import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  costruisciImpalcatura,
  domandeRisposte,
  paragrafiEtichettati,
  vociElenco,
  type FattoConoscenza,
} from "./impalcatura.ts";

const SERVIZIO: FattoConoscenza = {
  slug: "servizio-longevity-score",
  titolo: "Unique Longevity Score",
  tipo: "servizio",
  provenienza: "versione 1, in vigore dal 2026-03-01",
  daRiconfermare: false,
  dati: {},
  corpo: [
    "L'Unique Longevity Score è la misura sintetica dello stato di salute di una persona: un numero da 0 a 100 composto da sette pilastri.",
    "",
    "**Come si ottiene.** Un pannello ematochimico, una valutazione clinica, una body scan e un questionario.",
    "",
    "**Cosa non è.** Non è una diagnosi e non sostituisce un parere medico.",
    "",
    "**Ogni quanto si rifà.** Ogni sei mesi nel percorso standard.",
  ].join("\n"),
};

const IDENTITA: FattoConoscenza = {
  slug: "brand-identita",
  titolo: "Identità Unique",
  tipo: "brand",
  provenienza: "versione 1, in vigore dal 2026-01-01",
  daRiconfermare: false,
  dati: {},
  corpo: [
    "**Tono di voce.** Diretto, competente, mai allarmista. Si parla di dati, non di miracoli.",
    "",
    "**Cosa non diciamo mai.** Diagnosi in un contenuto. Percentuali senza fonte.",
  ].join("\n"),
};

const FAQ: FattoConoscenza = {
  slug: "faq-longevity-score",
  titolo: "FAQ",
  tipo: "faq",
  provenienza: "versione 1, in vigore dal 2026-01-01",
  daRiconfermare: false,
  dati: {},
  corpo: [
    "**Serve essere a digiuno?** Sì, per il prelievo: dodici ore.",
    "",
    "**Il punteggio è una diagnosi?** No. È una misura di sintesi.",
  ].join("\n"),
};

const LISTINO: FattoConoscenza = {
  slug: "listino-servizi",
  titolo: "Listino servizi",
  tipo: "listino",
  provenienza: "versione 2, in vigore dal 2026-03-15",
  daRiconfermare: false,
  dati: { prezzi_cents: { "longevity-score": 14900 } },
  corpo: "- Unique Longevity Score: 149 €\n- Consulenza longevity: 200 €",
};

describe("leggere la knowledge base senza riscriverla", () => {
  it("estrae i paragrafi con l'etichetta in grassetto", () => {
    const p = paragrafiEtichettati(SERVIZIO.corpo);
    assert.equal(p.length, 3);
    assert.equal(p[0].etichetta, "Come si ottiene");
    assert.match(p[1].testo, /Non è una diagnosi/);
  });

  it("legge le voci di un elenco", () => {
    assert.deepEqual(vociElenco(LISTINO.corpo), [
      "Unique Longevity Score: 149 €",
      "Consulenza longevity: 200 €",
    ]);
  });

  it("riconosce domande e risposte nelle FAQ", () => {
    const qa = domandeRisposte(FAQ.corpo);
    assert.equal(qa.length, 2);
    assert.match(qa[0].domanda, /digiuno\?/);
    assert.match(qa[0].risposta, /dodici ore/);
  });
});

describe("l'impalcatura di un carosello", () => {
  const imp = costruisciImpalcatura({
    formato: "carosello-instagram",
    brief: "Il nuovo Longevity Score per chi non ha mai fatto un check-up",
    fatti: [SERVIZIO, IDENTITA, LISTINO],
    angoli: [{ angolo: "autorità", volte: 2 }],
    ganci: [{ testo: "Il tuo medico ti ha mai misurato questo?", formato: "reel", lead: 14 }],
  });

  it("il primo blocco è il gancio, e propone quello che ha funzionato", () => {
    assert.equal(imp.blocchi[0].ruolo, "gancio");
    assert.match(imp.blocchi[0].daScrivere ?? "", /Il tuo medico ti ha mai misurato questo/);
    assert.match(imp.blocchi[0].nota ?? "", /autorità/);
  });

  it("i fatti sono citati testualmente, non riassunti", () => {
    const comeSiOttiene = imp.blocchi.find((b) => b.ruolo === "come si ottiene");
    assert.match(comeSiOttiene?.testo ?? "", /pannello ematochimico/);
    assert.match(comeSiOttiene?.nota ?? "", /servizio-longevity-score/);
  });

  it("il limite dichiarato non si può togliere", () => {
    const limite = imp.blocchi.find((b) => b.ruolo === "il limite dichiarato");
    assert.match(limite?.testo ?? "", /Non è una diagnosi/);
    assert.match(limite?.nota ?? "", /non si toglie/);
  });

  it("il tono di voce entra nei vincoli, dalla knowledge base", () => {
    assert.ok(imp.vincoli.some((v) => /Diretto, competente/.test(v)));
    assert.ok(imp.vincoli.some((v) => /Da non scrivere mai/.test(v)));
  });

  it("dichiara le fonti con lo slug", () => {
    assert.ok(imp.fonti.some((f) => f.slug === "servizio-longevity-score"));
    assert.ok(imp.fonti.some((f) => f.slug === "brand-identita"));
  });

  it("ricorda sempre la rilettura medica", () => {
    assert.ok(imp.avvertenze.some((a) => /riletta da un medico/.test(a)));
  });
});

describe("l'impalcatura di una landing", () => {
  const imp = costruisciImpalcatura({
    formato: "landing",
    brief: "Longevity Score",
    fatti: [SERVIZIO, IDENTITA, FAQ, LISTINO],
    angoli: [],
    ganci: [],
  });

  it("le obiezioni vengono dalle FAQ vere, non inventate", () => {
    const obiezioni = imp.blocchi.filter((b) => b.ruolo.startsWith("obiezione"));
    assert.ok(obiezioni.length >= 2);
    assert.match(obiezioni[0].testo ?? "", /dodici ore/);
  });

  it("il prezzo si può scrivere solo se è in listino", () => {
    const prezzo = imp.blocchi.find((b) => b.ruolo === "prezzo");
    assert.match(prezzo?.daScrivere ?? "", /listino in vigore/);
    assert.match(prezzo?.nota ?? "", /versione 2/);
  });

  it("senza ganci passati lo dice, invece di inventarne", () => {
    assert.match(imp.blocchi[0].daScrivere ?? "", /non ho ganci passati/i);
  });
});

describe("quando la knowledge base non basta", () => {
  it("senza voce di servizio, il contenuto non si costruisce e si spiega perché", () => {
    const imp = costruisciImpalcatura({
      formato: "reel",
      brief: "Un tema di cui non abbiamo scritto niente",
      fatti: [IDENTITA],
      angoli: [],
      ganci: [],
    });

    const corpo = imp.blocchi.find((b) => b.ruolo === "corpo");
    assert.match(corpo?.daScrivere ?? "", /Scrivila lì prima/);
    assert.ok(imp.avvertenze.some((a) => /Nessun fatto disponibile/.test(a)));
  });

  it("un'informazione non riconfermata viene segnalata prima di costruirci sopra", () => {
    const imp = costruisciImpalcatura({
      formato: "reel",
      brief: "Score",
      fatti: [{ ...SERVIZIO, daRiconfermare: true, provenienza: "versione 1 — non riconfermata da 400 giorni" }],
      angoli: [],
      ganci: [],
    });

    assert.ok(imp.avvertenze.some((a) => /non viene riconfermata/.test(a)));
  });

  it("senza identità di brand, il tono non è verificabile e lo dice", () => {
    const imp = costruisciImpalcatura({
      formato: "reel",
      brief: "Score",
      fatti: [SERVIZIO],
      angoli: [],
      ganci: [],
    });

    assert.ok(imp.avvertenze.some((a) => /identità del brand/.test(a)));
  });
});
