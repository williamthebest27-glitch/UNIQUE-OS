import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backoffMinuti, firmaPayload, verificaFirma } from "./firma.ts";

const SEGRETO = "un-segreto-qualunque";
const CORPO = JSON.stringify({ event: "payment.failed", amount_cents: 14900 });
const ADESSO = Date.UTC(2026, 8, 4, 10, 0, 0);
const T = String(Math.floor(ADESSO / 1000));

describe("firma dei webhook", () => {
  it("riconosce una firma che ha prodotto lei", () => {
    const header = firmaPayload(SEGRETO, T, CORPO);
    assert.equal(verificaFirma(SEGRETO, header, CORPO, 300, ADESSO), true);
  });

  it("rifiuta un corpo modificato dopo la firma", () => {
    const header = firmaPayload(SEGRETO, T, CORPO);
    const manomesso = CORPO.replace("14900", "1");
    assert.equal(verificaFirma(SEGRETO, header, manomesso, 300, ADESSO), false);
  });

  it("rifiuta la firma di un altro segreto", () => {
    const header = firmaPayload("un-altro-segreto", T, CORPO);
    assert.equal(verificaFirma(SEGRETO, header, CORPO, 300, ADESSO), false);
  });

  it("rifiuta una richiesta vecchia, anche se firmata bene", () => {
    const header = firmaPayload(SEGRETO, T, CORPO);
    const unOraDopo = ADESSO + 3_600_000;
    assert.equal(verificaFirma(SEGRETO, header, CORPO, 300, unOraDopo), false);
  });

  it("rifiuta un'intestazione senza le parti che servono", () => {
    assert.equal(verificaFirma(SEGRETO, "v1=abc", CORPO, 300, ADESSO), false);
    assert.equal(verificaFirma(SEGRETO, "", CORPO, 300, ADESSO), false);
  });
});

describe("ritmo dei nuovi tentativi", () => {
  it("raddoppia a ogni tentativo", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map(backoffMinuti),
      [1, 2, 4, 8, 16, 32],
    );
  });

  it("non supera la mezz'ora, per non perdere del tutto un endpoint tornato su", () => {
    assert.equal(backoffMinuti(12), 32);
  });
});
