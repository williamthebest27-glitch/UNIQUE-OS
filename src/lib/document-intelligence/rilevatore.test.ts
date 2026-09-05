import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estensioneDi, rileva } from "./rilevatore.ts";
import { zipDiProva } from "./zip-di-prova.ts";

/**
 * Il riconoscimento del formato è il primo controllo di sicurezza del
 * modulo, non una comodità: da qui dipende quale lettore aprirà un file
 * arrivato da fuori. Questi test difendono soprattutto una cosa — che il
 * **contenuto** batta sempre il nome.
 */

function conFirma(byte: number[], quanti = 64): Uint8Array {
  const dati = new Uint8Array(quanti);
  dati.set(byte, 0);
  return dati;
}

describe("riconoscimento dai byte", () => {
  it("un PDF si riconosce da %PDF", () => {
    const esito = rileva(conFirma([0x25, 0x50, 0x44, 0x46, 0x2d]), "referto.pdf", "application/pdf");
    assert.equal(esito.formato, "pdf");
    assert.equal(esito.fonte, "contenuto");
    assert.equal(esito.confidenza, 1);
  });

  it("un PNG si riconosce dalla sua firma di otto byte", () => {
    const esito = rileva(
      conFirma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "foto.png",
      "image/png",
    );
    assert.equal(esito.formato, "png");
  });

  it("un JPEG si riconosce da FF D8 FF", () => {
    const esito = rileva(conFirma([0xff, 0xd8, 0xff, 0xe0]), "foto.jpg", "image/jpeg");
    assert.equal(esito.formato, "jpeg");
  });

  it("RIFF da solo non basta: WebP lo dichiara all'offset 8", () => {
    const webp = conFirma([0x52, 0x49, 0x46, 0x46]);
    // "WEBP" a partire dal byte 8.
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    assert.equal(rileva(webp, "x.webp", "image/webp").formato, "webp");

    // Lo stesso contenitore con "WAVE" è un file audio. Il
    // riconoscimento dal contenuto non lo rivendica: resta l'estensione,
    // con la confidenza bassa che una supposizione merita — e il lettore
    // a valle dichiarerà che non è riuscito ad aprirlo.
    const wave = conFirma([0x52, 0x49, 0x46, 0x46]);
    wave.set([0x57, 0x41, 0x56, 0x45], 8);

    const esito = rileva(wave, "x.webp", "image/webp");
    assert.notEqual(esito.fonte, "contenuto");
    assert.ok(esito.confidenza < 0.6);
  });
});

describe("il contenuto batte il nome", () => {
  it("un PDF rinominato in .jpg resta un PDF", () => {
    const esito = rileva(conFirma([0x25, 0x50, 0x44, 0x46]), "referto.jpg", "image/jpeg");
    assert.equal(esito.formato, "pdf");
    assert.equal(esito.fonte, "contenuto");
  });

  it("un file che non è ciò che dichiara cade sull'estensione, con confidenza bassa", () => {
    // Byte che non corrispondono a nessuna firma nota e non sono testo
    // tabellare: resta l'estensione, e la confidenza lo dice.
    const ignoto = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x00, 0xff, 0x00, 0xfe]);
    const esito = rileva(ignoto, "referto.pdf", "application/pdf");

    assert.equal(esito.formato, "pdf");
    assert.equal(esito.fonte, "estensione");
    assert.ok(esito.confidenza < 0.6, "la confidenza deve dire che è un'ipotesi");
    assert.match(esito.motivo ?? "", /estensione/i);
  });

  it("un formato del tutto sconosciuto non passa, e spiega perché", () => {
    const esito = rileva(new Uint8Array([0x00, 0x01, 0x02, 0xff]), "cosa.xyz", "application/xyz");
    assert.equal(esito.formato, null);
    assert.match(esito.motivo ?? "", /non riconosciuto/i);
  });

  it("un file vuoto è un esito, non un errore", () => {
    const esito = rileva(new Uint8Array(0), "vuoto.pdf", "application/pdf");
    assert.equal(esito.formato, null);
    assert.match(esito.motivo ?? "", /vuoto/i);
  });
});

describe("i due contenitori ambigui", () => {
  it("distingue un .docx da un .xlsx guardando dentro l'archivio", () => {
    const docx = zipDiProva([
      ["[Content_Types].xml", "<Types/>"],
      ["word/document.xml", "<w:document/>"],
    ]);
    assert.equal(rileva(docx, "senza-nome", null).formato, "docx");

    const xlsx = zipDiProva([
      ["[Content_Types].xml", "<Types/>"],
      ["xl/workbook.xml", "<workbook/>"],
    ]);
    assert.equal(rileva(xlsx, "senza-nome", null).formato, "xlsx");
  });

  it("un archivio che non è Office viene rifiutato con un consiglio utile", () => {
    const zip = zipDiProva([["referti/uno.pdf", "finto"]]);
    const esito = rileva(zip, "referti.zip", "application/zip");

    assert.equal(esito.formato, null);
    assert.match(esito.motivo ?? "", /archivio/i);
    assert.match(esito.motivo ?? "", /uno alla volta/i);
  });
});

describe("il CSV, che non ha una firma", () => {
  it("riconosce una tabella dal numero costante di separatori", () => {
    const csv = new TextEncoder().encode(
      "Esame;Risultato;Unità\nGlicemia;102;mg/dL\nHDL;48;mg/dL\n",
    );
    const esito = rileva(csv, "esami.csv", "text/csv");
    assert.equal(esito.formato, "csv");
    assert.equal(esito.fonte, "contenuto");
  });

  it("non scambia una lettera per una tabella", () => {
    const lettera = new TextEncoder().encode(
      "Gentile paziente,\nle inviamo il referto in allegato.\nCordiali saluti\n",
    );
    // Nessun separatore costante: cade sull'estensione, non sul contenuto.
    const esito = rileva(lettera, "lettera.csv", "text/csv");
    assert.equal(esito.fonte, "estensione");
  });

  it("i binari non diventano CSV nemmeno con l'estensione giusta", () => {
    const binario = new Uint8Array(200);
    for (let i = 0; i < binario.length; i += 1) binario[i] = i % 7 === 0 ? 0x00 : 0x41;

    const esito = rileva(binario, "dati.csv", "text/csv");
    assert.notEqual(esito.fonte, "contenuto");
  });
});

describe("estensioni", () => {
  it("legge l'ultima estensione, in minuscolo", () => {
    assert.equal(estensioneDi("Referto.Analisi.PDF"), "pdf");
    assert.equal(estensioneDi("senza-estensione"), null);
    assert.equal(estensioneDi("finisce.con.punto."), null);
  });
});
