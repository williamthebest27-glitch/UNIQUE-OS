import type { TimelineEvent, TimelineKind } from "@/lib/domain/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";
import type { CategoriaTimeline } from "@/lib/clinical/timeline";

/**
 * La Health Timeline: tutta la storia del paziente in ordine cronologico.
 *
 * Legge dalla vista `patient_timeline`, che unisce punteggi, visite,
 * referti, esami, terapie, note, comunicazioni e percorsi. Non esiste
 * una tabella di eventi da tenere allineata: gli eventi *sono* le
 * tabelle di dominio, e una vista non può andare fuori sincrono con sé
 * stessa.
 *
 * **Il filtro è nella query, non nel browser.** Filtrare in memoria
 * avrebbe voluto dire leggere sessanta righe di tutto per mostrarne tre
 * di esami — e, peggio, dire «nessun esame» quando gli esami ci sono ma
 * stanno alla settantesima riga. Con il filtro nel `where`, il limite si
 * applica a ciò che si è chiesto.
 */

interface TimelineRow {
  occurred_at: string;
  kind: TimelineKind;
  category: string;
  title: string;
  detail: string | null;
  ref_id: string;
}

export interface OpzioniTimeline {
  /** Una categoria sola, o tutte. */
  categoria?: CategoriaTimeline | null;
  limite?: number;
}

export async function getPatientTimeline(
  patientId?: string,
  opzioni: OpzioniTimeline | number = {},
): Promise<TimelineEvent[]> {
  // Il secondo argomento era un numero: le chiamate esistenti passano
  // ancora il limite così, e romperle per aggiungere un filtro sarebbe
  // stato un cambio gratuito in cinque punti.
  const { categoria = null, limite = 40 } =
    typeof opzioni === "number" ? { limite: opzioni } : opzioni;

  if (!isSupabaseConfigured()) {
    const finti = mockTimeline();
    return (categoria ? finti.filter((e) => e.category === categoria) : finti).slice(
      0,
      limite,
    );
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("patient_timeline")
    .select("occurred_at, kind, category, title, detail, ref_id")
    .order("occurred_at", { ascending: false })
    .limit(limite);

  // Senza patient_id la Row Level Security restringe già al proprio
  // paziente; con, si guarda un paziente specifico — e la RLS verifica
  // comunque che si abbia titolo per farlo.
  if (patientId) query = query.eq("patient_id", patientId);
  if (categoria) query = query.eq("category", categoria);

  const { data } = await query;

  return ((data ?? []) as TimelineRow[]).map((row) => ({
    id: `${row.kind}-${row.ref_id}`,
    occurredAt: row.occurred_at,
    kind: row.kind,
    category: row.category,
    title: row.title,
    detail: row.detail,
    refId: row.ref_id,
  }));
}

/**
 * Quante righe ha ciascuna categoria.
 *
 * Serve al numero accanto a ogni filtro, e quel numero non è
 * decorazione: senza, si entra in una categoria per scoprire che è
 * vuota, e si esce. Con, si sa prima.
 *
 * Una lettura sola di tutta la timeline invece di nove `count`: nove
 * viaggi verso il database per disegnare nove numeri sono più cari della
 * riga che quei numeri accompagnano.
 */
export async function contaPerCategoria(
  patientId: string,
): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) {
    const conti: Record<string, number> = {};
    for (const e of mockTimeline()) {
      conti[e.category] = (conti[e.category] ?? 0) + 1;
    }
    return conti;
  }

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("patient_timeline")
    .select("category")
    .eq("patient_id", patientId)
    .limit(1000);

  const conti: Record<string, number> = {};
  for (const r of (data ?? []) as { category: string }[]) {
    conti[r.category] = (conti[r.category] ?? 0) + 1;
  }
  return conti;
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
      category: "punteggio",
      title: `Unique Longevity Score — ${Math.round(point.score)}`,
      detail:
        point.measuredOn === d.score?.measuredOn ? (d.score?.summary ?? null) : null,
      refId: point.measuredOn,
    });
  }

  if (d.enrollment) {
    events.push({
      id: `program-${d.enrollment.id}`,
      occurredAt: `${d.enrollment.startedOn}T09:00:00+02:00`,
      kind: "program_start",
      category: "percorso",
      title: `Inizio percorso — ${d.enrollment.programName}`,
      detail: d.enrollment.description,
      refId: d.enrollment.id,
    });
  }

  for (const doc of d.newDocuments) {
    events.push({
      id: `document-${doc.id}`,
      occurredAt: doc.createdAt,
      kind: "report",
      category: "referti",
      title: doc.title,
      detail: null,
      refId: doc.id,
    });
  }

  if (d.nextAppointment) {
    events.push({
      id: `appointment-${d.nextAppointment.id}`,
      occurredAt: d.nextAppointment.startsAt,
      kind: "appointment",
      category: "visite",
      title: d.nextAppointment.serviceName,
      detail: d.nextAppointment.location,
      refId: d.nextAppointment.id,
    });
  }

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
