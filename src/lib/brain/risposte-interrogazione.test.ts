import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { componiRisultato, type Risultato } from "./risposte-interrogazione.ts";
import type { Interrogazione } from "./interrogazione.ts";

const base = (over: Partial<Interrogazione> = {}): Interrogazione => ({
  misura: "fatturato",
  filtri: [],
  spiegazione: false,
  ...over,
});

describe("un totale", () => {
  it("dice numero, periodo e confronto", () => {
    const { testo } = componiRisultato(base(), {
      misura: "fatturato",
      periodo: "2026-09",
      unita: "euro",
      totale: 2_143_000,
      righe: [],
      precedente: { totale: 1_913_000, righe: [] },
      filtriApplicati: [],
      limiti: [],
    });
    assert.match(testo, /Fatturato settembre 2026: 21\.430\s€/);
    assert.match(testo, /\+12% rispetto a agosto 2026/);
  });

  it("ripete i filtri, così il numero non sembra di tutti", () => {
    const { testo } = componiRisultato(base(), {
      misura: "fatturato",
      periodo: "2026-08",
      unita: "euro",
      totale: 480_000,
      righe: [],
      filtriApplicati: ["professionista: Dott. Rossi"],
      limiti: [],
    });
    assert.match(testo, /professionista: Dott\. Rossi/);
    // Sotto le cinque cifre l'italiano non separa le migliaia: "4800 €".
    assert.match(testo, /4800\s€/);
  });

  it("quando non c'è un valore lo dice", () => {
    const { testo } = componiRisultato(base(), {
      misura: "fatturato",
      periodo: "2026-08",
      unita: "euro",
      totale: null,
      righe: [],
      filtriApplicati: [],
      limiti: ["I dati di agosto non sono stati importati."],
    });
    assert.match(testo, /Non ho un valore/);
    assert.match(testo, /non sono stati importati/);
  });
});

describe("una classifica", () => {
  const risultato: Risultato = {
    misura: "margine",
    periodo: "2026-09",
    unita: "euro",
    totale: 900_000,
    righe: [
      { etichetta: "Osteopatia", valore: 120_000, dettaglio: "18 visite" },
      { etichetta: "Consulenza longevity", valore: 500_000, dettaglio: "20 visite" },
      { etichetta: "Nutrizione", valore: 280_000, dettaglio: "25 visite" },
    ],
    filtriApplicati: [],
    limiti: [],
  };

  it("il primo della classifica, con chi segue", () => {
    const { testo } = componiRisultato(
      base({ misura: "margine", raggruppa: "servizio", ordina: "alto" }),
      risultato,
    );
    assert.match(testo, /\*\*Consulenza longevity\*\*, 5000\s€/);
    assert.match(testo, /Seguono Nutrizione/);
  });

  it("l'ultimo, quando si chiede il peggiore", () => {
    const { testo } = componiRisultato(
      base({ misura: "margine", raggruppa: "servizio", ordina: "basso" }),
      risultato,
    );
    assert.match(testo, /\*\*Osteopatia\*\*/);
  });

  it("i primi due, quando si chiede un numero", () => {
    const { testo } = componiRisultato(
      base({ misura: "margine", raggruppa: "servizio", ordina: "alto", limite: 2 }),
      risultato,
    );
    assert.match(testo, /Consulenza longevity/);
    assert.match(testo, /Nutrizione/);
    assert.match(testo, /E altri 1/);
  });

  it("l'elenco intero quando non c'è ordinamento, con il totale", () => {
    const { testo } = componiRisultato(base({ misura: "margine", raggruppa: "servizio" }), risultato);
    assert.match(testo, /totale 9000\s€/);
    assert.match(testo, /Osteopatia: 1200\s€ \(18 visite\)/);
  });
});

describe("perché", () => {
  it("scompone la variazione e dice dove è successa", () => {
    const { testo } = componiRisultato(
      base({ misura: "fatturato", raggruppa: "servizio", spiegazione: true }),
      {
        misura: "fatturato",
        periodo: "2026-09",
        unita: "euro",
        totale: 1_650_000,
        righe: [
          { etichetta: "Consulenza longevity", valore: 800_000 },
          { etichetta: "Nutrizione", valore: 450_000 },
          { etichetta: "Osteopatia", valore: 400_000 },
        ],
        precedente: {
          totale: 2_020_000,
          righe: [
            { etichetta: "Consulenza longevity", valore: 1_200_000 },
            { etichetta: "Nutrizione", valore: 400_000 },
            { etichetta: "Osteopatia", valore: 420_000 },
          ],
        },
        filtriApplicati: [],
        limiti: [],
      },
    );
    assert.match(testo, /sceso di 3700\s€/);
    assert.match(testo, /Consulenza longevity: −4000\s€/);
    assert.match(testo, /non perché le persone/);
  });

  it("chi c'era prima e non c'è più conta come un calo intero", () => {
    const { testo } = componiRisultato(
      base({ misura: "visite", raggruppa: "professionista", spiegazione: true }),
      {
        misura: "visite",
        periodo: "2026-09",
        unita: "numero",
        totale: 40,
        righe: [{ etichetta: "Dott. Rossi", valore: 40 }],
        precedente: {
          totale: 70,
          righe: [
            { etichetta: "Dott. Rossi", valore: 40 },
            { etichetta: "Dott.ssa Bianchi", valore: 30 },
          ],
        },
        filtriApplicati: [],
        limiti: [],
      },
    );
    assert.match(testo, /Dott\.ssa Bianchi: −30/);
  });

  it("senza variazione non c'è niente da spiegare", () => {
    const { testo } = componiRisultato(
      base({ misura: "visite", raggruppa: "servizio", spiegazione: true }),
      {
        misura: "visite",
        periodo: "2026-09",
        unita: "numero",
        totale: 10,
        righe: [{ etichetta: "A", valore: 10 }],
        precedente: { totale: 10, righe: [{ etichetta: "A", valore: 10 }] },
        filtriApplicati: [],
        limiti: [],
      },
    );
    assert.match(testo, /non c'è una variazione da spiegare/);
  });
});
