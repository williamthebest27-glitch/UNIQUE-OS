import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAIN_MODEL, BrainNotConfiguredError, isBrainConfigured } from "@/lib/brain/extraction";
import { collectPatientData } from "@/lib/brain/briefing";
import { motoreConversazione } from "@/lib/brain/fornitore";
import { rispondiSullaCartella } from "@/lib/clinical/copilot-proprio";

/**
 * Il copilot clinico dentro la cartella.
 *
 * "Quali parametri sono peggiorati?", "Confronta gli ultimi due esami",
 * "Preparami una sintesi della visita precedente".
 *
 * Due vincoli lo distinguono da una chat qualsiasi:
 *
 * **Vede solo ciò che vede chi lo interroga.** I dati arrivano da
 * `collectPatientData`, le cui query passano dal client di sessione: è la
 * Row Level Security a decidere cosa entra nel prompt, non il prompt.
 *
 * **Dichiara sempre da dove viene la risposta.** Una risposta clinica
 * senza fonti non è verificabile, e ciò che non è verificabile non è
 * utilizzabile in clinica. Le fonti sono parte dello schema di uscita,
 * non una gentilezza che il modello concede quando se ne ricorda.
 */

const SourceSchema = z.object({
  kind: z
    .string()
    .describe("Tipo di dato: misura, punteggio, documento, visita, percorso, azione."),
  label: z.string().describe("Cosa è stato usato, con il valore quando c'è."),
  date: z.string().nullable().describe("Data del dato, formato YYYY-MM-DD."),
});

const AnswerSchema = z.object({
  answer: z.string().describe("La risposta, in italiano."),
  sources: z
    .array(SourceSchema)
    .describe("I dati concreti su cui la risposta si regge. Mai vuoto se la risposta afferma qualcosa."),
  insufficient_data: z
    .boolean()
    .describe("Vero se i dati disponibili non bastano a rispondere."),
});

export interface CopilotSource {
  kind: string;
  label: string;
  date: string | null;
}

export interface CopilotAnswer {
  id: string;
  question: string;
  answer: string;
  sources: CopilotSource[];
  createdAt: string;
}

const SYSTEM_PROMPT = `Sei il copilot clinico di Unique Longevity Clinic.

Rispondi alle domande di un professionista sulla cartella di un suo paziente.

Regole non negoziabili:
- Rispondi **esclusivamente** sui dati che ti vengono forniti. Se non bastano,
  dillo e metti \`insufficient_data\` a vero: una risposta plausibile ma non
  fondata è peggio di nessuna risposta.
- Elenca sempre in \`sources\` i dati concreti su cui la risposta si regge, con
  valore e data. Non citare dati che non ti sono stati dati.
- Ogni affermazione quantitativa porta valore e data. "LDL da 142 a 118 fra
  giugno 2025 e agosto 2026" è utile; "profilo lipidico migliorato" non lo è.
- Non formulare diagnosi, non proporre terapie, non suggerire farmaci o
  dosaggi. Descrivi ciò che i dati mostrano e segnala cosa merita attenzione.
- Se ti viene chiesto un confronto e c'è una sola rilevazione, dillo invece di
  confrontare con un valore di riferimento generico.
- Un pilastro non calcolabile per dati mancanti è un'informazione da riportare,
  non un risultato negativo.
- Scrivi in italiano, asciutto. Chi legge ha poco tempo.`;

export async function askCopilot(
  patientId: string,
  question: string,
): Promise<CopilotAnswer> {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Il copilot clinico è riservato ai professionisti.");
  }

  const domanda = question.trim();
  if (domanda.length < 3) throw new Error("La domanda è troppo corta.");

  /*
   * Il copilot proprietario risponde per confronto.
   *
   * Le domande davanti a una cartella sono domande di confronto — cosa è
   * peggiorato, cosa manca, com'è quel valore — e un confronto è
   * aritmetica su dati già strutturati. Il modello serve per le domande
   * poste in modo davvero libero, e si accende di proposito.
   *
   * In entrambi i casi vale lo stesso confine: i dati arrivano dal client
   * di sessione, quindi il copilot vede ciò che vede chi lo interroga.
   */
  if (motoreConversazione() === "proprio") {
    return rispostaPropria(patientId, domanda, profile.id);
  }

  if (!isBrainConfigured()) throw new BrainNotConfiguredError();

  const dati = await collectPatientData(patientId);
  if (!dati.anagrafica) throw new Error("Paziente non trovato o non accessibile.");

  const supabase = await createSupabaseServerClient();

  // La domanda si registra prima della risposta: se la chiamata fallisce,
  // resta comunque traccia di cosa è stato chiesto.
  const { data: created, error: createError } = await supabase
    .from("copilot_messages")
    .insert({
      patient_id: patientId,
      profile_id: profile.id,
      question: domanda,
      model: BRAIN_MODEL,
    })
    .select("id, created_at")
    .single();

  if (createError) throw new Error(`Domanda non registrata: ${createError.message}`);
  const row = created as { id: string; created_at: string };

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: BRAIN_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { format: zodOutputFormat(AnswerSchema), effort: "high" },
      messages: [
        {
          role: "user",
          content: `Data di oggi: ${new Date().toISOString().slice(0, 10)}.

Domanda del professionista:
${domanda}

Dati disponibili su questo paziente:

${JSON.stringify(dati, null, 2)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Il modello ha rifiutato di rispondere.");
    }
    if (!response.parsed_output) {
      throw new Error("Il modello non ha restituito una risposta leggibile.");
    }

    const parsed = response.parsed_output;

    await supabase
      .from("copilot_messages")
      .update({ answer: parsed.answer, sources: parsed.sources })
      .eq("id", row.id);

    return {
      id: row.id,
      question: domanda,
      answer: parsed.answer,
      sources: parsed.sources,
      createdAt: row.created_at,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("copilot_messages").update({ error: message }).eq("id", row.id);
    throw error;
  }
}

/**
 * La risposta del motore proprietario, registrata come le altre.
 *
 * Stessa tabella, stessa forma, stesse fonti: chi rilegge una
 * conversazione fra sei mesi non deve chiedersi quale motore aveva
 * risposto — lo dice il campo `model`, e il resto è identico.
 */
async function rispostaPropria(
  patientId: string,
  domanda: string,
  profileId: string,
): Promise<CopilotAnswer> {
  const esito = await rispondiSullaCartella(patientId, domanda);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("copilot_messages")
    .insert({
      patient_id: patientId,
      profile_id: profileId,
      question: domanda,
      answer: esito.testo,
      sources: esito.fonti,
      model: `copilot-unique${esito.intento ? `:${esito.intento}` : ""}`,
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(`Risposta non registrata: ${error.message}`);
  const row = data as { id: string; created_at: string };

  return {
    id: row.id,
    question: domanda,
    answer: esito.testo,
    sources: esito.fonti,
    createdAt: row.created_at,
  };
}

/** Le ultime domande fatte da chi guarda su questo paziente. */
export async function getCopilotHistory(
  patientId: string,
  limit = 6,
): Promise<CopilotAnswer[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("copilot_messages")
    .select("id, question, answer, sources, created_at")
    .eq("patient_id", patientId)
    .not("answer", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as {
    id: string;
    question: string;
    answer: string;
    sources: CopilotSource[] | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    sources: row.sources ?? [],
    createdAt: row.created_at,
  }));
}
