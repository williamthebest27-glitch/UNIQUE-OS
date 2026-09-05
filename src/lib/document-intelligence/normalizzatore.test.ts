import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { vocePerCanonical } from "./catalogo.ts";
import {
  canonicalizza,
  convertiValore,
  leggiNumero,
  normalizzaUnita,
  ripulisciEtichetta,
  stessaUnita,
} from "./normalizzatore.ts";

/**
 * La normalizzazione è ciò che rende possibile l'analisi temporale: due
 * referti che scrivono lo stesso esame in due modi devono diventare lo
 * stesso biomarcatore, o la domanda «sta migliorando?» non ha risposta.
 *
 * Il test più importante di questo file è l'ultimo blocco: **il sistema
 * non inventa numeri.**
 */

describe("canonicalizzazione", () => {
  it("i modi in cui si scrive la vitamina D sono lo stesso esame", () => {
    const scritture = [
      "Vit D",
      "Vitamina D",
      "25-OH Vitamina D",
      "25 Hydroxy Vitamin D",
      "VITAMINA D (25-OH)",
      "25-OH-D",
    ];

    for (const scrittura of scritture) {
      const esito = canonicalizza(scrittura);
      assert.ok(esito, `«${scrittura}» non è stato riconosciuto`);
      assert.equal(esito.voce.canonical, "VITAMIN_D_25OH", `sbagliato per «${scrittura}»`);
    }
  });

  it("il pezzo non vince sul tutto: LDL non diventa colesterolo totale", () => {
    assert.equal(canonicalizza("Colesterolo LDL")?.voce.canonical, "LDL_CHOLESTEROL");
    assert.equal(canonicalizza("Colesterolo HDL")?.voce.canonical, "HDL_CHOLESTEROL");
    assert.equal(canonicalizza("Colesterolo totale")?.voce.canonical, "CHOLESTEROL_TOTAL");
    assert.equal(canonicalizza("Colesterolo non-HDL")?.voce.canonical, "NON_HDL_CHOLESTEROL");
  });

  it("un sinonimo dentro un'altra parola non conta", () => {
    // "hb" è emoglobina, ma "HBsAg" è l'antigene dell'epatite B: senza
    // il confine di parola, un esame virologico finirebbe in cartella
    // come un emocromo.
    assert.equal(canonicalizza("HBsAg"), null);
    assert.equal(canonicalizza("Hb")?.voce.canonical, "HEMOGLOBIN");
  });

  it("un'etichetta uguale al sinonimo vale più di una che lo contiene", () => {
    const esatto = canonicalizza("Ferritina");
    const dentro = canonicalizza("Ferritina sierica dosaggio immunometrico");

    assert.equal(esatto?.voce.canonical, "FERRITIN");
    assert.equal(dentro?.voce.canonical, "FERRITIN");
    assert.ok(
      (esatto?.fiducia ?? 0) > (dentro?.fiducia ?? 0),
      "la corrispondenza esatta deve avere più fiducia",
    );
  });

  it("ciò che non è nel catalogo resta fuori invece di essere forzato", () => {
    assert.equal(canonicalizza("Anticorpi anti-Toxoplasma IgG"), null);
    assert.equal(canonicalizza("xy"), null);
  });
});

describe("ripulire l'etichetta", () => {
  it("toglie il metodo fra parentesi, i marcatori e la numerazione", () => {
    assert.equal(ripulisciEtichetta("3. Colesterolo LDL (Friedewald) *"), "Colesterolo LDL");
    assert.equal(ripulisciEtichetta("  Glicemia:  "), "Glicemia");
  });
});

describe("unità di misura", () => {
  it("riduce le scritture diverse a una forma sola", () => {
    assert.equal(normalizzaUnita("mg/dl"), "mg/dL");
    assert.equal(normalizzaUnita("MG/DL"), "mg/dL");
    assert.equal(normalizzaUnita("umol/l"), "µmol/L");
    assert.equal(normalizzaUnita("10^3/uL"), "10³/µL");
  });

  it("riconosce le stesse unità scritte in modi diversi", () => {
    assert.ok(stessaUnita("mg/dL", "mg/dl"));
    assert.ok(stessaUnita("µU/mL", "uU/mL"));
    assert.ok(!stessaUnita("mg/dL", "mmol/L"));
  });

  it("un'unità sconosciuta torna com'è invece di sparire", () => {
    assert.equal(normalizzaUnita("gnorf/qqq"), "gnorf/qqq");
    assert.equal(normalizzaUnita(null), null);
    assert.equal(normalizzaUnita("   "), null);
  });
});

describe("conversioni, ma solo quelle sicure", () => {
  const glucosio = vocePerCanonical("GLUCOSE_FASTING")!;
  const ldl = vocePerCanonical("LDL_CHOLESTEROL")!;
  const glicata = vocePerCanonical("HBA1C")!;

  it("mmol/L di glucosio diventano mg/dL, e resta traccia dell'originale", () => {
    const esito = convertiValore(glucosio, 5.5, "mmol/L");

    assert.equal(esito.unita, "mg/dL");
    assert.ok(Math.abs(esito.valore - 99.1) < 0.2, `atteso ~99.1, ottenuto ${esito.valore}`);
    assert.deepEqual(esito.conversione, { da: "mmol/L", valoreOriginale: 5.5 });
  });

  it("l'unità già giusta non si tocca", () => {
    const esito = convertiValore(ldl, 145, "mg/dL");
    assert.equal(esito.valore, 145);
    assert.ok(esito.conversione === undefined);
    assert.ok(esito.fiducia > 0.9);
  });

  it("l'emoglobina glicata ha un'intercetta, e non è una proporzione", () => {
    // 53 mmol/mol corrisponde a circa 7,0%: con una conversione
    // moltiplicativa pura si otterrebbe 4,85, cioè un paziente sano al
    // posto di uno diabetico.
    const esito = convertiValore(glicata, 53, "mmol/mol");
    assert.ok(Math.abs(esito.valore - 7.0) < 0.1, `atteso ~7.0, ottenuto ${esito.valore}`);
  });

  it("un'unità che non c'entra non si converte, e la fiducia crolla", () => {
    const esito = convertiValore(ldl, 145, "mm/h");

    assert.equal(esito.valore, 145, "il numero non va toccato");
    assert.equal(esito.unita, "mm/h", "e nemmeno l'unità");
    assert.ok(esito.fiducia < 0.5, "ma la fiducia deve dire che qualcosa non torna");
    assert.match(esito.nota ?? "", /inattesa/i);
  });

  it("senza unità il valore passa, con la fiducia più bassa", () => {
    const esito = convertiValore(glucosio, 92, null);
    assert.equal(esito.valore, 92);
    assert.ok(esito.fiducia < 0.8);
    assert.match(esito.nota ?? "", /nessuna unità/i);
  });
});

describe("il sistema non inventa numeri", () => {
  it("un carattere che l'OCR non ha letto non diventa una cifra", () => {
    // Il caso della visione: «Glucosio 1?5 mg/dL» non deve diventare
    // né 105 né 125.
    const esito = leggiNumero("1?5", 0.8);

    assert.equal(esito.valore, null);
    assert.ok(esito.fiducia < 0.5);
    assert.match(esito.motivo ?? "", /non ha letto/i);
  });

  it("i riquadri che i motori ottici mettono al posto di un carattere valgono lo stesso", () => {
    for (const grezzo of ["1■5", "9□", "4�2"]) {
      assert.equal(leggiNumero(grezzo).valore, null, `«${grezzo}» non doveva diventare un numero`);
    }
  });

  it("una riga letta male abbassa anche i numeri che sembrano nitidi", () => {
    const nitida = leggiNumero("102", 1);
    const storta = leggiNumero("102", 0.55);

    assert.equal(nitida.valore, 102);
    assert.equal(storta.valore, 102);
    assert.ok(storta.fiducia < nitida.fiducia);
    assert.ok(storta.fiducia <= 0.6);
  });

  it("i valori sotto soglia conservano il numero e dichiarano di essere un estremo", () => {
    const esito = leggiNumero("<5");

    assert.equal(esito.valore, 5);
    assert.equal(esito.soglia, "<");
    assert.match(esito.motivo ?? "", /estremo/i);
  });

  it("i numeri all'italiana si leggono all'italiana", () => {
    assert.equal(leggiNumero("5,4").valore, 5.4);
    assert.equal(leggiNumero("250.000").valore, 250000);
  });

  it("ciò che non è un numero non diventa zero", () => {
    assert.equal(leggiNumero("negativo").valore, null);
    assert.equal(leggiNumero("").valore, null);
    assert.equal(leggiNumero("assente").valore, null);
  });
});
