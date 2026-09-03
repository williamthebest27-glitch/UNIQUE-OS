"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askCopilot } from "@/lib/brain/copilot";
import type { StatoCopilot, StatoTesto } from "@/lib/clinical/state";

/**
 * Ciò che un professionista fa dentro la cartella: chiedere al copilot,
 * scrivere una nota o una valutazione, proporre un nuovo step del percorso,
 * chiudere un task.
 */

async function requireStaff() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

/* ── Copilot ──────────────────────────────────────────────────────── */

export async function chiediAlCopilot(
  _prev: StatoCopilot,
  formData: FormData,
): Promise<StatoCopilot> {
  const patientId = String(formData.get("patientId") ?? "");
  // Le domande pronte arrivano come pulsanti di invio: se il campo di testo
  // è vuoto, la domanda è quella su cui si è cliccato.
  const scritta = String(formData.get("question") ?? "").trim();
  const domanda = scritta || String(formData.get("preset") ?? "").trim();

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (domanda.length < 3) {
    return { esito: "errore", messaggio: "Scrivi una domanda un po’ più lunga." };
  }

  try {
    await requireStaff();
    const risposta = await askCopilot(patientId, domanda);
    revalidatePath(`/pro/pazienti/${patientId}`);
    return {
      esito: "ok",
      domanda,
      risposta: risposta.answer,
      fonti: risposta.sources,
    };
  } catch (error) {
    console.error("[copilot] richiesta fallita:", error);
    return {
      esito: "errore",
      domanda,
      messaggio:
        error instanceof Error ? error.message : "Il copilot non ha risposto.",
    };
  }
}

/* ── Note e valutazioni ───────────────────────────────────────────── */

export async function salvaNota(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const patientId = String(formData.get("patientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "note");
  const visibile = formData.get("visible") === "on";

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (body.length < 3) return { esito: "errore", messaggio: "La nota è vuota." };

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("clinical_notes").insert({
      patient_id: patientId,
      author_id: profile.id,
      kind,
      title: title || null,
      body,
      visible_to_patient: visibile,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/pro/pazienti/${patientId}`);
    return {
      esito: "ok",
      messaggio: visibile
        ? "Salvata e condivisa con il paziente."
        : "Salvata, visibile solo al care team.",
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Nota non salvata.",
    };
  }
}

/* ── Proposte di percorso ─────────────────────────────────────────── */

export async function proponiStep(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const patientId = String(formData.get("patientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (title.length < 3) return { esito: "errore", messaggio: "Manca il titolo dello step." };

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("care_plan_proposals").insert({
      patient_id: patientId,
      proposed_by: profile.id,
      title,
      description: description || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/pro/pazienti/${patientId}`);
    return { esito: "ok", messaggio: "Proposta inviata: la decide un medico." };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Proposta non inviata.",
    };
  }
}

/**
 * Accetta o rifiuta uno step proposto.
 *
 * La Row Level Security permette l'aggiornamento solo a chi può decidere
 * (`can_approve_clinical_flag`): qui non serve un secondo controllo, e
 * metterlo darebbe la falsa impressione che sia quello a proteggere.
 */
export async function decidiStep(formData: FormData): Promise<void> {
  await requireStaff();
  const proposalId = String(formData.get("proposalId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!proposalId || !["accepted", "rejected"].includes(decision)) return;

  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("care_plan_proposals")
    .update({
      status: decision,
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("status", "proposed");

  if (patientId) revalidatePath(`/pro/pazienti/${patientId}`);
}

/* ── Correzioni manuali dei crediti ───────────────────────────────── */

/**
 * Correzione manuale del saldo crediti.
 *
 * Non modifica nulla: aggiunge una riga al registro. Il saldo è la somma
 * dei movimenti, quindi correggere significa scrivere la correzione — e
 * lo storico resta leggibile per intero, con chi l'ha fatta e perché.
 *
 * Il motivo è obbligatorio, e non solo qui: un vincolo sul database
 * rifiuta le correzioni senza descrizione.
 */
export async function correggiCrediti(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const patientId = String(formData.get("patientId") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (!Number.isFinite(amount) || amount === 0) {
    return { esito: "errore", messaggio: "Indica di quanti crediti correggere." };
  }
  if (reason.length < 3) {
    return { esito: "errore", messaggio: "Scrivi il motivo della correzione." };
  }

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("credit_entries").insert({
      patient_id: patientId,
      entry_type: "adjustment",
      amount,
      description: reason,
      created_by: profile.id,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/pro/pazienti/${patientId}`);
    revalidatePath("/crediti");
    return {
      esito: "ok",
      messaggio: `Correzione di ${amount > 0 ? "+" : "−"}${Math.abs(amount)} registrata.`,
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Correzione non registrata.",
    };
  }
}

/* ── Task ─────────────────────────────────────────────────────────── */

export async function chiudiTask(formData: FormData): Promise<void> {
  await requireStaff();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("professional_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "open");

  revalidatePath("/pro");
}
