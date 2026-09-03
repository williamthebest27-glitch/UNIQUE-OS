import type { JourneyStage } from "../journey/stages.ts";

/**
 * Next Best Action.
 *
 * **Le regole cliniche e quelle commerciali sono due elenchi separati, e
 * restano separate fino allo schermo.** Non è una convenzione di stile:
 * un suggerimento clinico che compete in classifica con uno commerciale
 * finisce, prima o poi, per essere scelto anche quando conviene invece
 * che quando serve. Qui non possono nemmeno mescolarsi — `nextBestActions`
 * restituisce due liste, non una ordinata.
 *
 * Ogni suggerimento porta con sé i fatti che lo hanno attivato: chi legge
 * deve poter verificare il perché senza fidarsi del cosa.
 */

export type NbaKind = "clinical" | "commercial";

export interface NbaContext {
  today: string;
  stage: JourneyStage;

  /** Giorni dall'ultimo Longevity Score. Null se non ne ha mai avuto uno. */
  daysSinceScore: number | null;
  /** Pilastri non calcolabili per dati mancanti. */
  missingPillars: string[];

  creditsGranted: number;
  creditsUsed: number;
  creditsAvailable: number;

  /** Giorni dall'ultima visita, per disciplina. Null se mai avvenuta. */
  daysSinceVisitByDiscipline: Record<string, number | null>;

  documentsAwaitingReview: number;
  proposalsAwaitingReview: number;

  /** Giorni dall'ultima attività registrata sul percorso. */
  programStalledDays: number | null;

  membershipDaysToExpiry: number | null;
  failedPayments: number;
}

export interface NbaSuggestion {
  id: string;
  kind: NbaKind;
  title: string;
  /** I fatti che hanno attivato la regola, in chiaro. */
  because: string[];
  priority: 1 | 2 | 3;
}

interface Rule {
  id: string;
  kind: NbaKind;
  evaluate: (ctx: NbaContext) => NbaSuggestion | null;
}

/* ── Soglie ───────────────────────────────────────────────────────── */

/**
 * Il controllo è trimestrale, ma il suggerimento arriva prima: proporlo
 * il novantesimo giorno significa farlo fare al centoventesimo. Ottanta
 * giorni lasciano il tempo di prenotare.
 */
export const SCORE_REFRESH_DAYS = 80;
export const NUTRITION_FOLLOWUP_DAYS = 120;
export const PROGRAM_STALL_DAYS = 30;
export const MEMBERSHIP_NOTICE_DAYS = 45;

const DISCIPLINE_LABELS: Record<string, string> = {
  physician: "medica",
  nutritionist: "nutrizionale",
  osteopath: "osteopatica",
  psychologist: "psicologica",
  trainer: "con il preparatore",
  nurse: "infermieristica",
};

/* ── Regole cliniche ──────────────────────────────────────────────── */
/* Guardano solo il percorso di salute. Nessuna di esse conosce i crediti,
   il prezzo o la scadenza della membership: non devono. */

export const CLINICAL_RULES: Rule[] = [
  {
    id: "score-stale",
    kind: "clinical",
    evaluate: (ctx) => {
      if (ctx.daysSinceScore === null) {
        return {
          id: "score-stale",
          kind: "clinical",
          title: "Effettuare il primo Longevity Score",
          because: ["Nessun punteggio registrato."],
          priority: 1,
        };
      }
      if (ctx.daysSinceScore < SCORE_REFRESH_DAYS) return null;
      return {
        id: "score-stale",
        kind: "clinical",
        title: "Ripetere il Longevity Score",
        because: [`Score effettuato ${ctx.daysSinceScore} giorni fa.`],
        priority: ctx.daysSinceScore > SCORE_REFRESH_DAYS * 2 ? 1 : 2,
      };
    },
  },
  {
    id: "documents-to-review",
    kind: "clinical",
    evaluate: (ctx) => {
      if (ctx.documentsAwaitingReview === 0 && ctx.proposalsAwaitingReview === 0) return null;
      const because: string[] = [];
      if (ctx.documentsAwaitingReview > 0) {
        because.push(`${ctx.documentsAwaitingReview} documenti caricati di recente.`);
      }
      if (ctx.proposalsAwaitingReview > 0) {
        because.push(`${ctx.proposalsAwaitingReview} valori estratti in attesa di approvazione.`);
      }
      return {
        id: "documents-to-review",
        kind: "clinical",
        title: "Rivedere i nuovi referti",
        because,
        priority: 1,
      };
    },
  },
  {
    id: "nutrition-followup",
    kind: "clinical",
    evaluate: (ctx) => {
      const giorni = ctx.daysSinceVisitByDiscipline.nutritionist;
      if (giorni === null || giorni === undefined) return null;
      if (giorni < NUTRITION_FOLLOWUP_DAYS) return null;

      const mesi = Math.floor(giorni / 30);
      return {
        id: "nutrition-followup",
        kind: "clinical",
        title: "Prenotare controllo nutrizionale",
        because: [`Non effettua una visita nutrizionale da ${mesi} mesi.`],
        priority: 2,
      };
    },
  },
  {
    id: "missing-pillars",
    kind: "clinical",
    evaluate: (ctx) => {
      if (ctx.missingPillars.length === 0) return null;
      return {
        id: "missing-pillars",
        kind: "clinical",
        title: "Completare i dati mancanti dello Score",
        because: [
          `Non calcolabili: ${ctx.missingPillars.join(", ")}.`,
          "Il punteggio complessivo resta parziale finché mancano.",
        ],
        priority: 2,
      };
    },
  },
];

/* ── Regole commerciali ───────────────────────────────────────────── */
/* Guardano crediti, membership e continuità del rapporto. Nessuna di esse
   propone un atto clinico. */

export const COMMERCIAL_RULES: Rule[] = [
  {
    id: "payment-failed",
    kind: "commercial",
    evaluate: (ctx) =>
      ctx.failedPayments > 0
        ? {
            id: "payment-failed",
            kind: "commercial",
            title: "Recuperare il pagamento fallito",
            because: [`${ctx.failedPayments} pagamenti non andati a buon fine.`],
            priority: 1,
          }
        : null,
  },
  {
    id: "credits-unused",
    kind: "commercial",
    evaluate: (ctx) => {
      if (ctx.creditsGranted <= 0 || ctx.creditsAvailable <= 0) return null;
      // Poco consumo a percorso avviato: il valore comprato non si sta
      // trasformando in visite.
      const quota = ctx.creditsUsed / ctx.creditsGranted;
      if (quota > 0.6) return null;

      return {
        id: "credits-unused",
        kind: "commercial",
        title: "Proporre l’utilizzo dei crediti residui",
        because: [
          `Il paziente ha utilizzato ${ctx.creditsUsed} crediti su ${ctx.creditsGranted}.`,
          `Ne restano ${ctx.creditsAvailable} disponibili.`,
        ],
        priority: 2,
      };
    },
  },
  {
    id: "program-stalled",
    kind: "commercial",
    evaluate: (ctx) => {
      if (ctx.programStalledDays === null) return null;
      if (ctx.programStalledDays < PROGRAM_STALL_DAYS) return null;
      return {
        id: "program-stalled",
        kind: "commercial",
        title: "Contattare il paziente: il percorso è fermo",
        because: [`Nessuna attività da ${ctx.programStalledDays} giorni.`],
        priority: 1,
      };
    },
  },
  {
    id: "membership-expiring",
    kind: "commercial",
    evaluate: (ctx) => {
      if (ctx.membershipDaysToExpiry === null) return null;
      if (ctx.membershipDaysToExpiry > MEMBERSHIP_NOTICE_DAYS) return null;
      return {
        id: "membership-expiring",
        kind: "commercial",
        title: "Preparare il rinnovo della membership",
        because: [
          ctx.membershipDaysToExpiry <= 0
            ? "La membership è scaduta."
            : `Scade fra ${ctx.membershipDaysToExpiry} giorni.`,
        ],
        priority: ctx.membershipDaysToExpiry <= 15 ? 1 : 2,
      };
    },
  },
  {
    id: "propose-membership",
    kind: "commercial",
    evaluate: (ctx) =>
      ctx.stage === "plan_proposed"
        ? {
            id: "propose-membership",
            kind: "commercial",
            title: "Proporre la membership",
            because: ["Il piano è stato consigliato ma non c’è ancora una membership."],
            priority: 2,
          }
        : null,
  },
];

/* ── Valutazione ──────────────────────────────────────────────────── */

export interface NextBestActions {
  clinical: NbaSuggestion[];
  commercial: NbaSuggestion[];
}

function run(rules: Rule[], ctx: NbaContext): NbaSuggestion[] {
  return rules
    .map((r) => r.evaluate(ctx))
    .filter((s): s is NbaSuggestion => s !== null)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Due liste, mai una.
 *
 * Restituire un elenco unico ordinato sarebbe già una scelta: metterebbe
 * in competizione "ripetere gli esami" e "proporre il rinnovo", e in una
 * classifica sola qualcuno finirebbe per guardare solo la prima riga.
 */
export function nextBestActions(ctx: NbaContext): NextBestActions {
  return {
    clinical: run(CLINICAL_RULES, ctx),
    commercial: run(COMMERCIAL_RULES, ctx),
  };
}

export function disciplineLabel(discipline: string): string {
  return DISCIPLINE_LABELS[discipline] ?? discipline;
}
