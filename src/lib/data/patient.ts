import type {
  ActionSource,
  ActionStatus,
  AppNotification,
  Appointment,
  AppointmentStatus,
  CreditSummary,
  DocumentKind,
  LongevityScore,
  PatientDashboardData,
  PatientDocument,
  PillarKey,
  ProgramEnrollment,
  ProgramStatus,
  ProgressHighlight,
  RecommendedAction,
  ScorePillar,
  ScorePoint,
  ScoreTrend,
} from "@/lib/domain/types";
import { redirect } from "next/navigation";
import { PILLAR_KEYS } from "@/lib/domain/types";
import { getMetric } from "@/lib/score/metrics";
import { normalize } from "@/lib/score/engine";
import { getCurrentProfile, homePathForRole, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";

/**
 * Accesso ai dati della home paziente.
 *
 * Nessuna query filtra per paziente a mano: ci pensa la Row Level
 * Security. Se una query qui fosse sbagliata, Postgres non restituirebbe
 * comunque righe che l’utente non ha diritto di vedere.
 *
 * Le righe sono tipizzate a mano perché il progetto non usa ancora la
 * generazione automatica dei tipi. Quando il database sarà stabile:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
 */

/* ── Forma delle righe lette dal database ─────────────────────────── */

interface ScoreRow {
  id: string;
  measured_on: string;
  score: number;
  previous_score: number | null;
  trend: ScoreTrend | null;
  biological_age: number | null;
  summary: string | null;
  coverage: number | null;
  score_pillars: {
    key: string;
    label: string;
    value: number | null;
    coverage: number | null;
    delta: number | null;
  }[];
}

interface AppointmentRow {
  id: string;
  service_name: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  location: string | null;
  credits_cost: number;
  professionals: {
    id: string;
    title: string | null;
    specialty: string | null;
    profiles: { full_name: string; avatar_url: string | null } | null;
  } | null;
}

interface EnrollmentRow {
  id: string;
  status: ProgramStatus;
  started_on: string;
  ends_on: string | null;
  progress_pct: number;
  steps_done: number;
  steps_total: number;
  programs: { name: string; description: string | null } | null;
}

interface ActionRow {
  id: string;
  title: string;
  description: string | null;
  pillar_key: string | null;
  source: ActionSource;
  status: ActionStatus;
  due_on: string | null;
  priority: number;
}

interface DocumentRow {
  id: string;
  kind: DocumentKind;
  title: string;
  issued_on: string | null;
  created_at: string;
  is_new_for_patient: boolean;
  size_bytes: number | null;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

interface MembershipRow {
  ends_on: string | null;
  membership_tiers: { name: string } | null;
}

interface BalanceRow {
  balance: number;
  total_credited: number;
  total_used: number;
}

interface MeasurementRow {
  metric_code: string;
  value: number | null;
  measured_on: string;
}

/* ── "Progressi ottenuti" ─────────────────────────────────────────── */

/** Quanti risultati mostrare in home. Oltre, diventa un tabulato. */
const MAX_HIGHLIGHTS = 4;

function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * I parametri che si sono mossi di più dall'inizio del percorso.
 *
 * Che una variazione sia un miglioramento lo decide la curva della
 * metrica, non il segno del numero: la glicata che scende migliora il
 * punteggio, la massa muscolare che scende lo peggiora, e una glicemia
 * può peggiorare scendendo troppo. Confrontiamo i valori normalizzati,
 * così la regola vale per tutte e trentacinque le metriche senza
 * elenchi di eccezioni.
 */
function buildHighlights(rows: MeasurementRow[]): ProgressHighlight[] {
  const byCode = new Map<string, MeasurementRow[]>();
  for (const row of rows) {
    if (row.value === null) continue;
    const list = byCode.get(row.metric_code) ?? [];
    list.push(row);
    byCode.set(row.metric_code, list);
  }

  const candidates: (ProgressHighlight & { magnitude: number })[] = [];

  for (const [code, series] of byCode) {
    const metric = getMetric(code);
    // Le metriche categoriali non hanno una variazione da raccontare.
    if (!metric || !metric.anchors) continue;

    // Serve almeno un prima e un dopo: un valore singolo non è un progresso.
    if (series.length < 2) continue;
    series.sort((a, b) => a.measured_on.localeCompare(b.measured_on));

    const first = Number(series[0].value);
    const last = Number(series[series.length - 1].value);
    const change = last - first;
    if (change === 0) continue;

    const normalizedChange = normalize(metric, last) - normalize(metric, first);
    if (normalizedChange === 0) continue;

    const decimals = Math.abs(last) < 10 ? 1 : 0;
    const unitSuffix = metric.unit === "%" ? " %" : "";

    candidates.push({
      id: code,
      label: metric.label,
      value: `${formatNumber(last, decimals)}${unitSuffix}`,
      change: `${change > 0 ? "+" : "−"}${formatNumber(Math.abs(change), decimals)}`,
      direction: change > 0 ? "up" : "down",
      isImprovement: normalizedChange > 0,
      magnitude: Math.abs(normalizedChange),
    });
  }

  return candidates
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_HIGHLIGHTS)
    .map(({ magnitude: _magnitude, ...highlight }) => highlight);
}

/* ── Conversione righe → modello di dominio ───────────────────────── */

function toScore(row: ScoreRow): LongevityScore {
  const byKey = new Map(row.score_pillars.map((p) => [p.key, p]));

  // Ordine fisso, quello dichiarato nel dominio: il paziente deve
  // ritrovare i pilastri sempre nella stessa posizione.
  const pillars: ScorePillar[] = PILLAR_KEYS.flatMap((key) => {
    const found = byKey.get(key);
    if (!found) return [];
    return [
      {
        key: key as PillarKey,
        label: found.label,
        value: found.value === null ? null : Number(found.value),
        coverage: found.coverage === null ? null : Number(found.coverage),
        delta: found.delta === null ? null : Number(found.delta),
      },
    ];
  });

  return {
    id: row.id,
    measuredOn: row.measured_on,
    score: Number(row.score),
    previousScore: row.previous_score === null ? null : Number(row.previous_score),
    trend: row.trend,
    biologicalAge: row.biological_age === null ? null : Number(row.biological_age),
    summary: row.summary,
    coverage: row.coverage === null ? null : Number(row.coverage),
    pillars,
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  const pro = row.professionals;
  return {
    id: row.id,
    serviceName: row.service_name,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    creditsCost: Number(row.credits_cost),
    professional: pro
      ? {
          id: pro.id,
          fullName: pro.profiles?.full_name ?? "",
          title: pro.title,
          specialty: pro.specialty,
          avatarUrl: pro.profiles?.avatar_url ?? null,
        }
      : null,
  };
}

function toEnrollment(row: EnrollmentRow): ProgramEnrollment {
  return {
    id: row.id,
    programName: row.programs?.name ?? "Percorso",
    description: row.programs?.description ?? null,
    status: row.status,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    progressPct: Number(row.progress_pct),
    stepsDone: row.steps_done,
    stepsTotal: row.steps_total,
  };
}

function toAction(row: ActionRow): RecommendedAction {
  const priority = Math.min(3, Math.max(1, row.priority)) as 1 | 2 | 3;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pillarKey: (PILLAR_KEYS as readonly string[]).includes(row.pillar_key ?? "")
      ? (row.pillar_key as PillarKey)
      : null,
    source: row.source,
    status: row.status,
    dueOn: row.due_on,
    priority,
  };
}

function toDocument(row: DocumentRow): PatientDocument {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    issuedOn: row.issued_on,
    createdAt: row.created_at,
    isNewForPatient: row.is_new_for_patient,
    sizeBytes: row.size_bytes,
  };
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/* ── Query ────────────────────────────────────────────────────────── */

/**
 * Tutto ciò che serve alla home del paziente.
 *
 * Restituisce null quando l’utente collegato non è un paziente — uno
 * staff, oppure un account non ancora associato a una scheda clinica.
 * In modalità dimostrativa restituisce i dati di esempio.
 */
export async function getPatientDashboard(): Promise<PatientDashboardData | null> {
  if (!isSupabaseConfigured()) {
    return mockPatientDashboard;
  }

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createSupabaseServerClient();

  const { data: patientData } = await supabase
    .from("patients")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const patientId = (patientData as { id: string } | null)?.id;
  if (!patientId) return null;

  const nowIso = new Date().toISOString();

  const [
    scores,
    appointment,
    enrollment,
    balance,
    membership,
    actions,
    documents,
    notifications,
    measurements,
  ] = await Promise.all([
    supabase
      .from("longevity_scores")
      .select(
        "id, measured_on, score, previous_score, trend, biological_age, summary, coverage, score_pillars(key, label, value, coverage, delta)",
      )
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(8),

    supabase
      .from("appointments")
      .select(
        "id, service_name, status, starts_at, ends_at, location, credits_cost, professionals(id, title, specialty, profiles(full_name, avatar_url))",
      )
      .eq("patient_id", patientId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("program_enrollments")
      .select(
        "id, status, started_on, ends_on, progress_pct, steps_done, steps_total, programs(name, description)",
      )
      .eq("patient_id", patientId)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("credit_balances")
      .select("balance, total_credited, total_used")
      .eq("patient_id", patientId)
      .maybeSingle(),

    supabase
      .from("memberships")
      .select("ends_on, membership_tiers(name)")
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("recommended_actions")
      .select("id, title, description, pillar_key, source, status, due_on, priority")
      .eq("patient_id", patientId)
      .in("status", ["suggested", "accepted", "in_progress"])
      .order("priority", { ascending: true })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(8),

    supabase
      .from("documents")
      .select("id, kind, title, issued_on, created_at, is_new_for_patient, size_bytes")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("notifications")
      .select("id, title, body, link_url, read_at, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("measurements")
      .select("metric_code, value, measured_on")
      .eq("patient_id", patientId)
      .not("value", "is", null)
      .order("measured_on", { ascending: true }),
  ]);

  const scoreRows = (scores.data ?? []) as ScoreRow[];
  const balanceRow = balance.data as BalanceRow | null;
  const membershipRow = membership.data as MembershipRow | null;

  const credits: CreditSummary = {
    balance: Number(balanceRow?.balance ?? 0),
    totalCredited: Number(balanceRow?.total_credited ?? 0),
    totalUsed: Number(balanceRow?.total_used ?? 0),
    membershipName: membershipRow?.membership_tiers?.name ?? null,
    membershipEndsOn: membershipRow?.ends_on ?? null,
  };

  // Le rilevazioni arrivano dalla più recente; il grafico le vuole in ordine
  // cronologico.
  const scoreHistory: ScorePoint[] = scoreRows
    .map((row) => ({ measuredOn: row.measured_on, score: Number(row.score) }))
    .reverse();

  return {
    profile,
    score: scoreRows.length > 0 ? toScore(scoreRows[0]) : null,
    scoreHistory,
    nextAppointment: appointment.data
      ? toAppointment(appointment.data as unknown as AppointmentRow)
      : null,
    enrollment: enrollment.data
      ? toEnrollment(enrollment.data as unknown as EnrollmentRow)
      : null,
    credits,
    actions: ((actions.data ?? []) as ActionRow[]).map(toAction),
    newDocuments: ((documents.data ?? []) as DocumentRow[]).map(toDocument),
    notifications: ((notifications.data ?? []) as NotificationRow[]).map(toNotification),
    highlights: buildHighlights((measurements.data ?? []) as MeasurementRow[]),
  };
}

/**
 * Variante usata dalle pagine della Patient App.
 *
 * Chi non è paziente viene mandato al proprio livello invece di vedere una
 * home vuota. Il null residuo significa una cosa sola: account valido, ma
 * scheda clinica non ancora aperta dalla clinica.
 */
export async function requirePatientDashboard(): Promise<PatientDashboardData | null> {
  const profile = await requireProfile();

  if (profile.role !== "patient") {
    redirect(homePathForRole(profile.role));
  }

  return getPatientDashboard();
}
