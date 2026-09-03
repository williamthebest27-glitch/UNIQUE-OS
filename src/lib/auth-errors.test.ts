import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTIVI_LINK, messaggioPerErrore, motivoLink } from "./auth-errors.ts";

test("il limite di invio si riconosce dal codice e dal testo", () => {
  for (const [c, t] of [
    ["over_email_send_rate_limit", ""],
    ["", "email rate limit exceeded"],
    ["", "For security purposes, you can only request this after 51 seconds"],
    ["", "Too Many Requests"],
  ] as const) {
    assert.equal(messaggioPerErrore(c, t).codice, "limite-email", `${c} / ${t}`);
  }
});

test("un fallimento di spedizione si distingue dal resto", () => {
  assert.equal(messaggioPerErrore(null, "Error sending magic link email").codice, "smtp");
  assert.equal(messaggioPerErrore("email_provider_disabled", "").codice, "smtp");
});

test("l'indirizzo di ritorno non autorizzato ha il suo messaggio", () => {
  assert.equal(messaggioPerErrore(null, "Redirect URL not allowed").codice, "ritorno");
});

test("un indirizzo non registrato resta indistinguibile", () => {
  // È la proprietà che protegge i pazienti: nessuno deve poter scoprire
  // chi è in cura guardando la risposta del form.
  const nonRegistrato = messaggioPerErrore("otp_disabled", "Signups not allowed for otp");
  const sconosciuto = messaggioPerErrore(null, "qualcosa di imprevisto");

  assert.equal(nonRegistrato.codice, "invio");
  assert.deepEqual(nonRegistrato, sconosciuto);
  assert.doesNotMatch(nonRegistrato.messaggio, /registrat|esiste|sconosciut|trovat/i);
});

test("senza errore riconoscibile si resta sul generico", () => {
  assert.equal(messaggioPerErrore(undefined, undefined).codice, "invio");
  assert.equal(messaggioPerErrore("", "").codice, "invio");
});

test("nessun messaggio riporta il testo originale in inglese", () => {
  // Quello finisce nei log del server, non davanti al paziente.
  for (const [c, t] of [
    ["over_email_send_rate_limit", "email rate limit exceeded"],
    ["otp_disabled", "Signups not allowed for otp"],
    [null, "Error sending magic link email"],
  ] as const) {
    const { messaggio } = messaggioPerErrore(c, t);
    assert.doesNotMatch(messaggio, /[a-z]+_[a-z]+|not allowed|rate limit/i);
  }
});

test("i motivi del link hanno un ripiego", () => {
  assert.equal(motivoLink("scaduto"), MOTIVI_LINK.scaduto);
  assert.equal(motivoLink("mancante"), MOTIVI_LINK.mancante);
  assert.equal(motivoLink("valore-inventato"), MOTIVI_LINK.link);
  assert.equal(motivoLink(null), MOTIVI_LINK.link);
});
