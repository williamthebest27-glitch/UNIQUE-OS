import "server-only";
import type { z } from "zod";
import { z as zod } from "zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { TracciaStrumento } from "@/lib/brain/tools";

/**
 * Un modello aperto, sul server di Unique.
 *
 * Ollama serve modelli aperti — Llama, Qwen, Mistral — da una macchina
 * propria, con un'API locale. È la risposta a una domanda precisa: come
 * si ha la conversazione libera senza che una parola esca dalla clinica.
 * I dati sanitari restano dove sono, e la bolletta è la corrente.
 *
 * Il motore proprietario resta la strada predefinita, perché su ciò che
 * sa fare è più affidabile di qualunque modello: risponde sempre allo
 * stesso modo, e i suoi errori sono test. Questo modello aggiunge ciò che
 * una grammatica non copre — la domanda posta in modo davvero libero, il
 * referto scansionato, il copy finito — e lo fa in casa.
 *
 * Due cose vanno sapute prima di accenderlo:
 *
 * - **la qualità dipende dal modello scelto** e dalla macchina che lo
 *   serve. Un modello piccolo su una CPU risponde in un minuto e sbaglia
 *   più di uno grande su una GPU. Il default è prudente, non ambizioso;
 * - **gli strumenti sono gli stessi** del percorso con Anthropic, quindi
 *   i numeri restano quelli dei motori di calcolo. Il modello non li
 *   inventa perché non gli si dà modo di farlo: li chiede.
 */

const URL_PREDEFINITO = "http://localhost:11434";
const MODELLO_PREDEFINITO = "qwen2.5:14b";

export function urlOllama(): string {
  return (process.env.OLLAMA_URL ?? URL_PREDEFINITO).replace(/\/+$/, "");
}

export function modelloOllama(): string {
  return process.env.OLLAMA_MODEL ?? MODELLO_PREDEFINITO;
}

/**
 * Il server risponde?
 *
 * Non basta che la variabile sia impostata: un Ollama spento è il modo
 * più comune in cui questo motore fallisce, e conviene scoprirlo con un
 * messaggio chiaro invece che con un timeout.
 */
export async function ollamaRaggiungibile(): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const risposta = await fetch(`${urlOllama()}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!risposta.ok) return { ok: false, motivo: `Ollama risponde ${risposta.status}.` };

    const dati = (await risposta.json()) as { models?: { name: string }[] };
    const nomi = (dati.models ?? []).map((m) => m.name);
    const voluto = modelloOllama();
    const presente = nomi.some((n) => n === voluto || n.split(":")[0] === voluto.split(":")[0]);

    if (!presente) {
      return {
        ok: false,
        motivo: `Il modello "${voluto}" non è scaricato. Sul server: ollama pull ${voluto}. Disponibili: ${nomi.join(", ") || "nessuno"}.`,
      };
    }
    return { ok: true };
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    return {
      ok: false,
      motivo: `Ollama non raggiungibile su ${urlOllama()}: ${messaggio}. È acceso?`,
    };
  }
}

/* ── Le forme dell'API ────────────────────────────────────────────── */

interface MessaggioOllama {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
}

interface RispostaChat {
  message: MessaggioOllama;
  done: boolean;
}

async function chiama(corpo: Record<string, unknown>, timeoutMs: number): Promise<RispostaChat> {
  const risposta = await fetch(`${urlOllama()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...corpo, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => "");
    throw new Error(`Ollama ${risposta.status}: ${testo.slice(0, 300) || risposta.statusText}`);
  }

  return (await risposta.json()) as RispostaChat;
}

/* ── Conversazione con strumenti ──────────────────────────────────── */

/**
 * Il ciclo degli strumenti, scritto a mano.
 *
 * L'SDK di Anthropic lo fa da solo; qui va fatto: il modello chiede uno
 * strumento, lo si esegue, gli si restituisce il risultato, e si va
 * avanti finché non risponde a parole. Il limite di iterazioni esiste
 * perché un modello piccolo può girare in tondo, e venti query per una
 * domanda mal posta non sono un servizio.
 *
 * Gli strumenti sono quelli di `strumentiDelBrain`: stessa definizione,
 * stesso `run`, stessa Row Level Security sotto.
 */
export async function chatConStrumenti(input: {
  sistema: string;
  messaggi: { role: "user" | "assistant"; content: string }[];
  strumenti: BetaRunnableTool[];
  maxIterazioni?: number;
  tracce?: TracciaStrumento[];
}): Promise<{ testo: string; iterazioni: number }> {
  const conversazione: MessaggioOllama[] = [
    { role: "system", content: input.sistema },
    ...input.messaggi.map((m) => ({ role: m.role, content: m.content })),
  ];

  const definizioni = input.strumenti.map((s) => ({
    type: "function" as const,
    function: {
      name: s.name,
      description: "description" in s ? (s.description ?? "") : "",
      parameters: "input_schema" in s ? s.input_schema : { type: "object", properties: {} },
    },
  }));

  const perNome = new Map(input.strumenti.map((s) => [s.name, s]));
  const massimo = input.maxIterazioni ?? 8;

  for (let iterazione = 1; iterazione <= massimo; iterazione += 1) {
    const risposta = await chiama(
      { model: modelloOllama(), messages: conversazione, tools: definizioni },
      120_000,
    );

    const chiamate = risposta.message.tool_calls ?? [];
    conversazione.push(risposta.message);

    if (chiamate.length === 0) {
      return { testo: risposta.message.content.trim(), iterazioni: iterazione };
    }

    // Tutte le chiamate di un turno si eseguono e si restituiscono
    // insieme: è ciò che il modello si aspetta, e spezzarle lo confonde.
    for (const chiamata of chiamate) {
      const strumento = perNome.get(chiamata.function.name);
      let contenuto: string;

      if (!strumento) {
        contenuto = JSON.stringify({ errore: `Strumento sconosciuto: ${chiamata.function.name}` });
      } else {
        try {
          const argomenti = strumento.parse(chiamata.function.arguments ?? {});
          const esito = await strumento.run(argomenti);
          contenuto = typeof esito === "string" ? esito : JSON.stringify(esito);
        } catch (errore) {
          const messaggio = errore instanceof Error ? errore.message : String(errore);
          contenuto = JSON.stringify({ errore: messaggio });
        }
      }

      conversazione.push({ role: "tool", content: contenuto });
    }
  }

  // Esaurite le iterazioni senza una risposta a parole: si chiede al
  // modello di concludere con quello che ha, senza altri strumenti.
  const finale = await chiama(
    {
      model: modelloOllama(),
      messages: [
        ...conversazione,
        {
          role: "user",
          content:
            "Rispondi adesso con ciò che hai raccolto, senza chiamare altri strumenti. Se un dato manca, dillo.",
        },
      ],
    },
    120_000,
  );

  return { testo: finale.message.content.trim(), iterazioni: massimo + 1 };
}

/* ── Uscita strutturata ───────────────────────────────────────────── */

/**
 * Una risposta nella forma di uno schema.
 *
 * Ollama accetta uno schema JSON e vincola l'uscita a rispettarlo: è
 * l'equivalente locale del `parse` di Anthropic, e serve dove il resto
 * del sistema si aspetta una struttura — l'estrazione da un referto, il
 * copilot, il Content Brain. La validazione con lo stesso schema Zod a
 * valle è la rete: un modello vincolato produce JSON valido, non
 * necessariamente JSON sensato.
 */
export async function generaStrutturato<S extends z.ZodTypeAny>(input: {
  sistema: string;
  richiesta: string;
  schema: S;
  immagini?: string[];
  timeoutMs?: number;
}): Promise<z.infer<S>> {
  const schemaJson = zod.toJSONSchema(input.schema);

  const risposta = await chiama(
    {
      model: modelloOllama(),
      messages: [
        { role: "system", content: input.sistema },
        {
          role: "user",
          content: input.richiesta,
          ...(input.immagini && input.immagini.length > 0 ? { images: input.immagini } : {}),
        },
      ],
      format: schemaJson,
    },
    input.timeoutMs ?? 180_000,
  );

  let grezzo: unknown;
  try {
    grezzo = JSON.parse(risposta.message.content);
  } catch {
    throw new Error("Il modello locale non ha restituito JSON leggibile.");
  }

  const esito = input.schema.safeParse(grezzo);
  if (!esito.success) {
    throw new Error(
      `Il modello locale ha restituito una struttura non valida: ${esito.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return esito.data;
}
