/**
 * Modello di dominio di Unique OS.
 *
 * Questi tipi rispecchiano lo schema in `supabase/migrations/`. Sono la
 * fonte di verità condivisa dai quattro livelli — Patient App,
 * Professional App, Control Center e Unique Brain — così che un
 * "paziente" significhi la stessa cosa ovunque.
 */

export type AppRole = "patient" | "professional" | "admin" | "owner";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type DocumentKind =
  | "lab_report"
  | "imaging"
  | "prescription"
  | "consent"
  | "care_plan"
  | "invoice"
  | "other";

export type ProgramStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type ActionStatus =
  | "suggested"
  | "accepted"
  | "in_progress"
  | "done"
  | "dismissed";

export type ActionSource = "professional" | "protocol" | "brain";

export type ScoreTrend = "up" | "stable" | "down";

export type CreditEntryType =
  | "purchase"
  | "grant"
  | "consumption"
  | "refund"
  | "expiry"
  | "adjustment";

/**
 * I pilastri dell’Unique Longevity Score.
 *
 * Sono deliberatamente pochi e stabili: il paziente deve poterli
 * riconoscere e ricordare. La composizione dei biomarcatori dentro
 * ciascun pilastro può evolvere senza cambiare questa lista.
 */
import type { PillarKey } from "@/lib/score/pillars";

export { PILLAR_KEYS, PILLAR_LABELS, PILLAR_WEIGHTS } from "@/lib/score/pillars";
export type { PillarKey };

export interface Profile {
  id: string;
  role: AppRole;
  fullName: string;
  firstName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface Professional {
  id: string;
  fullName: string;
  title: string | null;
  specialty: string | null;
  avatarUrl: string | null;
}

export interface ScorePillar {
  key: PillarKey;
  label: string;
  /** Null quando i dati disponibili non bastano a esprimere un giudizio. */
  value: number | null;
  /** Quota dei parametri previsti effettivamente disponibili, 0–1. */
  coverage: number | null;
  /** Variazione rispetto alla rilevazione precedente, in punti. */
  delta: number | null;
}

export interface LongevityScore {
  id: string;
  measuredOn: string;
  score: number;
  previousScore: number | null;
  trend: ScoreTrend | null;
  biologicalAge: number | null;
  summary: string | null;
  /** Quanta parte dei dati previsti alimenta questo punteggio, 0–1. */
  coverage: number | null;
  pillars: ScorePillar[];
}

/** Un punto dello storico, per il grafico di andamento. */
export interface ScorePoint {
  measuredOn: string;
  score: number;
}

export interface Appointment {
  id: string;
  serviceName: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  location: string | null;
  professional: Professional | null;
  creditsCost: number;
}

export interface ProgramEnrollment {
  id: string;
  programName: string;
  description: string | null;
  status: ProgramStatus;
  startedOn: string;
  endsOn: string | null;
  progressPct: number;
  /** Passi completati sul totale, per dare concretezza alla percentuale. */
  stepsDone: number;
  stepsTotal: number;
}

export interface RecommendedAction {
  id: string;
  title: string;
  description: string | null;
  pillarKey: PillarKey | null;
  source: ActionSource;
  status: ActionStatus;
  dueOn: string | null;
  /** 1 = alta, 2 = media, 3 = bassa. */
  priority: 1 | 2 | 3;
}

export interface PatientDocument {
  id: string;
  kind: DocumentKind;
  title: string;
  issuedOn: string | null;
  createdAt: string;
  isNewForPatient: boolean;
  sizeBytes: number | null;
}

export interface CreditSummary {
  balance: number;
  totalCredited: number;
  totalUsed: number;
  membershipName: string | null;
  membershipEndsOn: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Un risultato concreto ottenuto nel percorso, da celebrare in home. */
export interface ProgressHighlight {
  id: string;
  label: string;
  value: string;
  change: string | null;
  direction: "up" | "down" | "flat";
  /** Se true, la variazione è un miglioramento clinico. */
  isImprovement: boolean;
}

/**
 * Tutto ciò che serve a comporre la home del paziente.
 * Una sola struttura, così la pagina resta un unico `await`.
 */
export interface PatientDashboardData {
  profile: Profile;
  /** Null per un paziente appena preso in carico, prima del primo pannello. */
  score: LongevityScore | null;
  scoreHistory: ScorePoint[];
  nextAppointment: Appointment | null;
  enrollment: ProgramEnrollment | null;
  credits: CreditSummary;
  actions: RecommendedAction[];
  newDocuments: PatientDocument[];
  notifications: AppNotification[];
  highlights: ProgressHighlight[];
}
