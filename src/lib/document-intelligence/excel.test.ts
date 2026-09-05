import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leggiCsv, leggiXlsx } from "./excel.ts";
import { leggiDocx } from "./word.ts";
import { zipDiProva } from "./zip-di-prova.ts";

/**
 * I lettori dei formati Office.
 *
 * Gli archivi di prova si costruiscono qui invece di tenere `.xlsx` e
 * `.docx` binari nel repository: un file committato nessuno lo rilegge
 * più, e quando un giorno un test fallisce non si sa se sia colpa del
 * lettore o del file. Così invece si vede esattamente cosa il lettore
 * aveva davanti.
 */

/* ── CSV ──────────────────────────────────────────────────────────── */

function testo(sorgente: string): Uint8Array {
  return new TextEncoder().encode(sorgente);
}

describe("CSV", () => {
  it("riconosce il punto e virgola, che è quello che usa Excel in Italia", () => {
    const esito = leggiCsv(
      testo("Esame;Risultato;Unità;Riferimento\nGlicemia;102;mg/dL;70 - 100\nHDL;48;mg/dL;> 40\n"),
    );

    assert.ok(esito.leggibile);
    assert.equal(esito.metadati.separatore, ";");
    assert.equal(esito.tabelle.length, 1);
    assert.deepEqual(esito.tabelle[0].intestazioni, ["Esame", "Risultato", "Unità", "Riferimento"]);
    assert.equal(esito.tabelle[0].righe.length, 2);
  });

  it("le virgolette proteggono il separatore", () => {
    const esito = leggiCsv(testo('a;b\n"uno; due";tre\n"quattro";cinque\n'));
    assert.equal(esito.tabelle[0].righe[0][0].testo, "uno; due");
  });

  it("due virgolette dentro un campo protetto sono una virgoletta", () => {
    const esito = leggiCsv(testo('a;b\n"dice ""ciao""";x\n"y";z\n'));
    assert.equal(esito.tabelle[0].righe[0][0].testo, 'dice "ciao"');
  });

  it("il BOM che Excel antepone non finisce nell'intestazione", () => {
    const conBom = testo("﻿Esame;Valore\nGlicemia;102\nHDL;48\n");
    const esito = leggiCsv(conBom);
    assert.equal(esito.tabelle[0].intestazioni[0], "Esame");
  });

  it("un file vuoto è un esito, non un errore", () => {
    const esito = leggiCsv(testo("   \n"));
    assert.equal(esito.leggibile, false);
    assert.ok(esito.motivo);
  });
});

/* ── XLSX ─────────────────────────────────────────────────────────── */

/**
 * Una cartella Excel minima ma valida.
 *
 * Tre cose che rendono un `.xlsx` diverso da quello che sembra, e che
 * questo file di prova riproduce apposta: il testo sta in una tabella
 * condivisa e la cella contiene un indice; le date sono numeri seriali
 * riconoscibili solo dallo stile applicato; una formula porta con sé il
 * proprio ultimo risultato.
 */
function xlsxDiProva(): Uint8Array {
  const stringheCondivise = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="7" uniqueCount="7">
  <si><t>Esame</t></si>
  <si><t>Risultato</t></si>
  <si><t>Unità</t></si>
  <si><t>Glicemia</t></si>
  <si><t>mg/dL</t></si>
  <si><t>Colesterolo LDL</t></si>
  <si><t>Data prelievo</t></si>
</sst>`;

  // Lo stile 1 punta al formato numerico 14, che è una data breve.
  const stili = `<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cellXfs count="2">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
  </cellXfs>
</styleSheet>`;

  const foglio = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>3</v></c>
      <c r="B2"><v>102</v></c>
      <c r="C2" t="s"><v>4</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>5</v></c>
      <c r="B3"><f>SUM(B2)+43</f><v>145</v></c>
      <c r="C3" t="s"><v>4</v></c>
    </row>
    <row r="4">
      <c r="A4" t="s"><v>6</v></c>
      <c r="B4" s="1"><v>46094</v></c>
    </row>
  </sheetData>
</worksheet>`;

  const workbook = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Referto" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relazioni = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  return zipDiProva([
    ["[Content_Types].xml", "<Types/>"],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", relazioni],
    ["xl/sharedStrings.xml", stringheCondivise],
    ["xl/styles.xml", stili],
    ["xl/worksheets/sheet1.xml", foglio],
  ]);
}

describe("XLSX", () => {
  const esito = leggiXlsx(xlsxDiProva());

  it("apre l'archivio e trova il foglio dichiarato dalle relazioni", () => {
    assert.ok(esito.leggibile, esito.motivo ?? "non leggibile");
    assert.equal(esito.tabelle.length, 1);
    assert.equal(esito.tabelle[0].nome, "Referto");
  });

  it("risolve le stringhe condivise: la cella contiene un indice, non il testo", () => {
    assert.deepEqual(esito.tabelle[0].intestazioni, ["Esame", "Risultato", "Unità"]);
    assert.equal(esito.tabelle[0].righe[0][0].testo, "Glicemia");
  });

  it("legge il risultato di una formula, non la formula", () => {
    const riga = esito.tabelle[0].righe.find((r) => r[0].testo === "Colesterolo LDL");
    assert.ok(riga, "la riga dell'LDL non è stata trovata");
    assert.equal(riga[1].numero, 145);
  });

  it("conta le formule, perché sapere che un numero è calcolato conta", () => {
    assert.equal(esito.metadati.formule, "1");
  });

  it("una data è un numero, e senza lo stile diventerebbe un valore di laboratorio", () => {
    // Il seriale 46094 con il formato 14 è il 13 marzo 2026. L'ancora
    // che permette di verificarlo a mente: il seriale 45292 è il 1°
    // gennaio 2024, e 46094 cade 802 giorni dopo.
    //
    // Letto come numero sarebbe una glicemia da ricovero immediato: è
    // esattamente l'errore che il riconoscimento dei formati data evita.
    assert.match(esito.testo, /2026-03-13/);
  });

  it("il testo esce riga per riga, con le colonne separate", () => {
    assert.match(esito.testo, /Glicemia {2}102 {2}mg\/dL/);
  });

  it("un archivio che non è una cartella Excel non solleva", () => {
    const rotto = leggiXlsx(zipDiProva([["a.txt", "niente"]]));
    assert.equal(rotto.leggibile, false);
    assert.ok(rotto.motivo);
  });
});

/* ── DOCX ─────────────────────────────────────────────────────────── */

function docxDiProva(): Uint8Array {
  const documento = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Referto specialistico</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Vitamina </w:t></w:r><w:r><w:t>D</w:t></w:r>
      <w:r><w:t xml:space="preserve"> nella norma.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>
      <w:r><w:t>Controllo fra sei mesi</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Prima versione </w:t></w:r>
      <w:del><w:r><w:delText>sbagliata</w:delText></w:r></w:del>
      <w:r><w:t>corretta</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Esame</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Risultato</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Glicemia</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>102 mg/dL</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const proprieta = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Referto Rossi</dc:title>
  <dc:creator>Laboratorio Analisi Prova</dc:creator>
</cp:coreProperties>`;

  return zipDiProva([
    ["[Content_Types].xml", "<Types/>"],
    ["word/document.xml", documento],
    ["docProps/core.xml", proprieta],
  ]);
}

describe("DOCX", () => {
  const esito = leggiDocx(docxDiProva());

  it("legge il corpo del documento", () => {
    assert.ok(esito.leggibile, esito.motivo ?? "non leggibile");
  });

  it("distingue titoli, paragrafi ed elenchi", () => {
    const titolo = esito.blocchi.find((b) => b.tipo === "titolo");
    assert.equal(titolo?.testo, "Referto specialistico");
    assert.equal(titolo?.livello, 1);

    assert.ok(esito.blocchi.some((b) => b.tipo === "elenco" && b.testo.includes("sei mesi")));
  });

  it("ricompone una frase spezzata in frammenti di formattazione", () => {
    // Word spezza «Vitamina **D**» in tre pezzi: uniti senza separatore,
    // o «Vitamina D» non verrebbe più riconosciuta come un esame.
    assert.ok(esito.blocchi.some((b) => b.testo === "Vitamina D nella norma."));
  });

  it("il testo cancellato con le revisioni non rientra nel documento", () => {
    // Rimetterlo dentro significherebbe riportare in cartella un valore
    // che qualcuno aveva corretto.
    assert.ok(!esito.testo.includes("sbagliata"));
    assert.ok(esito.testo.includes("Prima versione corretta"));
  });

  it("le tabelle diventano tabelle, con le intestazioni riconosciute", () => {
    assert.equal(esito.tabelle.length, 1);
    assert.deepEqual(esito.tabelle[0].intestazioni, ["Esame", "Risultato"]);
    assert.equal(esito.tabelle[0].righe[0][0].testo, "Glicemia");
  });

  it("la tabella entra anche nel testo, perché è lì che si cercano gli esami", () => {
    assert.match(esito.testo, /Glicemia {2}102 mg\/dL/);
  });

  it("legge i metadati che Word scrive a parte", () => {
    assert.equal(esito.metadati.titolo, "Referto Rossi");
    assert.equal(esito.metadati.autore, "Laboratorio Analisi Prova");
  });

  it("un archivio senza corpo non solleva", () => {
    const rotto = leggiDocx(zipDiProva([["a.txt", "niente"]]));
    assert.equal(rotto.leggibile, false);
    assert.match(rotto.motivo ?? "", /corpo/i);
  });
});
