import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITI,
  chiediPassaggio,
  liberaPassaggio,
  messaggioFreno,
} from "./freno.ts";

/*
 * Ogni test usa una chiave sua. Il deposito è globale di proposito —
 * sopravvive al ricaricamento dei moduli in sviluppo — e due test che
 * condividessero una chiave si conterebbero i tentativi a vicenda.
 */
let contatore = 0;
const chiave = () => `prova-${++contatore}-${Math.random()}`;

test("sotto il limite si passa, e i tentativi restanti scendono", () => {
  const k = chiave();
  const { quanti } = LIMITI.accesso;

  for (let i = 1; i <= quanti; i += 1) {
    const esito = chiediPassaggio("accesso", k);
    assert.equal(esito.passa, true, `tentativo ${i}`);
    assert.equal(esito.restanti, quanti - i);
  }
});

test("il tentativo dopo il limite non passa e dice quando riprovare", () => {
  const k = chiave();
  for (let i = 0; i < LIMITI.accesso.quanti; i += 1) chiediPassaggio("accesso", k);

  const esito = chiediPassaggio("accesso", k);
  assert.equal(esito.passa, false);
  assert.equal(esito.restanti, 0);
  assert.ok(esito.fraSecondi > 0 && esito.fraSecondi <= LIMITI.accesso.finestraSec);
});

test("la finestra scorre: passata, si riparte da capo", () => {
  const k = chiave();
  const t0 = 1_000_000_000_000;

  for (let i = 0; i < LIMITI.accesso.quanti; i += 1) chiediPassaggio("accesso", k, t0);
  assert.equal(chiediPassaggio("accesso", k, t0).passa, false);

  // Un millisecondo oltre la finestra: i vecchi tentativi non contano più.
  const dopo = t0 + LIMITI.accesso.finestraSec * 1000 + 1;
  assert.equal(chiediPassaggio("accesso", k, dopo).passa, true);
});

/*
 * Il tentativo respinto **occupa comunque un posto** nella finestra.
 *
 * È la differenza fra un tetto e una cadenza: se i respinti non
 * contassero, chi bussa senza sosta si troverebbe la finestra intatta
 * al primo istante utile e potrebbe ripartire con il pieno dei
 * tentativi, per sempre.
 *
 * Non è invece una penalità che allunga il blocco: la finestra scorre, e
 * quando i tentativi vecchi escono si riapre. Una gogna a tempo sarebbe
 * un'altra cosa, e non è questa.
 */
test("un tentativo respinto occupa comunque un posto", () => {
  const k = chiave();
  const t0 = 2_000_000_000_000;
  const { quanti, finestraSec } = LIMITI.accesso;

  for (let i = 0; i < quanti; i += 1) chiediPassaggio("accesso", k, t0);

  // A metà finestra insiste, e viene respinto.
  const meta = t0 + (finestraSec * 1000) / 2;
  assert.equal(chiediPassaggio("accesso", k, meta).passa, false);

  // Passata la finestra dei primi, si ricomincia — ma non da zero: il
  // tentativo respinto di prima è ancora dentro, e uno dei posti è suo.
  const dopo = t0 + finestraSec * 1000 + 1;
  const esito = chiediPassaggio("accesso", k, dopo);

  assert.equal(esito.passa, true);
  assert.equal(esito.restanti, quanti - 2, "il respinto occupa un posto, questo un altro");
});

test("contesti diversi hanno finestre diverse sulla stessa chiave", () => {
  const k = chiave();
  for (let i = 0; i < LIMITI.link.quanti + 2; i += 1) chiediPassaggio("link", k);

  assert.equal(chiediPassaggio("link", k).passa, false);
  // La ricerca non è stata toccata: chi ha esaurito i link può ancora cercare.
  assert.equal(chiediPassaggio("ricerca", k).passa, true);
});

test("chiavi diverse non si contano a vicenda", () => {
  const a = chiave();
  const b = chiave();
  for (let i = 0; i < LIMITI.accesso.quanti + 1; i += 1) chiediPassaggio("accesso", a);

  assert.equal(chiediPassaggio("accesso", a).passa, false);
  assert.equal(chiediPassaggio("accesso", b).passa, true);
});

test("un accesso riuscito azzera la finestra", () => {
  const k = chiave();
  for (let i = 0; i < LIMITI.accesso.quanti; i += 1) chiediPassaggio("accesso", k);
  assert.equal(chiediPassaggio("accesso", k).passa, false);

  liberaPassaggio("accesso", k);
  assert.equal(chiediPassaggio("accesso", k).passa, true);
});

/*
 * Il messaggio dice quanto manca e non perché. «Hai sbagliato password
 * cinque volte» confermerebbe a chi prova indirizzi altrui che
 * quell'indirizzo esiste.
 */
test("il messaggio non rivela niente sull'account", () => {
  const testo = messaggioFreno({ passa: false, restanti: 0, fraSecondi: 240 });
  assert.match(testo, /4 minuti/);
  assert.ok(!/password|email|account|utente/i.test(testo));

  assert.match(messaggioFreno({ passa: false, restanti: 0, fraSecondi: 30 }), /30 secondi/);
  assert.match(messaggioFreno({ passa: false, restanti: 0, fraSecondi: 60 }), /1 minuto\b/);
  assert.equal(messaggioFreno({ passa: true, restanti: 3, fraSecondi: 0 }), "");
});

test("i limiti sono tutti sensati: nessuno a zero, nessuna finestra nulla", () => {
  for (const [nome, limite] of Object.entries(LIMITI)) {
    assert.ok(limite.quanti >= 1, `${nome}: un limite a zero blocca tutti`);
    assert.ok(limite.finestraSec >= 1, `${nome}: una finestra nulla non frena niente`);
  }
});
