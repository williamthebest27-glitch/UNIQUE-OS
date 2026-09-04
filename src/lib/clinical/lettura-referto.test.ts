import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estraiData,
  leggiReferto,
  normalizzaUnita,
  numeroItaliano,
} from "./lettura-referto.ts";

const OGGI = "2026-09-04";

/** Un referto come esce davvero da un laboratorio italiano. */
const REFERTO = `
LABORATORIO ANALISI CLINICHE
Paziente: Rossi Mario          Data prelievo: 12/03/2026

ESAME                          RISULTATO      U.M.       VALORI DI RIFERIMENTO
Glicemia                       102            mg/dL      70 - 100
Emoglobina glicata             5,4            %          4,0 - 5,6
Colesterolo HDL                48             mg/dL      > 40
Colesterolo LDL                142            mg/dL      < 116
Trigliceridi                   168            mg/dL      < 150
ALT (GPT)                      28             U/L        < 41
Vitamina D (25-OH)             22,5           ng/mL      30 - 100
Ferritina                      210            ng/mL      30 - 400
`;

describe("numeri come li scrive un laboratorio italiano", () => {
  it("la virgola è il decimale", () => {
    assert.equal(numeroItaliano("5,4"), 5.4);
    assert.equal(numeroItaliano("102"), 102);
  });

  it("il punto separa le migliaia, e non è un decimale", () => {
    // Sbagliarlo su un valore di laboratorio è un ordine di grandezza.
    assert.equal(numeroItaliano("1.234,5"), 1234.5);
    assert.equal(numeroItaliano("1.234"), 1234);
  });

  it("regge anche i referti scritti all'inglese", () => {
    assert.equal(numeroItaliano("1,234.5"), 1234.5);
    assert.equal(numeroItaliano("12.5"), 12.5);
  });

  it("i valori sotto soglia mantengono il numero", () => {
    assert.equal(numeroItaliano("<5"), 5);
  });

  it("ciò che non è un numero non diventa zero", () => {
    assert.equal(numeroItaliano("negativo"), null);
    assert.equal(numeroItaliano(""), null);
  });
});

describe("unità di misura", () => {
  it("riduce le scritture diverse alla stessa forma", () => {
    assert.equal(normalizzaUnita("mg/dl"), "mg/dL");
    assert.equal(normalizzaUnita("MG/DL"), "mg/dL");
    assert.equal(normalizzaUnita("µU/mL"), "µU/mL");
    assert.equal(normalizzaUnita("μU/mL"), "µU/mL");
  });
});

describe("la data del referto", () => {
  it("la trova in forma numerica", () => {
    assert.equal(estraiData("Data prelievo: 12/03/2026", OGGI), "2026-03-12");
    assert.equal(estraiData("eseguito il 12-03-2026", OGGI), "2026-03-12");
  });

  it("e in forma estesa", () => {
    assert.equal(estraiData("Milano, 12 marzo 2026", OGGI), "2026-03-12");
  });

  it("una data futura è un errore di lettura, non un esame di domani", () => {
    assert.equal(estraiData("Data: 12/03/2027", OGGI), null);
  });
});

describe("leggere un referto vero", () => {
  const esito = leggiReferto(REFERTO, OGGI);
  const per = (code: string) => esito.measurements.find((m) => m.metric_code === code);

  it("riconosce che è un referto di laboratorio", () => {
    assert.equal(esito.document_kind, "lab_report");
    assert.equal(esito.document_date, "2026-03-12");
  });

  it("prende il risultato, non l'intervallo di riferimento", () => {
    // La riga è "Glicemia 102 mg/dL 70 - 100": i numeri sono tre.
    assert.equal(per("glucose_fasting")?.value, 102);
    assert.equal(per("triglycerides")?.value, 168);
  });

  it("legge i decimali con la virgola", () => {
    assert.equal(per("hba1c")?.value, 5.4);
  });

  it("non confonde LDL con HDL, né con il colesterolo che li contiene", () => {
    assert.equal(per("ldl")?.value, 142);
    assert.equal(per("hdl")?.value, 48);
  });

  it("porta l'unità e il pezzo di testo da cui viene", () => {
    const glicemia = per("glucose_fasting");
    assert.equal(glicemia?.unit, "mg/dL");
    assert.match(glicemia?.source_excerpt ?? "", /Glicemia/);
  });

  it("dichiara una fiducia alta quando l'unità è quella attesa", () => {
    assert.ok((per("glucose_fasting")?.confidence ?? 0) >= 0.9);
  });

  it("data del documento su ogni misura", () => {
    for (const m of esito.measurements) {
      assert.equal(m.measured_on, "2026-03-12", m.metric_code);
    }
  });

  it("segnala le righe con numeri che il catalogo non copre", () => {
    // La ferritina non è fra le metriche dello Score: va detto, non
    // nascosto, altrimenti nessuno si accorge che manca.
    assert.ok(esito.non_riconosciute.some((r) => /Ferritina/i.test(r)));
    assert.match(esito.next_steps.join(" "), /non sono nel catalogo/);
  });
});

describe("conversioni fra unità", () => {
  it("un referto in mmol/L viene convertito, non scartato", () => {
    const esito = leggiReferto("Glicemia 5,6 mmol/L\nColesterolo LDL 3,6 mmol/L", OGGI);
    const glicemia = esito.measurements.find((m) => m.metric_code === "glucose_fasting");
    // 5,6 mmol/L ≈ 101 mg/dL
    assert.ok(glicemia !== undefined);
    assert.ok(Math.abs((glicemia?.value ?? 0) - 100.9) < 1);
    // La conversione abbassa la fiducia: è una lettura in più.
    assert.ok((glicemia?.confidence ?? 1) < 0.95);
  });

  it("un'unità che non c'entra abbassa molto la fiducia", () => {
    const esito = leggiReferto("Glicemia 102 kg", OGGI);
    assert.ok((esito.measurements[0]?.confidence ?? 1) <= 0.5);
  });
});

describe("la pressione è una frazione, e sono due misure", () => {
  it("le separa", () => {
    const esito = leggiReferto("Pressione arteriosa 128/82 mmHg", OGGI);
    assert.equal(esito.measurements.find((m) => m.metric_code === "sbp")?.value, 128);
    assert.equal(esito.measurements.find((m) => m.metric_code === "dbp")?.value, 82);
  });

  it("ma una frazione qualunque non è pressione", () => {
    const esito = leggiReferto("Rapporto 120/80 di qualcos'altro", OGGI);
    assert.equal(esito.measurements.find((m) => m.metric_code === "sbp"), undefined);
  });
});

describe("quando non c'è niente da leggere", () => {
  it("lo dice invece di restituire un elenco vuoto senza spiegazioni", () => {
    const esito = leggiReferto("Documento senza parametri riconoscibili.", OGGI);
    assert.equal(esito.measurements.length, 0);
    assert.match(esito.summary, /scansionato|non ho riconosciuto/i);
  });

  it("un documento senza data lo segnala fra i passi successivi", () => {
    const esito = leggiReferto("Glicemia 95 mg/dL\nTrigliceridi 110 mg/dL", OGGI);
    assert.equal(esito.document_date, null);
    assert.match(esito.next_steps.join(" "), /data/i);
  });
});

describe("il punto ambiguo", () => {
  it("tre cifre dopo il punto sono migliaia: globuli bianchi e piastrine", () => {
    assert.equal(numeroItaliano("5.600"), 5600);
    assert.equal(numeroItaliano("250.000"), 250000);
  });

  it("una o due cifre restano decimali", () => {
    assert.equal(numeroItaliano("12.5"), 12.5);
    assert.equal(numeroItaliano("0.85"), 0.85);
    assert.equal(numeroItaliano("1.23"), 1.23);
  });

  it("con la virgola in gioco non c'è ambiguità da risolvere", () => {
    assert.equal(numeroItaliano("1.234,5"), 1234.5);
    assert.equal(numeroItaliano("1,234.5"), 1234.5);
  });
});
