"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaCartellaClinica } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";
import {
  isStatoDose,
  isStatoTerapia,
  isVia,
  normalizzaOrari,
  richiedeMotivo,
} from "@/lib/clinical/terapie";

/**
 * Cosa si fa a una terapia.
 *
 * Prescrivere, sospendere, e registrare cosa è successo a una dose. Ogni
 * gesto passa da una funzione del database e non da un `insert`, per la
 * ragione di sempre: prescrivere è due cose insieme — la riga e le
 * somministrazioni che ne discendono — e una prescrizione senza le sue
 * righe è una decisione che non produce il gesto per cui è stata presa.
 *
 * **Chi può prescrivere lo decide Postgres.** `can_prescribe()` chiede
 * disciplina medica e care team, e questa è l'unica strada: se anche
 * l'interfaccia mostrasse il modulo a un osteopata, il database lo
 * rifiuterebbe con una frase che si può leggere in pagina.
 */

async function requireClinico() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

/** Le `raise exception` delle nostre funzioni sono già scritte per essere lette. */
function leggibile(errore: unknown, ripiego: string): string {
  if (!(errore instanceof Error)) return ripiego;
  const m = errore.message;
  if (/[a-zà-ù»]\.$/i.test(m) && !m.includes("_")) return m;
  return ripiego;
}

/**
 * Dove ricompare una terapia quando cambia.
 *
 * La cartella del paziente, il giro dell'infermieristica, la schermata
 * di apertura che lo conta, e la timeline — che adesso ha una riga per
 * ogni prescrizione. `invalidaCartellaClinica` copre le prime tre; il
 * giro vive in `/pro` e nella sezione «piano», ed è quello che si
 * dimentica.
 */
function invalidaTerapie(patientId: string | null): void {
  invalidaCartellaClinica(patientId);
  revalidatePath("/pro");
  if (patientId) revalidatePath(`/pro/pazienti/${patientId}`, "layout");
}

/* ── Prescrivere ──────────────────────────────────────────────────── */

export async function prescrivi(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const farmaco = String(formData.get("farmaco") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const frequenza = String(formData.get("frequenza") ?? "").trim();
  const viaGrezza = String(formData.get("via") ?? "oral");
  const orariGrezzi = String(formData.get("orari") ?? "");
  const inizio = String(formData.get("inizio") ?? "").trim();
  const fine = String(formData.get("fine") ?? "").trim();
  const istruzioni = String(formData.get("istruzioni") ?? "").trim();

  if (!pazienteId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (farmaco.length < 2) return { esito: "errore", messaggio: "Indica il farmaco." };
  if (dose.length < 1) return { esito: "errore", messaggio: "Indica la dose." };
  if (frequenza.length < 2) {
    return { esito: "errore", messaggio: "Indica la frequenza." };
  }

  const orari = normalizzaOrari(orariGrezzi);

  if (fine && inizio && fine < inizio) {
    return { esito: "errore", messaggio: "La fine non può precedere l'inizio." };
  }

  try {
    await requireClinico();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("prescribe", {
      p_patient: pazienteId,
      p_medication: farmaco,
      p_dose: dose,
      p_frequency: frequenza,
      p_route: isVia(viaGrezza) ? viaGrezza : "oral",
      p_times: orari,
      p_starts_on: inizio || null,
      p_ends_on: fine || null,
      p_instructions: istruzioni || null,
    });

    if (error) throw new Error(error.message);

    invalidaTerapie(pazienteId);

    return {
      esito: "ok",
      messaggio:
        orari.length > 0
          ? `Prescritto. ${orari.length === 1 ? "Una dose" : `${orari.length} dosi`} al giorno nel giro dell'infermieristica.`
          : "Prescritto, al bisogno: nessuna dose programmata.",
    };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Prescrizione non salvata.") };
  }
}

/* ── Sospendere, riprendere, chiudere ─────────────────────────────── */

export async function cambiaStatoTerapia(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const prescrizioneId = String(formData.get("prescrizioneId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!prescrizioneId) return { esito: "errore", messaggio: "Terapia non indicata." };
  if (!isStatoTerapia(stato)) return { esito: "errore", messaggio: "Stato non valido." };

  if (stato !== "active" && motivo.length < 3) {
    return {
      esito: "errore",
      messaggio: "Scrivi perché: una sospensione senza motivo fra un mese non si legge.",
    };
  }

  try {
    await requireClinico();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("set_prescription_status", {
      p_prescription: prescrizioneId,
      p_status: stato,
      p_reason: motivo || null,
    });

    if (error) throw new Error(error.message);

    invalidaTerapie(pazienteId || null);

    const detto: Record<string, string> = {
      active: "Ripresa. Le dosi dei prossimi giorni sono state riprogrammate.",
      suspended: "Sospesa. Le dosi future sono state tolte dal giro.",
      completed: "Conclusa.",
      cancelled: "Annullata.",
    };
    return { esito: "ok", messaggio: detto[stato] ?? "Aggiornata." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Terapia non aggiornata.") };
  }
}

/* ── Registrare una dose ──────────────────────────────────────────── */

/**
 * Cosa è successo a questa dose.
 *
 * È il gesto più frequente di tutta l'applicazione: viene fatto decine
 * di volte al giorno, spesso in piedi, con una mano sola. Per questo
 * «somministrata» è un clic e basta — il motivo lo chiedono solo i due
 * stati che senza non si capiscono, rifiutata e saltata.
 */
export async function registraDose(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const doseId = String(formData.get("doseId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();

  if (!doseId) return { esito: "errore", messaggio: "Dose non indicata." };
  if (!isStatoDose(stato) || stato === "due") {
    return { esito: "errore", messaggio: "Stato non valido." };
  }
  if (richiedeMotivo(stato) && motivo.length < 3) {
    return {
      esito: "errore",
      messaggio:
        "Serve il motivo: una dose non data senza una ragione scritta non si riesce più a leggere fra un mese.",
    };
  }

  try {
    await requireClinico();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("record_administration", {
      p_administration: doseId,
      p_status: stato,
      p_reason: motivo || null,
      p_note: nota || null,
    });

    if (error) throw new Error(error.message);

    invalidaTerapie(pazienteId || null);

    const detto: Record<string, string> = {
      given: "Somministrata.",
      refused: "Registrato il rifiuto. Chi ha prescritto è stato avvisato.",
      skipped: "Saltata.",
      not_needed: "Registrata come non necessaria.",
    };
    return { esito: "ok", messaggio: detto[stato] ?? "Registrata." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Dose non registrata.") };
  }
}

/**
 * La scorciatoia del giro: un clic, somministrata.
 *
 * Un'azione senza stato di ritorno perché il risultato si vede: la riga
 * cambia. Un modulo con `useActionState` avrebbe messo una frase di
 * conferma sotto ognuna delle venti righe del turno.
 */
export async function somministra(formData: FormData): Promise<void> {
  await requireClinico();
  const doseId = String(formData.get("doseId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  if (!doseId) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("record_administration", {
    p_administration: doseId,
    p_status: "given",
    p_reason: null,
    p_note: null,
  });

  invalidaTerapie(pazienteId || null);
}

/**
 * Rigenerare le dosi previste.
 *
 * Serve dopo aver corretto gli orari di una terapia in corso, e sarebbe
 * automatico se non fosse che rigenerare è distruttivo per le righe
 * future: qui è un gesto, così chi lo compie sa cosa sta rifacendo.
 */
export async function rigeneraDosi(formData: FormData): Promise<void> {
  await requireClinico();
  const prescrizioneId = String(formData.get("prescrizioneId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  if (!prescrizioneId) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("generate_administrations", {
    p_prescription: prescrizioneId,
    p_days: 7,
  });

  invalidaTerapie(pazienteId || null);
}
