import { test } from "node:test";
import assert from "node:assert/strict";
import { MORPH_DURATION_MS, MORPH_HOLD_MS, easeOutExpo, morphProgress } from "./morph.ts";

test("durante l'attesa iniziale la figura è ancora com'era", () => {
  assert.equal(morphProgress(1000, 1000), 0);
  assert.equal(morphProgress(1000, 1000 + MORPH_HOLD_MS - 1), 0);
});

test("finita la durata la figura è com'è, e resta così", () => {
  const fine = 1000 + MORPH_HOLD_MS + MORPH_DURATION_MS;
  assert.equal(morphProgress(1000, fine), 1);
  assert.equal(morphProgress(1000, fine + 60_000), 1);
});

test("cresce senza mai tornare indietro, e arriva piano", () => {
  let precedente = 0;
  for (let ms = 0; ms <= MORPH_HOLD_MS + MORPH_DURATION_MS; ms += 50) {
    const k = morphProgress(0, ms);
    assert.ok(k >= precedente, `regressione a ${ms}ms: ${k} < ${precedente}`);
    precedente = k;
  }
  // A metà durata è già oltre il 95%: il grosso del cambiamento è subito,
  // l'ultimo tratto si assesta.
  assert.ok(morphProgress(0, MORPH_HOLD_MS + MORPH_DURATION_MS / 2) > 0.95);
});

test("un orologio che va indietro non rompe nulla", () => {
  assert.equal(morphProgress(5000, 4000), 0);
});

test("easeOutExpo: parte da 0, arriva a 1, mai oltre", () => {
  assert.equal(easeOutExpo(0), 0);
  assert.equal(easeOutExpo(1), 1);
  assert.equal(easeOutExpo(2), 1);
  const meta = easeOutExpo(0.5);
  assert.ok(meta > 0.9 && meta < 1);
});
