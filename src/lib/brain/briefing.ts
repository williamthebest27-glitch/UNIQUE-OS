import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAIN_MODEL, BrainNotConfiguredError, isBrainConfigured } from "@/lib/brain/extraction";
import { modelloAttivo, motoreConversazione } from "@/lib/brain/fornitore";
import { generaStrutturato, modelloOllama, ollamaRaggiungibile } from "@/lib/brain/ollama";

/**
 * "Riassumimi questo paziente prima della visita."
 *
 * Il professionista non deve aprire dieci PDF per ricostruire una storia.
 * La sintesi si scrive **solo** sui dati che il database restituisce con i
 * permessi di chi la chiede: le query passano dal client di sessione,
 * quindi la Row Level Security decide cosa entra nel prompt. Un medico non
 * può ottenere per interposto modello ciò che non potrebbe leggere da sé.
 *
 * Ogni briefing viene conservato: è verificabile a posteriori, si sa su
 * quali dati è stato scritto, e non si paga due volte la stessa domanda.
 */

const BriefingSchema = z.object({
  summary: z
    .string()
    .describe("Quattro-sei frasi in italiano: chi è il paziente e a che punto è."),
  highlights: z
    .array(z.string())
    .describe("Punti salienti, ciascuno con il valore e la data che lo sostengono."),
  open_questions: z
    .array(z.string())
    .describe("Cosa verificare o chiedere in visita, inclusi i dati mancanti."),
});

export interface Briefing {
  id: string;
  summary: string;
  highlights: string[];
  openQuestions: string[];
  createdAt: string;
  model: string | null;
}

const SYSTEM_PROMPT = `Sei l'assistente clinico di Unique Longevity Clinic.

Prepari un professionista alla visita riassumendo la storia di un paziente.

Regole non negoziabili:
- Usa **esclusivamente** i dati che ti vengono forniti. Se un'informazione non
  c'è, dillo: "non risulta", "non disponibile". Non colmare i vuoti con ciò che
  è statisticamente probabile.
- Ogni affermazione quantitativa porta con sé il valore e la data. "Glicata 5,2%
  ad agosto" è utile; "buon controllo glicemico" non è verificabile.
- Non formulare diagnosi, non proporre terapie, non suggerire farmaci. Descrivi
  ciò che i dati mostrano e segnala cosa merita attenzione.
- Se un pilastro dello Score non è calcolabile per mancanza di dati, è
  un'informazione: mettila fra le cose da verificare, non fra i risultati.
- Scrivi in italiano, in tono asciutto e professionale. Niente incoraggiamenti,
  niente enfasi: chi legge ha cinque minuti prima di far entrare il paziente.`;

/* ── Raccolta dei dati ────────────────────────────────────────────── */

/**
 * Tutto ciò che il modello può leggere di un paziente.
 *
 * Le query passano dal client di sessione: è la Row Level Security a
 * decidere cosa entra nel prompt. Condivisa con il copilot, così le due
 * funzioni AI guardano esattamente gli stessi dati.
 */
export async function collectPatientData(patientId: string) {
  const supabase = await createSupabaseServerClient();

  const [patient, scores, measurements, appointments, documents, enrollment, actions, team] =
    await Promise.all([
      supabase
        .from("patients")
        .select("patient_code, date_of_birth, sex_at_birth, height_cm, notes, profile:profiles(full_name)")
        .eq("id", patientId)
        .maybeSingle(),

      supabase
        .from("longevity_scores")
        .select("measured_on, score, coverage, summary, score_pillars(key, label, value, coverage, delta)")
        .eq("patient_id", patientId)
        .order("measured_on", { ascending: false })
        .limit(4),

      supabase
        .from("measurements")
        .select("metric_code, label, value, category, unit, measured_on")
        .eq("patient_id", patientId)
        .order("measured_on", { ascending: false })
        .limit(120),

      supabase
        .from("appointments")
        .select("service_name, status, starts_at, location, notes")
        .eq("patient_id", patientId)
        .order("starts_at", { ascending: false })
        .limit(12),

      supabase
        .from("documents")
        .select("kind, title, issued_on")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("program_enrollments")
        .select("status, started_on, ends_on, progress_pct, steps_done, steps_total, programs(name)")
        .eq("patient_id", patientId)
        .order("started_on", { ascending: false })
        .limit(3),

      supabase
        .from("recommended_actions")
        .select("title, status, pillar_key, due_on")
        .eq("patient_id", patientId)
        .in("status", ["suggested", "accepted", "in_progress"])
        .limit(15),

      supabase
        .from("care_team_members")
        .select("role_in_team, professional:professionals(title, specialty, profile:profiles(full_name))")
        .eq("patient_id", patientId)
        .is("ended_at", null),
    ]);

  return {
    anagrafica: patient.data,
    punteggi: scores.data ?? [],
    misure: measurements.data ?? [],
    appuntamenti: appointments.data ?? [],
    documenti: documents.data ?? [],
    percorsi: enrollment.data ?? [],
    azioni: actions.data ?? [],
    care_team: team.data ?? [],
  };
}

/* ── Generazione ──────────────────────────────────────────────────── */

export async function generateBriefing(patientId: string): Promise<Briefing> {
  if (!modelloAttivo()) throw new BrainNotConfiguredError();
  if (motoreConversazione() === "anthropic" && !isBrainConfigured()) throw new BrainNotConfiguredError();

  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Il briefing clinico è riservato ai professionisti.");
  }

  const dati = await collectPatientData(patientId);
  if (!dati.anagrafica) {
    throw new Error("Paziente non trovato o non accessibile.");
  }

  const richiesta = `Data di oggi: ${new Date().toISOString().slice(0, 10)}.

Dati disponibili su questo paziente:

${JSON.stringify(dati, null, 2)}`;
  const modelloUsato = motoreConversazione() === "ollama" ? `ollama:${modelloOllama()}` : BRAIN_MODEL;

  let parsed: z.infer<typeof BriefingSchema>;

  if (motoreConversazione() === "ollama") {
    const stato = await ollamaRaggiungibile();
    if (!stato.ok) throw new Error(stato.motivo ?? "Ollama non raggiungibile.");
    parsed = await generaStrutturato({ sistema: SYSTEM_PROMPT, richiesta, schema: BriefingSchema });
  } else {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: BRAIN_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { format: zodOutputFormat(BriefingSchema), effort: "high" },
      messages: [{ role: "user", content: richiesta }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Il modello ha rifiutato di produrre il briefing.");
    }
    if (!response.parsed_output) {
      throw new Error("Il modello non ha restituito un briefing leggibile.");
    }
    parsed = response.parsed_output;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("patient_briefings")
    .insert({
      patient_id: patientId,
      model: modelloUsato,
      summary: parsed.summary,
      highlights: parsed.highlights,
      open_questions: parsed.open_questions,
      // Su quanto materiale è stata scritta: serve a rileggerla domani
      // sapendo cosa il modello aveva e cosa no.
      data_window: {
        punteggi: dati.punteggi.length,
        misure: dati.misure.length,
        appuntamenti: dati.appuntamenti.length,
        documenti: dati.documenti.length,
        azioni: dati.azioni.length,
      },
      generated_by: profile.id,
    })
    .select("id, created_at, model")
    .single();

  if (error) throw new Error(`Briefing non salvato: ${error.message}`);
  const saved = data as { id: string; created_at: string; model: string | null };

  return {
    id: saved.id,
    summary: parsed.summary,
    highlights: parsed.highlights,
    openQuestions: parsed.open_questions,
    createdAt: saved.created_at,
    model: saved.model,
  };
}

/** L'ultimo briefing salvato, se c'è. */
export async function getLatestBriefing(patientId: string): Promise<Briefing | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("patient_briefings")
    .select("id, summary, highlights, open_questions, created_at, model")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    id: string;
    summary: string;
    highlights: string[];
    open_questions: string[];
    created_at: string;
    model: string | null;
  } | null;

  if (!row) return null;

  return {
    id: row.id,
    summary: row.summary,
    highlights: row.highlights ?? [],
    openQuestions: row.open_questions ?? [],
    createdAt: row.created_at,
    model: row.model,
  };
}
