import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAIN_MODEL, BrainNotConfiguredError, isBrainConfigured } from "@/lib/brain/extraction";
import { cercaConoscenza, conoscenzaPerSlug, type VoceCorrente } from "@/lib/knowledge/queries";
import { contenutiMigliori } from "@/lib/data/marketing";
import { ricorrenzeVincenti } from "@/lib/marketing/engine";

/**
 * Il Content Brain.
 *
 * Non è "ChatGPT con il brand book incollato nel prompt". La differenza
 * sta in tre vincoli, e sono tutti verificabili guardando l'output:
 *
 * **Scrive solo su ciò che Unique sa di sé.** Identità, sistema visivo e
 * linee guida arrivano dalla knowledge base nella versione in vigore
 * oggi. Se il tono di voce cambia, cambia il prompt — senza che nessuno
 * debba ricordarsi di aggiornare un file.
 *
 * **I numeri li prende dal listino, non dalla memoria.** Un prezzo in un
 * contenuto è una promessa commerciale: deve venire dalla voce di
 * knowledge base che lo contiene, con la sua versione, o non deve
 * comparire.
 *
 * **Dichiara le fonti e le avvertenze.** Ogni contenuto esce con l'elenco
 * delle voci su cui è stato costruito e con ciò che va fatto rileggere a
 * un medico prima di pubblicare. Un contenuto sanitario che nessuno ha
 * riletto non è un contenuto: è un rischio.
 */

export const FORMATI = {
  "carosello-instagram": "Carosello Instagram, 6-8 tavole",
  "reel": "Script per reel, 20-40 secondi",
  "landing": "Landing page, sezione per sezione",
  "campagna-meta": "Campagna Meta: angoli, copy e creatività",
  "email": "Email alla lista",
  "script-vendita": "Script per la telefonata commerciale",
  "articolo": "Articolo per il sito",
  "studio-in-contenuti": "Uno studio scientifico trasformato in contenuti Unique",
} as const;

export type FormatoContenuto = keyof typeof FORMATI;

/** Le voci di knowledge base che accompagnano ogni generazione. */
const VOCI_BRAND = ["brand-identita", "brand-sistema-visivo", "marketing-linee-guida"];

const Blocco = z.object({
  ruolo: z
    .string()
    .describe("Che parte è: gancio, tavola 1, corpo, prova, obiezione, chiusura, call to action."),
  testo: z.string().describe("Il testo, pronto da usare. Niente segnaposto."),
  nota: z
    .string()
    .nullable()
    .describe("Indicazione di produzione: cosa si vede, che immagine, che ritmo. Null se non serve."),
});

const Fonte = z.object({
  slug: z.string().describe("Lo slug della voce di knowledge base usata."),
  usata_per: z.string().describe("Cosa se n'è ricavato: un prezzo, il tono, una regola."),
});

const ContenutoGenerato = z.object({
  titolo: z.string().describe("Come si chiama questo contenuto, internamente."),
  blocchi: z.array(Blocco).describe("Il contenuto, in ordine."),
  call_to_action: z.string().describe("Una sola, ripetuta se serve. Mai due diverse."),
  hook_alternativi: z
    .array(z.string())
    .describe("Due o tre aperture alternative, per provare angoli diversi."),
  vincoli_rispettati: z
    .array(z.string())
    .describe("Quali regole del brand book hanno vincolato le scelte, e come."),
  fonti: z.array(Fonte).describe("Le voci di knowledge base su cui si regge il contenuto."),
  da_far_rileggere: z
    .array(z.string())
    .describe(
      "Affermazioni che richiedono la rilettura di un medico prima della pubblicazione. Vuoto se non ce ne sono.",
    ),
});

export interface RisultatoContenuto {
  id: string;
  titolo: string;
  formato: FormatoContenuto;
  brief: string;
  contenuto: z.infer<typeof ContenutoGenerato>;
  createdAt: string;
}

const SYSTEM_PROMPT = `Sei il Content Brain di Unique, una longevity clinic.

Scrivi materiale di comunicazione — caroselli, script, landing, campagne, email —
che rispetta l'identità di Unique senza doversela far ricordare ogni volta.

Regole non negoziabili:
- **Il brand book non è un suggerimento.** Tono di voce, claim vietati e struttura
  arrivano dalla knowledge base che ti viene fornita. Se una richiesta va contro
  una regola del brand, scrivi il contenuto rispettando la regola e spiega la
  scelta in \`vincoli_rispettati\`.
- **I numeri vengono dal listino che ti è stato dato, mai dalla memoria.** Se un
  prezzo, una durata o una condizione non compaiono nelle fonti, non li scrivere:
  usa una formula che rimandi al contatto ("il costo aggiornato te lo diciamo in
  segreteria") invece di inventare una cifra.
- **Niente promesse cliniche.** Nessuna diagnosi, nessuna guarigione, nessuna
  prevenzione garantita, nessun paragone con altri centri. Ogni affermazione che
  sfiora la salute va elencata in \`da_far_rileggere\`.
- **Una call to action sola.** Due call to action in un contenuto sono zero.
- **In italiano, asciutto.** Niente superlativi, niente urgenza artificiale,
  niente emoji a fine riga. Una frase in meno è quasi sempre meglio di una in più.
- **Le fonti si dichiarano.** Ogni voce di knowledge base che ha influito va in
  \`fonti\`, con cosa se n'è ricavato.`;

function formattaVoci(voci: VoceCorrente[]): string {
  if (voci.length === 0) return "(nessuna)";
  return voci
    .map(
      (v) =>
        `### ${v.title}\nslug: ${v.slug} — ${v.provenienza}${v.daRiconfermare ? " ⚠ da riconfermare" : ""}\n${v.body}${
          Object.keys(v.data).length > 0 ? `\ndati: ${JSON.stringify(v.data)}` : ""
        }`,
    )
    .join("\n\n");
}

/**
 * Genera un contenuto.
 *
 * Il contesto si compone di quattro pezzi, e nessuno è facoltativo:
 * l'identità del brand, ciò che Unique sa dell'argomento, il listino se
 * il contenuto tocca i prezzi, e i contenuti che hanno funzionato — con
 * gli angoli che ricorrono fra i migliori.
 */
export async function generaContenuto(input: {
  formato: FormatoContenuto;
  brief: string;
  campaignId?: string | null;
}): Promise<RisultatoContenuto> {
  if (!isBrainConfigured()) throw new BrainNotConfiguredError();

  const profile = await requireProfile();
  if (!["admin", "owner", "marketing"].includes(profile.role)) {
    throw new Error("Il Content Brain è riservato a direzione e marketing.");
  }

  const brief = input.brief.trim();
  if (brief.length < 8) throw new Error("Il brief è troppo corto per produrre qualcosa di utile.");

  const [brand, pertinenti, migliori] = await Promise.all([
    conoscenzaPerSlug([...VOCI_BRAND, "listino-servizi", "listino-membership"]),
    cercaConoscenza(brief, 5),
    contenutiMigliori(5),
  ]);

  // Le voci pertinenti possono ripetere quelle di brand: si tengono una volta.
  const gia = new Set(brand.map((v) => v.slug));
  const contesto = [...brand, ...pertinenti.filter((v) => !gia.has(v.slug))];

  const ricorrenze = ricorrenzeVincenti(migliori);

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: BRAIN_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(ContenutoGenerato), effort: "high" },
    messages: [
      {
        role: "user",
        content: `Data di oggi: ${new Date().toISOString().slice(0, 10)}.

## Cosa serve
${FORMATI[input.formato]}

## Brief
${brief}

## Cosa Unique sa di sé e dell'argomento
${formattaVoci(contesto)}

## Cosa ha funzionato finora
${
  migliori.length === 0
    ? "(nessuno storico: non dedurre nulla dai contenuti passati)"
    : migliori
        .map(
          (c) =>
            `- "${c.title}" (${c.format}, angolo: ${c.angle ?? "non dichiarato"}) — ` +
            `${c.leadsAttributed} lead, coinvolgimento ${
              c.engagement === null ? "non misurabile" : `${(c.engagement * 100).toFixed(1)}%`
            }${c.hook ? `\n  gancio: "${c.hook}"` : ""}`,
        )
        .join("\n")
}
${
  ricorrenze.angoli.length > 0
    ? `\nRicorrono fra i migliori: ${ricorrenze.angoli
        .map(([a, n]) => `${a} (${n})`)
        .join(", ")}.`
    : ""
}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Il modello ha rifiutato di generare questo contenuto.");
  }
  if (!response.parsed_output) {
    throw new Error("Il modello non ha restituito un contenuto leggibile.");
  }

  const contenuto = response.parsed_output;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generated_contents")
    .insert({
      kind: input.formato,
      brief,
      title: contenuto.titolo,
      output: contenuto,
      // Le fonti si conservano con la versione: fra sei mesi si deve poter
      // capire su quale listino era stato scritto un contenuto.
      sources: contesto.map((v) => ({
        slug: v.slug,
        version: v.version,
        valid_from: v.validFrom,
      })),
      model: BRAIN_MODEL,
      created_by: profile.id,
      campaign_id: input.campaignId ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(`Contenuto non salvato: ${error.message}`);

  const row = data as { id: string; created_at: string };

  return {
    id: row.id,
    titolo: contenuto.titolo,
    formato: input.formato,
    brief,
    contenuto,
    createdAt: row.created_at,
  };
}

/** I contenuti generati di recente, con il loro brief. */
export async function contenutiGenerati(limite = 20): Promise<RisultatoContenuto[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("generated_contents")
    .select("id, kind, brief, title, output, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as {
    id: string;
    kind: string;
    brief: string;
    title: string | null;
    output: z.infer<typeof ContenutoGenerato>;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    titolo: row.title ?? "Senza titolo",
    formato: row.kind as FormatoContenuto,
    brief: row.brief,
    contenuto: row.output,
    createdAt: row.created_at,
  }));
}
