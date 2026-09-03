import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeAll, type CompensationRule, type ServiceEconomics, type Visit } from "./engine.ts";
import { computePayouts, filterMonth } from "./payouts.ts";

const IV: ServiceEconomics = {
  id: "svc-iv",
  slug: "iv-therapy",
  name: "IV Therapy",
  priceCents: 25_000,
  materialCostCents: 2_500,
};

const SERVIZI = new Map([[IV.id, IV]]);
const REGOLA: CompensationRule = {
  id: "r",
  professionalId: null,
  serviceId: null,
  professionalShare: 0.7,
  minMonthlyVisits: 0,
};

const NOMI = new Map([
  ["pro-1", "Dott. Rossi"],
  ["pro-2", "Dott.ssa Bianchi"],
]);

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

describe("report compensi", () => {
  const visite = [
    visita({ appointmentId: "a1", professionalId: "pro-1" }),
    visita({ appointmentId: "a2", professionalId: "pro-1" }),
    visita({ appointmentId: "a3", professionalId: "pro-2" }),
    visita({ appointmentId: "a4", professionalId: "pro-2", occurredAt: "2026-04-02T09:00:00Z" }),
  ];
  const rows = computeAll(visite, SERVIZI, [REGOLA]);

  it("isola il mese richiesto", () => {
    assert.equal(filterMonth(rows, "2026-03").length, 3);
    assert.equal(filterMonth(rows, "2026-04").length, 1);
  });

  it("somma i compensi per professionista", () => {
    const r = computePayouts(rows, "2026-03", NOMI);
    const uno = r.righe.find((x) => x.professionalId === "pro-1")!;
    assert.equal(uno.professionalName, "Dott. Rossi");
    assert.equal(uno.visite.length, 2);
    assert.equal(uno.totali.professionalPayCents, 15_750 * 2);
    assert.equal(uno.totaleDaPagareCents, 15_750 * 2);
  });

  it("ordina dal compenso più alto", () => {
    const r = computePayouts(rows, "2026-03", NOMI);
    assert.equal(r.righe[0].professionalId, "pro-1");
  });

  it("permette di ricostruire il totale dalle righe", () => {
    const r = computePayouts(rows, "2026-03", NOMI);
    const somma = r.righe.reduce((acc, x) => acc + x.totaleDaPagareCents, 0);
    assert.equal(somma, r.totaleDaPagareCents);

    // E ogni riga si ricostruisce dalle sue visite.
    for (const riga of r.righe) {
      const daVisite = riga.visite.reduce((acc, v) => acc + v.professionalPayCents, 0);
      assert.equal(daVisite + riga.rettificheCents, riga.totaleDaPagareCents);
    }
  });

  it("applica le rettifiche con il loro motivo", () => {
    const r = computePayouts(rows, "2026-03", NOMI, [
      { id: "adj-1", professionalId: "pro-1", amountCents: -5_000, reason: "Anticipo di febbraio" },
    ]);
    const uno = r.righe.find((x) => x.professionalId === "pro-1")!;
    assert.equal(uno.rettificheCents, -5_000);
    assert.equal(uno.totaleDaPagareCents, 15_750 * 2 - 5_000);
    assert.equal(uno.rettifiche[0].reason, "Anticipo di febbraio");
  });

  it("include chi ha solo una rettifica e nessuna visita", () => {
    const r = computePayouts(rows, "2026-03", NOMI, [
      { id: "adj-2", professionalId: "pro-9", amountCents: 12_000, reason: "Consulenza esterna" },
    ]);
    const nove = r.righe.find((x) => x.professionalId === "pro-9")!;
    assert.equal(nove.visite.length, 0);
    assert.equal(nove.totaleDaPagareCents, 12_000);
  });

  it("paga la mancata presentazione come una visita, senza materiali", () => {
    const conNoShow = computeAll(
      [visita({ appointmentId: "a5", outcome: "no_show" })],
      SERVIZI,
      [REGOLA],
    );
    const r = computePayouts(conNoShow, "2026-03", NOMI);
    const riga = r.righe[0];
    assert.equal(riga.totali.materialCents, 0);
    assert.equal(riga.totaleDaPagareCents, Math.round(25_000 * 0.7));
  });

  it("tiene fuori dal report le visite senza professionista, ma non dal fatturato", () => {
    const senza = computeAll([visita({ professionalId: null })], SERVIZI, [REGOLA]);
    const r = computePayouts(senza, "2026-03", NOMI);
    assert.equal(r.righe.length, 0);
    assert.equal(r.totaleDaPagareCents, 0);
    assert.equal(r.fatturatoLordoCents, 25_000);
  });

  it("restituisce un report vuoto per un mese senza visite", () => {
    const r = computePayouts(rows, "2026-12", NOMI);
    assert.deepEqual(r.righe, []);
    assert.equal(r.totaleDaPagareCents, 0);
  });
});
