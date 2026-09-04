import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOTIVI_LINK,
  messaggioPerErrore,
  messaggioPerPassword,
  motivoLink,
} from "./auth-errors.ts";
import { PASSWORD_MINIMA } from "./auth-state.ts";

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

/* ── Accesso con password ─────────────────────────────────────────── */

test("credenziali sbagliate non dicono quale delle due", () => {
  for (const [c, t] of [
    ["invalid_credentials", ""],
    ["", "Invalid login credentials"],
  ] as const) {
    const { messaggio, codice } = messaggioPerPassword(c, t);
    assert.equal(codice, "credenziali");
    // Né "utente inesistente" né "password errata": la stessa frase per
    // entrambi, o si scoprirebbe chi ha un account in una clinica.
    assert.doesNotMatch(messaggio, /esist|registrat|utente/i);
  }
});

test("una password troppo debole dice quanti caratteri servono", () => {
  const { messaggio, codice } = messaggioPerPassword("weak_password", "");
  assert.equal(codice, "debole");
  assert.match(messaggio, new RegExp(String(PASSWORD_MINIMA)));
});

test("i tentativi ravvicinati si distinguono da un guasto", () => {
  const { messaggio, codice } = messaggioPerPassword("over_request_rate_limit", "");
  assert.equal(codice, "limite-tentativi");
  assert.match(messaggio, /protezione/i);
});

test("la sessione scaduta manda a chiedere un altro link", () => {
  assert.equal(messaggioPerPassword("session_not_found", "").codice, "sessione");
});

test("un errore sconosciuto non parla di link non spediti", () => {
  const { messaggio, codice } = messaggioPerPassword("qualcosa_di_nuovo", "boom");
  assert.equal(codice, "accesso");
  assert.doesNotMatch(messaggio, /link/i);
});

test("nessun messaggio di password perde il gergo di Supabase", () => {
  for (const [c, t] of [
    ["invalid_credentials", "Invalid login credentials"],
    ["email_not_confirmed", "Email not confirmed"],
    ["weak_password", "Password should be at least 6 characters"],
    ["same_password", "New password should be different from the old password"],
  ] as const) {
    assert.doesNotMatch(messaggioPerPassword(c, t).messaggio, /[a-z]+_[a-z]+/i);
  }
});
