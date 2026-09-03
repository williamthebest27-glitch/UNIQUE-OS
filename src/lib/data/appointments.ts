import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";

/**
 * Appuntamenti e disponibilità dal punto di vista del paziente.
 *
 * Gli appuntamenti possono nascere qui o arrivare dal gestionale della
 * clinica: `source` dice quale dei due è la fonte di verità di quella
 * riga. Unique OS deve saperli leggere entrambi.
 */

export interface AppuntamentoPaziente {
  id: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: string;
  attendance: string;
  creditsCost: number;
  professionalName: string | null;
  source: string;
  cancelReason: string | null;
}

export interface SlotDisponibile {
  id: string;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  creditsCost: number;
  professionalName: string | null;
}

interface AppointmentRow {
  id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string;
  attendance: string;
  credits_cost: number;
  source: string;
  cancel_reason: string | null;
  professionals: { title: string | null; profiles: { full_name: string } | null } | null;
}

function nomeProfessionista(
  pro: { title: string | null; profiles: { full_name: string } | null } | null,
): string | null {
  if (!pro?.profiles?.full_name) return null;
  return [pro.title, pro.profiles.full_name].filter(Boolean).join(" ");
}

export async function getPatientAppointments(patientId?: string): Promise<{
  prossimi: AppuntamentoPaziente[];
  passati: AppuntamentoPaziente[];
}> {
  if (!isSupabaseConfigured()) {
    const appt = mockPatientDashboard.nextAppointment;
    if (!appt) return { prossimi: [], passati: [] };
    return {
      prossimi: [
        {
          id: appt.id,
          serviceName: appt.serviceName,
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          location: appt.location,
          status: appt.status,
          attendance: "pending",
          creditsCost: appt.creditsCost,
          professionalName: appt.professional
            ? [appt.professional.title, appt.professional.fullName].filter(Boolean).join(" ")
            : null,
          source: "unique_os",
          cancelReason: null,
        },
      ],
      passati: [],
    };
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("appointments")
    .select(
      "id, service_name, starts_at, ends_at, location, status, attendance, credits_cost, source, cancel_reason, professionals(title, profiles(full_name))",
    )
    .order("starts_at", { ascending: false })
    .limit(60);

  if (patientId) query = query.eq("patient_id", patientId);

  const { data } = await query;
  const rows = ((data ?? []) as unknown as AppointmentRow[]).map((row) => ({
    id: row.id,
    serviceName: row.service_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    status: row.status,
    attendance: row.attendance,
    creditsCost: Number(row.credits_cost),
    professionalName: nomeProfessionista(row.professionals),
    source: row.source,
    cancelReason: row.cancel_reason,
  }));

  const adesso = Date.now();
  const attivi = (a: AppuntamentoPaziente) =>
    ["scheduled", "confirmed"].includes(a.status) && Date.parse(a.startsAt) >= adesso;

  return {
    // I futuri in ordine cronologico, il passato dal più recente.
    prossimi: rows.filter(attivi).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    passati: rows.filter((a) => !attivi(a)),
  };
}

interface SlotRow {
  id: string;
  starts_at: string;
  ends_at: string;
  services: { name: string; credits_cost: number } | null;
  professionals: { title: string | null; profiles: { full_name: string } | null } | null;
}

export async function getOpenSlots(limit = 12): Promise<SlotDisponibile[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("availability_slots")
    .select(
      "id, starts_at, ends_at, services(name, credits_cost), professionals(title, profiles(full_name))",
    )
    .eq("is_booked", false)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  return ((data ?? []) as unknown as SlotRow[])
    // Uno slot senza servizio non ha un costo in crediti: non è prenotabile.
    .filter((row) => row.services !== null)
    .map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      serviceName: row.services!.name,
      creditsCost: Number(row.services!.credits_cost),
      professionalName: nomeProfessionista(row.professionals),
    }));
}

export interface MovimentoCredito {
  id: string;
  kind: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

/** Il registro dei crediti, riga per riga. */
export async function getCreditLedger(
  patientId?: string,
  limit = 40,
): Promise<MovimentoCredito[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("credit_entries")
    .select("id, entry_type, amount, description, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (patientId) query = query.eq("patient_id", patientId);

  const { data } = await query;

  return ((data ?? []) as {
    id: string;
    entry_type: string;
    amount: number;
    description: string | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    kind: row.entry_type,
    amount: Number(row.amount),
    description: row.description,
    createdAt: row.created_at,
  }));
}
