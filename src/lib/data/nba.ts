import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { nextBestActions, type NextBestActions } from "@/lib/nba/rules";
import { computeJourneyStage, type JourneyResult } from "@/lib/journey/stages";
import { PILLAR_LABELS, type PillarKey } from "@/lib/domain/types";

/**
 * Raccoglie i fatti e li passa alle regole.
 *
 * Qui non c'è nessuna decisione: si legge il database e si costruisce il
 * contesto. Cosa proporre lo decidono `nextBestActions` e
 * `computeJourneyStage`, che sono funzioni pure e testate — è la ragione
 * per cui si può discutere una regola guardando il codice invece di
 * ricostruirla da una query.
 */

export interface PatientSignals {
  stage: JourneyResult;
  azioni: NextBestActions;
}

function giorniDa(iso: string | null, oggi: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${oggi}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export async function getPatientSignals(patientId: string): Promise<PatientSignals | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const [
    scoreRes,
    creditiRes,
    visiteRes,
    documentiRes,
    proposteRes,
    membershipRes,
    programRes,
    pagamentiRes,
    leadRes,
  ] = await Promise.all([
    supabase
      .from("longevity_scores")
      .select("measured_on, score_pillars(key, value)")
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("credit_balances")
      .select("total_credited, total_used, available")
      .eq("patient_id", patientId)
      .maybeSingle(),

    supabase
      .from("appointments")
      .select("starts_at, status, professionals(discipline)")
      .eq("patient_id", patientId)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(60),

    supabase
      .from("documents")
      .select("id")
      .eq("patient_id", patientId)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),

    supabase
      .from("measurement_proposals")
      .select("id")
      .eq("patient_id", patientId)
      .eq("status", "needs_review"),

    supabase
      .from("memberships")
      .select("status, is_active, ends_on, cancelled_at, created_at")
      .eq("patient_id", patientId)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("program_enrollments")
      .select("status, started_on, updated_at")
      .eq("patient_id", patientId)
      .order("started_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("payments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("status", "failed"),

    supabase
      .from("leads")
      .select("status")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle(),
  ]);

  /* ── Score e pilastri mancanti ──────────────────────────────── */
  const score = scoreRes.data as {
    measured_on: string;
    score_pillars: { key: string; value: number | null }[];
  } | null;

  const daysSinceScore = giorniDa(score?.measured_on ?? null, oggi);

  const missingPillars = (score?.score_pillars ?? [])
    .filter((p) => p.value === null)
    .map((p) => PILLAR_LABELS[p.key as PillarKey] ?? p.key);

  /* ── Visite per disciplina ──────────────────────────────────── */
  const visite = (visiteRes.data ?? []) as unknown as {
    starts_at: string;
    professionals: { discipline: string } | null;
  }[];

  const daysSinceVisitByDiscipline: Record<string, number | null> = {};
  for (const v of visite) {
    const d = v.professionals?.discipline;
    if (!d) continue;
    const giorni = giorniDa(v.starts_at, oggi);
    // Le visite arrivano dalla più recente: la prima che si incontra vince.
    if (daysSinceVisitByDiscipline[d] === undefined) {
      daysSinceVisitByDiscipline[d] = giorni;
    }
  }

  /* ── Crediti, membership, percorso ──────────────────────────── */
  const crediti = creditiRes.data as {
    total_credited: number;
    total_used: number;
    available: number;
  } | null;

  const membership = membershipRes.data as {
    status: string;
    is_active: boolean;
    ends_on: string | null;
    cancelled_at: string | null;
    created_at: string;
  } | null;

  const programma = programRes.data as {
    status: string;
    started_on: string;
    updated_at: string;
  } | null;

  const membershipDaysToExpiry =
    membership?.ends_on && membership.is_active
      ? -(giorniDa(membership.ends_on, oggi) ?? 0)
      : null;

  const ultimaAttivita =
    visite[0]?.starts_at.slice(0, 10) ?? programma?.updated_at.slice(0, 10) ?? null;

  const programStalledDays =
    programma?.status === "active" ? giorniDa(programma.updated_at, oggi) : null;

  /* ── Journey ────────────────────────────────────────────────── */
  const lead = leadRes.data as { status: string } | null;

  const stage = computeJourneyStage({
    leadLost: lead?.status === "lost",
    hasBookedFirstVisit: visite.length > 0,
    hasScore: score !== null,
    lastScoreOn: score?.measured_on ?? null,
    hasPlan: programma !== null,
    membershipProposedAt: membership && !membership.is_active ? membership.created_at : null,
    membershipActive: Boolean(membership?.is_active && membership.status === "active"),
    membershipEnded: Boolean(
      membership && ["cancelled", "expired"].includes(membership.status),
    ),
    programActive: programma?.status === "active",
    lastActivityOn: ultimaAttivita,
    today: oggi,
  });

  /* ── Regole ─────────────────────────────────────────────────── */
  const azioni = nextBestActions({
    today: oggi,
    stage: stage.stage,
    daysSinceScore,
    missingPillars,
    creditsGranted: Number(crediti?.total_credited ?? 0),
    creditsUsed: Number(crediti?.total_used ?? 0),
    creditsAvailable: Number(crediti?.available ?? 0),
    daysSinceVisitByDiscipline,
    documentsAwaitingReview: (documentiRes.data ?? []).length,
    proposalsAwaitingReview: (proposteRes.data ?? []).length,
    programStalledDays,
    membershipDaysToExpiry,
    failedPayments: (pagamentiRes.data ?? []).length,
  });

  return { stage, azioni };
}
