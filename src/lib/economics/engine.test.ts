import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  byProfessional,
  byService,
  computeAll,
  computeVisitEconomics,
  membershipMargin,
  resolveRule,
  totals,
  type CompensationRule,
  type ServiceEconomics,
  type Visit,
} from "./engine.ts";

const IV: ServiceEconomics = {
  id: "svc-iv",
  slug: "iv-therapy",
  name: "IV Therapy",
  priceCents: 25_000,
  materialCostCents: 2_500,
};

const NUTRI: ServiceEconomics = {
  id: "svc-nutri",
  slug: "visita-nutrizionale",
  name: "Visita nutrizionale",
  priceCents: 12_000,
  materialCostCents: 0,
};

const SERVIZI = new Map([
  [IV.id, IV],
  [NUTRI.id, NUTRI],
]);

const DEFAULT_RULE: CompensationRule = {
  id: "r-default",
  professionalId: null,
  serviceId: null,
  professionalShare: 0.7,
  minMonthlyVisits: 0,
};

function visita(over: Partial<Visit> = {}): Visit {
  return {
    appointmentId: "a1",
    serviceId: IV.id,
    professionalId: "pro-1",
    patientId: "pat-1",
    occurredAt: "2026-03-10T09:00:00Z",
    outcome: "completed",
    ...over,
  };
}

describe("economia di una visita", () => {
  it("riproduce l’esempio della visione: 250 € · materiali 25 € · 70%", () => {
    const e = computeVisitEconomics(visita(), IV, [DEFAULT_RULE], 1);

    assert.equal(e.grossCents, 25_000);
    assert.equal(e.materialCents, 2_500);
    assert.equal(e.compensableCents, 22_500);
    assert.equal(e.professionalPayCents, 15_750); // 157,50 €
    assert.equal(e.uniqueMarginCents, 6_750); //  67,50 €
  });

  it("non fa sparire centesimi fra compenso e margine", () => {
    const e = computeVisitEconomics(visita(), IV, [DEFAULT_RULE], 1);
    assert.equal(
      e.professionalPayCents + e.uniqueMarginCents + e.materialCents,
      e.grossCents,
    );
  });

  it("non addebita i materiali di una visita non erogata", () => {
    const e = computeVisitEconomics(visita({ outcome: "no_show" }), IV, [DEFAULT_RULE], 1);
    assert.equal(e.materialCents, 0);
    assert.equal(e.compensableCents, 25_000);
    assert.equal(e.professionalPayCents, 17_500);
  });

  it("non paga nulla senza una regola applicabile", () => {
    const e = computeVisitEconomics(visita(), IV, [], 1);
    assert.equal(e.professionalShare, 0);
    assert.equal(e.professionalPayCents, 0);
    assert.equal(e.uniqueMarginCents, 22_500);
  });
});

describe("risoluzione della regola", () => {
  const regole: CompensationRule[] = [
    DEFAULT_RULE,
    { id: "r-pro", professionalId: "pro-1", serviceId: null, professionalShare: 0.75, minMonthlyVisits: 0 },
    { id: "r-svc", professionalId: null, serviceId: IV.id, professionalShare: 0.6, minMonthlyVisits: 0 },
    { id: "r-both", professionalId: "pro-1", serviceId: IV.id, professionalShare: 0.8, minMonthlyVisits: 0 },
    { id: "r-tier", professionalId: "pro-1", serviceId: IV.id, professionalShare: 0.85, minMonthlyVisits: 20 },
  ];

  it("preferisce la regola che nomina professionista e servizio", () => {
    assert.equal(resolveRule(regole, "pro-1", IV.id, 1)?.id, "r-both");
  });

  it("ricade sul professionista quando il servizio non è nominato", () => {
    assert.equal(resolveRule(regole, "pro-1", NUTRI.id, 1)?.id, "r-pro");
  });

  it("ricade sul servizio per un professionista senza accordi", () => {
    assert.equal(resolveRule(regole, "pro-9", IV.id, 1)?.id, "r-svc");
  });

  it("ricade sulla regola generale quando non c’è altro", () => {
    assert.equal(resolveRule(regole, "pro-9", NUTRI.id, 1)?.id, "r-default");
  });

  it("applica lo scaglione solo una volta raggiunto", () => {
    assert.equal(resolveRule(regole, "pro-1", IV.id, 19)?.id, "r-both");
    assert.equal(resolveRule(regole, "pro-1", IV.id, 20)?.id, "r-tier");
    assert.equal(resolveRule(regole, "pro-1", IV.id, 44)?.id, "r-tier");
  });

  it("restituisce null quando nessuna regola si applica", () => {
    assert.equal(resolveRule([], "pro-1", IV.id, 1), null);
  });
});

describe("scaglioni sul mese", () => {
  const regole: CompensationRule[] = [
    DEFAULT_RULE,
    { id: "r-tier", professionalId: "pro-1", serviceId: null, professionalShare: 0.8, minMonthlyVisits: 3 },
  ];

  it("conta le visite per professionista e mese solare", () => {
    const visite: Visit[] = [
      visita({ appointmentId: "a1", occurredAt: "2026-03-01T09:00:00Z" }),
      visita({ appointmentId: "a2", occurredAt: "2026-03-02T09:00:00Z" }),
      visita({ appointmentId: "a3", occurredAt: "2026-03-03T09:00:00Z" }),
      visita({ appointmentId: "a4", occurredAt: "2026-04-01T09:00:00Z" }),
    ];

    const rows = computeAll(visite, SERVIZI, regole);

    assert.equal(rows[0].professionalShare, 0.7);
    assert.equal(rows[1].professionalShare, 0.7);
    // Terza visita di marzo: scatta lo scaglione.
    assert.equal(rows[2].professionalShare, 0.8);
    // Aprile riparte da capo.
    assert.equal(rows[3].professionalShare, 0.7);
  });

  it("conta separatamente due professionisti", () => {
    const visite: Visit[] = [
      visita({ appointmentId: "a1", professionalId: "pro-1" }),
      visita({ appointmentId: "a2", professionalId: "pro-2" }),
      visita({ appointmentId: "a3", professionalId: "pro-1" }),
      visita({ appointmentId: "a4", professionalId: "pro-1" }),
    ];

    const rows = computeAll(visite, SERVIZI, regole);
    const diPro1 = rows.filter((r) => r.professionalId === "pro-1");
    assert.equal(diPro1.length, 3);
    assert.equal(diPro1[2].professionalShare, 0.8);
  });

  it("salta le visite su servizi fuori catalogo invece di inventarne il prezzo", () => {
    const rows = computeAll([visita({ serviceId: "svc-ignoto" })], SERVIZI, regole);
    assert.equal(rows.length, 0);
  });
});

describe("aggregazioni", () => {
  const visite: Visit[] = [
    visita({ appointmentId: "a1", serviceId: IV.id, professionalId: "pro-1" }),
    visita({ appointmentId: "a2", serviceId: NUTRI.id, professionalId: "pro-2" }),
    visita({ appointmentId: "a3", serviceId: NUTRI.id, professionalId: "pro-2" }),
  ];
  const rows = computeAll(visite, SERVIZI, [DEFAULT_RULE]);

  it("somma i totali senza perdere righe", () => {
    const t = totals(rows);
    assert.equal(t.visite, 3);
    assert.equal(t.grossCents, 25_000 + 12_000 + 12_000);
    assert.equal(
      t.professionalPayCents + t.uniqueMarginCents + t.materialCents,
      t.grossCents,
    );
  });

  it("ordina i servizi per fatturato", () => {
    // Una IV Therapy da 250 € vale più di due visite nutrizionali da 120 €.
    const g = byService(rows);
    assert.equal(g[0].label, "IV Therapy");
    assert.equal(g[0].totali.grossCents, 25_000);
    assert.equal(g[1].label, "Visita nutrizionale");
    assert.equal(g[1].totali.grossCents, 24_000);
    assert.equal(g[1].totali.visite, 2);
  });

  it("raggruppa per professionista con i nomi", () => {
    const g = byProfessional(rows, new Map([["pro-1", "Dott. Rossi"], ["pro-2", "Dott.ssa Bianchi"]]));
    assert.equal(g.length, 2);
    assert.ok(g.some((x) => x.label === "Dott. Rossi"));
  });

  it("calcola il margine sul fatturato lordo", () => {
    const t = totals(rows);
    assert.ok(t.marginRatio > 0 && t.marginRatio < 1);
    assert.equal(totals([]).marginRatio, 0);
  });
});

describe("margine della membership", () => {
  it("sottrae compensi e materiali dal prezzo del piano", () => {
    const rows = computeAll(
      [visita({ appointmentId: "a1" }), visita({ appointmentId: "a2" })],
      SERVIZI,
      [DEFAULT_RULE],
    );

    // Due IV Therapy: compenso 15.750 × 2, materiali 2.500 × 2.
    const m = membershipMargin(420_000, rows);
    assert.equal(m.deliveryCostCents, (15_750 + 2_500) * 2);
    assert.equal(m.marginCents, 420_000 - m.deliveryCostCents);
    assert.equal(m.visite, 2);
  });

  it("mostra il margine negativo invece di nasconderlo", () => {
    const molte: Visit[] = Array.from({ length: 30 }, (_, i) =>
      visita({ appointmentId: `a${i}`, occurredAt: `2026-03-${String(i + 1).padStart(2, "0")}T09:00:00Z` }),
    );
    const rows = computeAll(molte, SERVIZI, [DEFAULT_RULE]);
    const m = membershipMargin(420_000, rows);

    assert.ok(m.marginCents < 0);
    assert.ok(m.marginRatio < 0);
  });
});
