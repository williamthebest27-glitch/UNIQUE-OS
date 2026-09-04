import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SOGLIA_VARIAZIONE,
  componiConfronto,
  componiMancanti,
  componiMigliorati,
  componiPeggiorati,
  componiSintesiCartella,
  componiValore,
  confrontaMisure,
  metricheMancanti,
  riconosciDomandaCartella,
  type MisuraStorica,
} from "./cartella-domande.ts";

const domanda = (t: string) => riconosciDomandaCartella(t);

/**
 * Due prelievi a distanza di sei mesi: la glicemia sale, l'LDL scende,
 * la glicata resta dov'era.
 */
const STORICO: MisuraStorica[] = [
  { code: "glucose_fasting", value: 118, measuredOn: "2026-09-01" },
  { code: "glucose_fasting", value: 92, measuredOn: "2026-03-01" },
  { code: "ldl", value: 108, measuredOn: "2026-09-01" },
  { code: "ldl", value: 152, measuredOn: "2026-03-01" },
  { code: "hba1c", value: 5.3, measuredOn: "2026-09-01" },
  { code: "hba1c", value: 5.3, measuredOn: "2026-03-01" },
  { code: "hdl", value: 51, measuredOn: "2026-09-01" },
];

describe("riconoscere la domanda sulla cartella", () => {
  it("capisce le domande che un medico fa davvero", () => {
    assert.equal(domanda("quali parametri sono peggiorati?")?.id, "peggiorati");
    assert.equal(domanda("cosa è migliorato?")?.id, "migliorati");
    assert.equal(domanda("confronta gli ultimi due esami")?.id, "confronto");
    assert.equal(domanda("preparami una sintesi prima della visita")?.id, "sintesi");
    assert.equal(domanda("cosa manca per lo score?")?.id, "mancanti");
  });

  it("una domanda che nomina un esame è una domanda su quel valore", () => {
    const r = domanda("com'è la glicata?");
    assert.equal(r?.id, "valore");
    assert.equal(r?.metrica, "hba1c");
  });

  it("e resta tale anche con un verbo intorno", () => {
    const r = domanda("la glicemia è peggiorata?");
    assert.equal(r?.metrica, "glucose_fasting");
  });

  it("quando non capisce non inventa", () => {
    assert.equal(domanda("che tempo fa"), null);
  });
});

describe("confrontare le misure", () => {
  const variazioni = confrontaMisure(STORICO);
  const per = (code: string) => variazioni.find((v) => v.code === code);

  it("prende la più recente come attuale e la precedente come confronto", () => {
    const glicemia = per("glucose_fasting");
    assert.equal(glicemia?.attuale, 118);
    assert.equal(glicemia?.attualeIl, "2026-09-01");
    assert.equal(glicemia?.precedente, 92);
  });

  it("la direzione la decide la curva, non il segno del valore", () => {
    // La glicemia sale: il valore cresce, il punteggio scende.
    assert.equal(per("glucose_fasting")?.direzione, "peggiorato");
    assert.ok((per("glucose_fasting")?.deltaPunteggio ?? 0) < 0);

    // L'LDL scende: il valore cala, il punteggio sale.
    assert.equal(per("ldl")?.direzione, "migliorato");
    assert.ok((per("ldl")?.deltaPunteggio ?? 0) > 0);
  });

  it("una differenza piccola non è una tendenza", () => {
    assert.equal(per("hba1c")?.direzione, "stabile");
    assert.ok(Math.abs(per("hba1c")?.deltaPunteggio ?? 99) < SOGLIA_VARIAZIONE);
  });

  it("con una sola rilevazione non si parla di andamento", () => {
    assert.equal(per("hdl")?.direzione, "primo");
    assert.equal(per("hdl")?.precedente, null);
    assert.equal(per("hdl")?.deltaPunteggio, null);
  });

  it("segnala i valori oltre la soglia clinica", () => {
    // 118 mg/dL non fa scattare l'allerta (soglia 126), 130 sì.
    const alto = confrontaMisure([{ code: "glucose_fasting", value: 130, measuredOn: "2026-09-01" }]);
    assert.equal(alto[0].fuoriSoglia, true);
    assert.equal(per("glucose_fasting")?.fuoriSoglia, false);
  });
});

describe("cosa è peggiorato", () => {
  it("elenca i peggiorati con valore, data e valore precedente", () => {
    const { testo, fonti } = componiPeggiorati(confrontaMisure(STORICO));
    assert.match(testo, /Glicemia a digiuno 118 mg\/dL il 2026-09-01/);
    assert.match(testo, /era 92 il 2026-03-01/);
    assert.ok(fonti.length > 0);
  });

  it("non elenca ciò che è migliorato", () => {
    const { testo } = componiPeggiorati(confrontaMisure(STORICO));
    assert.doesNotMatch(testo, /Colesterolo LDL/);
  });

  it("quando non c'è niente da confrontare lo dice", () => {
    const { testo } = componiPeggiorati(
      confrontaMisure([{ code: "hdl", value: 51, measuredOn: "2026-09-01" }]),
    );
    assert.match(testo, /una sola rilevazione/);
  });

  it("e quando tutto tiene, lo dice pure quello", () => {
    const { testo } = componiPeggiorati(
      confrontaMisure([
        { code: "hba1c", value: 5.3, measuredOn: "2026-09-01" },
        { code: "hba1c", value: 5.3, measuredOn: "2026-03-01" },
      ]),
    );
    assert.match(testo, /Nessun parametro è peggiorato/);
  });
});

describe("cosa è migliorato e cosa si è mosso", () => {
  it("il miglioramento porta il segno più", () => {
    const { testo } = componiMigliorati(confrontaMisure(STORICO));
    assert.match(testo, /Colesterolo LDL 108/);
    assert.match(testo, /\+\d+ punti/);
  });

  it("il confronto conta anche gli stabili, invece di nasconderli", () => {
    const { testo } = componiConfronto(confrontaMisure(STORICO));
    assert.match(testo, /stabil/);
  });
});

describe("il valore di un singolo esame", () => {
  it("porta valore, data, precedente e andamento", () => {
    const v = confrontaMisure(STORICO).find((x) => x.code === "hba1c");
    const { testo } = componiValore(v, "emoglobina glicata");
    assert.match(testo, /Emoglobina glicata 5,3 % il 2026-09-01/);
    assert.match(testo, /Stabile/);
  });

  it("se non c'è, spiega perché potrebbe non esserci", () => {
    const { testo } = componiValore(undefined, "vitamina D");
    assert.match(testo, /non è ancora stato caricato|non è stato approvato/);
  });

  it("un valore fuori soglia manda da un medico", () => {
    const v = confrontaMisure([{ code: "glucose_fasting", value: 140, measuredOn: "2026-09-01" }])[0];
    const { testo } = componiValore(v, "glicemia");
    assert.match(testo, /soglia di rilevanza clinica/);
  });
});

describe("cosa manca", () => {
  it("raggruppa per fonte del dato", () => {
    const mancanti = metricheMancanti(STORICO, "lab");
    const { testo } = componiMancanti(mancanti);
    assert.match(testo, /esami di laboratorio/);
    assert.ok(mancanti.length > 0);
  });

  it("ricorda che un pilastro senza dati non è un pilastro basso", () => {
    const { testo } = componiMancanti(metricheMancanti(STORICO, "lab"));
    assert.match(testo, /non conta come punteggio basso/);
  });
});

describe("la sintesi prima della visita", () => {
  it("mette insieme punteggio, fuori soglia e peggioramenti", () => {
    const { testo } = componiSintesiCartella({
      score: 74,
      scoreIl: "2026-09-01",
      scorePrecedente: 70,
      copertura: 0.86,
      pilastriDeboli: [{ label: "Stile di vita", valore: 58 }],
      variazioni: confrontaMisure(STORICO),
      mancantiDiLaboratorio: 4,
      ultimaVisita: { servizio: "Consulenza longevity", quando: "12 giugno" },
      documentiRecenti: 2,
    });

    assert.match(testo, /Longevity Score 74/);
    assert.match(testo, /\+4 rispetto al precedente/);
    assert.match(testo, /86% dei parametri/);
    assert.match(testo, /In peggioramento: Glicemia/);
    assert.match(testo, /Stile di vita 58/);
  });

  it("dichiara sempre che non è un giudizio clinico", () => {
    const { testo } = componiSintesiCartella({
      score: null,
      scoreIl: null,
      scorePrecedente: null,
      copertura: null,
      pilastriDeboli: [],
      variazioni: [],
      mancantiDiLaboratorio: 0,
      ultimaVisita: null,
      documentiRecenti: 0,
    });
    assert.match(testo, /non un giudizio clinico/);
    assert.match(testo, /Nessun Longevity Score/);
  });
});
