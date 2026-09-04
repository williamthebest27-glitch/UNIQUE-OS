import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUORI_LINEA,
  LINEA_PRINCIPALE,
  avanzamento,
  fasiCoperte,
  fasePrecedente,
  mappaPercorso,
  prossimaFase,
} from "./avanzamento.ts";
import { JOURNEY_STAGES, type JourneyInput } from "./stages.ts";

const OGGI = "2026-09-10";

function fatti(over: Partial<JourneyInput> = {}): JourneyInput {
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

describe("la mappa copre tutte le fasi", () => {
  it("non perde nessuno stato per strada", () => {
    assert.equal(fasiCoperte(), true);
    assert.equal(
      LINEA_PRINCIPALE.length + FUORI_LINEA.length,
      JOURNEY_STAGES.length,
    );
  });

  it("tiene «inattivo» e «perso» fuori dalla linea: sono uscite, non tappe", () => {
    assert.ok(!LINEA_PRINCIPALE.includes("inactive"));
    assert.ok(!LINEA_PRINCIPALE.includes("lost"));
  });
});

describe("dove si è", () => {
  it("segna fatte quelle prima, corrente quella attuale, future le altre", () => {
    const mappa = mappaPercorso("plan_proposed");
    assert.equal(mappa.find((p) => p.stage === "lead")?.stato, "fatta");
    assert.equal(mappa.find((p) => p.stage === "plan_proposed")?.stato, "corrente");
    assert.equal(mappa.find((p) => p.stage === "retention")?.stato, "futura");
  });

  it("non accende nessun passo quando si è usciti", () => {
    const mappa = mappaPercorso("lost");
    assert.equal(mappa.filter((p) => p.stato === "corrente").length, 0);
    assert.equal(mappa.filter((p) => p.stato === "fatta").length, 0);
  });
});

describe("il passo prima e quello dopo", () => {
  it("trova il successivo sulla linea", () => {
    assert.equal(prossimaFase("lead"), "first_visit_booked");
    assert.equal(prossimaFase("score_done"), "plan_proposed");
  });

  it("non ha successivo in fondo alla linea", () => {
    assert.equal(prossimaFase("retention"), null);
  });

  it("non ha successivo fuori dalla linea", () => {
    assert.equal(prossimaFase("lost"), null);
    assert.equal(prossimaFase("inactive"), null);
  });

  it("non ha precedente all'inizio", () => {
    assert.equal(fasePrecedente("lead"), null);
    assert.equal(fasePrecedente("first_visit_booked"), "lead");
  });
});

describe("cosa manca per avanzare", () => {
  it("da lead chiede la prima visita", () => {
    const a = avanzamento(fatti(), "lead");
    assert.equal(a.prossima, "first_visit_booked");
    assert.equal(a.condizioni[0].fatto, false);
    assert.match(a.condizioni[0].azione ?? "", /prima visita/i);
  });

  it("segna fatta la condizione già soddisfatta", () => {
    const a = avanzamento(fatti({ hasScore: true }), "first_visit_booked");
    assert.equal(a.prossima, "score_done");
    assert.equal(a.condizioni[0].fatto, true);
  });

  it("da score chiede il piano, e ricorda che lo score c'è già", () => {
    const a = avanzamento(fatti({ hasScore: true }), "score_done");
    assert.equal(a.prossima, "plan_proposed");
    assert.equal(a.condizioni.length, 2);
    assert.equal(a.condizioni[0].fatto, true);
    assert.equal(a.condizioni[1].fatto, false);
  });

  it("chi è uscito non avanza: la condizione è un contatto", () => {
    const a = avanzamento(fatti({ leadLost: true }), "lost");
    assert.equal(a.fuoriLinea, true);
    assert.equal(a.prossima, null);
    assert.match(a.condizioni[0].azione ?? "", /Contattare/);
  });

  it("in fondo alla linea non promette un passo che non esiste", () => {
    const a = avanzamento(fatti({ membershipActive: true }), "retention");
    assert.equal(a.prossima, null);
    assert.equal(a.condizioni[0].fatto, true);
  });

  it("il reassessment non è un'azione: scatta da solo", () => {
    const a = avanzamento(fatti({ membershipActive: true }), "program_active");
    assert.equal(a.prossima, "reassessment_due");
    assert.equal(a.condizioni[0].azione, null);
  });
});
