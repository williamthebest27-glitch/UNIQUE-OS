"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getMetric } from "@/lib/score/metrics";
import { recomputeAndStoreScore } from "@/lib/score/service";
import { analyzeDocument } from "@/lib/brain/analyze";
import { generateBriefing } from "@/lib/brain/briefing";

/**
 * Le azioni con cui un professionista chiude il ciclo: chiedere l'analisi
 * di un documento, approvare o rifiutare i valori che l'AI propone.
 *
 * L'approvazione è il punto in cui la responsabilità clinica torna a una
 * persona. Finché una proposta resta in coda, non tocca né le misure né
 * il punteggio del paziente.
 */

async function requireClinicalStaff() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

export async function analizzaDocumento(formData: FormData): Promise<void> {
  await requireClinicalStaff();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) throw new Error("Documento non indicato.");

  await analyzeDocument(documentId);

  const patientId = String(formData.get("patientId") ?? "");
  if (patientId) revalidatePath(`/pro/pazienti/${patientId}`);
  revalidatePath("/pro/revisioni");
}

/** "Riassumimi questo paziente prima della visita." */
export async function generaBriefing(formData: FormData): Promise<void> {
  await requireClinicalStaff();
  const patientId = String(formData.get("patientId") ?? "");
  if (!patientId) throw new Error("Paziente non indicato.");

  await generateBriefing(patientId);
  revalidatePath(`/pro/pazienti/${patientId}`);
}

export async function approvaProposta(formData: FormData): Promise<void> {
  const profile = await requireClinicalStaff();
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) throw new Error("Proposta non indicata.");

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("measurement_proposals")
    .select(
      "id, patient_id, analysis_id, metric_code, label, value, category, unit, measured_on, confidence, status, analysis:document_analyses(document_id)",
    )
    .eq("id", proposalId)
    .maybeSingle();

  const proposal = data as {
    id: string;
    patient_id: string;
    analysis_id: string;
    metric_code: string;
    label: string;
    value: number | null;
    category: string | null;
    unit: string | null;
    measured_on: string;
    confidence: number;
    status: string;
    analysis: { document_id: string } | null;
  } | null;

  if (!proposal) throw new Error("Proposta non trovata o non accessibile.");
  // Una proposta già decisa non si ridecide: la seconda approvazione
  // sarebbe un doppio clic, non una scelta.
  if (proposal.status !== "needs_review") return;

  const metric = getMetric(proposal.metric_code);

  const { data: inserted, error } = await supabase
    .from("measurements")
    .upsert(
      {
        patient_id: proposal.patient_id,
        metric_code: proposal.metric_code,
        label: proposal.label,
        value: proposal.value,
        category: proposal.category,
        unit: proposal.unit ?? metric?.unit ?? null,
        measured_on: proposal.measured_on,
        source: metric?.source ?? "lab",
        document_id: proposal.analysis?.document_id ?? null,
        analysis_id: proposal.analysis_id,
        entered_by: profile.id,
        confidence: proposal.confidence,
      },
      { onConflict: "patient_id,metric_code,measured_on,source" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Misura non salvata: ${error.message}`);

  await supabase
    .from("measurement_proposals")
    .update({
      status: "approved",
      measurement_id: (inserted as { id: string }).id,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proposalId);

  await recomputeAndStoreScore(supabase, proposal.patient_id);
  revalidatePath("/pro/revisioni");
}

/**
 * Ricalcola il punteggio di un paziente dalle misure già in archivio.
 *
 * Serve dopo un caricamento massivo di dati, dopo un cambio di formula, e
 * per verificare il motore senza passare da un documento.
 */
export async function ricalcolaPunteggio(formData: FormData): Promise<void> {
  await requireClinicalStaff();
  const patientId = String(formData.get("patientId") ?? "");
  if (!patientId) throw new Error("Paziente non indicato.");

  const supabase = await createSupabaseServerClient();
  await recomputeAndStoreScore(supabase, patientId);
  revalidatePath("/pro/revisioni");
}

export async function rifiutaProposta(formData: FormData): Promise<void> {
  const profile = await requireClinicalStaff();
  const proposalId = String(formData.get("proposalId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!proposalId) throw new Error("Proposta non indicata.");

  const supabase = await createSupabaseServerClient();

  await supabase
    .from("measurement_proposals")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq("id", proposalId)
    .eq("status", "needs_review");

  revalidatePath("/pro/revisioni");
}
