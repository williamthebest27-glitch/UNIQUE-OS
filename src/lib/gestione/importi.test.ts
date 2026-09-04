import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { centesimiDa, euroDaCentesimi } from "./importi.ts";

describe("gli importi scritti al banco", () => {
  it("legge le forme italiane", () => {
    assert.equal(centesimiDa("149"), 14900);
    assert.equal(centesimiDa("149,50"), 14950);
    assert.equal(centesimiDa("149,5"), 14950);
    assert.equal(centesimiDa("1.200"), 120000);
    assert.equal(centesimiDa("1.200,00"), 120000);
    assert.equal(centesimiDa("€ 149"), 14900);
    assert.equal(centesimiDa(" 12.500,75 "), 1250075);
  });

  it("tollera il punto decimale di chi ha la tastiera inglese", () => {
    assert.equal(centesimiDa("149.5"), 14950);
    assert.equal(centesimiDa("149.50"), 14950);
  });

  it("rifiuta quello che non è un importo", () => {
    assert.equal(centesimiDa(""), null);
    assert.equal(centesimiDa("abc"), null);
    assert.equal(centesimiDa("149,505"), null);
    assert.equal(centesimiDa("12,3,4"), null);
  });

  it("torna indietro per precompilare", () => {
    assert.equal(euroDaCentesimi(14900), "149,00");
    assert.equal(euroDaCentesimi(14950), "149,50");
    assert.equal(euroDaCentesimi(5), "0,05");
    assert.equal(euroDaCentesimi(-1200), "-12,00");
  });
});
