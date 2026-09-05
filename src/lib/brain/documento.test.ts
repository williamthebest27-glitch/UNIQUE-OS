import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { vocePerCanonical } from "../document-intelligence/catalogo.ts";
import { scegliIntervallo } from "../document-intelligence/stato.ts";
import type { Biomarcatore, DocumentoStrutturato } from "../document-intelligence/tipi.ts";
import {
  analizzaDocumentoStrutturato,
  calcolaTrend,
  distanzaDaObiettivo,
  type MisuraStorica,
} from "./documento.ts";

/**
 * L'analisi temporale e la produzione di intuizioni.
 *
 * Il test centrale è quello della visione: 18 → 29 → 37 di vitamina D
 * deve leggersi come un miglioramento. Gli altri difendono la disciplina
 * che rende quel giudizio credibile — non chiamare trend il rumore, non
 * chiamare miglioramento un'oscillazione, non dare un giudizio quando
 * non c'è un obiettivo con cui confrontarsi.
 */

function biomarcatore(
  canonical: string,
  valore: number | null,
  data: string,
  extra: Partial<Biomarcatore> = {},
): Biomarcatore {
  const voce = vocePerCanonical(canonical);

  return {
    canonical_name: canonical,
    display_name: voce?.display ?? canonical,
    etichetta_documento: voce?.display ?? canonical,
    metric_code: voce?.metricCode ?? null,
    categoria: voce?.categoria ?? "altro",
    valore,
    valore_testuale: null,
    unita: voce?.unita ?? null,
    intervallo: scegliIntervallo(voce ?? null, null),
    stato: "NORMAL",
    confidenza: 0.95,
    richiedeVerifica: false,
    note: [],
    citazione: `${voce?.display ?? canonical} ${valore}`,
    pagina: 1,
    data,
    ...extra,
  };
}

function storico(canonical: string, punti: [string, number][]): MisuraStorica[] {
  const voce = vocePerCanonical(canonical);
  return punti.map(([data, valore]) => ({
    canonical_name: canonical,
    valore,
    unita: voce?.unita ?? null,
    data,
  }));
}

describe("la distanza dall'obiettivo", () => {
  it("è zero dentro la fascia ottimale, e cresce fuori", () => {
    const ldl = vocePerCanonical("LDL_CHOLESTEROL")!;
    const intervallo = scegliIntervallo(ldl, null);

    assert.equal(distanzaDaObiettivo(70, ldl, intervallo), 0);
    assert.equal(distanzaDaObiettivo(100, ldl, intervallo), 20); // ottimale 0–80
    assert.equal(distanzaDaObiettivo(145, ldl, intervallo), 65);
  });

  it("regge gli esami in cui migliorare significa salire", () => {
    const hdl = vocePerCanonical("HDL_CHOLESTEROL")!;
    const intervallo = scegliIntervallo(hdl, null, { sesso: "M" });

    // Ottimale 55–90: sotto è lontano, dentro è a distanza zero.
    assert.ok(distanzaDaObiettivo(40, hdl, intervallo)! > 0);
    assert.equal(distanzaDaObiettivo(60, hdl, intervallo), 0);
  });
});

describe("l'andamento nel tempo", () => {
  it("18 → 29 → 37 di vitamina D è un miglioramento", () => {
    // Il caso della visione, alla lettera.
    const trend = calcolaTrend(
      biomarcatore("VITAMIN_D_25OH", 37, "2026-08-10"),
      storico("VITAMIN_D_25OH", [
        ["2026-01-12", 18],
        ["2026-04-15", 29],
      ]),
    );

    assert.equal(trend.direzione, "IMPROVING");
    assert.deepEqual(
      trend.serie.map((p) => p.valore),
      [18, 29, 37],
    );
    assert.equal(trend.variazione, 19);
    assert.ok(trend.significativo);
  });

  it("un LDL che sale è un peggioramento, anche se il numero cresce", () => {
    // La direzione del bene dipende dall'esame: qui salire è peggio.
    const trend = calcolaTrend(
      biomarcatore("LDL_CHOLESTEROL", 165, "2026-08-10"),
      storico("LDL_CHOLESTEROL", [["2026-02-10", 110]]),
    );

    assert.equal(trend.direzione, "WORSENING");
  });

  it("una differenza dentro la variabilità dell'esame non è un trend", () => {
    // 88 → 92 di glicemia è lo stesso valore misurato due volte.
    // Chiamarlo peggioramento insegnerebbe a non guardare più i trend.
    const trend = calcolaTrend(
      biomarcatore("GLUCOSE_FASTING", 92, "2026-08-10"),
      storico("GLUCOSE_FASTING", [["2026-02-10", 88]]),
    );

    assert.equal(trend.direzione, "STABLE");
    assert.ok(!trend.significativo);
  });

  it("due passi avanti e uno indietro è un'oscillazione, non un miglioramento", () => {
    const trend = calcolaTrend(
      biomarcatore("FERRITIN", 120, "2026-08-10"),
      storico("FERRITIN", [
        ["2026-01-10", 40],
        ["2026-03-10", 150],
        ["2026-05-10", 45],
      ]),
    );

    assert.equal(trend.direzione, "FLUCTUATING");
  });

  it("una sola misura non ha un andamento", () => {
    const trend = calcolaTrend(biomarcatore("TSH", 2.1, "2026-08-10"), []);
    assert.equal(trend.direzione, "UNKNOWN");
    assert.equal(trend.variazione, null);
  });

  it("senza un obiettivo il movimento si registra ma non si giudica", () => {
    // L'FSH non ha un intervallo nel catalogo: dire che «migliora»
    // sarebbe inventare un verso al bene.
    const trend = calcolaTrend(
      biomarcatore("FSH", 12, "2026-08-10"),
      storico("FSH", [["2026-02-10", 4]]),
    );

    assert.equal(trend.direzione, "UNKNOWN");
    assert.ok(trend.significativo, "il movimento c'è ed è dichiarato");
  });
});

/* ── L'analisi completa ───────────────────────────────────────────── */

function documento(biomarcatori: Biomarcatore[]): DocumentoStrutturato {
  return {
    documento: {
      id: "doc-1",
      nome_file: "referto.pdf",
      formato: "pdf",
      mime: "application/pdf",
      dimensione_byte: 1000,
      impronta: "a".repeat(64),
      pagine: 1,
      caricato_il: "2026-08-10T10:00:00.000Z",
    },
    paziente: { nome: null, data_nascita: null, confidenza: 0 },
    tipo_documento: "LAB_REPORT",
    data_documento: "2026-08-10",
    laboratorio: null,
    biomarcatori,
    farmaci: [],
    integratori: [],
    note_cliniche: [],
    tabelle: [],
    avvertenze: [],
    testo_estratto: "",
    lettura: { via: "nativo", fiduciaTesto: 1 },
    richiede_revisione_umana: false,
    confidenza_complessiva: 0.95,
  };
}

describe("le intuizioni del Brain", () => {
  it("un valore fuori norma diventa un reperto negativo con le sue prove", () => {
    const ldl = vocePerCanonical("LDL_CHOLESTEROL")!;
    const analisi = analizzaDocumentoStrutturato(
      documento([
        biomarcatore("LDL_CHOLESTEROL", 145, "2026-08-10", {
          stato: "HIGH",
          intervallo: { min: 0, max: 100, fonte: "documento", testo: "< 100" },
        }),
      ]),
    );

    assert.equal(analisi.reperti_negativi.length, 1);
    const intuizione = analisi.reperti_negativi[0];

    assert.match(intuizione.osservazione, /Colesterolo LDL/);
    assert.equal(intuizione.gravita, "RILEVANTE");
    assert.ok(intuizione.prove.length > 0, "un'inferenza senza prove non è verificabile");
    assert.ok(intuizione.prove.some((p) => p.includes("145")));
    assert.ok(analisi.richiede_revisione_clinica);
    void ldl;
  });

  it("una raccomandazione non è mai esecutiva e non nomina terapie", () => {
    const analisi = analizzaDocumentoStrutturato(
      documento([
        biomarcatore("LDL_CHOLESTEROL", 145, "2026-08-10", {
          stato: "HIGH",
          intervallo: { min: 0, max: 100, fonte: "documento" },
        }),
      ]),
    );

    assert.ok(analisi.raccomandazioni.length > 0);

    for (const r of analisi.raccomandazioni) {
      assert.equal(r.richiede_approvazione_clinica, true);
      // Nessuna parola che possa leggersi come una prescrizione.
      assert.doesNotMatch(
        r.azione,
        /prescriv|somministra|assum|inizia la terapia|sospendi/i,
        `raccomandazione troppo esecutiva: «${r.azione}»`,
      );
    }
  });

  it("l'interpretazione resta al condizionale e rimanda a una persona", () => {
    const analisi = analizzaDocumentoStrutturato(
      documento([
        biomarcatore("LDL_CHOLESTEROL", 145, "2026-08-10", {
          stato: "HIGH",
          intervallo: { min: 0, max: 100, fonte: "documento" },
        }),
      ]),
    );

    assert.equal(analisi.interpretazioni.length, 1);
    assert.match(analisi.interpretazioni[0].possibile_lettura, /potrebbe/i);
    assert.match(analisi.interpretazioni[0].possibile_lettura, /professionista/i);
  });

  it("segnala cosa manca, non solo cosa c'è", () => {
    // Un profilo lipidico con l'LDL e senza l'HDL non si legge bene, e
    // dirlo è più utile che commentare ciò che c'è.
    const analisi = analizzaDocumentoStrutturato(
      documento([biomarcatore("LDL_CHOLESTEROL", 90, "2026-08-10")]),
    );

    assert.ok(analisi.dati_mancanti.some((m) => /profilo lipidico/i.test(m)));
  });

  it("un valore illeggibile finisce fra le aree da rivedere, non fra i reperti", () => {
    const analisi = analizzaDocumentoStrutturato(
      documento([
        biomarcatore("GLUCOSE_FASTING", null, "2026-08-10", {
          stato: "UNKNOWN",
          valore_testuale: "1?5",
          richiedeVerifica: true,
          confidenza: 0.32,
        }),
      ]),
    );

    assert.equal(analisi.reperti_negativi.length, 0);
    assert.equal(analisi.aree_da_rivedere.length, 1);
    assert.ok(
      analisi.raccomandazioni.some((r) => /verificare/i.test(r.azione)),
      "deve chiedere di verificarlo a mano",
    );
  });

  it("il miglioramento della vitamina D arriva fino alla sintesi", () => {
    const analisi = analizzaDocumentoStrutturato(
      documento([
        biomarcatore("VITAMIN_D_25OH", 37, "2026-08-10", { stato: "NORMAL" }),
      ]),
      {
        storico: storico("VITAMIN_D_25OH", [
          ["2026-01-12", 18],
          ["2026-04-15", 29],
        ]),
      },
    );

    const trend = analisi.trend.find((t) => t.canonical_name === "VITAMIN_D_25OH");
    assert.equal(trend?.direzione, "IMPROVING");
    assert.match(analisi.sintesi, /miglioramento/i);
    assert.ok(analisi.reperti_positivi.some((i) => /Vitamina D/i.test(i.osservazione)));
  });

  it("il contesto del paziente entra nella sintesi quando c'è", () => {
    const analisi = analizzaDocumentoStrutturato(
      documento([biomarcatore("TSH", 2.1, "2026-08-10")]),
      { eta: 54, obiettivi: ["Longevity Base"] },
    );

    assert.match(analisi.sintesi, /54 anni/);
    assert.match(analisi.sintesi, /Longevity Base/);
  });

  it("un documento senza parametri lo dice, invece di inventare una sintesi", () => {
    const analisi = analizzaDocumentoStrutturato(documento([]));
    assert.match(analisi.sintesi, /nessun parametro/i);
    assert.equal(analisi.reperti_positivi.length, 0);
  });
});
