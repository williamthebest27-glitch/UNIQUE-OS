import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estraiInterrogazione,
  nomeProprio,
  scomponiVariazione,
  type RigaConfronto,
} from "./interrogazione.ts";

const OGGI = "2026-09-04";
const chiedi = (d: string) => estraiInterrogazione(d, OGGI);

describe("una grammatica, non un elenco", () => {
  it("la misura da sola", () => {
    assert.equal(chiedi("quanto abbiamo fatturato?")?.misura, "fatturato");
    assert.equal(chiedi("quante visite abbiamo fatto?")?.misura, "visite");
    assert.equal(chiedi("quanti lead sono arrivati?")?.misura, "lead");
  });

  it("misura per dimensione", () => {
    const q = chiedi("fatturato per servizio");
    assert.equal(q?.misura, "fatturato");
    assert.equal(q?.raggruppa, "servizio");
  });

  it("misura con filtro nominato direttamente", () => {
    const q = chiedi("quante visite di nutrizione questo mese?");
    assert.equal(q?.misura, "visite");
    assert.deepEqual(q?.filtri, [{ dimensione: "disciplina", valore: "nutritionist" }]);
    assert.equal(q?.periodo, "2026-09");
  });

  it("misura, professionista e periodo insieme", () => {
    const q = chiedi("quanto ha fatturato il dottor Rossi ad agosto?");
    assert.equal(q?.misura, "fatturato");
    assert.ok(q?.filtri.some((f) => f.dimensione === "professionista" && f.valore === "Rossi"));
    assert.equal(q?.periodo, "2026-08");
  });

  it("la classifica suppone il raggruppamento", () => {
    const q = chiedi("qual è il servizio più redditizio?");
    assert.equal(q?.misura, "margine");
    assert.equal(q?.raggruppa, "servizio");
    assert.equal(q?.ordina, "alto");
  });

  it("i primi tre", () => {
    const q = chiedi("i tre professionisti che fatturano di più");
    assert.equal(q?.misura, "fatturato");
    assert.equal(q?.raggruppa, "professionista");
    assert.equal(q?.limite, 3);
    assert.equal(q?.ordina, "alto");
  });

  it("anche in cifre", () => {
    assert.equal(chiedi("i 5 servizi migliori per margine")?.limite, 5);
  });

  it("il peggiore", () => {
    const q = chiedi("qual è il canale che converte peggio?");
    assert.equal(q?.misura, "conversione");
    assert.equal(q?.raggruppa, "canale");
    assert.equal(q?.ordina, "basso");
  });

  it("un canale nominato è un filtro", () => {
    const q = chiedi("quanti lead da instagram il mese scorso?");
    assert.deepEqual(q?.filtri, [{ dimensione: "canale", valore: "instagram" }]);
    assert.equal(q?.periodo, "2026-08");
  });

  it("il perché si riconosce", () => {
    assert.equal(chiedi("perché il fatturato è sceso?")?.spiegazione, true);
    assert.equal(chiedi("come mai meno visite?")?.spiegazione, true);
    assert.equal(chiedi("quante visite?")?.spiegazione, false);
  });

  it("senza una misura non c'è niente da calcolare", () => {
    assert.equal(chiedi("che ore sono"), null);
    assert.equal(chiedi("ciao"), null);
  });
});

describe("il nome proprio", () => {
  it("lo trova dopo la preposizione, per la maiuscola", () => {
    assert.equal(nomeProprio("quanto ha fatturato di Rossi"), "Rossi");
    assert.equal(nomeProprio("le visite del dottor Bianchi"), "Bianchi");
    assert.equal(nomeProprio("il dott. Verdi"), "Verdi");
  });

  it("una parola minuscola non è un nome", () => {
    assert.equal(nomeProprio("le visite di nutrizione"), undefined);
  });
});

describe("perché un numero si è mosso", () => {
  const righe: RigaConfronto[] = [
    { chiave: "a", etichetta: "Consulenza longevity", attuale: 8_000, precedente: 12_000 },
    { chiave: "b", etichetta: "Osteopatia", attuale: 3_000, precedente: 3_200 },
    { chiave: "c", etichetta: "Nutrizione", attuale: 4_500, precedente: 4_000 },
    { chiave: "d", etichetta: "Body scan", attuale: 1_000, precedente: 1_000 },
  ];

  it("calcola la variazione totale", () => {
    assert.equal(scomponiVariazione(righe).totale, -3_700);
  });

  it("mette per primo chi ha spinto di più nella direzione del totale", () => {
    const { contributi } = scomponiVariazione(righe);
    assert.equal(contributi[0].etichetta, "Consulenza longevity");
    assert.equal(contributi[0].delta, -4_000);
    assert.equal(contributi[0].direzione, "giu");
  });

  it("si ferma quando ha spiegato abbastanza", () => {
    // La consulenza da sola spiega più dell'80%: basta lei.
    const { contributi } = scomponiVariazione(righe, 0.8);
    assert.equal(contributi.length, 1);
  });

  it("con una copertura più alta elenca anche il resto, ma non chi non si è mosso", () => {
    const { contributi } = scomponiVariazione(righe, 1);
    assert.ok(contributi.every((c) => c.etichetta !== "Body scan"));
  });

  it("chi va contro corrente ha una quota negativa", () => {
    const { contributi } = scomponiVariazione(righe, 1);
    const nutrizione = contributi.find((c) => c.etichetta === "Nutrizione");
    assert.ok(nutrizione);
    assert.ok(nutrizione.quota < 0);
    assert.equal(nutrizione.direzione, "su");
  });

  it("senza variazione non c'è niente da spiegare", () => {
    const ferme: RigaConfronto[] = [{ chiave: "a", etichetta: "A", attuale: 5, precedente: 5 }];
    assert.deepEqual(scomponiVariazione(ferme), { totale: 0, contributi: [] });
  });
});

describe("quello che la batteria di domande ha insegnato", () => {
  it("un prezzo non è una misura: sta in knowledge base", () => {
    assert.equal(chiedi("quanto costa la visita nutrizionale?"), null);
    assert.equal(chiedi("qual è il prezzo dello Score?"), null);
    assert.equal(chiedi("che tariffa ha l'osteopatia?"), null);
  });

  it("'da quale canale arrivano più lead' raggruppa e ordina", () => {
    const q = chiedi("da quale canale arrivano più lead?");
    assert.equal(q?.misura, "lead");
    assert.equal(q?.raggruppa, "canale");
    assert.equal(q?.ordina, "alto");
  });

  it("'chi' è una domanda sui professionisti", () => {
    const q = chiedi("chi ha fatto più visite?");
    assert.equal(q?.raggruppa, "professionista");
    assert.equal(q?.ordina, "alto");
  });

  it("'quale servizio' raggruppa per servizio anche senza 'per'", () => {
    assert.equal(chiedi("quale servizio ha il margine più alto?")?.raggruppa, "servizio");
  });
});
