"use server";

import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaMessaggiClinici } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";

/**
 * Scrivere a un paziente, dalla parte della clinica.
 *
 * Le funzioni del database sono le stesse che usa il paziente:
 * `open_thread` e `send_message` guardano chi le chiama e decidono da
 * sé da che parte del filo nasce il messaggio, chi va avvisato e quale
 * evento emettere. Riscriverne una versione «per lo staff» avrebbe
 * significato due strade per lo stesso fatto, e prima o poi due
 * comportamenti diversi.
 *
 * **La categoria decide chi legge.** Un filo clinico lo vedono il
 * paziente e il suo care team; uno amministrativo lo vede anche la
 * reception, che è chi risponde di appuntamenti e fatture. Sceglierla è
 * la sola decisione vera nell'aprire una conversazione, ed è per questo
 * che il modulo la chiede in chiaro invece di assumerla.
 */

async function requireStaff() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

/* ── Aprire ───────────────────────────────────────────────────────── */

export async function apriFiloClinico(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const patientId = String(formData.get("patientId") ?? "").trim();
  const oggetto = String(formData.get("oggetto") ?? "").trim();
  const corpo = String(formData.get("corpo") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "clinical");

  if (!patientId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (oggetto.length < 3) {
    return { esito: "errore", messaggio: "Serve un oggetto: è quello che si legge nell'elenco." };
  }
  if (corpo.length < 3) return { esito: "errore", messaggio: "Il messaggio è vuoto." };
  if (!["clinical", "administrative"].includes(categoria)) {
    return { esito: "errore", messaggio: "Categoria non valida." };
  }

  try {
    await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("open_thread", {
      p_subject: oggetto,
      p_body: corpo,
      p_category: categoria,
      p_patient: patientId,
    });

    if (error) throw new Error(error.message);

    invalidaMessaggiClinici(patientId);
    return {
      esito: "ok",
      messaggio:
        categoria === "clinical"
          ? "Inviato. Lo vedono il paziente e il suo care team."
          : "Inviato. Lo vede anche la reception.",
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Messaggio non inviato.",
    };
  }
}

/* ── Rispondere ───────────────────────────────────────────────────── */

export async function rispondiAlPaziente(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const threadId = String(formData.get("threadId") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();
  const corpo = String(formData.get("corpo") ?? "").trim();

  if (!threadId) return { esito: "errore", messaggio: "Conversazione non indicata." };
  if (corpo.length < 2) return { esito: "errore", messaggio: "Il messaggio è vuoto." };

  try {
    await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("send_message", {
      p_thread: threadId,
      p_body: corpo,
    });

    if (error) throw new Error(error.message);

    // Rispondere è anche leggere: lasciare il pallino acceso dopo aver
    // risposto è il modo più rapido per farlo ignorare.
    await segnaLetti(threadId);

    invalidaMessaggiClinici(patientId || null);
    return { esito: "ok", messaggio: "Risposta inviata." };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: error instanceof Error ? error.message : "Risposta non inviata.",
    };
  }
}

/* ── Segnare letto ────────────────────────────────────────────────── */

/**
 * Marca letti i messaggi del paziente su un filo.
 *
 * Il timestamp è su tutta la clinica e non per persona: `messages` ha un
 * `read_by_staff_at` solo. È la scelta giusta per una coda condivisa —
 * quando qualcuno ha letto, il lavoro non è più di nessun altro — ma va
 * saputa: non dice *chi* ha letto. Per quello c'è il registro degli
 * accessi.
 */
async function segnaLetti(threadId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("messages")
    .update({ read_by_staff_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("from_patient", true)
    .is("read_by_staff_at", null);
}

export async function segnaFiloLetto(formData: FormData): Promise<void> {
  await requireStaff();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();
  if (!threadId) return;

  await segnaLetti(threadId);
  invalidaMessaggiClinici(patientId || null);
}

/* ── Chiudere ─────────────────────────────────────────────────────── */

/**
 * Chiudere un filo.
 *
 * Non cancella niente e non impedisce di rileggerlo: toglie soltanto la
 * possibilità di scriverci — `send_message` rifiuta un filo chiuso — e
 * lo fa sparire dalla coda. Una conversazione conclusa che resta in
 * elenco è indistinguibile da una a cui nessuno ha risposto.
 */
export async function chiudiFilo(formData: FormData): Promise<void> {
  await requireStaff();
  const threadId = String(formData.get("threadId") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();
  const riapri = formData.get("riapri") === "true";
  if (!threadId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("message_threads")
    .update({ is_closed: !riapri })
    .eq("id", threadId);

  invalidaMessaggiClinici(patientId || null);
}
