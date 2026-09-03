/**
 * Customer journey.
 *
 * Lo stato non è un campo che qualcuno aggiorna: è **derivato** dai
 * fatti. Un campo scritto a mano si disallinea al primo passaggio
 * dimenticato, e uno stato sbagliato in un CRM è peggio di nessuno
 * stato, perché ci si costruiscono sopra decisioni e automazioni.
 */

export const JOURNEY_STAGES = [
  "lead",
  "first_visit_booked",
  "score_done",
  "plan_proposed",
  "membership_proposed",
  "membership_active",
  "program_active",
  "reassessment_due",
  "retention",
  "inactive",
  "lost",
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const STAGE_LABELS: Record<JourneyStage, string> = {
  lead: "Lead",
  first_visit_booked: "Prima visita prenotata",
  score_done: "Longevity Score effettuato",
  plan_proposed: "Piano consigliato",
  membership_proposed: "Membership proposta",
  membership_active: "Membership attiva",
  program_active: "Percorso in corso",
  reassessment_due: "Reassessment",
  retention: "Retention",
  inactive: "Inattivo",
  lost: "Perso",
};

/** Oltre questi giorni senza un nuovo punteggio, tocca rivalutare. */
export const REASSESSMENT_DAYS = 120;

/** Oltre questi giorni senza contatto né visite, il paziente è fermo. */
export const INACTIVITY_DAYS = 180;

export interface JourneyInput {
  /** Stato CRM, se la persona viene da un lead. */
  leadLost: boolean;
  hasBookedFirstVisit: boolean;
  hasScore: boolean;
  lastScoreOn: string | null;
  /** Un piano è stato consigliato: proposta di percorso accettata o percorso creato. */
  hasPlan: boolean;
  membershipProposedAt: string | null;
  membershipActive: boolean;
  membershipEnded: boolean;
  programActive: boolean;
  lastActivityOn: string | null;
  today: string;
}

export interface JourneyResult {
  stage: JourneyStage;
  /** Il fatto che ha determinato lo stato: serve a spiegarlo, non a decorarlo. */
  reason: string;
  /** Da quanti giorni la persona è ferma, se lo sappiamo. */
  daysSinceActivity: number | null;
}

function giorniTra(da: string | null, a: string): number | null {
  if (!da) return null;
  const x = Date.parse(`${da.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

/**
 * Lo stato attuale, valutato dal più avanzato al meno avanzato.
 *
 * L'ordine conta: un membro con un percorso in corso è "percorso", non
 * "membership attiva", perché è quello lo stato che descrive cosa sta
 * succedendo adesso.
 */
export function computeJourneyStage(input: JourneyInput): JourneyResult {
  const inattivoDa = giorniTra(input.lastActivityOn, input.today);
  const base = { daysSinceActivity: inattivoDa };

  if (input.leadLost) {
    return { ...base, stage: "lost", reason: "Lead segnato come perso." };
  }

  // L'inattività prevale su tutto tranne "perso": un membro fermo da sei
  // mesi non è in retention, per quanto la membership risulti attiva.
  if (inattivoDa !== null && inattivoDa > INACTIVITY_DAYS) {
    return {
      ...base,
      stage: "inactive",
      reason: `Nessuna attività da ${inattivoDa} giorni.`,
    };
  }

  if (input.membershipActive) {
    if (input.programActive) {
      return { ...base, stage: "program_active", reason: "Percorso in corso." };
    }

    const daPunteggio = giorniTra(input.lastScoreOn, input.today);
    if (daPunteggio === null || daPunteggio > REASSESSMENT_DAYS) {
      return {
        ...base,
        stage: "reassessment_due",
        reason:
          daPunteggio === null
            ? "Membership attiva, nessun punteggio registrato."
            : `Ultimo punteggio ${daPunteggio} giorni fa.`,
      };
    }

    return { ...base, stage: "retention", reason: "Membership attiva e percorso aggiornato." };
  }

  if (input.membershipEnded) {
    return { ...base, stage: "inactive", reason: "Membership conclusa." };
  }

  if (input.membershipProposedAt) {
    return { ...base, stage: "membership_proposed", reason: "Membership proposta, in attesa." };
  }

  if (input.hasPlan) {
    return { ...base, stage: "plan_proposed", reason: "Piano consigliato." };
  }

  if (input.hasScore) {
    return { ...base, stage: "score_done", reason: "Longevity Score effettuato." };
  }

  if (input.hasBookedFirstVisit) {
    return { ...base, stage: "first_visit_booked", reason: "Prima visita prenotata." };
  }

  return { ...base, stage: "lead", reason: "Nessuna visita ancora prenotata." };
}

/** Posizione nell'imbuto, per ordinare e misurare. 0 = fuori percorso. */
export function stageRank(stage: JourneyStage): number {
  if (stage === "lost" || stage === "inactive") return 0;
  return JOURNEY_STAGES.indexOf(stage) + 1;
}
