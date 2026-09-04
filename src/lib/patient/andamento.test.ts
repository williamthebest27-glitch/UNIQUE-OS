import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finestraDa, geometria, inFinestra, variazione, type PuntoSerie } from "./andamento.ts";

const PUNTI: PuntoSerie[] = [
  { data: "2025-09-01", valore: 70 },
  { data: "2026-03-01", valore: 74 },
  { data: "2026-07-01", valore: 76 },
  { data: "2026-08-15", valore: 78 },
  { data: "2026-09-05", valore: 79 },
];

const OGGI = "2026-09-10";

describe("le finestre temporali", () => {
  it("trenta giorni indietro dall'oggi passato, non dall'oggi vero", () => {
    // Il 10 settembre meno trenta giorni è l'11 agosto: restano le due
    // rilevazioni successive. L'«oggi» arriva da fuori proprio perché il
    // test non deve dipendere dal giorno in cui gira.
    assert.deepEqual(inFinestra(PUNTI, "30g", OGGI), [
      { data: "2026-08-15", valore: 78 },
      { data: "2026-09-05", valore: 79 },
    ]);
  });

  it("novanta giorni ne prendono una in più", () => {
    assert.equal(inFinestra(PUNTI, "90g", OGGI).length, 3);
  });

  it("«sempre» tiene tutto", () => {
    assert.equal(inFinestra(PUNTI, "tutto", OGGI).length, 5);
  });

  it("i punti escono in ordine cronologico anche se entrano sparsi", () => {
    const sparsi = [PUNTI[3], PUNTI[0], PUNTI[4], PUNTI[1], PUNTI[2]];
    assert.deepEqual(
      inFinestra(sparsi, "tutto", OGGI).map((p) => p.data),
      ["2025-09-01", "2026-03-01", "2026-07-01", "2026-08-15", "2026-09-05"],
    );
  });

  it("una finestra sconosciuta ripiega su novanta giorni invece di rompersi", () => {
    assert.equal(finestraDa("qualsiasi").giorni, 90);
  });
});

describe("la variazione", () => {
  it("dal primo all'ultimo, con la percentuale", () => {
    const v = variazione(PUNTI, true);
    assert.equal(v?.primo, 70);
    assert.equal(v?.ultimo, 79);
    assert.equal(v?.delta, 9);
    assert.ok(Math.abs((v?.deltaPct ?? 0) - 12.857) < 0.01);
    assert.equal(v?.miglioramento, true);
  });

  it("dove è meglio scendere, scendere è un miglioramento", () => {
    const peso = [
      { data: "2026-01-01", valore: 88 },
      { data: "2026-06-01", valore: 82 },
    ];
    assert.equal(variazione(peso, false)?.miglioramento, true);
    assert.equal(variazione(peso, true)?.miglioramento, false);
  });

  it("un punto solo non è una variazione", () => {
    assert.equal(variazione([PUNTI[0]], true), null);
    assert.equal(variazione([], true), null);
  });

  it("fermo non è né meglio né peggio", () => {
    const fermo = [
      { data: "2026-01-01", valore: 70 },
      { data: "2026-06-01", valore: 70 },
    ];
    assert.equal(variazione(fermo, true)?.miglioramento, null);
  });

  it("partendo da zero la percentuale non esiste, e non si inventa", () => {
    const daZero = [
      { data: "2026-01-01", valore: 0 },
      { data: "2026-06-01", valore: 5 },
    ];
    assert.equal(variazione(daZero, true)?.deltaPct, null);
  });
});

describe("la geometria del grafico", () => {
  it("il primo punto sta a sinistra, l'ultimo a destra", () => {
    const g = geometria(PUNTI, 300, 100);
    assert.ok(g);
    assert.equal(g!.punti[0].x, 0);
    assert.equal(g!.punti[g!.punti.length - 1].x, 300);
  });

  it("il valore più alto sta più in alto del più basso", () => {
    const g = geometria(PUNTI, 300, 100)!;
    assert.ok(g.punti[g.punti.length - 1].y < g.punti[0].y);
  });

  it("la scala segue i dati, non parte da zero", () => {
    // Con valori fra 70 e 79 la scala non deve scendere vicino allo zero,
    // altrimenti nove punti di percorso diventano una linea piatta.
    const g = geometria(PUNTI, 300, 100)!;
    assert.ok(g.min > 60, `min inatteso: ${g.min}`);
    assert.ok(g.max < 90, `max inatteso: ${g.max}`);
  });

  it("valori tutti uguali non fanno dividere per zero", () => {
    const piatto = [
      { data: "2026-01-01", valore: 42 },
      { data: "2026-02-01", valore: 42 },
    ];
    const g = geometria(piatto, 300, 100)!;
    assert.ok(Number.isFinite(g.punti[0].y));
    assert.ok(Number.isFinite(g.punti[1].y));
    assert.ok(g.min < 42 && g.max > 42);
  });

  it("un punto solo si mette al centro", () => {
    const g = geometria([PUNTI[0]], 300, 100)!;
    assert.equal(g.punti[0].x, 150);
  });

  it("senza punti non c'è geometria", () => {
    assert.equal(geometria([], 300, 100), null);
  });

  it("l'area chiude il tracciato in basso, per il riempimento", () => {
    const g = geometria(PUNTI, 300, 100)!;
    assert.ok(g.area.startsWith(g.linea));
    assert.match(g.area, /Z$/);
  });
});
