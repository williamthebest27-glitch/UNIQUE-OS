"use server";

import { revalidatePath } from "next/cache";
import {
  invalidaCartellaClinica,
  invalidaCrediti,
  invalidaLavoro,
} from "@/lib/cache/invalidazione";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askCopilot } from "@/lib/brain/copilot";
import { getMetric } from "@/lib/score/metrics";
import { recomputeAndStoreScore } from "@/lib/score/service";
import {
  canWriteMetric,
  DISCIPLINE_LABELS,
  type Discipline,
} from "@/lib/professionals/disciplines";
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

  // Un passo accettato compare nel piano del paziente, non solo nella
  // cartella di chi lo ha deciso.
  invalidaCartellaClinica(patientId || null);
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

    invalidaCrediti(patientId);
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
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "open");

  // La stessa tabella la legge anche la lista di lavoro del banco.
  invalidaLavoro();
}

/* ── Misure prese in visita ───────────────────────────────────────── */

/**
 * Una misura rilevata durante la visita.
 *
 * È l'altra strada per cui un valore entra in cartella: la prima passa
 * da un referto, dalla lettura automatica e dalla coda di revisione;
 * questa da una persona che ha in mano uno strumento. Non ha bisogno di
 * approvazione perché **l'approvazione è il gesto stesso** — chi la
 * scrive la sta firmando, e la riga registra chi è.
 *
 * Le due regole che valgono comunque:
 *
 *   **La competenza per disciplina.** Un osteopata non scrive un
 *   pannello lipidico. La regola vive in `professionals/disciplines.ts`
 *   perché dipende dal catalogo delle metriche, che è versionato con
 *   l'algoritmo dello Score.
 *
 *   **La plausibilità.** Un valore fuori dall'intervallo fisiologico non
 *   è un paziente messo male: è quasi sempre un errore di unità o una
 *   cifra in più, e va fermato prima di entrare — dove costerebbe un
 *   punteggio sbagliato e una segnalazione che nessuno capisce.
 *
 * Il punteggio si ricalcola subito: una misura presa in visita deve
 * poter cambiare lo Score mentre il paziente è ancora lì.
 */
export async function registraMisura(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const patientId = String(formData.get("patientId") ?? "").trim();
  const codice = String(formData.get("metricCode") ?? "").trim();
  const grezzo = String(formData.get("valore") ?? "").replace(",", ".").trim();
  const quando = String(formData.get("misurataIl") ?? "").trim();

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (!codice) return { esito: "errore", messaggio: "Scegli il parametro da registrare." };

  const metrica = getMetric(codice);
  if (!metrica) {
    return { esito: "errore", messaggio: "Parametro non presente nel catalogo." };
  }

  const valore = Number(grezzo);
  if (!Number.isFinite(valore)) {
    return { esito: "errore", messaggio: "Il valore non è un numero." };
  }

  const [minimo, massimo] = metrica.plausible;
  if (valore < minimo || valore > massimo) {
    return {
      esito: "errore",
      messaggio: `${valore} ${metrica.unit} è fuori dall'intervallo fisiologicamente plausibile (${minimo}–${massimo}). Controlla l'unità di misura.`,
    };
  }

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    if (profile.role === "professional") {
      const { data: proRow } = await supabase
        .from("professionals")
        .select("discipline")
        .eq("profile_id", profile.id)
        .maybeSingle();

      const disciplina =
        (proRow as { discipline: Discipline } | null)?.discipline ?? "other";

      if (!canWriteMetric(disciplina, codice)) {
        return {
          esito: "errore",
          messaggio: `${DISCIPLINE_LABELS[disciplina]}: questo parametro è fuori dal tuo ambito di competenza.`,
        };
      }
    }

    const data = quando || new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("measurements").upsert(
      {
        patient_id: patientId,
        metric_code: codice,
        label: metrica.label,
        value: valore,
        unit: metrica.unit,
        measured_on: data,
        source: "professional",
        entered_by: profile.id,
      },
      { onConflict: "patient_id,metric_code,measured_on,source" },
    );

    if (error) throw new Error(error.message);

    await recomputeAndStoreScore(supabase, patientId);
    invalidaCartellaClinica(patientId);

    const fuoriSoglia = metrica.clinicalAlert?.(valore) ?? false;

    return {
      esito: "ok",
      messaggio: fuoriSoglia
        ? `${metrica.label}: ${valore} ${metrica.unit} registrato. È oltre la soglia clinica.`
        : `${metrica.label}: ${valore} ${metrica.unit} registrato. Punteggio ricalcolato.`,
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Misura non registrata.",
    };
  }
}
