import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completamento,
  daFormData,
  leggiDomande,
  rispostaPresente,
  valida,
  type Domanda,
} from "./questionari.ts";

const GREZZE = [
  { id: "ore", text: "Quante ore dormi?", type: "number", unit: "ore", min: 0, max: 14 },
  { id: "risvegli", text: "Quante volte ti svegli?", type: "single", options: ["Mai", "Una volta", "Più di una"] },
  { id: "riposato", text: "Ti senti riposato?", type: "scale", min: 1, max: 5, labels: ["Mai", "Sempre"] },
  { id: "note", text: "Altro?", type: "text", required: false },
];

describe("leggere le domande", () => {
  it("le riconosce e le normalizza", () => {
    const domande = leggiDomande(GREZZE);
    assert.equal(domande.length, 4);
    assert.equal(domande[0].tipo, "number");
    assert.equal(domande[0].unita, "ore");
    assert.equal(domande[0].obbligatoria, true);
    assert.equal(domande[3].obbligatoria, false);
    assert.deepEqual(domande[2].estremi, ["Mai", "Sempre"]);
  });

  it("scarta ciò che non è una domanda invece di renderizzarlo a metà", () => {
    const domande = leggiDomande([
      { id: "buona", text: "Va bene", type: "text" },
      { text: "senza id", type: "text" },
      { id: "senza-testo", type: "text" },
      { id: "scelta-vuota", text: "Scegli", type: "single", options: [] },
      "non un oggetto",
      null,
    ]);
    assert.deepEqual(domande.map((d) => d.id), ["buona"]);
  });

  it("un tipo sconosciuto diventa testo libero, non un errore", () => {
    assert.equal(leggiDomande([{ id: "x", text: "?", type: "ologramma" }])[0].tipo, "text");
  });

  it("un JSON che non è un elenco non produce domande", () => {
    assert.deepEqual(leggiDomande({ id: "x" }), []);
    assert.deepEqual(leggiDomande(null), []);
    assert.deepEqual(leggiDomande("[]"), []);
  });
});

describe("una risposta c'è davvero?", () => {
  it("il vuoto non conta", () => {
    assert.equal(rispostaPresente(undefined), false);
    assert.equal(rispostaPresente(null), false);
    assert.equal(rispostaPresente(""), false);
    assert.equal(rispostaPresente("   "), false);
    assert.equal(rispostaPresente([]), false);
  });

  it("lo zero è una risposta", () => {
    assert.equal(rispostaPresente(0), true);
  });
});

describe("validare", () => {
  const domande: Domanda[] = leggiDomande(GREZZE);

  it("una risposta fuori scala si segnala accanto al campo giusto", () => {
    const esito = valida(domande, { ore: 30 }, false);
    assert.equal(esito.ok, false);
    assert.match(esito.errori.ore, /più di 14 ore/);
  });

  it("una scelta non fra quelle proposte non passa", () => {
    const esito = valida(domande, { risvegli: "Ogni ora" }, false);
    assert.match(esito.errori.risvegli, /una delle risposte proposte/);
  });

  it("salvare a metà è lecito: le mancanti si elencano, non si bloccano", () => {
    const esito = valida(domande, { ore: 7 }, false);
    assert.equal(esito.ok, true);
    assert.deepEqual(esito.mancanti.sort(), ["riposato", "risvegli"]);
  });

  it("consegnare con obbligatorie mancanti no", () => {
    const esito = valida(domande, { ore: 7 }, true);
    assert.equal(esito.ok, false);
    assert.match(esito.errori.risvegli, /serve per consegnare/);
  });

  it("le facoltative non bloccano la consegna", () => {
    const esito = valida(domande, { ore: 7, risvegli: "Mai", riposato: 4 }, true);
    assert.equal(esito.ok, true);
    assert.deepEqual(esito.mancanti, []);
  });
});

describe("il completamento", () => {
  const domande = leggiDomande(GREZZE);

  it("si misura sulle obbligatorie, che sono quelle che bloccano", () => {
    assert.equal(completamento(domande, {}), 0);
    assert.equal(completamento(domande, { ore: 7 }), 33);
    assert.equal(completamento(domande, { ore: 7, risvegli: "Mai", riposato: 4 }), 100);
  });

  it("un questionario di sole facoltative è già completo", () => {
    assert.equal(completamento(leggiDomande([{ id: "a", text: "?", type: "text", required: false }]), {}), 100);
  });
});

describe("dal modulo HTML alle risposte", () => {
  const domande = leggiDomande([
    ...GREZZE,
    { id: "sport", text: "Quali sport?", type: "multi", options: ["Corsa", "Nuoto", "Pesi"] },
  ]);

  const modulo = (dati: Record<string, string[]>) => (nome: string) => dati[nome];

  it("i numeri tornano numeri, anche con la virgola", () => {
    const r = daFormData(domande, modulo({ q_ore: ["7,5"] }));
    assert.equal(r.ore, 7.5);
  });

  it("le scelte multiple tornano un elenco", () => {
    const r = daFormData(domande, modulo({ q_sport: ["Corsa", "Pesi"] }));
    assert.deepEqual(r.sport, ["Corsa", "Pesi"]);
  });

  it("i campi lasciati vuoti non diventano risposte vuote", () => {
    const r = daFormData(domande, modulo({ q_ore: [""], q_note: ["   "] }));
    assert.deepEqual(r, {});
  });

  it("un numero illeggibile resta come l'ha scritto la persona: lo segnala la validazione", () => {
    const r = daFormData(domande, modulo({ q_ore: ["sette"] }));
    assert.equal(r.ore, "sette");
    assert.match(valida(domande, r, false).errori.ore, /Serve un numero/);
  });
});
