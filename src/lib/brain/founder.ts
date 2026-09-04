import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAIN_MODEL, BrainNotConfiguredError, isBrainConfigured } from "@/lib/brain/extraction";
import { strumentiDelBrain, type TracciaStrumento } from "@/lib/brain/tools";
import { motoreConversazione } from "@/lib/brain/fornitore";
import { rispondiConMotoreProprio } from "@/lib/brain/motore-proprio";
import { chatConStrumenti, modelloOllama, ollamaRaggiungibile } from "@/lib/brain/ollama";

/**
 * L'interfaccia founder.
 *
 * "Come sta andando Unique questo mese?" — e poi "perché?", che è la
 * domanda vera. Perché funzioni servono tre cose che una chat qualsiasi
 * non ha:
 *
 * **Gli strumenti.** Il modello non conosce i numeri di Unique: li
 * chiede. Ogni risposta poggia su chiamate registrate, e chi legge può
 * vedere che il fatturato viene da una query e non da una stima.
 *
 * **La memoria.** Le decisioni prese e le preferenze dichiarate valgono
 * anche domani. Non si ripete a ogni conversazione che le comunicazioni
 * ai pazienti si approvano prima.
 *
 * **Il confine fra dire e fare.** Il Brain può proporre azioni, non
 * eseguirle. Ogni proposta passa da un'anteprima e da un sì.
 */

export interface MessaggioBrain {
  id: string;
  ruolo: "user" | "assistant";
  contenuto: string;
  tracce: TracciaStrumento[];
  createdAt: string;
}

export interface Conversazione {
  id: string;
  titolo: string | null;
  messaggi: MessaggioBrain[];
  ultimoMessaggio: string;
}

const SYSTEM_PROMPT = `Sei Unique Brain, il livello di ragionamento sopra l'infrastruttura di Unique — una longevity clinic.

Parli con la direzione. Il tuo compito non è essere gentile: è far capire come sta andando l'azienda, dove sta il problema, e cosa conviene fare.

## Come rispondi

- **Prima i numeri, poi l'interpretazione.** "Fatturato 21.430 €, +12% sul mese scorso" e poi cosa significa. Mai il contrario.
- **Ogni numero viene da uno strumento.** Se non l'hai chiesto, non lo scrivi. Non stimare, non estrapolare, non ricordare: chiedi.
- **Quando un dato manca, dillo.** "Non ho i costi di struttura" è una risposta utile; un margine calcolato senza i costi di struttura è un danno.
- **Un valore null non è zero.** Un costo per lead null significa che non è calcolabile — di solito perché non ci sono ancora lead. Dirlo come "0 €" sarebbe una bugia aritmetica.
- **Corto.** Chi legge dirige una clinica. Tre frasi dense battono dieci righe.
- **Niente elenchi puntati se bastano due frasi.** Niente titoli in una risposta breve.
- **Se ti chiedono "perché", vai a cercarlo.** Guarda gli eventi, la capacità, le campagne, i task. Un "perché" senza uno strumento chiamato è un'opinione.

## Cosa sai e cosa non sai

- Su prezzi, procedure, regole commerciali e modi di fare di Unique **usa sempre lo strumento della conoscenza**. Ciò che ti ricordi può essere la versione dell'anno scorso.
- Quando citi un'informazione dalla knowledge base, riporta da quando vale se la cosa può essere cambiata di recente, e segnala se è da riconfermare.
- I dati clinici dei pazienti non passano da qui. Puoi vedere conteggi e stati, non referti.

## Dire e fare

Puoi proporre azioni con \`proponi_azione\`. Non eseguirle: le esegue una persona dopo aver visto l'anteprima.

- Proponi quando l'interlocutore chiede di fare qualcosa, o quando la cosa da fare è evidente e la nomini esplicitamente.
- Una proposta alla volta, e spiega a parole cosa hai preparato e cosa succederebbe.
- Non proporre comunicazioni verso i pazienti come se partissero da sole: preparano contatti, non li inviano.
- Se una richiesta tocca prezzi o pazienti, elenca prima cosa verrebbe toccato e poi chiedi conferma.

Scrivi in italiano.`;

/** Le decisioni e le preferenze che valgono anche in questa conversazione. */
async function memoriaAttiva(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("brain_memory")
    .select("kind, statement, context, valid_until, created_at")
    .or(`valid_until.is.null,valid_until.gte.${oggi}`)
    .order("created_at", { ascending: false })
    .limit(25);

  const righe = (data ?? []) as {
    kind: string;
    statement: string;
    context: string | null;
    created_at: string;
  }[];

  if (righe.length === 0) return "(nessuna decisione registrata finora)";

  return righe
    .map(
      (m) =>
        `- [${m.kind}] ${m.statement}${m.context ? ` — ${m.context}` : ""} (${m.created_at.slice(0, 10)})`,
    )
    .join("\n");
}

/** Apre una conversazione, o riprende quella indicata. */
async function conversazione(
  conversationId: string | null,
  profileId: string,
): Promise<{ id: string; storia: { role: "user" | "assistant"; content: string }[] }> {
  const supabase = await createSupabaseServerClient();

  if (conversationId) {
    const { data } = await supabase
      .from("brain_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    return {
      id: conversationId,
      storia: ((data ?? []) as { role: "user" | "assistant"; content: string }[]).filter(
        (m) => m.content.trim().length > 0,
      ),
    };
  }

  const { data, error } = await supabase
    .from("brain_conversations")
    .insert({ profile_id: profileId })
    .select("id")
    .single();

  if (error) throw new Error(`Conversazione non aperta: ${error.message}`);
  return { id: (data as { id: string }).id, storia: [] };
}

/**
 * Una domanda al Brain, e la sua risposta.
 *
 * Il ciclo degli strumenti lo guida l'SDK: il modello chiede, la funzione
 * risponde, il modello continua finché non ha abbastanza per rispondere.
 * Il limite di iterazioni esiste perché una domanda mal posta non si
 * trasformi in venti query.
 */
export async function chiediAlBrain(input: {
  domanda: string;
  conversationId?: string | null;
}): Promise<{ conversationId: string; risposta: string; tracce: TracciaStrumento[] }> {
  const profile = await requireProfile();
  if (!["admin", "owner"].includes(profile.role)) {
    throw new Error("L'interfaccia founder è riservata alla direzione.");
  }

  const domanda = input.domanda.trim();
  if (domanda.length < 2) throw new Error("La domanda è vuota.");

  const { id, storia } = await conversazione(input.conversationId ?? null, profile.id);
  const supabase = await createSupabaseServerClient();

  await supabase.from("brain_messages").insert({
    conversation_id: id,
    role: "user",
    content: domanda,
  });

  /*
   * Il motore proprietario è la strada normale, non il ripiego.
   *
   * Risponde senza rete, senza costo per domanda e senza far uscire un
   * numero dall'infrastruttura — che con dati sanitari è un fatto
   * giuridico prima che tecnico. Il modello linguistico si accende di
   * proposito, con `UNIQUE_BRAIN=anthropic`, e serve a una cosa sola che
   * il motore non sa fare: la conversazione davvero libera.
   */
  if (motoreConversazione() === "proprio") {
    // L'ultima domanda posta serve ai seguiti: "perché?", "e ad agosto?".
    const ultimaDomanda = [...storia].reverse().find((m) => m.role === "user")?.content ?? null;
    const esito = await rispondiConMotoreProprio(domanda, { domandaPrecedente: ultimaDomanda });

    await supabase.from("brain_messages").insert({
      conversation_id: id,
      role: "assistant",
      content: esito.risposta,
      tool_calls: esito.tracce,
      model: `motore-unique${esito.intento ? `:${esito.intento}` : ""}`,
    });

    await supabase
      .from("brain_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        ...(storia.length === 0 ? { title: domanda.slice(0, 80) } : {}),
      })
      .eq("id", id);

    return { conversationId: id, risposta: esito.risposta, tracce: esito.tracce };
  }

  /*
   * Il modello locale: stessi strumenti, stesso prompt, nessuna rete.
   *
   * Il ciclo degli strumenti e' scritto a mano in `chatConStrumenti`,
   * perche' l'SDK di Anthropic non parla con Ollama. Ma gli strumenti
   * sono gli stessi oggetti — nome, schema, `run` — quindi i numeri
   * restano quelli dei motori di calcolo, e la Row Level Security sotto
   * e' la stessa. Cambia chi mette insieme le frasi, non chi sa i fatti.
   */
  if (motoreConversazione() === "ollama") {
    const stato = await ollamaRaggiungibile();
    if (!stato.ok) throw new Error(stato.motivo ?? "Ollama non raggiungibile.");

    const tracceLocali: TracciaStrumento[] = [];
    const strumentiLocali = strumentiDelBrain({ conversationId: id, tracce: tracceLocali });
    const memoriaLocale = await memoriaAttiva();

    try {
      const { testo } = await chatConStrumenti({
        sistema: `${SYSTEM_PROMPT}

Oggi e' ${new Date().toISOString().slice(0, 10)}.

Decisioni e preferenze gia' registrate:
${memoriaLocale}`,
        messaggi: [...storia, { role: "user" as const, content: domanda }],
        strumenti: strumentiLocali,
        maxIterazioni: 8,
        tracce: tracceLocali,
      });

      await supabase.from("brain_messages").insert({
        conversation_id: id,
        role: "assistant",
        content: testo,
        tool_calls: tracceLocali,
        model: `ollama:${modelloOllama()}`,
      });

      await supabase
        .from("brain_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          ...(storia.length === 0 ? { title: domanda.slice(0, 80) } : {}),
        })
        .eq("id", id);

      return { conversationId: id, risposta: testo, tracce: tracceLocali };
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      await supabase.from("brain_messages").insert({
        conversation_id: id,
        role: "assistant",
        content: `Non sono riuscito a rispondere con il modello locale: ${messaggio}`,
        tool_calls: tracceLocali,
        model: `ollama:${modelloOllama()}`,
      });
      throw errore;
    }
  }

  if (!isBrainConfigured()) throw new BrainNotConfiguredError();

  const tracce: TracciaStrumento[] = [];
  const strumenti = strumentiDelBrain({ conversationId: id, tracce });
  const memoria = await memoriaAttiva();

  const client = new Anthropic();

  try {
    const runner = client.beta.messages.toolRunner({
      model: BRAIN_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      // Il prompt stabile sta in un blocco a sé e si mette in cache; la
      // memoria e la data cambiano e stanno dopo, o invaliderebbero la
      // cache a ogni conversazione.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: `Oggi è ${new Date().toISOString().slice(0, 10)}.\n\nDecisioni e preferenze già registrate:\n${memoria}`,
        },
      ],
      messages: [...storia, { role: "user" as const, content: domanda }],
      tools: strumenti,
      max_iterations: 10,
    });

    const finale = await runner.runUntilDone();

    if (finale.stop_reason === "refusal") {
      throw new Error("Il modello ha rifiutato di rispondere.");
    }

    const risposta = finale.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    await supabase.from("brain_messages").insert({
      conversation_id: id,
      role: "assistant",
      content: risposta,
      tool_calls: tracce,
      model: BRAIN_MODEL,
    });

    await supabase
      .from("brain_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        // Il titolo è la prima domanda: è quasi sempre l'argomento.
        ...(storia.length === 0 ? { title: domanda.slice(0, 80) } : {}),
      })
      .eq("id", id);

    return { conversationId: id, risposta, tracce };
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);

    // Anche una risposta mancata resta nella conversazione: sapere che
    // una domanda è stata fatta e non ha avuto risposta è
    // un'informazione, e senza traccia non la si recupera.
    await supabase.from("brain_messages").insert({
      conversation_id: id,
      role: "assistant",
      content: `Non sono riuscito a rispondere: ${messaggio}`,
      tool_calls: tracce,
      model: BRAIN_MODEL,
    });

    throw errore;
  }
}

/** Le conversazioni di chi guarda, dalla più recente. */
export async function conversazioni(limite = 12): Promise<
  { id: string; titolo: string | null; ultimoMessaggio: string }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brain_conversations")
    .select("id, title, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as { id: string; title: string | null; last_message_at: string }[]).map(
    (c) => ({ id: c.id, titolo: c.title, ultimoMessaggio: c.last_message_at }),
  );
}

/** Una conversazione intera, per rileggerla. */
export async function leggiConversazione(id: string): Promise<Conversazione | null> {
  const supabase = await createSupabaseServerClient();

  const [conversazioneRes, messaggiRes] = await Promise.all([
    supabase
      .from("brain_conversations")
      .select("id, title, last_message_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("brain_messages")
      .select("id, role, content, tool_calls, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const testa = conversazioneRes.data as
    | { id: string; title: string | null; last_message_at: string }
    | null;
  if (!testa) return null;

  return {
    id: testa.id,
    titolo: testa.title,
    ultimoMessaggio: testa.last_message_at,
    messaggi: ((messaggiRes.data ?? []) as {
      id: string;
      role: "user" | "assistant";
      content: string;
      tool_calls: TracciaStrumento[] | null;
      created_at: string;
    }[]).map((m) => ({
      id: m.id,
      ruolo: m.role,
      contenuto: m.content,
      tracce: m.tool_calls ?? [],
      createdAt: m.created_at,
    })),
  };
}
