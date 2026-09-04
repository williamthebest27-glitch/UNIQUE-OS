import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { METRIC_DEFINITIONS } from "@/lib/score/metrics";
import { motoreConversazione } from "@/lib/brain/fornitore";
import { generaStrutturato, ollamaRaggiungibile } from "@/lib/brain/ollama";
import { testoDaDocumento } from "@/lib/clinical/testo-documento";

/**
 * Estrazione dei parametri clinici da un documento.
 *
 * Primo tratto del motore descritto nella visione: riconoscere il tipo di
 * documento, estrarre i parametri rilevanti e prepararli per il database.
 * Qui l'AI si ferma. Confronto con lo storico, validazione e proposta di
 * aggiornamento dei sottoscore avvengono in codice deterministico
 * (`validation.ts`, `analyze.ts`), dove le regole sono leggibili e
 * verificabili.
 */

/** Modello usato. Registrato su ogni analisi, per poterla rileggere domani. */
export const BRAIN_MODEL = "claude-opus-5";

export function isBrainConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
}

/* ── Schema dell'estrazione ───────────────────────────────────────── */

const DOCUMENT_KINDS = [
  "lab_report",
  "imaging",
  "prescription",
  "consent",
  "care_plan",
  "invoice",
  "other",
] as const;

const ExtractedMeasurement = z.object({
  metric_code: z
    .string()
    .describe("Codice esatto dal catalogo fornito. Nessun codice inventato."),
  label: z.string().describe("Etichetta così come compare sul documento."),
  value: z.number().nullable().describe("Valore numerico, null se categoriale."),
  category: z
    .string()
    .nullable()
    .describe("Valore categoriale, solo per le metriche che lo prevedono."),
  unit: z.string().nullable().describe("Unità di misura letta sul documento."),
  measured_on: z
    .string()
    .nullable()
    .describe("Data del prelievo o dell'esame, formato YYYY-MM-DD."),
  confidence: z
    .number()
    .describe("Quanto è sicura la lettura, da 0 a 1. Onesta, non ottimistica."),
  source_excerpt: z
    .string()
    .describe("La riga del documento da cui il valore è stato letto, verbatim."),
});

export const DocumentExtraction = z.object({
  document_kind: z.enum(DOCUMENT_KINDS),
  document_date: z.string().nullable(),
  measurements: z.array(ExtractedMeasurement),
  summary: z
    .string()
    .describe("Due o tre frasi in italiano su cosa contiene il documento."),
  next_steps: z
    .array(z.string())
    .describe("Approfondimenti suggeriti, in italiano. Vuoto se non ce ne sono."),
});

export type DocumentExtraction = z.infer<typeof DocumentExtraction>;
export type ExtractedMeasurement = z.infer<typeof ExtractedMeasurement>;

/* ── Prompt ───────────────────────────────────────────────────────── */

/**
 * Il catalogo delle metriche, reso leggibile per il modello.
 *
 * È deliberatamente stabile e ordinato: resta identico fra una chiamata e
 * l'altra, quindi si può mettere in cache e non va riletturato ogni volta.
 */
function renderCatalog(): string {
  return METRIC_DEFINITIONS.map((metric) => {
    const accepted = metric.categories
      ? ` | valori ammessi: ${Object.keys(metric.categories).join(", ")}`
      : ` | unità attesa: ${metric.unit || "—"}`;
    const aliases = metric.aliases?.length
      ? ` | sui referti: ${metric.aliases.join(", ")}`
      : "";
    return `${metric.code} — ${metric.label}${accepted}${aliases}`;
  }).join("\n");
}

const SYSTEM_PROMPT = `Sei il motore di estrazione clinica di Unique Longevity Clinic.

Leggi un documento sanitario e ne estrai i parametri misurati, mappandoli sul
catalogo di metriche qui sotto.

Regole non negoziabili:
- Usa esclusivamente i codici del catalogo. Se un parametro del documento non
  corrisponde ad alcun codice, omettilo: non inventare codici e non forzare
  accostamenti approssimativi.
- Riporta il valore nell'unità che vedi sul documento, senza convertirlo.
  Se l'unità differisce da quella attesa, riportala comunque com'è: la
  conversione è compito di chi valida, non tuo.
- \`source_excerpt\` deve essere la riga del documento, copiata alla lettera.
  Serve a un medico per verificare senza riaprire il file.
- La confidenza è una stima onesta della leggibilità del dato. Un valore
  stampato male, ambiguo o dedotto merita una confidenza bassa. Non gonfiarla.
- Non formulare diagnosi e non dare indicazioni terapeutiche. La sintesi
  descrive cosa contiene il documento e come si colloca rispetto agli
  intervalli di riferimento riportati; nulla di più.
- Se il documento non contiene parametri misurati — un consenso, una fattura —
  restituisci una lista vuota e dillo nella sintesi.

Catalogo delle metriche:
${renderCatalog()}`;

/* ── Chiamata ─────────────────────────────────────────────────────── */

export interface DocumentInput {
  /** Contenuto del file, in base64. */
  data: string;
  mimeType: string;
  fileName: string;
}

export class BrainNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY non è impostata: il motore clinico AI è disattivato.");
    this.name = "BrainNotConfiguredError";
  }
}

export class BrainRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Il modello ha rifiutato di elaborare il documento (${category ?? "senza categoria"}).`);
    this.name = "BrainRefusalError";
  }
}

/**
 * Manda il documento a Claude e restituisce l'estrazione strutturata.
 *
 * Lo schema è imposto dall'API tramite structured outputs, quindi la forma
 * della risposta non va più verificata a mano: resta da verificare il
 * merito, che è tutt'altro mestiere e sta in `validation.ts`.
 */
export async function extractFromDocument(
  input: DocumentInput,
): Promise<DocumentExtraction> {
  /*
   * Il modello locale legge in due modi.
   *
   * Un PDF con il testo si converte in testo — la stessa ricostruzione
   * delle righe del lettore proprietario — e si manda quello: e' piu'
   * affidabile di un'immagine anche per un modello con la vista, e
   * funziona con qualunque modello. Un'immagine si manda com'e', e serve
   * un modello che sappia guardarla (llama3.2-vision, llava): con uno
   * solo testuale la richiesta fallisce con un messaggio chiaro.
   *
   * Un PDF scansionato — pagine e nessun testo — resta il caso che qui
   * non si copre: andrebbe rasterizzato, e senza una libreria per farlo
   * e' meglio dirlo che tentare.
   */
  if (motoreConversazione() === "ollama") {
    const stato = await ollamaRaggiungibile();
    if (!stato.ok) throw new Error(stato.motivo ?? "Ollama non raggiungibile.");

    const isPdfLocale = input.mimeType === "application/pdf";
    const bytes = new Uint8Array(Buffer.from(input.data, "base64"));

    if (isPdfLocale) {
      const documento = await testoDaDocumento(bytes, input.mimeType);
      if (!documento.leggibile) {
        throw new Error(
          documento.motivo ??
            "Il PDF non contiene testo: con il modello locale serve un'immagine del referto.",
        );
      }
      return generaStrutturato({
        sistema: SYSTEM_PROMPT,
        richiesta: `Documento: ${input.fileName}. Estrai i parametri secondo le regole dal testo qui sotto.

${documento.testo}`,
        schema: DocumentExtraction,
        timeoutMs: 240_000,
      });
    }

    return generaStrutturato({
      sistema: SYSTEM_PROMPT,
      richiesta: `Documento: ${input.fileName}. Estrai i parametri secondo le regole dall'immagine.`,
      schema: DocumentExtraction,
      immagini: [input.data],
      timeoutMs: 240_000,
    });
  }

  if (!isBrainConfigured()) throw new BrainNotConfiguredError();

  const client = new Anthropic();

  const isPdf = input.mimeType === "application/pdf";
  const fileBlock = isPdf
    ? ({
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: input.data,
        },
      })
    : ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: input.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: input.data,
        },
      });

  const response = await client.messages.parse({
    model: BRAIN_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // Il catalogo non cambia fra un documento e l'altro.
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { format: zodOutputFormat(DocumentExtraction), effort: "high" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: `Documento: ${input.fileName}. Estrai i parametri secondo le regole.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new BrainRefusalError(response.stop_details?.category ?? null);
  }

  if (!response.parsed_output) {
    throw new Error("Il modello non ha restituito un'estrazione leggibile.");
  }

  return response.parsed_output;
}
