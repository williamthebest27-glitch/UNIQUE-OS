import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recomputeAndStoreScore, loadLatestValues } from "@/lib/score/service";
import { getMetric } from "@/lib/score/metrics";
import {
  BrainNotConfiguredError,
  BRAIN_MODEL,
  extractFromDocument,
  isBrainConfigured,
} from "@/lib/brain/extraction";
import { validateExtraction, type ValidatedProposal } from "@/lib/brain/validation";
import { modelloAttivo, motoreConversazione } from "@/lib/brain/fornitore";
import { modelloOllama } from "@/lib/brain/ollama";
import { estraiSenzaModello } from "@/lib/clinical/estrazione-propria";
import { createSupabaseServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

/**
 * Il ciclo completo descritto nella visione, per un singolo documento:
 * riconoscere il tipo, estrarre i parametri, strutturarli, confrontarli
 * con lo storico, identificare le variazioni, proporre l'aggiornamento
 * dei sottoscore, generare una sintesi e suggerire gli approfondimenti.
 *
 * L'unico passo affidato al modello è l'estrazione. Tutto il resto —
 * validazione, confronto, decisione su cosa entra da solo e cosa aspetta
 * un medico — è codice deterministico e testato.
 */

export interface AnalysisOutcome {
  analysisId: string;
  summary: string;
  nextSteps: string[];
  autoApplied: number;
  pendingReview: number;
  discarded: number;
  /** Punteggio ricalcolato dopo le misure applicate in automatico. */
  newScore: number | null;
}

const BUCKET = "patient-documents";

/**
 * L’analisi di un documento caricato dal paziente richiede la chiave
 * privilegiata. Senza, il referto resta comunque salvato e il care team
 * viene avvisato: lo analizzerà un professionista.
 */
export class ServiceRoleRequiredError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY non è impostata: i documenti caricati dai pazienti non vengono analizzati in automatico.",
    );
    this.name = "ServiceRoleRequiredError";
  }
}

export async function analyzeDocument(documentId: string): Promise<AnalysisOutcome> {

  const profile = await requireProfile();
  const session = await createSupabaseServerClient();

  const { data: docData, error: docError } = await session
    .from("documents")
    .select("id, patient_id, title, storage_path, mime_type, issued_on, kind")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) throw new Error(`Documento non leggibile: ${docError.message}`);
  const document = docData as {
    id: string;
    patient_id: string;
    title: string;
    storage_path: string;
    mime_type: string | null;
    issued_on: string | null;
    kind: string;
  } | null;

  // Se la Row Level Security non restituisce la riga, l'utente non ha
  // titolo per vedere quel documento: non c'è altro da dire.
  if (!document) throw new Error("Documento non trovato o non accessibile.");

  // Il controllo di accesso è appena avvenuto con i permessi dell’utente.
  // Un paziente però non può scrivere analisi e proposte — vedrebbe valori
  // non ancora validati — quindi da qui in poi la scrittura passa dalla
  // chiave privilegiata, su un documento già verificato come suo.
  const needsPrivilege = profile.role === "patient";
  if (needsPrivilege && !isServiceRoleConfigured()) {
    throw new ServiceRoleRequiredError();
  }
  const supabase = needsPrivilege ? createSupabaseServiceClient() : session;

  const { data: analysisRow, error: analysisError } = await supabase
    .from("document_analyses")
    .insert({
      document_id: document.id,
      patient_id: document.patient_id,
      status: "pending",
      model:
        motoreConversazione() === "anthropic"
          ? BRAIN_MODEL
          : motoreConversazione() === "ollama"
            ? `ollama:${modelloOllama()}`
            : "lettore-unique",
      requested_by: profile.id,
    })
    .select("id")
    .single();

  if (analysisError) throw new Error(`Analisi non avviabile: ${analysisError.message}`);
  const analysisId = (analysisRow as { id: string }).id;

  try {
    const file = await supabase.storage.from(BUCKET).download(document.storage_path);
    if (file.error || !file.data) {
      throw new Error(`File non scaricabile: ${file.error?.message ?? "assente"}`);
    }

    const contenuto = new Uint8Array(await file.data.arrayBuffer());

    /*
     * Chi legge il referto.
     *
     * Il lettore proprietario è la strada normale: ricostruisce le righe
     * del PDF, riconosce gli esami dai sinonimi del catalogo, converte le
     * unità e dichiara quanto è sicuro di ogni valore. Non esce niente
     * dall'infrastruttura — e un referto è il documento più sensibile che
     * questa applicazione tocchi.
     *
     * Il modello si accende di proposito, e serve dove il lettore si
     * ferma: referti scansionati, impaginazioni fuori dall'ordinario,
     * documenti che non sono referti.
     *
     * Quello che cambia è **solo** chi legge. Validazione, confronto con
     * lo storico e decisione su cosa richiede un medico restano lo stesso
     * codice deterministico di prima.
     */
    const extraction =
      modelloAttivo()
        ? await extractFromDocument({
            data: Buffer.from(contenuto).toString("base64"),
            mimeType: document.mime_type ?? "application/pdf",
            fileName: document.title,
          })
        : await estraiSenzaModello({
            dati: contenuto,
            mimeType: document.mime_type,
          });

    const previousValues = await loadLatestValues(supabase, document.patient_id);
    const { proposals, discarded } = validateExtraction(extraction.measurements, {
      previousValues,
      documentDate: extraction.document_date ?? document.issued_on,
      today: new Date().toISOString().slice(0, 10),
    });

    await supabase
      .from("document_analyses")
      .update({
        status: "completed",
        detected_kind: extraction.document_kind,
        detected_date: extraction.document_date,
        summary: extraction.summary,
        next_steps: extraction.next_steps,
        raw: extraction,
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysisId);

    // Classificazione automatica: un documento caricato dal paziente arriva
    // senza categoria, e la data la conosce solo il referto. Non sovrascriviamo
    // mai una classificazione già decisa da una persona.
    const documentPatch: Record<string, unknown> = {};
    if (document.kind === "other") documentPatch.kind = extraction.document_kind;
    if (!document.issued_on && extraction.document_date) {
      documentPatch.issued_on = extraction.document_date;
    }
    if (Object.keys(documentPatch).length > 0) {
      await supabase.from("documents").update(documentPatch).eq("id", document.id);
    }

    // Le misure che passano ogni regola entrano subito; le altre restano
    // in coda e nel frattempo non toccano il punteggio del paziente.
    const autoApplied = proposals.filter((p) => p.status === "auto_applied");
    const measurementIds = await insertMeasurements(
      supabase,
      document.patient_id,
      document.id,
      analysisId,
      profile.id,
      autoApplied,
    );

    if (proposals.length > 0) {
      await supabase.from("measurement_proposals").insert(
        proposals.map((proposal) => ({
          analysis_id: analysisId,
          patient_id: document.patient_id,
          metric_code: proposal.metricCode,
          label: proposal.label,
          value: proposal.value,
          category: proposal.category,
          unit: proposal.unit,
          measured_on: proposal.measuredOn,
          confidence: proposal.confidence,
          source_excerpt: proposal.sourceExcerpt,
          previous_value: proposal.previousValue,
          delta: proposal.delta,
          status: proposal.status,
          review_reasons: proposal.reviewReasons,
          measurement_id: measurementIds[proposal.metricCode] ?? null,
        })),
      );
    }

    const { result } = await recomputeAndStoreScore(supabase, document.patient_id);

    return {
      analysisId,
      summary: extraction.summary,
      nextSteps: extraction.next_steps,
      autoApplied: autoApplied.length,
      pendingReview: proposals.length - autoApplied.length,
      discarded: discarded.length,
      newScore: result.score,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("document_analyses")
      .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
      .eq("id", analysisId);
    throw error;
  }
}

/** Scrive le misure e restituisce l'id creato per ciascuna metrica. */
async function insertMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  patientId: string,
  documentId: string,
  analysisId: string,
  actorId: string,
  proposals: ValidatedProposal[],
): Promise<Record<string, string>> {
  if (proposals.length === 0) return {};

  const rows = proposals.map((proposal) => {
    const metric = getMetric(proposal.metricCode);
    return {
      patient_id: patientId,
      metric_code: proposal.metricCode,
      label: proposal.label,
      value: proposal.value,
      category: proposal.category,
      unit: proposal.unit ?? metric?.unit ?? null,
      measured_on: proposal.measuredOn,
      source: metric?.source ?? "lab",
      document_id: documentId,
      analysis_id: analysisId,
      entered_by: actorId,
      confidence: proposal.confidence,
    };
  });

  // Stesso parametro, stesso giorno, stessa fonte: è la stessa misura.
  // Un secondo caricamento dello stesso referto non deve duplicarla.
  const { data, error } = await supabase
    .from("measurements")
    .upsert(rows, { onConflict: "patient_id,metric_code,measured_on,source" })
    .select("id, metric_code");

  if (error) throw new Error(`Salvataggio delle misure fallito: ${error.message}`);

  return Object.fromEntries(
    ((data ?? []) as { id: string; metric_code: string }[]).map((r) => [r.metric_code, r.id]),
  );
}
