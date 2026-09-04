import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  componiAndamento,
  componiCampagneCostose,
  componiCampagneQualita,
  componiConoscenza,
  componiContenuti,
  componiNonCapito,
  componiPazientiFermi,
  componiSpesa,
  conta,
  elenco,
  frasePeriodo,
  variazione,
  type DatiAndamento,
} from "./narrativa.ts";

const OGGI = "2026-09-04";

function andamento(over: Partial<DatiAndamento> = {}): DatiAndamento {
  return {
    periodo: "2026-09",
    oggi: OGGI,
    fatturatoCents: 2_143_000,
    fatturatoPrecedenteCents: 1_913_000,
    visite: 184,
    nuoviPazienti: 12,
    nuoviMembri: 12,
    churn: 1,
    lead: 48,
    conversione: 0.25,
    margineCents: 900_000,
    margineQuota: 0.42,
    compensiDaLiquidareCents: 0,
    collo: null,
    pagamentiFalliti: 0,
    proposteInAttesa: 0,
    ...over,
  };
}

describe("piccole cose che si leggono cento volte", () => {
  it("il singolare non diventa mai un numero", () => {
    assert.equal(conta(1, "visita", "visite", true), "una visita");
    assert.equal(conta(0, "visita", "visite", true), "nessuna visita");
    assert.equal(conta(3, "visita", "visite", true), "3 visite");
  });

  it("l'elenco italiano ha la e prima dell'ultimo", () => {
    assert.equal(elenco(["a"]), "a");
    assert.equal(elenco(["a", "b"]), "a e b");
    assert.equal(elenco(["a", "b", "c"]), "a, b e c");
  });

  it("il mese in corso si chiama questo mese", () => {
    assert.equal(frasePeriodo("2026-09", OGGI), "questo mese");
    assert.equal(frasePeriodo("2026-08", OGGI), "a agosto 2026");
  });
});

describe("il confronto con il mese prima", () => {
  it("dice di quanto è cresciuto", () => {
    const v = variazione(112, 100);
    assert.equal(v.direzione, "su");
    assert.match(v.testo, /\+12%/);
  });

  it("usa il segno meno tipografico, non il trattino", () => {
    const v = variazione(88, 100);
    assert.equal(v.direzione, "giu");
    assert.match(v.testo, /−12%/);
  });

  it("sotto il cinque per cento non è una tendenza", () => {
    assert.equal(variazione(103, 100).direzione, "piatta");
    assert.match(variazione(103, 100).testo, /in linea/);
  });

  it("senza un mese prima non si confronta niente", () => {
    assert.equal(variazione(100, null).direzione, "ignota");
    assert.equal(variazione(100, 0).direzione, "ignota");
  });
});

describe("come sta andando", () => {
  it("mette i numeri prima dell'interpretazione", () => {
    const { testo } = componiAndamento(andamento());
    const posizioneCifra = testo.search(/\d/);
    assert.ok(posizioneCifra < 40, "il primo numero arriva troppo tardi");
    assert.match(testo, /\+12%/);
    assert.match(testo, /184 visite/);
  });

  it("dice sempre che il margine non è il profitto", () => {
    const { testo } = componiAndamento(andamento());
    assert.match(testo, /costi di struttura/);
  });

  it("segnala il collo di bottiglia solo quando stringe davvero", () => {
    const stretto = componiAndamento(
      andamento({ collo: { professionista: "Dott. Rossi", saturazione: 0.91 } }),
    );
    assert.match(stretto.testo, /Dott\. Rossi/);

    const largo = componiAndamento(
      andamento({ collo: { professionista: "Dott. Rossi", saturazione: 0.4 } }),
    );
    assert.doesNotMatch(largo.testo, /Dott\. Rossi/);
  });

  it("quando non c'è niente da segnalare lo dice", () => {
    assert.match(componiAndamento(andamento()).testo, /Niente che richieda attenzione/);
  });

  it("i pagamenti falliti finiscono fra le cose da guardare", () => {
    const { testo } = componiAndamento(andamento({ pagamentiFalliti: 2 }));
    assert.match(testo, /2 pagamenti falliti/);
  });

  it("dichiara sempre da dove vengono i numeri", () => {
    assert.ok(componiAndamento(andamento()).fonti.length > 0);
  });
});

describe("marketing", () => {
  it("un costo per lead non calcolabile non diventa zero euro", () => {
    const { testo } = componiSpesa({
      periodo: "2026-09",
      oggi: OGGI,
      spesaCents: 120_000,
      lead: 0,
      pazienti: 0,
      cplCents: null,
      cacCents: null,
      roas: null,
      ricavoCents: 0,
      campagneAttive: 2,
    });
    assert.match(testo, /non è ancora calcolabile/);
    assert.doesNotMatch(testo, /0\s*€ per lead/);
  });

  it("senza campagne dice che la spesa non sta arrivando", () => {
    const { testo } = componiSpesa({
      periodo: "2026-09",
      oggi: OGGI,
      spesaCents: 0,
      lead: 0,
      pazienti: 0,
      cplCents: null,
      cacCents: null,
      roas: null,
      ricavoCents: 0,
      campagneAttive: 0,
    });
    assert.match(testo, /non sta arrivando nel sistema/);
  });

  it("la classifica per qualità spiega perché non è per numero di lead", () => {
    const { testo } = componiCampagneQualita(
      [
        {
          nome: "Meta — Longevity",
          canale: "meta",
          pazienti: 8,
          valoreMedioCents: 120_000,
          tassoMembership: 0.75,
          cplCents: 3_000,
          spesaCents: 240_000,
        },
      ],
      "2026-09",
      OGGI,
    );
    assert.match(testo, /Meta — Longevity/);
    // Due cose che sembrano difetti e non lo sono. In italiano il
    // separatore delle migliaia compare da cinque cifre in su — "1200 €"
    // e "12.000 €" sono entrambi corretti, è una regola CLDR. E lo spazio
    // prima del simbolo è unificatore (U+00A0), non uno spazio normale:
    // cercarlo con uno spazio semplice non lo trova.
    assert.match(testo, /1200\s€/);
    assert.match(testo, /non per numero di lead/);
  });

  it("con pochi pazienti non si pronuncia", () => {
    const { testo } = componiCampagneQualita([], "2026-09", OGGI);
    assert.match(testo, /caso, non qualità/);
  });

  it("una campagna fuori media si nomina con lo scarto", () => {
    const { testo } = componiCampagneCostose(
      [{ nome: "Reel settembre", cplCents: 4_000, scarto: 0.31 }],
      3_050,
      "2026-09",
      OGGI,
    );
    assert.match(testo, /Reel settembre/);
    assert.match(testo, /31%/);
    assert.match(testo, /media è pesata sulla spesa/);
  });

  it("i contenuti senza dati non si inventano", () => {
    const { testo } = componiContenuti([], { angoli: [], formati: [] });
    assert.match(testo, /non arrivano da sole/);
  });
});

describe("pazienti fermi", () => {
  it("distingue chi non viene da chi non usa i crediti", () => {
    const visite = componiPazientiFermi({
      quanti: 18,
      giorni: 60,
      criterio: "visite",
      esempi: [],
    });
    assert.match(visite.testo, /non viene in clinica/);

    const crediti = componiPazientiFermi({
      quanti: 18,
      giorni: 60,
      criterio: "crediti",
      esempi: [],
    });
    assert.match(crediti.testo, /non utilizza crediti/);
  });

  it("promette di preparare, mai di inviare", () => {
    const { testo } = componiPazientiFermi({
      quanti: 18,
      giorni: 60,
      criterio: "crediti",
      esempi: [{ nome: "Giulia Ferrari", giorni: 94 }],
    });
    assert.match(testo, /non parte comunque nessun messaggio/);
    assert.match(testo, /Giulia Ferrari/);
  });
});

describe("knowledge base", () => {
  it("cita la voce con la sua provenienza", () => {
    const { testo, fonti } = componiConoscenza(
      [
        {
          titolo: "Listino servizi",
          slug: "listino-servizi",
          provenienza: "versione 2, in vigore dal 2026-03-15",
          daRiconfermare: false,
          estratto: "Unique Longevity Score: 149 €",
        },
      ],
      "prezzo score",
    );
    assert.match(testo, /versione 2/);
    assert.match(testo, /149/);
    assert.ok(fonti.some((f) => f.includes("listino-servizi")));
  });

  it("avvisa quando l'informazione non è riconfermata da troppo", () => {
    const { testo } = componiConoscenza(
      [
        {
          titolo: "Listino servizi",
          slug: "listino-servizi",
          provenienza: "versione 1 — non riconfermata da 400 giorni",
          daRiconfermare: true,
          estratto: "129 €",
        },
      ],
      "prezzo",
    );
    assert.match(testo, /nessuno oggi la garantisce/);
  });

  it("quando non sa, dice che l'informazione manca", () => {
    const { testo } = componiConoscenza([], "orari di apertura");
    assert.match(testo, /va scritta/);
  });
});

describe("quando non capisce", () => {
  it("lo dice, e mostra cosa sa fare", () => {
    const { testo } = componiNonCapito(["Come sta andando?", "Quanto abbiamo speso?"]);
    assert.match(testo, /invece di indovinare/);
    assert.match(testo, /Come sta andando\?/);
  });
});
