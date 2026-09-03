import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANCELLATION_HOURS,
  CREDIT_ENTRY_LABELS,
  cancellationNotice,
  cancellationOutcome,
  hoursUntil,
  isFreeCancellation,
} from "./rules.ts";

const ORA = new Date("2026-09-10T10:00:00Z");

function fra(ore: number): string {
  return new Date(ORA.getTime() + ore * 3_600_000).toISOString();
}

describe("regole di disdetta", () => {
  it("tiene la soglia a 24 ore", () => {
    // Se questa cambia, va cambiata anche credit_cancellation_hours()
    // nella migrazione: sono due copie della stessa regola.
    assert.equal(CANCELLATION_HOURS, 24);
  });

  it("conta le ore che mancano", () => {
    assert.equal(hoursUntil(fra(48), ORA), 48);
    assert.equal(hoursUntil(fra(-3), ORA), -3);
  });

  it("libera il credito con largo anticipo", () => {
    assert.ok(isFreeCancellation(fra(72), ORA));
    assert.equal(cancellationOutcome(fra(72), ORA), "released");
  });

  it("addebita sotto soglia", () => {
    assert.equal(isFreeCancellation(fra(6), ORA), false);
    assert.equal(cancellationOutcome(fra(6), ORA), "charged");
  });

  it("al confine esatto la disdetta è ancora gratuita", () => {
    // A 24 ore precise il paziente è in tempo. Un minuto dopo, no.
    assert.ok(isFreeCancellation(fra(24), ORA));
    assert.equal(isFreeCancellation(fra(23.99), ORA), false);
  });

  it("tratta un appuntamento già passato come tardivo", () => {
    assert.equal(cancellationOutcome(fra(-1), ORA), "charged");
  });

  it("non minaccia addebiti quando non ci sono crediti in gioco", () => {
    const avviso = cancellationNotice(fra(2), 0, ORA);
    assert.match(avviso, /non comporta addebiti/);
  });

  it("avvisa prima, non dopo", () => {
    assert.match(cancellationNotice(fra(48), 1, ORA), /torna disponibile/);
    assert.match(cancellationNotice(fra(2), 1, ORA), /viene comunque addebitato/);
  });

  it("ha un'etichetta per ogni tipo di movimento", () => {
    const tipi = Object.keys(CREDIT_ENTRY_LABELS);
    assert.equal(tipi.length, 8);
    for (const [tipo, etichetta] of Object.entries(CREDIT_ENTRY_LABELS)) {
      assert.ok(etichetta.length > 0, `manca l'etichetta di ${tipo}`);
    }
  });
});
