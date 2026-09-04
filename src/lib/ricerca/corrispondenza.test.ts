import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LUNGHEZZA_MINIMA,
  migliori,
  normalizza,
  punteggio,
  punteggioSuCampi,
  ricercaUtile,
  termini,
} from "./corrispondenza.ts";

describe("normalizzazione", () => {
  it("toglie gli accenti", () => {
    assert.equal(normalizza("Nicolò Rossi"), "nicolo rossi");
    assert.equal(normalizza("Renée D'Angelò"), "renee d'angelo");
  });

  it("comprime gli spazi e taglia i bordi", () => {
    assert.equal(normalizza("  Mario   Rossi  "), "mario rossi");
  });
});

describe("i termini sono vincoli, tutti", () => {
  it("non trova chi ha solo metà dei termini", () => {
    assert.equal(punteggio("Mario Bianchi", termini("mario rossi")), 0);
  });

  it("ignora l'ordine: in clinica si scrive in entrambi i modi", () => {
    assert.ok(punteggio("Mario Rossi", termini("rossi mario")) > 0);
    assert.ok(punteggio("Mario Rossi", termini("mario rossi")) > 0);
  });

  it("trova un accento scritto senza", () => {
    assert.ok(punteggio("Nicolò Bergamaschi", termini("nicolo")) > 0);
  });
});

describe("l'ordinamento mette l'inizio di parola davanti", () => {
  it("preferisce Rossi ad Ambrosini per «ros»", () => {
    const rossi = punteggio("Rossi", termini("ros"));
    const ambrosini = punteggio("Ambrosini", termini("ros"));
    assert.ok(rossi > ambrosini, `${rossi} deve battere ${ambrosini}`);
  });

  it("preferisce la parola intera al prefisso", () => {
    assert.ok(punteggio("Rossi", termini("rossi")) > punteggio("Rossini", termini("rossi")));
  });

  it("preferisce il testo corto a quello lungo", () => {
    const corto = punteggio("Rossi", termini("rossi"));
    const lungo = punteggio(
      "Referto di laboratorio del paziente Mario Rossi, emesso il 4 settembre",
      termini("rossi"),
    );
    assert.ok(corto > lungo);
  });
});

describe("più campi", () => {
  it("tiene il migliore, non la somma", () => {
    const uno = punteggioSuCampi(["Mario Rossi", null, "UQ-0031"], termini("rossi"));
    const solo = punteggio("Mario Rossi", termini("rossi"));
    assert.equal(uno, solo);
  });

  it("trova dal codice paziente", () => {
    assert.ok(punteggioSuCampi(["Mario Rossi", "UQ-0031"], termini("uq-0031")) > 0);
  });

  it("regge i campi vuoti", () => {
    assert.equal(punteggioSuCampi([null, undefined, ""], termini("rossi")), 0);
  });
});

describe("selezione", () => {
  it("scarta chi non corrisponde e taglia alla lunghezza chiesta", () => {
    const scelti = migliori(
      [
        { voce: "a", punti: 0 },
        { voce: "b", punti: 5 },
        { voce: "c", punti: 9 },
        { voce: "d", punti: 7 },
      ],
      2,
    );
    assert.deepEqual(scelti, ["c", "d"]);
  });

  it("a parità di punteggio conserva l'ordine di partenza", () => {
    const scelti = migliori(
      [
        { voce: "recente", punti: 5 },
        { voce: "vecchio", punti: 5 },
      ],
      2,
    );
    assert.deepEqual(scelti, ["recente", "vecchio"]);
  });
});

describe("quando non vale la pena cercare", () => {
  it("rifiuta una lettera sola", () => {
    assert.equal(ricercaUtile("a"), false);
    assert.equal(LUNGHEZZA_MINIMA, 2);
  });

  it("rifiuta i soli spazi", () => {
    assert.equal(ricercaUtile("   "), false);
  });

  it("accetta due lettere", () => {
    assert.equal(ricercaUtile("ro"), true);
  });
});
