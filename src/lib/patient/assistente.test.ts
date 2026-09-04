import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DOMANDE_ESEMPIO, rispondi, type ContestoPaziente } from "./assistente.ts";

function contesto(patch: Partial<ContestoPaziente> = {}): ContestoPaziente {
  return {
    nome: "Alessandro",
    oggi: "2026-09-10",
    score: 78,
    scorePrecedente: 72,
    scoreMisuratoIl: "2026-08-20",
    pilastri: [
      { etichetta: "Movement", valore: 86, delta: 4 },
      { etichetta: "Lifestyle", valore: 69, delta: -1 },
      { etichetta: "Nutrition", valore: null, delta: null },
    ],
    prossimaVisita: {
      servizio: "Controllo nutrizionale",
      quando: "2026-09-18T09:30:00Z",
      professionista: "Dott.ssa Neri",
      luogo: "Varese",
    },
    visiteInProgramma: 2,
    creditiDisponibili: 4,
    creditiPrenotati: 1,
    membershipPiano: "Signature",
    membershipScadeIl: "2027-01-31",
    azioniAperte: [{ titolo: "Camminare 30 minuti al giorno", scadeIl: null }],
    questionariDaFare: [{ titolo: "Qualità del sonno" }],
    documentiNuovi: 2,
    messaggiNonLetti: 0,
    progressi: [
      { etichetta: "Emoglobina glicata", valore: "5,3 %", variazione: "−0,6", miglioramento: true },
      { etichetta: "Colesterolo LDL", valore: "150 mg/dL", variazione: "+12", miglioramento: false },
    ],
    ...patch,
  };
}

describe("il confine clinico", () => {
  const domande = [
    "Il mio colesterolo è grave?",
    "Cosa significa questo valore?",
    "Devo preoccuparmi?",
    "Che malattia ho?",
    "Devo prendere le statine?",
    "Ho la glicemia alta?",
    "È normale il mio LDL?",
    "Questi sintomi da cosa dipendono?",
  ];

  for (const domanda of domande) {
    it(`«${domanda}» non riceve una risposta medica`, () => {
      const r = rispondi(domanda, contesto());
      assert.equal(r.categoria, "rinvio_medico");
      assert.match(r.testo, /per il tuo medico/);
      assert.ok(r.collegamenti.some((c) => c.href === "/messaggi"));
    });
  }

  it("una domanda clinica non cade in un'altra regola per una parola in comune", () => {
    // Contiene "punteggio", ma chiede un giudizio: vince il confine.
    const r = rispondi("Il mio punteggio è preoccupante?", contesto());
    assert.equal(r.categoria, "rinvio_medico");
  });
});

describe("le risposte sui fatti", () => {
  it("il punteggio, con la variazione e i pilastri agli estremi", () => {
    const r = rispondi("Qual è il mio Longevity Score?", contesto());
    assert.equal(r.categoria, "punteggio");
    assert.match(r.testo, /78 su 100/);
    assert.match(r.testo, /\+6 punti/);
    assert.match(r.testo, /Movement/);
    assert.match(r.testo, /Lifestyle/);
  });

  it("un pilastro non calcolabile non entra nel confronto", () => {
    const r = rispondi("come sto?", contesto());
    assert.doesNotMatch(r.testo, /Nutrition/);
  });

  it("senza punteggio lo dice, invece di inventarne uno", () => {
    const r = rispondi("qual è il mio score?", contesto({ score: null, scorePrecedente: null }));
    assert.match(r.testo, /Non hai ancora un Unique Longevity Score/);
    assert.deepEqual(r.fonti, ["nessun punteggio registrato"]);
  });

  it("il prossimo appuntamento, con giorno, ora e professionista", () => {
    const r = rispondi("Quando è il prossimo appuntamento?", contesto());
    assert.equal(r.categoria, "appuntamento");
    assert.match(r.testo, /Controllo nutrizionale/);
    assert.match(r.testo, /venerdì 18 settembre/);
    assert.match(r.testo, /Dott\.ssa Neri/);
  });

  it("senza appuntamenti propone di prenotare, se ci sono crediti", () => {
    const r = rispondi("quando è la prossima visita?", contesto({ prossimaVisita: null }));
    assert.match(r.testo, /Non hai visite in programma/);
    assert.match(r.testo, /4 crediti disponibili/);
  });

  it("i crediti, disponibili e prenotati separati", () => {
    const r = rispondi("Quanti crediti ho?", contesto());
    assert.equal(r.categoria, "crediti");
    assert.match(r.testo, /4 crediti disponibili/);
    assert.match(r.testo, /1 prenotati/);
  });

  it("l'andamento distingue ciò che migliora da ciò che peggiora, e rinvia il senso al medico", () => {
    const r = rispondi("Che cosa è cambiato dall'ultimo controllo?", contesto());
    assert.equal(r.categoria, "andamento");
    assert.match(r.testo, /In miglioramento: Emoglobina glicata/);
    assert.match(r.testo, /In peggioramento: Colesterolo LDL/);
    assert.match(r.testo, /lo commenta il tuo medico/);
  });

  it("senza due rilevazioni non finge un confronto", () => {
    const r = rispondi("sto migliorando?", contesto({ progressi: [] }));
    assert.match(r.testo, /Non ho ancora due rilevazioni/);
  });

  it("cosa fare questa settimana mette insieme piano, questionari e documenti", () => {
    const r = rispondi("Cosa devo fare questa settimana?", contesto());
    assert.equal(r.categoria, "dafare");
    assert.match(r.testo, /Camminare 30 minuti/);
    assert.match(r.testo, /Qualità del sonno/);
    assert.match(r.testo, /2 nuovi documenti/);
  });

  it("quando non c'è niente in sospeso lo dice e basta", () => {
    const r = rispondi("cosa devo fare?", contesto({ azioniAperte: [], questionariDaFare: [], documentiNuovi: 0 }));
    assert.match(r.testo, /Non hai nulla in sospeso/);
  });

  it("la membership, con la scadenza", () => {
    const r = rispondi("Quando scade il mio piano?", contesto());
    assert.equal(r.categoria, "membership");
    assert.match(r.testo, /Signature/);
    assert.match(r.testo, /31 gennaio 2027/);
  });
});

describe("quando non sa", () => {
  it("lo dice, e dice cosa sa fare", () => {
    const r = rispondi("Qual è la capitale del Portogallo?", contesto());
    assert.equal(r.categoria, "non_so");
    assert.match(r.testo, /Non ho abbastanza informazioni/);
  });

  it("una domanda vuota non è un errore", () => {
    const r = rispondi("   ", contesto());
    assert.equal(r.categoria, "non_so");
    assert.deepEqual(r.collegamenti, []);
  });

  it("non risponde mai con un fatto non presente nel contesto", () => {
    const vuoto = contesto({
      score: null,
      scorePrecedente: null,
      scoreMisuratoIl: null,
      pilastri: [],
      prossimaVisita: null,
      visiteInProgramma: 0,
      creditiDisponibili: 0,
      creditiPrenotati: 0,
      membershipPiano: null,
      membershipScadeIl: null,
      azioniAperte: [],
      questionariDaFare: [],
      documentiNuovi: 0,
      messaggiNonLetti: 0,
      progressi: [],
    });
    for (const domanda of DOMANDE_ESEMPIO) {
      const r = rispondi(domanda, vuoto);
      assert.doesNotMatch(r.testo, /\b(78|Signature|Neri)\b/, `«${domanda}» ha inventato un dato`);
    }
  });
});

describe("le domande di esempio", () => {
  it("ognuna riceve una risposta vera, non il ripiego", () => {
    for (const domanda of DOMANDE_ESEMPIO) {
      const r = rispondi(domanda, contesto());
      assert.notEqual(r.categoria, "non_so", `«${domanda}» non è riconosciuta`);
      assert.ok(r.testo.length > 0);
    }
  });
});
