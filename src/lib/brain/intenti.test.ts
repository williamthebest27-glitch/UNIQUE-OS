import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOMANDE_ESEMPIO,
  estraiGiorni,
  estraiPeriodo,
  normalizza,
  riconosciIntento,
} from "./intenti.ts";
import { estraiInterrogazione } from "./interrogazione.ts";

const OGGI = "2026-09-04";

const intento = (domanda: string) => riconosciIntento(domanda, OGGI)?.id ?? null;

describe("normalizzazione", () => {
  it("toglie accenti, maiuscole e punteggiatura", () => {
    assert.equal(normalizza("Qual è la CAPACITÀ?"), "qual e la capacita");
  });

  it("chi scrive di fretta scrive senza accenti, e va capito lo stesso", () => {
    assert.equal(normalizza("perché"), normalizza("perche"));
    assert.equal(normalizza("capacità"), normalizza("capacita"));
  });
});

describe("riconoscere la domanda", () => {
  it("capisce le domande della visione, parola per parola", () => {
    assert.equal(intento("Come sta andando Unique questo mese?"), "andamento");
    assert.equal(intento("Quale campagna sta portando i pazienti migliori?"), "campagne_qualita");
    assert.equal(intento("Quale campagna genera più membership?"), "campagne_qualita");
    assert.equal(intento("Quanto abbiamo speso questo mese?"), "spesa_marketing");
    assert.equal(intento("Quali video stanno convertendo?"), "contenuti");
  });

  it("riconosce lo stesso intento posto in modi diversi", () => {
    for (const domanda of [
      "come va?",
      "Come siamo messi",
      "fammi un riepilogo",
      "dammi una sintesi della situazione",
      "come è andato il mese",
    ]) {
      assert.equal(intento(domanda), "andamento", domanda);
    }
  });

  it("distingue una campagna cara da una che porta bene", () => {
    assert.equal(intento("ci sono campagne che costano troppo?"), "campagne_costose");
    assert.equal(intento("quale campagna rende meglio?"), "campagne_qualita");
  });

  it("non confonde il fatturato con la spesa in campagne", () => {
    assert.equal(intento("quanto abbiamo fatturato?"), "fatturato");
    assert.equal(intento("quanto abbiamo speso in campagne?"), "spesa_marketing");
  });

  it("i pazienti fermi si chiedono in molti modi", () => {
    for (const domanda of [
      "chi non viene da tre mesi?",
      "ci sono pazienti inattivi?",
      "quali membri non usano i crediti?",
      "chi è sparito?",
    ]) {
      assert.equal(intento(domanda), "pazienti_fermi", domanda);
    }
  });

  it("distingue chi non viene da chi non spende i crediti", () => {
    assert.equal(
      riconosciIntento("quali membri non usano i crediti da 60 giorni?", OGGI)?.parametri.criterio,
      "crediti",
    );
    assert.equal(
      riconosciIntento("chi non viene da 90 giorni?", OGGI)?.parametri.criterio,
      "visite",
    );
  });

  it("una domanda su un prezzo va in knowledge base", () => {
    const r = riconosciIntento("Quanto costa il Longevity Score?", OGGI);
    assert.equal(r?.id, "conoscenza");
    assert.match(r?.parametri.ricerca ?? "", /longevity score/);
  });

  it("chiede tutti i gruppi: una parola sola non basta", () => {
    // "campagne" da solo non dice quale delle due domande sia.
    assert.notEqual(intento("campagne"), "campagne_qualita");
    assert.notEqual(intento("campagne"), "campagne_costose");
  });

  it("quando non capisce lo dice, invece di indovinare", () => {
    assert.equal(intento("che tempo fa a Varese"), null);
    assert.equal(intento("asdfgh"), null);
    assert.equal(intento(""), null);
  });

  it("sa elencare cosa sa fare", () => {
    assert.equal(intento("cosa sai fare?"), "aiuto");
    assert.ok(DOMANDE_ESEMPIO.length >= 8);
  });

  it("ogni domanda di esempio è riconosciuta, da un intento o da un'interrogazione", () => {
    // Le domande componibili — "qual è il servizio più redditizio" — non
    // hanno un intento: le risponde lo strato semantico. Un esempio deve
    // essere riconosciuto da almeno uno dei due, altrimenti la pagina
    // suggerirebbe una domanda a cui il motore non sa rispondere.
    for (const domanda of DOMANDE_ESEMPIO) {
      const riconosciuta = intento(domanda) !== null || estraiInterrogazione(domanda, OGGI) !== null;
      assert.ok(riconosciuta, `non riconosciuta: ${domanda}`);
    }
  });
});

describe("il periodo nella domanda", () => {
  it("il mese scorso è il mese scorso", () => {
    assert.equal(estraiPeriodo("com'è andato il mese scorso?", OGGI), "2026-08");
  });

  it("attraversa il capodanno senza inciampare", () => {
    assert.equal(estraiPeriodo("il mese scorso", "2026-01-15"), "2025-12");
    assert.equal(estraiPeriodo("due mesi fa", "2026-01-15"), "2025-11");
  });

  it("un mese nominato senza anno è l'ultima volta che è passato", () => {
    // A settembre, "dicembre" è quello dell'anno scorso: non si chiedono
    // i numeri di un mese che deve ancora arrivare.
    assert.equal(estraiPeriodo("a dicembre", OGGI), "2025-12");
    assert.equal(estraiPeriodo("ad agosto", OGGI), "2026-08");
  });

  it("con l'anno esplicito non c'è niente da indovinare", () => {
    assert.equal(estraiPeriodo("agosto 2025", OGGI), "2025-08");
    assert.equal(estraiPeriodo("2026-03", OGGI), "2026-03");
  });

  it("senza indicazioni non inventa un periodo", () => {
    assert.equal(estraiPeriodo("quale campagna rende meglio", OGGI), undefined);
  });
});

describe("i giorni nella domanda", () => {
  it("legge i giorni scritti come numero", () => {
    assert.equal(estraiGiorni("da più di 90 giorni"), 90);
    assert.equal(estraiGiorni("60 gg"), 60);
  });

  it("converte i mesi in giorni", () => {
    assert.equal(estraiGiorni("da tre mesi"), 90);
    assert.equal(estraiGiorni("da 2 mesi"), 60);
    assert.equal(estraiGiorni("da un mese"), 30);
  });

  it("dove non ci sono, non li inventa", () => {
    assert.equal(estraiGiorni("chi è sparito"), undefined);
  });

  it("ma per i pazienti fermi un valore predefinito serve", () => {
    assert.equal(riconosciIntento("chi è sparito?", OGGI)?.parametri.giorni, 60);
  });
});

describe("dove sta la risposta conta più dell'argomento", () => {
  it("la procedura di disdetta è knowledge base, non un numero sulle membership", () => {
    assert.equal(intento("cosa dice la procedura di disdetta?"), "conoscenza");
    assert.equal(intento("qual è il protocollo per i no-show?"), "conoscenza");
    assert.equal(intento("dov'è il listino?"), "conoscenza");
  });

  it("ma le disdette come numero restano una domanda sulle membership", () => {
    assert.equal(intento("quante disdette questo mese?"), "membership");
    assert.equal(intento("com'è il churn?"), "membership");
  });

  it("preparare è un'azione, chiedere chi è fermo è una domanda", () => {
    assert.equal(intento("chi non viene da tre mesi?"), "pazienti_fermi");
    assert.equal(
      intento("preparami i contatti per chi non viene da tre mesi"),
      "prepara_riattivazione",
    );
  });
});
