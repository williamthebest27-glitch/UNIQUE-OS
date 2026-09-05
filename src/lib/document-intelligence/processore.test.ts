import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tabellaDaTestoAllineato } from "./tabelle.ts";
import { processa } from "./processore.ts";
import type { ContenutoEstratto } from "./tipi.ts";

/**
 * La pipeline, dal testo letto al JSON strutturato.
 *
 * Sono i test che contano di più: qui si decide cosa entra in una
 * cartella clinica. Ognuno difende una promessa fatta nella visione, e
 * il commento sopra ciascuno dice quale.
 */

const OGGI = "2026-09-05";

/** Un referto come esce davvero da un laboratorio italiano. */
const REFERTO = `LABORATORIO ANALISI CLINICHE SAN MARCO
Paziente: Rossi Mario          Data prelievo: 12/03/2026

ESAME                          RISULTATO      U.M.       VALORI DI RIFERIMENTO
Glicemia                       102            mg/dL      70 - 100
Emoglobina glicata             5,4            %          4,0 - 5,6
Colesterolo totale             215            mg/dL      < 200
Colesterolo HDL                48             mg/dL      > 40
Colesterolo LDL                145            mg/dL      < 100
Trigliceridi                   168            mg/dL      < 150
ALT (GPT)                      28             U/L        < 41
TSH                            2,1            µU/mL      0,4 - 4,0
Ferritina                      210            ng/mL      30 - 400
Vitamina D (25-OH)             18             ng/mL      30 - 100
Potassio                       4,2            mmol/L     3,5 - 5,1`;

function contenuto(testo: string, extra: Partial<ContenutoEstratto> = {}): ContenutoEstratto {
  const righe = testo.split("\n").filter((r) => r.trim().length > 0);

  return {
    formato: "pdf",
    leggibile: true,
    testo,
    blocchi: righe.map((r) => ({ tipo: "riga-tabella" as const, testo: r, pagina: 1 })),
    tabelle: [tabellaDaTestoAllineato(righe)].filter((t) => t !== null),
    pagine: 1,
    via: "nativo",
    metadati: {},
    fiduciaTesto: 1,
    ...extra,
  };
}

const FILE = {
  nomeFile: "referto.pdf",
  formato: "pdf" as const,
  mime: "application/pdf",
  dimensioneByte: 120_000,
  impronta: "a".repeat(64),
};

describe("un referto di laboratorio, dall'inizio alla fine", () => {
  const esito = processa(contenuto(REFERTO), FILE, { oggi: OGGI });

  it("riconosce che è un referto di laboratorio", () => {
    assert.equal(esito.tipo_documento, "LAB_REPORT");
  });

  it("legge la data del prelievo, non quella del caricamento", () => {
    assert.equal(esito.data_documento, "2026-03-12");
  });

  it("riconosce il laboratorio e il nome intestato", () => {
    assert.match(esito.laboratorio ?? "", /SAN MARCO/i);
    assert.match(esito.paziente.nome ?? "", /Rossi/);
    // Mai una confidenza alta: è una lettura di controllo, non
    // un'identificazione.
    assert.ok(esito.paziente.confidenza < 0.9);
  });

  it("estrae tutti gli esami del catalogo che compaiono", () => {
    const nomi = esito.biomarcatori.map((b) => b.canonical_name);

    for (const atteso of [
      "GLUCOSE_FASTING",
      "HBA1C",
      "CHOLESTEROL_TOTAL",
      "HDL_CHOLESTEROL",
      "LDL_CHOLESTEROL",
      "TRIGLYCERIDES",
      "ALT",
      "TSH",
      "FERRITIN",
      "VITAMIN_D_25OH",
      "POTASSIUM",
    ]) {
      assert.ok(nomi.includes(atteso), `manca ${atteso}`);
    }
  });

  it("non confonde il valore con l'intervallo di riferimento", () => {
    // «Colesterolo LDL 145 mg/dL < 100» contiene due numeri: il primo è
    // il risultato, il secondo la soglia. È l'errore di lettura più
    // frequente su un referto italiano.
    const ldl = esito.biomarcatori.find((b) => b.canonical_name === "LDL_CHOLESTEROL");
    assert.equal(ldl?.valore, 145);
    assert.equal(ldl?.intervallo.max, 100);
    assert.equal(ldl?.intervallo.fonte, "documento");
  });

  it("l'intervallo del laboratorio vince su quello del catalogo", () => {
    // Il catalogo di Unique direbbe 70–99 per la glicemia; il referto
    // dice 70–100, e sul referto conta quello del laboratorio.
    const glicemia = esito.biomarcatori.find((b) => b.canonical_name === "GLUCOSE_FASTING");
    assert.equal(glicemia?.intervallo.fonte, "documento");
    assert.equal(glicemia?.intervallo.max, 100);
    assert.equal(glicemia?.stato, "HIGH");
  });

  it("i valori fuori norma sono marcati, quelli dentro no", () => {
    const per = (nome: string) => esito.biomarcatori.find((b) => b.canonical_name === nome);

    assert.equal(per("LDL_CHOLESTEROL")?.stato, "HIGH");
    assert.equal(per("VITAMIN_D_25OH")?.stato, "LOW");
    assert.ok(["NORMAL", "OPTIMAL", "BORDERLINE"].includes(per("HBA1C")?.stato ?? ""));
  });

  it("i numeri all'italiana si leggono all'italiana", () => {
    const glicata = esito.biomarcatori.find((b) => b.canonical_name === "HBA1C");
    assert.equal(glicata?.valore, 5.4);
  });

  it("ogni valore porta la riga da cui è stato letto", () => {
    for (const b of esito.biomarcatori) {
      assert.ok(b.citazione.length > 0, `${b.display_name} è senza citazione`);
    }
  });

  it("i valori fuori soglia mandano il documento da una persona", () => {
    assert.equal(esito.richiede_revisione_umana, true);
  });

  it("i biomarcatori dello Score portano il loro codice metrica", () => {
    const ldl = esito.biomarcatori.find((b) => b.canonical_name === "LDL_CHOLESTEROL");
    assert.equal(ldl?.metric_code, "ldl");

    // La ferritina è un dato clinico vero che il punteggio non usa: non
    // deve avere un codice metrica inventato.
    const ferritina = esito.biomarcatori.find((b) => b.canonical_name === "FERRITIN");
    assert.equal(ferritina?.metric_code, null);
  });
});

describe("il sistema non inventa", () => {
  it("un valore che l'OCR non ha letto resta nullo e chiede una verifica", () => {
    // Il caso esatto della visione.
    const esito = processa(
      contenuto("Glucosio 1?5 mg/dL 70 - 100", {
        via: "ocr",
        motoreOcr: "modello",
        fiduciaTesto: 0.6,
        fiduciaRighe: [{ testo: "Glucosio 1?5 mg/dL 70 - 100", fiducia: 0.32 }],
      }),
      FILE,
      {
        oggi: OGGI,
        fiduciaPerRiga: new Map([["Glucosio 1?5 mg/dL 70 - 100", 0.32]]),
      },
    );

    const glucosio = esito.biomarcatori.find((b) => b.canonical_name === "GLUCOSE_FASTING");

    assert.ok(glucosio, "l'esame va comunque registrato: sappiamo che è stato fatto");
    assert.equal(glucosio.valore, null, "il valore non va indovinato");
    assert.notEqual(glucosio.valore, 105);
    assert.notEqual(glucosio.valore, 125);
    assert.ok(glucosio.confidenza < 0.5);
    assert.equal(glucosio.richiedeVerifica, true);
    assert.equal(esito.richiede_revisione_umana, true);
  });

  it("un valore fisiologicamente impossibile non entra come valore", () => {
    // 46094 è un seriale Excel letto per sbaglio come glicemia.
    const esito = processa(contenuto("Glicemia 46094 mg/dL"), FILE, { oggi: OGGI });
    const glicemia = esito.biomarcatori.find((b) => b.canonical_name === "GLUCOSE_FASTING");

    assert.equal(glicemia?.valore, null);
    assert.equal(glicemia?.stato, "UNKNOWN");
    assert.ok(glicemia?.note.some((n) => /fuori dall'intervallo fisiologicamente/i.test(n)));
  });

  it("un documento illeggibile è un esito, non un'eccezione", () => {
    const esito = processa(
      {
        formato: "png",
        leggibile: false,
        motivo: "È un'immagine e non c'è nessun riconoscimento ottico disponibile.",
        testo: "",
        blocchi: [],
        tabelle: [],
        pagine: 1,
        via: "ocr",
        metadati: {},
        fiduciaTesto: 0,
      },
      { ...FILE, formato: "png" },
      { oggi: OGGI },
    );

    assert.equal(esito.biomarcatori.length, 0);
    assert.equal(esito.richiede_revisione_umana, true);
    assert.equal(esito.confidenza_complessiva, 0);
    assert.ok(esito.avvertenze.some((a) => a.codice === "ocr-fallito"));
  });
});

describe("le conversioni di unità", () => {
  it("un referto in mmol/L viene riportato nell'unità del catalogo", () => {
    const esito = processa(contenuto("Glicemia 5,5 mmol/L"), FILE, { oggi: OGGI });
    const glicemia = esito.biomarcatori.find((b) => b.canonical_name === "GLUCOSE_FASTING");

    assert.equal(glicemia?.unita, "mg/dL");
    assert.ok(Math.abs((glicemia?.valore ?? 0) - 99.1) < 0.5);
    // La conversione resta tracciata: senza, nessuno saprebbe perché in
    // cartella c'è 99 e sul referto 5,5.
    assert.equal(glicemia?.conversione?.da, "mmol/L");
    assert.equal(glicemia?.conversione?.valoreOriginale, 5.5);
  });
});

describe("il documento è di questo paziente?", () => {
  it("segnala quando il nome sul referto non corrisponde alla cartella", () => {
    const esito = processa(contenuto(REFERTO), FILE, {
      oggi: OGGI,
      nomePazienteInCartella: "Bianchi Anna",
    });

    assert.ok(esito.avvertenze.some((a) => a.codice === "paziente-non-corrispondente"));
    assert.equal(esito.richiede_revisione_umana, true);
  });

  it("non si allarma per l'ordine di nome e cognome", () => {
    const esito = processa(contenuto(REFERTO), FILE, {
      oggi: OGGI,
      nomePazienteInCartella: "Mario Rossi",
    });

    assert.ok(!esito.avvertenze.some((a) => a.codice === "paziente-non-corrispondente"));
  });
});

describe("i duplicati", () => {
  it("un documento già in cartella viene segnalato, non rifiutato", () => {
    const esito = processa(contenuto(REFERTO), FILE, {
      oggi: OGGI,
      duplicatoDi: { id: "abc", titolo: "Analisi marzo" },
    });

    const duplicato = esito.avvertenze.find((a) => a.codice === "duplicato");
    assert.ok(duplicato);
    assert.match(duplicato.messaggio, /Analisi marzo/);
    // I dati ci sono comunque: la decisione su cosa tenere è di una
    // persona, non del motore.
    assert.ok(esito.biomarcatori.length > 5);
  });
});

describe("la confidenza complessiva", () => {
  it("un referto nativo e pulito è più affidabile di una scansione", () => {
    const nativo = processa(contenuto(REFERTO), FILE, { oggi: OGGI });
    const scansione = processa(
      contenuto(REFERTO, { via: "ocr", motoreOcr: "tesseract", fiduciaTesto: 0.7 }),
      FILE,
      { oggi: OGGI },
    );

    assert.ok(
      nativo.confidenza_complessiva > scansione.confidenza_complessiva,
      "la lettura ottica deve pesare sulla confidenza del documento",
    );
    assert.ok(scansione.avvertenze.some((a) => a.codice === "confidenza-bassa"));
  });
});
