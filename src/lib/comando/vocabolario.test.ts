import { test } from "node:test";
import assert from "node:assert/strict";
import { attesaDa, descriviEvento, oraDi, tonoEvento } from "./vocabolario.ts";

test("un evento conosciuto si legge in italiano", () => {
  assert.equal(descriviEvento("lab.validated"), "Nuovo risultato di laboratorio");
  assert.equal(descriviEvento("consultation.requested"), "Nuova richiesta di consulenza");
});

/*
 * Il ripiego è la parte che conta: un evento aggiunto in una migrazione
 * e dimenticato nel vocabolario deve comparire lo stesso. Un feed che
 * tace su ciò che non conosce insegna a fidarsi di un elenco incompleto.
 */
test("un evento ignoto compare comunque, leggibile alla meglio", () => {
  assert.equal(descriviEvento("ricovero.aperto"), "ricovero aperto");
  assert.equal(descriviEvento("qualcosa_di_nuovo"), "qualcosa di nuovo");
  assert.notEqual(descriviEvento("mai.visto"), "");
});

test("il colore tocca a pochi, e la cancellazione è fra quelli", () => {
  assert.equal(tonoEvento("patient.erased"), "grave");
  assert.equal(tonoEvento("consent.revoked"), "grave");
  assert.equal(tonoEvento("lab.validated"), "clinico");
  assert.equal(tonoEvento("prescription.created"), "clinico");

  // Il grosso del traffico resta neutro: se tutto risalta, niente risalta.
  assert.equal(tonoEvento("lead.created"), "neutro");
  assert.equal(tonoEvento("credit.used"), "neutro");
  assert.equal(tonoEvento("mai.visto"), "neutro");
});

test("l'ora è quella di Roma, non quella del server", () => {
  // Mezzogiorno UTC d'estate a Roma sono le 14.
  assert.equal(oraDi("2026-07-01T12:00:00Z"), "14:00");
  // D'inverno, le 13.
  assert.equal(oraDi("2026-01-15T12:00:00Z"), "13:00");
});

test("una data illeggibile non rompe la riga", () => {
  assert.equal(oraDi("boh"), "--:--");
  assert.equal(attesaDa("boh"), "");
});

test("l'attesa cambia unità man mano che cresce", () => {
  const adesso = Date.parse("2026-09-07T12:00:00Z");
  const fa = (ms: number) => new Date(adesso - ms).toISOString();

  assert.equal(attesaDa(fa(0), adesso), "0 min");
  assert.equal(attesaDa(fa(12 * 60_000), adesso), "12 min");
  assert.equal(attesaDa(fa(3 * 3_600_000), adesso), "3 h");

  // Sotto le 48 ore restano ore: «2 g» perderebbe la differenza fra
  // ieri sera e l'altroieri mattina, che in una coda è tutta la storia.
  assert.equal(attesaDa(fa(47 * 3_600_000), adesso), "47 h");
  assert.equal(attesaDa(fa(72 * 3_600_000), adesso), "3 g");
});

/*
 * Un orologio indietro rispetto al database produrrebbe un'attesa
 * negativa, e «-4 min» in una coda si legge come un difetto del
 * sistema. Zero è falso ma innocuo.
 */
test("un istante nel futuro non produce un'attesa negativa", () => {
  const adesso = Date.parse("2026-09-07T12:00:00Z");
  assert.equal(attesaDa(new Date(adesso + 5 * 60_000).toISOString(), adesso), "0 min");
});
