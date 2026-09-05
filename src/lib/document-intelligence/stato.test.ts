import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { vocePerCanonical } from "./catalogo.ts";
import { calcolaStato, descriviStato, scegliIntervallo, statoRichiedeRevisione } from "./stato.ts";

/**
 * Lo stato è il passaggio da fatto a interpretazione, ed è il punto in
 * cui un errore diventa clinicamente rilevante: dire «nella norma» a un
 * valore che il laboratorio segnalava è peggio che non dire niente.
 *
 * La regola che questi test difendono più di ogni altra: **l'intervallo
 * del documento vince sempre su quello del catalogo.**
 */

const ldl = vocePerCanonical("LDL_CHOLESTEROL")!;
const vitaminaD = vocePerCanonical("VITAMIN_D_25OH")!;
const potassio = vocePerCanonical("POTASSIUM")!;
const ferritina = vocePerCanonical("FERRITIN")!;
const fsh = vocePerCanonical("FSH")!;

describe("da dove viene il metro", () => {
  it("l'intervallo stampato sul referto ha la precedenza", () => {
    const intervallo = scegliIntervallo(ldl, { min: 0, max: 100, testo: "0 - 100" });

    assert.equal(intervallo.fonte, "documento");
    assert.equal(intervallo.max, 100);
    assert.equal(intervallo.testo, "0 - 100");
  });

  it("senza intervallo sul documento si usa quello del catalogo", () => {
    const intervallo = scegliIntervallo(ldl, null);

    assert.equal(intervallo.fonte, "catalogo");
    assert.equal(intervallo.max, 116);
  });

  it("il riferimento per sesso si applica solo quando il sesso è noto", () => {
    const uomo = scegliIntervallo(ferritina, null, { sesso: "M" });
    const donna = scegliIntervallo(ferritina, null, { sesso: "F" });
    const ignoto = scegliIntervallo(ferritina, null, {});

    assert.equal(uomo.min, 30);
    assert.equal(donna.min, 15);
    // Un riferimento che dipende dal sesso, su un paziente di cui non lo
    // si conosce, sarebbe sbagliato metà delle volte — e non si saprebbe
    // quale metà.
    assert.equal(ignoto.fonte, "assente");
  });

  it("un esame senza riferimento resta senza riferimento", () => {
    const intervallo = scegliIntervallo(fsh, null, { sesso: "F" });
    assert.equal(intervallo.fonte, "assente");
  });
});

describe("lo stato di un valore", () => {
  it("un LDL di 145 con il riferimento del laboratorio a 100 è alto", () => {
    const intervallo = scegliIntervallo(ldl, { min: 0, max: 100 });
    assert.equal(calcolaStato(145, intervallo, ldl), "HIGH");
  });

  it("lo stesso numero cambia stato se cambia il metro", () => {
    // Un laboratorio con il riferimento a 160 non lo segnalerebbe: dire
    // che è alto contraddirebbe il foglio che il paziente ha in mano.
    const largo = scegliIntervallo(ldl, { min: 0, max: 160 });
    assert.notEqual(calcolaStato(145, largo, ldl), "HIGH");
  });

  it("la soglia critica vale anche dentro un intervallo largo", () => {
    // Un potassio a 6,3 è un'emergenza qualunque cosa dica il foglio.
    const largo = scegliIntervallo(potassio, { min: 3, max: 7 });
    assert.equal(calcolaStato(6.3, largo, potassio), "CRITICAL");
  });

  it("dentro l'intervallo ma a ridosso di un estremo è «al limite»", () => {
    const intervallo = scegliIntervallo(vitaminaD, null); // 30–100
    assert.equal(calcolaStato(32, intervallo, vitaminaD), "BORDERLINE");
  });

  it("la fascia ottimale è più stretta della norma, e si distingue", () => {
    const intervallo = scegliIntervallo(vitaminaD, null);
    assert.equal(calcolaStato(55, intervallo, vitaminaD), "OPTIMAL");
    // 95 è nell'intervallo ma fuori dall'ottimale — e vicino al massimo.
    assert.equal(calcolaStato(85, intervallo, vitaminaD), "NORMAL");
  });

  it("senza intervallo non si giudica, e non è un ripiego", () => {
    const nessuno = scegliIntervallo(fsh, null);
    assert.equal(calcolaStato(7.2, nessuno, fsh), "UNKNOWN");
  });

  it("un valore assente non produce uno stato", () => {
    const intervallo = scegliIntervallo(ldl, null);
    assert.equal(calcolaStato(null, intervallo, ldl), "UNKNOWN");
  });
});

describe("cosa manda in revisione", () => {
  it("fuori dall'intervallo sì, al limite no", () => {
    assert.ok(statoRichiedeRevisione("CRITICAL"));
    assert.ok(statoRichiedeRevisione("HIGH"));
    assert.ok(statoRichiedeRevisione("LOW"));

    // Mandare in coda ogni valore vicino a un estremo la riempirebbe
    // fino a renderla inutile.
    assert.ok(!statoRichiedeRevisione("BORDERLINE"));
    assert.ok(!statoRichiedeRevisione("NORMAL"));
    assert.ok(!statoRichiedeRevisione("OPTIMAL"));
  });
});

describe("come si racconta uno stato", () => {
  it("nomina sempre la fonte dell'intervallo", () => {
    const dalDocumento = descriviStato(
      "HIGH",
      { min: 0, max: 100, fonte: "documento" },
      "mg/dL",
    );
    assert.match(dalDocumento, /laboratorio/i);

    const dalCatalogo = descriviStato("HIGH", { min: 0, max: 116, fonte: "catalogo" }, "mg/dL");
    assert.match(dalCatalogo, /Unique/);
  });

  it("senza intervallo dice che il valore è registrato, non giudicato", () => {
    const testo = descriviStato("UNKNOWN", { min: null, max: null, fonte: "assente" }, null);
    assert.match(testo, /non giudicato/i);
  });
});
