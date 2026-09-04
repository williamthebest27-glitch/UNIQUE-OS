"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaAttenzione, invalidaLavoro } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";

/**
 * Cosa si fa a un segnale.
 *
 * Tre gesti, e sono deliberatamente asimmetrici:
 *
 *   **Accettare** trasforma il segnale in un task con un incaricato. È
 *   l'unico che scrive qualcosa di duraturo, ed è il motivo per cui
 *   esiste il pulsante: un suggerimento che si può solo leggere non
 *   produce lavoro, produce colpa.
 *
 *   **Modificare** è accettare con parole proprie. Non è un gesto a
 *   parte nel database — è lo stesso insert con un titolo diverso — ma è
 *   un gesto a parte per chi lo compie, e va offerto come tale: il
 *   motore propone «Richiamare per il referto», il medico sa che il
 *   punto è un'altra cosa e la scrive.
 *
 *   **Mettere a tacere** non cancella niente. Sopprime la riga per una
 *   settimana e chiede perché. Il referto non revisionato resta non
 *   revisionato, e torna.
 *
 * Nessuno dei tre tocca un dato clinico. È la ragione per cui possono
 * stare qui, senza passare dal catalogo delle azioni approvabili del
 * Brain: creare un task è reversibile, silenziare una riga anche.
 */

async function requireStaff() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

/* ── Accettare: il segnale diventa lavoro ─────────────────────────── */

/**
 * Da suggerimento a task.
 *
 * `origin: "brain"` anche quando il suggerimento nasce da una soglia e
 * non da un modello: l'origine dice a chi legge il task fra un mese che
 * non l'ha scritto una persona, ed è quella l'informazione che conta —
 * non quale pezzo di software l'ha prodotto.
 *
 * L'incaricato predefinito è chi accetta. Un task senza incaricato non è
 * un task: è un desiderio, e lo dice anche il commento sulla tabella.
 */
export async function accettaSegnale(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const titolo = String(formData.get("titolo") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();
  const dettaglio = String(formData.get("dettaglio") ?? "").trim();
  const scadenza = String(formData.get("scadenza") ?? "").trim();
  const priorita = Number(formData.get("priorita") ?? 2);

  if (titolo.length < 3) {
    return { esito: "errore", messaggio: "Scrivi cosa c'è da fare." };
  }

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("tasks").insert({
      title: titolo,
      detail: dettaglio || null,
      patient_id: patientId || null,
      owner_id: profile.id,
      created_by: profile.id,
      due_on: scadenza || null,
      priority: [1, 2, 3].includes(priorita) ? priorita : 2,
      origin: "brain",
      category: "clinical",
      status: "open",
    });

    if (error) throw new Error(error.message);

    invalidaLavoro();
    return { esito: "ok", messaggio: "Task creato e assegnato a te." };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Task non creato.",
    };
  }
}

/* ── Mettere a tacere ─────────────────────────────────────────────── */

/** Quanti giorni dura il silenzio, se non si dice altro. */
const GIORNI_SILENZIO = 7;

export async function mettiATacere(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const signalId = String(formData.get("signalId") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const giorni = Number(formData.get("giorni") ?? GIORNI_SILENZIO);

  if (!signalId) return { esito: "errore", messaggio: "Segnale non indicato." };

  try {
    const profile = await requireStaff();
    const supabase = await createSupabaseServerClient();

    const durata = Number.isFinite(giorni) && giorni > 0 && giorni <= 90 ? giorni : GIORNI_SILENZIO;
    const fino = new Date(Date.now() + durata * 86_400_000).toISOString().slice(0, 10);

    // Un secondo «ignora» sullo stesso segnale non è un errore: è
    // qualcuno che rinvia di nuovo, e va scritto sopra al primo.
    const { error } = await supabase.from("signal_dismissals").upsert(
      {
        signal_id: signalId,
        profile_id: profile.id,
        patient_id: patientId || null,
        reason: motivo || null,
        until: fino,
      },
      { onConflict: "signal_id,profile_id" },
    );

    if (error) throw new Error(error.message);

    invalidaAttenzione();
    return {
      esito: "ok",
      messaggio: `Rimandato di ${durata} ${durata === 1 ? "giorno" : "giorni"}. Il fatto resta.`,
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Non è stato messo a tacere.",
    };
  }
}

/** Far tornare subito un segnale rimandato. */
export async function riattivaSegnale(formData: FormData): Promise<void> {
  const signalId = String(formData.get("signalId") ?? "").trim();
  if (!signalId) return;

  const profile = await requireStaff();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("signal_dismissals")
    .delete()
    .eq("signal_id", signalId)
    .eq("profile_id", profile.id);

  invalidaAttenzione();
}

/** Far tornare tutto ciò che è stato rimandato. */
export async function riattivaTutto(): Promise<void> {
  const profile = await requireStaff();
  const supabase = await createSupabaseServerClient();

  await supabase.from("signal_dismissals").delete().eq("profile_id", profile.id);

  invalidaAttenzione();
}

/* ── Prendere in carico un task ───────────────────────────────────── */

/**
 * Assegnarsi un task che non ha incaricato.
 *
 * Il gesto che manca sempre negli elenchi condivisi: senza, due persone
 * fanno lo stesso lavoro oppure nessuna delle due, e in entrambi i casi
 * l'elenco ha mentito.
 */
export async function prendiInCarico(formData: FormData): Promise<void> {
  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) return;

  const profile = await requireStaff();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("tasks")
    .update({ owner_id: profile.id })
    .eq("id", taskId)
    .eq("status", "open");

  invalidaLavoro();
}

/** Lasciare un task che si era preso: torna alla coda del team. */
export async function lasciaTask(formData: FormData): Promise<void> {
  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) return;

  const profile = await requireStaff();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("tasks")
    .update({ owner_id: null })
    .eq("id", taskId)
    .eq("owner_id", profile.id)
    .eq("status", "open");

  invalidaLavoro();
}

/* ── Notifiche ────────────────────────────────────────────────────── */

/**
 * Segnare letta una notifica.
 *
 * `notifications.profile_id` è personale — a differenza di
 * `read_by_staff_at` sui messaggi, che è di tutta la clinica. Qui il
 * filtro sul proprio profilo c'è comunque, oltre alla policy: una
 * notifica altrui non si tocca nemmeno per errore.
 */
export async function segnaNotificaLetta(formData: FormData): Promise<void> {
  const profile = await requireStaff();
  const id = String(formData.get("notificaId") ?? "").trim();
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profile.id)
    .is("read_at", null);

  revalidatePath("/pro/notifiche");
  invalidaAttenzione();
}

/** Segnare lette tutte le proprie. */
export async function segnaTutteLette(): Promise<void> {
  const profile = await requireStaff();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);

  revalidatePath("/pro/notifiche");
  invalidaAttenzione();
}
