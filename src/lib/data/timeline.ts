import type { TimelineEvent, TimelineKind } from "@/lib/domain/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";

/**
 * La Health Timeline: tutta la storia del paziente in ordine cronologico.
 *
 * Legge dalla vista `patient_timeline`, che unisce punteggi, visite,
 * documenti e percorsi. Non esiste una tabella di eventi da tenere
 * allineata: gli eventi *sono* le tabelle di dominio, e una vista non può
 * andare fuori sincrono con sé stessa.
 */

interface TimelineRow {
  occurred_at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  ref_id: string;
}

export async function getPatientTimeline(
  patientId?: string,
  limit = 40,
): Promise<TimelineEvent[]> {
  if (!isSupabaseConfigured()) return mockTimeline().slice(0, limit);

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("patient_timeline")
    .select("occurred_at, kind, title, detail, ref_id")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  // Senza patient_id la Row Level Security restringe già al proprio
  // paziente; con, si guarda un paziente specifico — e la RLS verifica
  // comunque che si abbia titolo per farlo.
  if (patientId) query = query.eq("patient_id", patientId);

  const { data } = await query;

  return ((data ?? []) as TimelineRow[]).map((row) => ({
    id: `${row.kind}-${row.ref_id}`,
    occurredAt: row.occurred_at,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
  }));
}

/**
 * In modalità dimostrativa la timeline si ricava dagli stessi dati finti
 * della home, invece di inventarne altri: così le due schermate
 * raccontano la stessa storia.
 */
function mockTimeline(): TimelineEvent[] {
  const d = mockPatientDashboard;
  const events: TimelineEvent[] = [];

  for (const point of d.scoreHistory) {
    events.push({
      id: `score-${point.measuredOn}`,
      occurredAt: `${point.measuredOn}T09:00:00+02:00`,
      kind: "score",
      title: `Unique Longevity Score — ${Math.round(point.score)}`,
      detail:
        point.measuredOn === d.score?.measuredOn ? (d.score?.summary ?? null) : null,
    });
  }

  if (d.enrollment) {
    events.push({
      id: `program-${d.enrollment.id}`,
      occurredAt: `${d.enrollment.startedOn}T09:00:00+02:00`,
      kind: "program_start",
      title: `Inizio percorso — ${d.enrollment.programName}`,
      detail: d.enrollment.description,
    });
  }

  for (const doc of d.newDocuments) {
    events.push({
      id: `document-${doc.id}`,
      occurredAt: doc.createdAt,
      kind: "document",
      title: doc.title,
      detail: null,
    });
  }

  if (d.nextAppointment) {
    events.push({
      id: `appointment-${d.nextAppointment.id}`,
      occurredAt: d.nextAppointment.startsAt,
      kind: "appointment",
      title: d.nextAppointment.serviceName,
      detail: d.nextAppointment.location,
    });
  }

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
