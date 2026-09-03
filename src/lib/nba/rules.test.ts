import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLINICAL_RULES,
  COMMERCIAL_RULES,
  nextBestActions,
  type NbaContext,
} from "./rules.ts";
import {
  INACTIVITY_DAYS,
  REASSESSMENT_DAYS,
  computeJourneyStage,
  stageRank,
  type JourneyInput,
} from "../journey/stages.ts";

const OGGI = "2026-09-10";

function contesto(over: Partial<NbaContext> = {}): NbaContext {
  return {
    today: OGGI,
    stage: "retention",
    daysSinceScore: 10,
    missingPillars: [],
    creditsGranted: 24,
    creditsUsed: 20,
    creditsAvailable: 4,
    daysSinceVisitByDiscipline: {},
    documentsAwaitingReview: 0,
    proposalsAwaitingReview: 0,
    programStalledDays: null,
    membershipDaysToExpiry: null,
    failedPayments: 0,
    ...over,
  };
}

function percorso(over: Partial<JourneyInput> = {}): JourneyInput {
  return {
    leadLost: false,
    hasBookedFirstVisit: false,
    hasScore: false,
    lastScoreOn: null,
    hasPlan: false,
    membershipProposedAt: null,
    membershipActive: false,
    membershipEnded: false,
    programActive: false,
    lastActivityOn: OGGI,
    today: OGGI,
    ...over,
  };
}

describe("separazione fra regole cliniche e commerciali", () => {
  it("tiene le due liste distinte", () => {
    const r = nextBestActions(
      contesto({ daysSinceScore: 200, creditsUsed: 2, creditsGranted: 24, creditsAvailable: 22 }),
    );
    assert.ok(r.clinical.length > 0);
    assert.ok(r.commercial.length > 0);
    // Nessun suggerimento appare in entrambe.
    const ids = new Set(r.clinical.map((s) => s.id));
    assert.ok(r.commercial.every((s) => !ids.has(s.id)));
  });

  it("etichetta ogni regola con il proprio tipo", () => {
    for (const rule of CLINICAL_RULES) assert.equal(rule.kind, "clinical");
    for (const rule of COMMERCIAL_RULES) assert.equal(rule.kind, "commercial");
  });

  it("non fa dipendere una regola clinica dai crediti o dalla membership", () => {
    // Stesso contesto clinico, situazione commerciale opposta: i
    // suggerimenti clinici devono essere identici.
    const clinico = { daysSinceScore: 200, documentsAwaitingReview: 2 };

    const povero = nextBestActions(
      contesto({ ...clinico, creditsAvailable: 0, membershipDaysToExpiry: 2, failedPayments: 3 }),
    );
    const ricco = nextBestActions(
      contesto({ ...clinico, creditsAvailable: 40, membershipDaysToExpiry: 300, failedPayments: 0 }),
    );

    assert.deepEqual(
      povero.clinical.map((s) => s.id),
      ricco.clinical.map((s) => s.id),
    );
  });

  it("porta con sé i fatti che hanno attivato ogni suggerimento", () => {
    const r = nextBestActions(contesto({ daysSinceScore: 87 }));
    const score = r.clinical.find((s) => s.id === "score-stale")!;
    assert.match(score.because[0], /87 giorni/);
  });
});

describe("regole cliniche", () => {
  it("propone il primo Score a chi non ne ha mai avuto uno", () => {
    const r = nextBestActions(contesto({ daysSinceScore: null }));
    const s = r.clinical.find((x) => x.id === "score-stale")!;
    assert.match(s.title, /primo Longevity Score/);
    assert.equal(s.priority, 1);
  });

  it("non insiste su uno Score recente", () => {
    const r = nextBestActions(contesto({ daysSinceScore: 30 }));
    assert.equal(r.clinical.find((x) => x.id === "score-stale"), undefined);
  });

  it("alza la priorità su uno Score molto vecchio", () => {
    const recente = nextBestActions(contesto({ daysSinceScore: 100 }));
    const vecchio = nextBestActions(contesto({ daysSinceScore: 400 }));
    assert.equal(recente.clinical.find((x) => x.id === "score-stale")!.priority, 2);
    assert.equal(vecchio.clinical.find((x) => x.id === "score-stale")!.priority, 1);
  });

  it("segnala il controllo nutrizionale dopo mesi", () => {
    const r = nextBestActions(
      contesto({ daysSinceVisitByDiscipline: { nutritionist: 150 } }),
    );
    const s = r.clinical.find((x) => x.id === "nutrition-followup")!;
    assert.match(s.because[0], /5 mesi/);
  });

  it("non segnala nulla per una disciplina mai frequentata", () => {
    const r = nextBestActions(
      contesto({ daysSinceVisitByDiscipline: { nutritionist: null } }),
    );
    assert.equal(r.clinical.find((x) => x.id === "nutrition-followup"), undefined);
  });

  it("elenca i pilastri non calcolabili", () => {
    const r = nextBestActions(contesto({ missingPillars: ["Mental Wellbeing"] }));
    const s = r.clinical.find((x) => x.id === "missing-pillars")!;
    assert.match(s.because[0], /Mental Wellbeing/);
  });
});

describe("regole commerciali", () => {
  it("suggerisce di usare i crediti fermi", () => {
    const r = nextBestActions(
      contesto({ creditsGranted: 6, creditsUsed: 3, creditsAvailable: 3 }),
    );
    const s = r.commercial.find((x) => x.id === "credits-unused")!;
    assert.match(s.because[0], /3 crediti su 6/);
  });

  it("tace quando i crediti sono stati consumati", () => {
    const r = nextBestActions(
      contesto({ creditsGranted: 24, creditsUsed: 20, creditsAvailable: 4 }),
    );
    assert.equal(r.commercial.find((x) => x.id === "credits-unused"), undefined);
  });

  it("segnala il percorso fermo", () => {
    const r = nextBestActions(contesto({ programStalledDays: 45 }));
    const s = r.commercial.find((x) => x.id === "program-stalled")!;
    assert.equal(s.priority, 1);
  });

  it("mette in cima un pagamento fallito", () => {
    const r = nextBestActions(contesto({ failedPayments: 1 }));
    assert.equal(r.commercial[0].id, "payment-failed");
  });

  it("avvisa del rinnovo prima della scadenza, con più urgenza sotto i quindici giorni", () => {
    assert.equal(
      nextBestActions(contesto({ membershipDaysToExpiry: 40 })).commercial.find(
        (x) => x.id === "membership-expiring",
      )!.priority,
      2,
    );
    assert.equal(
      nextBestActions(contesto({ membershipDaysToExpiry: 5 })).commercial.find(
        (x) => x.id === "membership-expiring",
      )!.priority,
      1,
    );
  });

  it("non dice nulla quando non c’è nulla da dire", () => {
    const r = nextBestActions(contesto());
    assert.equal(r.clinical.length, 0);
    assert.equal(r.commercial.length, 0);
  });
});

describe("customer journey", () => {
  it("parte da lead", () => {
    assert.equal(computeJourneyStage(percorso()).stage, "lead");
  });

  it("segue l’imbuto della visione", () => {
    assert.equal(
      computeJourneyStage(percorso({ hasBookedFirstVisit: true })).stage,
      "first_visit_booked",
    );
    assert.equal(
      computeJourneyStage(percorso({ hasBookedFirstVisit: true, hasScore: true })).stage,
      "score_done",
    );
    assert.equal(
      computeJourneyStage(percorso({ hasScore: true, hasPlan: true })).stage,
      "plan_proposed",
    );
    assert.equal(
      computeJourneyStage(percorso({ hasPlan: true, membershipProposedAt: "2026-08-01" })).stage,
      "membership_proposed",
    );
  });

  it("mette il percorso in corso davanti alla membership attiva", () => {
    const r = computeJourneyStage(
      percorso({ membershipActive: true, programActive: true, lastScoreOn: OGGI }),
    );
    assert.equal(r.stage, "program_active");
  });

  it("chiede il reassessment quando il punteggio invecchia", () => {
    const vecchio = new Date(Date.parse(OGGI) - (REASSESSMENT_DAYS + 10) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = computeJourneyStage(percorso({ membershipActive: true, lastScoreOn: vecchio }));
    assert.equal(r.stage, "reassessment_due");
  });

  it("chiama retention un membro aggiornato", () => {
    const r = computeJourneyStage(percorso({ membershipActive: true, lastScoreOn: OGGI }));
    assert.equal(r.stage, "retention");
  });

  it("l’inattività prevale sulla membership attiva", () => {
    const fermo = new Date(Date.parse(OGGI) - (INACTIVITY_DAYS + 30) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = computeJourneyStage(
      percorso({ membershipActive: true, lastScoreOn: OGGI, lastActivityOn: fermo }),
    );
    assert.equal(r.stage, "inactive");
  });

  it("un lead perso resta perso", () => {
    const r = computeJourneyStage(percorso({ leadLost: true, membershipActive: true }));
    assert.equal(r.stage, "lost");
  });

  it("spiega sempre perché", () => {
    for (const input of [percorso(), percorso({ hasScore: true }), percorso({ leadLost: true })]) {
      assert.ok(computeJourneyStage(input).reason.length > 0);
    }
  });

  it("colloca fuori dall’imbuto chi è perso o inattivo", () => {
    assert.equal(stageRank("lost"), 0);
    assert.equal(stageRank("inactive"), 0);
    assert.ok(stageRank("retention") > stageRank("lead"));
  });
});
