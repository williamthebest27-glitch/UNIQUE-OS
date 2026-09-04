import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generaSlot, giorniFra, romaComeIso, type Turno } from "./disponibilita.ts";

/** Martedì e giovedì mattina, sempre validi. */
const TURNI: Turno[] = [
  { weekday: 2, startsAt: "09:00", endsAt: "12:00", validFrom: "2026-01-01", validTo: null },
  { weekday: 4, startsAt: "14:00", endsAt: "16:00", validFrom: "2026-01-01", validTo: null },
];

const PRIMA = "2026-01-01T00:00:00.000Z";

describe("il fuso di Roma", () => {
  it("d'inverno Roma è un'ora avanti su UTC", () => {
    // Le 9 di Roma a gennaio sono le 8 UTC.
    assert.equal(romaComeIso("2026-01-13", "09:00"), "2026-01-13T08:00:00.000Z");
  });

  it("d'estate è due ore avanti: l'ora legale non si può ignorare", () => {
    // Le 9 di Roma a luglio sono le 7 UTC.
    assert.equal(romaComeIso("2026-07-14", "09:00"), "2026-07-14T07:00:00.000Z");
  });

  it("i giorni fra due date sono inclusivi", () => {
    assert.deepEqual(giorniFra("2026-09-01", "2026-09-03"), [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });
});

describe("generare le disponibilità", () => {
  it("affetta il turno secondo la durata del servizio", () => {
    // 13 gennaio 2026 è un martedì: 9-12 a fette di 60 minuti = tre slot.
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [],
      adesso: PRIMA,
    });
    assert.equal(slot.length, 3);
    assert.equal(slot[0].startsAt, "2026-01-13T08:00:00.000Z");
    assert.equal(slot[2].endsAt, "2026-01-13T11:00:00.000Z");
  });

  it("una fetta che non ci sta per intero non si genera", () => {
    // 9-12 a fette di 50 minuti: tre fette (150 min) stanno, la quarta no.
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 50,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [],
      adesso: PRIMA,
    });
    assert.equal(slot.length, 3);
  });

  it("rispetta i giorni della settimana", () => {
    // Dal lunedì 12 alla domenica 18: un martedì (3 slot) e un giovedì (2).
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-12",
      a: "2026-01-18",
      esistenti: [],
      adesso: PRIMA,
    });
    assert.equal(slot.length, 5);
  });

  it("rispetta la validità del turno", () => {
    const scaduto: Turno[] = [
      { weekday: 2, startsAt: "09:00", endsAt: "12:00", validFrom: "2026-01-01", validTo: "2026-01-10" },
    ];
    const slot = generaSlot({
      turni: scaduto,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [],
      adesso: PRIMA,
    });
    assert.equal(slot.length, 0);
  });

  it("salta le fette già occupate: rieseguire è sicuro", () => {
    const prima = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [],
      adesso: PRIMA,
    });
    const seconda = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: prima,
      adesso: PRIMA,
    });
    assert.equal(seconda.length, 0);
  });

  it("un appuntamento a cavallo blocca le fette che tocca", () => {
    // Una visita dalle 9:30 alle 10:30 tocca sia la fetta 9-10 sia la 10-11.
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [{ startsAt: "2026-01-13T08:30:00.000Z", endsAt: "2026-01-13T09:30:00.000Z" }],
      adesso: PRIMA,
    });
    assert.equal(slot.length, 1);
    assert.equal(slot[0].startsAt, "2026-01-13T10:00:00.000Z");
  });

  it("non genera nel passato", () => {
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-01-13",
      a: "2026-01-13",
      esistenti: [],
      // Sono le 9:30 di Roma: la fetta delle 9 è già cominciata.
      adesso: "2026-01-13T08:30:00.000Z",
    });
    assert.equal(slot.length, 2);
  });

  it("d'estate gli slot cadono all'ora giusta di Roma", () => {
    // 14 luglio 2026 è un martedì.
    const slot = generaSlot({
      turni: TURNI,
      durataMinuti: 60,
      da: "2026-07-14",
      a: "2026-07-14",
      esistenti: [],
      adesso: PRIMA,
    });
    assert.equal(slot[0].startsAt, "2026-07-14T07:00:00.000Z");
  });

  it("una durata assurda non produce niente", () => {
    assert.deepEqual(
      generaSlot({ turni: TURNI, durataMinuti: 0, da: "2026-01-13", a: "2026-01-13", esistenti: [], adesso: PRIMA }),
      [],
    );
  });
});
