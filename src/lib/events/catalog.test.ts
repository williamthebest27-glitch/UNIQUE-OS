import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_CATALOG,
  EVENT_NAMES,
  describeEvent,
  matchesSubscription,
} from "./catalog.ts";

describe("catalogo degli eventi", () => {
  it("nomina ogni evento come fatto già avvenuto, entità.azione", () => {
    for (const name of EVENT_NAMES) {
      assert.match(
        name,
        /^[a-z_]+\.[a-z_]+$/,
        `"${name}" non rispetta la forma entità.azione`,
      );
    }
  });

  it("dà a ogni evento un'etichetta leggibile e una gravità", () => {
    for (const name of EVENT_NAMES) {
      const d = EVENT_CATALOG[name];
      assert.ok(d.label.length > 3, `${name} senza etichetta`);
      assert.ok(["critical", "important", "info"].includes(d.severity));
    }
  });

  it("non lascia scoperto un evento sconosciuto", () => {
    const d = describeEvent("wearable.synced");
    assert.equal(d.entity, "wearable");
    assert.equal(d.severity, "info");
  });

  it("tiene critici i fatti che richiedono un intervento", () => {
    assert.equal(EVENT_CATALOG["payment.failed"].severity, "critical");
    assert.equal(EVENT_CATALOG["brain.action_failed"].severity, "critical");
    assert.equal(EVENT_CATALOG["appointment.completed"].severity, "info");
  });
});

describe("iscrizione agli eventi", () => {
  it("l'asterisco prende tutto", () => {
    assert.equal(matchesSubscription(["*"], "payment.failed"), true);
  });

  it("la famiglia prende i suoi", () => {
    assert.equal(matchesSubscription(["payment.*"], "payment.failed"), true);
    assert.equal(matchesSubscription(["payment.*"], "lead.created"), false);
  });

  it("il nome esatto non prende i vicini", () => {
    assert.equal(matchesSubscription(["payment.failed"], "payment.failed"), true);
    assert.equal(matchesSubscription(["payment.failed"], "payment.succeeded"), false);
  });

  it("un elenco vuoto non prende niente", () => {
    assert.equal(matchesSubscription([], "payment.failed"), false);
  });
});
