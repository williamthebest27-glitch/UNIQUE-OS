"use server";

import { revalidatePath } from "next/cache";
import {
  invalidaAgenda,
  invalidaCrediti,
  invalidaNumeriDirezione,
  invalidaTeamClinico,
} from "@/lib/cache/invalidazione";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";
import type { AppRole, Profile } from "@/lib/domain/types";
import { conflitti, descriviConflitti, fineDa, orarioAmmesso, type AppuntamentoInAgenda } from "@/lib/gestione/agenda";
import { generaSlot, giorniFra, romaComeIso, type Turno } from "@/lib/gestione/disponibilita";
import { centesimiDa } from "@/lib/gestione/importi";
import { messaggioLeggibile, type EsitoGestione } from "@/lib/gestione/state";

/**
 * Le azioni del gestionale.
 *
 * Tutte seguono la stessa forma: chi sei, cosa chiedi, il controllo che
 * la reception farebbe a mente se avesse tempo, poi la scrittura. La
 * scrittura passa dal client di sessione, quindi dalla Row Level
 * Security; la chiave privilegiata compare in un punto solo — creare
 * l'utente dietro a un paziente o un professionista nuovo — perché gli
 * utenti li crea soltanto il sistema di autenticazione.
 *
 * Nessuna azione lancia: torna una frase. Al banco un errore deve
 * leggersi, non aprire una pagina grigia.
 */

const BANCO: AppRole[] = ["admin", "owner", "reception"];
const DIREZIONE: AppRole[] = ["admin", "owner"];

function testo(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function opzionale(formData: FormData, campo: string): string | null {
  return testo(formData, campo) || null;
}

async function richiedi(ruoli: AppRole[], cosa: string): Promise<Profile> {
  const profile = await requireProfile();
  if (!ruoli.includes(profile.role)) throw new Error(`${cosa}: azione riservata a ${ruoli.includes("reception") ? "reception e direzione" : "la direzione"}.`);
  return profile;
}

function errore(messaggio: string): EsitoGestione {
  return { esito: "errore", messaggio };
}

function ok(messaggio: string): EsitoGestione {
  return { esito: "ok", messaggio };
}

/** Il modo uniforme di trasformare un'eccezione in una frase. */
function esitoDa(error: unknown): EsitoGestione {
  return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
}

function rinfrescaAgenda(patientId?: string) {
  // Un appuntamento tocca tre mondi che di solito non si parlano: chi
  // lo ha prenotato dall’app, chi si trova l’ora occupata in agenda,
  // chi governa la giornata dal banco. Qui si rinfrescava solo il terzo.
  invalidaAgenda(patientId ?? null);
  revalidatePath("/control/pazienti");
}

/* ── Utenti: la parte privilegiata ──────────────────────────────── */

/**
 * L'utente dietro a una persona nuova.
 *
 * Se l'email è già registrata non è un errore: è la stessa persona che
 * torna. Si riusa il profilo e si va avanti. La password non la decide
 * nessuno qui: la persona la imposta da sola con "Ho dimenticato la
 * password" nella pagina di accesso, che manda il collegamento.
 */
async function profiloPer(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "patient" | "professional";
}): Promise<string> {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "Per creare una persona nuova serve la chiave privilegiata sul server (SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  const admin = createSupabaseServiceClient();
  const fullName = `${input.firstName} ${input.lastName}`.trim();

  let userId: string | null = null;
  const creato = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { full_name: fullName, first_name: input.firstName, last_name: input.lastName },
  });

  if (creato.data.user) {
    userId = creato.data.user.id;
  } else {
    const msg = creato.error?.message ?? "";
    if (!/already|exists|registered/i.test(msg)) {
      throw new Error(`Utente non creato: ${msg || "motivo sconosciuto"}`);
    }
    const { data } = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
    userId = (data as { id: string } | null)?.id ?? null;
    if (!userId) throw new Error("L'email risulta già registrata ma il profilo non si trova.");
  }

  // Il profilo lo crea il trigger su auth.users; qui lo si completa.
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      role: input.role,
    })
    .eq("id", userId);
  if (error) throw new Error(`Profilo non aggiornato: ${error.message}`);

  return userId;
}

/** La sede di default per chi lavora al banco: la sua, o l'unica che c'è. */
async function sedeDefault(profileId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: profilo }, { data: sedi }] = await Promise.all([
    supabase.from("profiles").select("scope_location_id").eq("id", profileId).maybeSingle(),
    supabase.from("locations").select("id").eq("is_active", true).order("created_at").limit(1),
  ]);
  return (
    (profilo as { scope_location_id: string | null } | null)?.scope_location_id ??
    ((sedi ?? []) as { id: string }[])[0]?.id ??
    null
  );
}

/* ── Anagrafica ─────────────────────────────────────────────────── */

export async function creaPaziente(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  let nuovoId: string;
  try {
    const profile = await richiedi(BANCO, "Anagrafica");

    const firstName = testo(formData, "firstName");
    const lastName = testo(formData, "lastName");
    const email = testo(formData, "email").toLowerCase();
    if (!firstName || !lastName) return errore("Servono nome e cognome.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errore("Serve un'email valida: è con quella che il paziente entra in Unique OS.");
    }

    const supabase = await createSupabaseServerClient();
    const profileId = await profiloPer({
      email,
      firstName,
      lastName,
      phone: opzionale(formData, "phone"),
      role: "patient",
    });

    // Già in anagrafica? Allora è lì che si va, senza una seconda scheda.
    const { data: esistente } = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (esistente) {
      nuovoId = (esistente as { id: string }).id;
    } else {
      const { data, error } = await supabase
        .from("patients")
        .insert({
          profile_id: profileId,
          location_id: opzionale(formData, "locationId") ?? (await sedeDefault(profile.id)),
          date_of_birth: opzionale(formData, "dateOfBirth"),
          fiscal_code: opzionale(formData, "fiscalCode")?.toUpperCase() ?? null,
          patient_code: `P-${Date.now().toString(36).toUpperCase()}`,
          onboarded_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`Paziente non creato: ${error.message}`);
      nuovoId = (data as { id: string }).id;
    }
  } catch (error) {
    return esitoDa(error);
  }

  revalidatePath("/control/pazienti");
  revalidatePath("/control/crm");
  redirect(`/control/pazienti/${nuovoId}`);
}

export async function aggiornaAnagrafica(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(BANCO, "Anagrafica");
    const patientId = testo(formData, "patientId");
    const profileId = testo(formData, "profileId");
    const firstName = testo(formData, "firstName");
    const lastName = testo(formData, "lastName");
    if (!patientId || !profileId) return errore("Paziente non indicato.");
    if (!firstName || !lastName) return errore("Servono nome e cognome.");

    const supabase = await createSupabaseServerClient();
    const [profilo, paziente] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          phone: opzionale(formData, "phone"),
        })
        .eq("id", profileId),
      supabase
        .from("patients")
        .update({
          date_of_birth: opzionale(formData, "dateOfBirth"),
          fiscal_code: opzionale(formData, "fiscalCode")?.toUpperCase() ?? null,
        })
        .eq("id", patientId),
    ]);
    if (profilo.error) throw new Error(profilo.error.message);
    if (paziente.error) throw new Error(paziente.error.message);

    revalidatePath(`/control/pazienti/${patientId}`);
    revalidatePath("/control/pazienti");
    return ok("Anagrafica aggiornata.");
  } catch (error) {
    return esitoDa(error);
  }
}

/* ── Agenda ─────────────────────────────────────────────────────── */

interface RigaAgenda {
  id: string;
  professional_id: string | null;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  patient: { profile: { full_name: string } | null } | null;
}

/** Gli appuntamenti che toccano una finestra, con l'etichetta per il messaggio. */
async function agendaFra(da: string, a: string): Promise<AppuntamentoInAgenda[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, professional_id, room_id, starts_at, ends_at, status, service_name, patient:patients(profile:profiles(full_name))")
    .lt("starts_at", a)
    .gt("ends_at", da)
    .limit(500);

  return ((data ?? []) as unknown as RigaAgenda[]).map((r) => ({
    id: r.id,
    professionalId: r.professional_id,
    roomId: r.room_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    etichetta: `${r.service_name} con ${r.patient?.profile?.full_name ?? "un paziente"}`,
  }));
}

export async function creaAppuntamento(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    const profile = await richiedi(BANCO, "Agenda");
    const patientId = testo(formData, "patientId");
    const serviceId = testo(formData, "serviceId");
    const professionalId = opzionale(formData, "professionalId");
    const roomId = opzionale(formData, "roomId");
    const giorno = testo(formData, "giorno");
    const ora = testo(formData, "ora");
    const usaCrediti = formData.get("usaCrediti") === "on";

    if (!patientId) return errore("Scegli il paziente.");
    if (!serviceId) return errore("Scegli il servizio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{2}:\d{2}$/.test(ora)) {
      return errore("Servono giorno e ora.");
    }

    const startsAt = romaComeIso(giorno, ora);
    const nonAmmesso = orarioAmmesso(startsAt, new Date().toISOString());
    if (nonAmmesso) return errore(nonAmmesso);

    const supabase = await createSupabaseServerClient();
    const [{ data: servizio }, { data: paziente }] = await Promise.all([
      supabase.from("services").select("name, duration_min, credits_cost").eq("id", serviceId).maybeSingle(),
      supabase.from("patients").select("location_id").eq("id", patientId).maybeSingle(),
    ]);
    const s = servizio as { name: string; duration_min: number; credits_cost: number | string } | null;
    if (!s) return errore("Servizio non trovato.");
    if (!paziente) return errore("Paziente non trovato.");

    const endsAt = fineDa(startsAt, s.duration_min);

    const conflittiTrovati = conflitti(
      { id: null, professionalId, roomId, startsAt, endsAt },
      await agendaFra(startsAt, endsAt),
    );
    const frase = descriviConflitti(conflittiTrovati);
    if (frase) return errore(frase);

    const creditsCost = usaCrediti ? Number(s.credits_cost) : 0;
    if (creditsCost > 0) {
      const { data: saldo } = await supabase
        .from("credit_balances")
        .select("available")
        .eq("patient_id", patientId)
        .maybeSingle();
      const disponibili = Number((saldo as { available: number | string } | null)?.available ?? 0);
      if (disponibili < creditsCost) {
        return errore(
          `Il paziente ha ${disponibili} crediti disponibili e il servizio ne costa ${creditsCost}. Registra l'incasso o togli la spunta ai crediti.`,
        );
      }
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: patientId,
        professional_id: professionalId,
        room_id: roomId,
        service_id: serviceId,
        service_name: s.name,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "confirmed",
        credits_cost: creditsCost,
        location_id: (paziente as { location_id: string | null }).location_id,
        notes: opzionale(formData, "note"),
        created_by: profile.id,
        source: "unique_os",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Appuntamento non creato: ${error.message}`);

    // Se il professionista aveva pubblicato quella fetta come disponibile,
    // adesso non lo è più: altrimenti il paziente la vedrebbe ancora libera.
    if (professionalId) {
      await supabase
        .from("availability_slots")
        .update({ is_booked: true, appointment_id: (data as { id: string }).id })
        .eq("professional_id", professionalId)
        .eq("is_booked", false)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt);
    }

    rinfrescaAgenda(patientId);
    return ok(`Appuntamento fissato: ${s.name}, ${giorno.split("-").reverse().join("/")} alle ${ora}.`);
  } catch (error) {
    return esitoDa(error);
  }
}

/**
 * Lo stato di una visita, dal banco.
 *
 * Confermata, svolta, non presentato, disdetta. I crediti — prenotati,
 * consumati, restituiti — li muove il trigger sul cambio di stato, non
 * questa funzione: così il registro resta coerente anche se lo stato
 * cambia da un'altra porta.
 */
export async function cambiaStatoAppuntamento(formData: FormData): Promise<void> {
  await richiedi(BANCO, "Agenda");
  const appointmentId = testo(formData, "appointmentId");
  const stato = testo(formData, "stato");
  const patientId = opzionale(formData, "patientId");
  if (!appointmentId) return;

  const supabase = await createSupabaseServerClient();
  const profile = await requireProfile();

  const patch: Record<string, unknown> =
    stato === "completed"
      ? { status: "completed", attendance: "attended" }
      : stato === "no_show"
        ? { status: "no_show", attendance: "no_show" }
        : stato === "confirmed"
          ? { status: "confirmed" }
          : stato === "cancelled"
            ? {
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                cancelled_by: profile.id,
                cancel_reason: opzionale(formData, "motivo") ?? "Disdetta dal banco",
              }
            : {};
  if (Object.keys(patch).length === 0) return;

  await supabase
    .from("appointments")
    .update(patch)
    .eq("id", appointmentId)
    .in("status", ["scheduled", "confirmed"]);

  if (stato === "cancelled") {
    await supabase
      .from("availability_slots")
      .update({ is_booked: false, appointment_id: null })
      .eq("appointment_id", appointmentId);
  }

  rinfrescaAgenda(patientId ?? undefined);
}

export async function spostaAppuntamento(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(BANCO, "Agenda");
    const appointmentId = testo(formData, "appointmentId");
    const giorno = testo(formData, "giorno");
    const ora = testo(formData, "ora");
    if (!appointmentId) return errore("Appuntamento non indicato.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{2}:\d{2}$/.test(ora)) {
      return errore("Servono giorno e ora nuovi.");
    }

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("appointments")
      .select("id, patient_id, professional_id, room_id, starts_at, ends_at, status")
      .eq("id", appointmentId)
      .maybeSingle();
    const a = data as {
      id: string;
      patient_id: string;
      professional_id: string | null;
      room_id: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
    } | null;
    if (!a) return errore("Appuntamento non trovato.");
    if (!["scheduled", "confirmed"].includes(a.status)) return errore("Si sposta solo una visita ancora da svolgere.");

    const durata = Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000);
    const startsAt = romaComeIso(giorno, ora);
    const nonAmmesso = orarioAmmesso(startsAt, new Date().toISOString());
    if (nonAmmesso) return errore(nonAmmesso);
    const endsAt = fineDa(startsAt, durata);

    const frase = descriviConflitti(
      conflitti(
        { id: a.id, professionalId: a.professional_id, roomId: a.room_id, startsAt, endsAt },
        await agendaFra(startsAt, endsAt),
      ),
    );
    if (frase) return errore(frase);

    const { error } = await supabase
      .from("appointments")
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq("id", a.id);
    if (error) throw new Error(error.message);

    rinfrescaAgenda(a.patient_id);
    return ok(`Spostato al ${giorno.split("-").reverse().join("/")} alle ${ora}.`);
  } catch (error) {
    return esitoDa(error);
  }
}

/* ── Disponibilità ──────────────────────────────────────────────── */

export async function generaDisponibilita(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(BANCO, "Disponibilità");
    const professionalId = testo(formData, "professionalId");
    const serviceId = opzionale(formData, "serviceId");
    const da = testo(formData, "da");
    const a = testo(formData, "a");
    if (!professionalId) return errore("Scegli il professionista.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(da) || !/^\d{4}-\d{2}-\d{2}$/.test(a) || a < da) {
      return errore("Serve un periodo: da quando, fino a quando.");
    }
    if (giorniFra(da, a).length > 92) return errore("Al massimo tre mesi per volta.");

    const supabase = await createSupabaseServerClient();
    const inizio = romaComeIso(da, "00:00");
    const fine = romaComeIso(a, "23:59");

    const [turniRes, slotRes, visiteRes, servizioRes, proRes] = await Promise.all([
      supabase
        .from("professional_schedules")
        .select("weekday, starts_at, ends_at, valid_from, valid_to")
        .eq("professional_id", professionalId),
      supabase
        .from("availability_slots")
        .select("starts_at, ends_at")
        .eq("professional_id", professionalId)
        .gte("starts_at", inizio)
        .lte("starts_at", fine),
      supabase
        .from("appointments")
        .select("starts_at, ends_at")
        .eq("professional_id", professionalId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .gte("starts_at", inizio)
        .lte("starts_at", fine),
      serviceId
        ? supabase.from("services").select("duration_min").eq("id", serviceId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("professionals").select("location_id").eq("id", professionalId).maybeSingle(),
    ]);

    const turni: Turno[] = ((turniRes.data ?? []) as {
      weekday: number;
      starts_at: string;
      ends_at: string;
      valid_from: string;
      valid_to: string | null;
    }[]).map((t) => ({
      weekday: t.weekday,
      startsAt: t.starts_at.slice(0, 5),
      endsAt: t.ends_at.slice(0, 5),
      validFrom: t.valid_from,
      validTo: t.valid_to,
    }));
    if (turni.length === 0) {
      return errore("Questo professionista non ha orari settimanali: impostali prima, nella sua scheda.");
    }

    const durata = (servizioRes.data as { duration_min: number } | null)?.duration_min ?? 60;
    const esistenti = [
      ...((slotRes.data ?? []) as { starts_at: string; ends_at: string }[]),
      ...((visiteRes.data ?? []) as { starts_at: string; ends_at: string }[]),
    ].map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));

    const nuovi = generaSlot({ turni, durataMinuti: durata, da, a, esistenti });
    if (nuovi.length === 0) return ok("Niente da aggiungere: le fette di questo periodo esistono già.");

    const locationId = (proRes.data as { location_id: string | null } | null)?.location_id ?? null;
    const { error } = await supabase.from("availability_slots").insert(
      nuovi.map((slot) => ({
        professional_id: professionalId,
        service_id: serviceId,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        location_id: locationId,
        source: "unique_os",
      })),
    );
    if (error) throw new Error(`Disponibilità non salvate: ${error.message}`);

    revalidatePath("/control/professionisti");
    invalidaAgenda();
    return ok(`${nuovi.length} disponibilità pubblicate, da ${durata} minuti.`);
  } catch (error) {
    return esitoDa(error);
  }
}

/* ── Cataloghi: servizi, stanze, professionisti, turni ──────────── */

function slugDa(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function salvaServizio(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(DIREZIONE, "Listino");
    const id = opzionale(formData, "id");
    const name = testo(formData, "name");
    if (!name) return errore("Serve il nome del servizio.");

    const durata = Number(testo(formData, "durationMin") || "60");
    const crediti = Number((testo(formData, "creditsCost") || "0").replace(",", "."));
    const prezzo = centesimiDa(testo(formData, "priceEuro") || "0");
    const materiali = centesimiDa(testo(formData, "materialsEuro") || "0");
    if (!Number.isInteger(durata) || durata <= 0) return errore("La durata è in minuti interi.");
    if (!Number.isFinite(crediti) || crediti < 0) return errore("I crediti non sono un numero.");
    if (prezzo === null || materiali === null) return errore("Prezzo o materiali non leggibili: scrivi ad esempio 149,00.");

    const riga = {
      name,
      slug: opzionale(formData, "slug") ?? slugDa(name),
      description: opzionale(formData, "description"),
      duration_min: durata,
      credits_cost: crediti,
      price_cents: prezzo,
      material_cost_cents: materiali,
      discipline: opzionale(formData, "discipline"),
      is_active: formData.get("isActive") !== "off",
    };

    const supabase = await createSupabaseServerClient();
    const { error } = id
      ? await supabase.from("services").update(riga).eq("id", id)
      : await supabase.from("services").insert(riga);
    if (error) throw new Error(error.message);

    revalidatePath("/control/servizi");
    revalidatePath("/control/economia");
    return ok(id ? "Servizio aggiornato." : "Servizio aggiunto al listino.");
  } catch (error) {
    return esitoDa(error);
  }
}

export async function salvaStanza(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    const profile = await richiedi(DIREZIONE, "Stanze");
    const id = opzionale(formData, "id");
    const name = testo(formData, "name");
    if (!name) return errore("Serve il nome della stanza.");

    const supabase = await createSupabaseServerClient();
    const riga = {
      name,
      notes: opzionale(formData, "notes"),
      is_active: formData.get("isActive") !== "off",
      location_id: opzionale(formData, "locationId") ?? (await sedeDefault(profile.id)),
    };
    const { error } = id
      ? await supabase.from("rooms").update(riga).eq("id", id)
      : await supabase.from("rooms").insert(riga);
    if (error) throw new Error(error.message);

    revalidatePath("/control/servizi");
    revalidatePath("/control/capacita");
    return ok(id ? "Stanza aggiornata." : "Stanza aggiunta.");
  } catch (error) {
    return esitoDa(error);
  }
}

export async function creaProfessionista(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    const profile = await richiedi(DIREZIONE, "Professionisti");
    const firstName = testo(formData, "firstName");
    const lastName = testo(formData, "lastName");
    const email = testo(formData, "email").toLowerCase();
    if (!firstName || !lastName) return errore("Servono nome e cognome.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errore("Serve un'email valida: è con quella che entra.");

    const profileId = await profiloPer({ email, firstName, lastName, phone: opzionale(formData, "phone"), role: "professional" });

    const supabase = await createSupabaseServerClient();
    const { data: esistente } = await supabase.from("professionals").select("id").eq("profile_id", profileId).maybeSingle();
    if (esistente) return errore("Questa persona è già fra i professionisti.");

    const { error } = await supabase.from("professionals").insert({
      profile_id: profileId,
      title: opzionale(formData, "title"),
      specialty: opzionale(formData, "specialty"),
      discipline: testo(formData, "discipline") || "other",
      location_id: opzionale(formData, "locationId") ?? (await sedeDefault(profile.id)),
      is_active: true,
    });
    if (error) throw new Error(`Professionista non creato: ${error.message}`);

    revalidatePath("/control/professionisti");
    return ok(
      `${firstName} ${lastName} è in squadra. Entra da /accedi con "Ho dimenticato la password" per scegliere la sua.`,
    );
  } catch (error) {
    return esitoDa(error);
  }
}

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"] as const;

/**
 * Gli orari settimanali di un professionista, riscritti per intero.
 *
 * Il modulo manda sette coppie da/a; una coppia vuota è un giorno di
 * riposo. Si sostituisce tutto: un turno modificato in luogo è la
 * ragione per cui le disponibilità di due settimane fa non tornano più.
 */
export async function salvaTurni(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(DIREZIONE, "Orari");
    const professionalId = testo(formData, "professionalId");
    if (!professionalId) return errore("Professionista non indicato.");

    const righe: { professional_id: string; weekday: number; starts_at: string; ends_at: string }[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const da = testo(formData, `${GIORNI[weekday]}_da`);
      const a = testo(formData, `${GIORNI[weekday]}_a`);
      if (!da && !a) continue;
      if (!/^\d{2}:\d{2}$/.test(da) || !/^\d{2}:\d{2}$/.test(a) || a <= da) {
        return errore(`L'orario di ${GIORNI[weekday]} non torna: la fine deve venire dopo l'inizio.`);
      }
      righe.push({ professional_id: professionalId, weekday, starts_at: da, ends_at: a });
    }

    const supabase = await createSupabaseServerClient();
    const cancellati = await supabase.from("professional_schedules").delete().eq("professional_id", professionalId);
    if (cancellati.error) throw new Error(cancellati.error.message);
    if (righe.length > 0) {
      const { error } = await supabase.from("professional_schedules").insert(righe);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/control/professionisti");
    revalidatePath("/control/capacita");
    return ok(righe.length === 0 ? "Nessun orario: il professionista non riceve." : `Orari salvati: ${righe.length} giorni a settimana.`);
  } catch (error) {
    return esitoDa(error);
  }
}

export async function attivaDisattivaProfessionista(formData: FormData): Promise<void> {
  await richiedi(DIREZIONE, "Professionisti");
  const id = testo(formData, "professionalId");
  const attivo = formData.get("attivo") === "true";
  if (!id) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("professionals").update({ is_active: attivo }).eq("id", id);
  revalidatePath("/control/professionisti");
}

/* ── Care team ──────────────────────────────────────────────────── */

/**
 * Mette un professionista nel team di un paziente.
 *
 * È l'atto che apre una cartella clinica a una persona, ed è per questo
 * che sta qui e non fra le impostazioni: la Row Level Security non
 * guarda il ruolo, guarda il team. Un medico appena creato ha il
 * permesso di entrare in area clinica e non vede nessuno finché non
 * compare in questa tabella.
 *
 * Riservato alla direzione perché è `is_staff()` a governare la
 * scrittura nel database: reception e marketing riceverebbero comunque
 * un rifiuto, e una frase è più utile di un errore di Postgres.
 */
export async function assegnaAlTeam(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(DIREZIONE, "Care team");
    const patientId = testo(formData, "patientId");
    const professionalId = testo(formData, "professionalId");
    if (!patientId || !professionalId) return errore("Servono il paziente e il professionista.");

    const supabase = await createSupabaseServerClient();

    // La chiave è la coppia, quindi riassegnare qualcuno che era uscito
    // riapre la sua riga invece di crearne una seconda. `assigned_at`
    // torna a oggi: la riga racconta l'assegnazione in corso, non la
    // prima di sempre.
    const { error } = await supabase.from("care_team_members").upsert(
      {
        patient_id: patientId,
        professional_id: professionalId,
        role_in_team: opzionale(formData, "ruolo"),
        assigned_at: new Date().toISOString(),
        ended_at: null,
      },
      { onConflict: "patient_id,professional_id" },
    );
    if (error) throw new Error(`Assegnazione non riuscita: ${error.message}`);

    invalidaTeamClinico(patientId);
    return ok("Assegnato: da adesso la cartella si apre dall'area clinica.");
  } catch (error) {
    return esitoDa(error);
  }
}

/**
 * Toglie un professionista dal team.
 *
 * Non cancella la riga: le scrive una data di fine. Chi ha seguito una
 * persona per un anno resta scritto nella sua storia, e l'accesso si
 * chiude lo stesso — le funzioni della Row Level Security guardano
 * `ended_at is null`, non l'esistenza della riga.
 */
export async function chiudiAssegnazione(formData: FormData): Promise<void> {
  await richiedi(DIREZIONE, "Care team");
  const patientId = testo(formData, "patientId");
  const professionalId = testo(formData, "professionalId");
  if (!patientId || !professionalId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("care_team_members")
    .update({ ended_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .eq("professional_id", professionalId)
    .is("ended_at", null);

  invalidaTeamClinico(patientId);
}

/* ── Incassi e membership ───────────────────────────────────────── */

const CANALI = new Set(["cash", "pos", "bank_transfer", "online", "other"]);
const TIPI = new Set(["membership", "membership_renewal", "service", "package", "upgrade", "extra"]);

export async function registraIncasso(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(BANCO, "Incassi");
    const patientId = testo(formData, "patientId");
    const importo = centesimiDa(testo(formData, "importoEuro"));
    const kind = testo(formData, "kind") || "service";
    const channel = testo(formData, "channel") || "pos";
    if (!patientId) return errore("Scegli il paziente.");
    if (importo === null || importo <= 0) return errore("L'importo non è leggibile: scrivi ad esempio 149,00.");
    if (!TIPI.has(kind) || !CANALI.has(channel)) return errore("Tipo o canale non validi.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("record_payment", {
      p_patient: patientId,
      p_amount_cents: importo,
      p_kind: kind,
      p_channel: channel,
      p_description: opzionale(formData, "descrizione"),
      p_appointment: opzionale(formData, "appointmentId"),
      p_membership: null,
    });
    if (error) throw new Error(error.message);

    const { data: riga } = await supabase.from("payments").select("receipt_no").eq("id", data as string).maybeSingle();
    const ricevuta = (riga as { receipt_no: string | null } | null)?.receipt_no;

    revalidatePath(`/control/pazienti/${patientId}`);
    invalidaNumeriDirezione();
    return ok(ricevuta ? `Incasso registrato. Ricevuta ${ricevuta}.` : "Incasso registrato.");
  } catch (error) {
    return esitoDa(error);
  }
}

export async function attivaMembership(_prev: EsitoGestione, formData: FormData): Promise<EsitoGestione> {
  try {
    await richiedi(BANCO, "Membership");
    const patientId = testo(formData, "patientId");
    const tierId = testo(formData, "tierId");
    const startsOn = testo(formData, "startsOn") || new Date().toISOString().slice(0, 10);
    const pagata = formData.get("pagata") === "on";
    const channel = testo(formData, "channel") || "pos";
    if (!patientId || !tierId) return errore("Scegli paziente e piano.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return errore("La data di inizio non è leggibile.");

    const supabase = await createSupabaseServerClient();

    // Importo vuoto = prezzo di listino del piano. Scritto = quello, che
    // sia uno sconto o una quota concordata.
    let importo: number | null = null;
    if (pagata) {
      const scritto = testo(formData, "importoEuro");
      if (scritto) {
        importo = centesimiDa(scritto);
      } else {
        const { data: piano } = await supabase.from("membership_tiers").select("price_cents").eq("id", tierId).maybeSingle();
        importo = (piano as { price_cents: number } | null)?.price_cents ?? null;
      }
      if (importo === null || importo <= 0) return errore("L'importo incassato non è leggibile.");
      if (!CANALI.has(channel)) return errore("Canale di pagamento non valido.");
    }

    const { error } = await supabase.rpc("activate_membership", {
      p_patient: patientId,
      p_tier: tierId,
      p_starts_on: startsOn,
      p_paid_cents: importo,
      p_channel: pagata ? channel : null,
    });
    if (error) throw new Error(error.message);

    invalidaCrediti(patientId);
    invalidaNumeriDirezione();
    return ok(pagata ? "Membership attivata e incasso registrato." : "Membership attivata, da incassare.");
  } catch (error) {
    return esitoDa(error);
  }
}
