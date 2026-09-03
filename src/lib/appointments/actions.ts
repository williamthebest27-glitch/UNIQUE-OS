"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StatoPrenotazione } from "@/lib/appointments/state";

/**
 * Prenotare e disdire.
 *
 * Entrambe passano da funzioni del database, non da una update sulla
 * tabella: il controllo di chi può fare cosa, la verifica dei crediti
 * disponibili e il movimento del registro devono avvenire insieme o non
 * avvenire. Una transazione, non tre chiamate che possono fallire a metà.
 */

function messaggioLeggibile(raw: string): string {
  // Le eccezioni di Postgres arrivano con prefissi che non dicono nulla
  // a chi legge. Il testo che scriviamo nelle funzioni sì.
  return raw.replace(/^.*?(?:ERROR|error):\s*/i, "").trim() || "Operazione non riuscita.";
}

export async function prenotaSlot(
  _prev: StatoPrenotazione,
  formData: FormData,
): Promise<StatoPrenotazione> {
  const slotId = String(formData.get("slotId") ?? "");
  if (!slotId) return { esito: "errore", messaggio: "Disponibilità non indicata." };

  try {
    await requireProfile();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("book_slot", { p_slot: slotId });
    if (error) throw new Error(error.message);

    revalidatePath("/appuntamenti");
    revalidatePath("/crediti");
    revalidatePath("/dashboard");
    return { esito: "ok", messaggio: "Appuntamento prenotato." };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: messaggioLeggibile(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

export async function disdiciAppuntamento(
  _prev: StatoPrenotazione,
  formData: FormData,
): Promise<StatoPrenotazione> {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!appointmentId) {
    return { esito: "errore", messaggio: "Appuntamento non indicato." };
  }

  try {
    await requireProfile();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("cancel_appointment", {
      p_appointment: appointmentId,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/appuntamenti");
    revalidatePath("/crediti");
    revalidatePath("/dashboard");
    return { esito: "ok", messaggio: "Appuntamento disdetto." };
  } catch (error) {
    return {
      esito: "errore",
      messaggio: messaggioLeggibile(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

/**
 * Segna l'esito di una visita: presente o assente.
 *
 * È il passaggio che, sul mancato arrivo, addebita il credito. Lo fa il
 * trigger, non questa funzione.
 */
export async function registraEsito(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (profile.role === "patient") throw new Error("Azione riservata ai professionisti.");

  const appointmentId = String(formData.get("appointmentId") ?? "");
  const attended = formData.get("attended") === "true";
  if (!appointmentId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("appointments")
    .update({
      status: attended ? "completed" : "no_show",
      attendance: attended ? "attended" : "no_show",
    })
    .eq("id", appointmentId)
    .in("status", ["scheduled", "confirmed"]);

  const patientId = String(formData.get("patientId") ?? "");
  if (patientId) revalidatePath(`/pro/pazienti/${patientId}`);
  revalidatePath("/pro");
}
