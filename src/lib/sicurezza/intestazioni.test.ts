import { test } from "node:test";
import assert from "node:assert/strict";
import { INTESTAZIONI_FISSE, origineDi, politicaContenuti } from "./intestazioni.ts";

const SUPA = "https://abcdefgh.supabase.co";

test("dell'URL di Supabase entra l'origine, non il percorso", () => {
  assert.equal(origineDi("https://abc.supabase.co/rest/v1"), "https://abc.supabase.co");
  assert.equal(origineDi("non-un-url"), null);
  assert.equal(origineDi(""), null);
});

test("il nonce finisce negli script e li governa", () => {
  const csp = politicaContenuti({ nonce: "XYZ123" });
  assert.match(csp, /script-src [^;]*'nonce-XYZ123'/);
  assert.match(csp, /script-src [^;]*'strict-dynamic'/);
});

/*
 * Il controllo che vale per tutti: `script-src` è la direttiva che
 * impedisce a un'iniezione di diventare esecuzione. Se un giorno
 * qualcuno ci mette `unsafe-inline` per far funzionare qualcosa in
 * fretta, questo test lo ferma prima del commit.
 */
test("gli script non ammettono mai codice in linea", () => {
  for (const sviluppo of [true, false]) {
    const csp = politicaContenuti({ nonce: "n", supabaseUrl: SUPA, sviluppo });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    assert.ok(scriptSrc, "script-src deve esistere");
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), `unsafe-inline con sviluppo=${sviluppo}`);
  }
});

test("«unsafe-eval» esiste solo in sviluppo", () => {
  assert.match(politicaContenuti({ nonce: "n", sviluppo: true }), /'unsafe-eval'/);
  assert.doesNotMatch(politicaContenuti({ nonce: "n", sviluppo: false }), /'unsafe-eval'/);
  // Il valore predefinito è la produzione: dimenticare l'argomento non
  // deve allentare niente.
  assert.doesNotMatch(politicaContenuti({ nonce: "n" }), /'unsafe-eval'/);
});

/*
 * Gli stili ammettono `unsafe-inline` **senza nonce**, ed è deliberato:
 * con un nonce presente il browser ignora `unsafe-inline`, e React e
 * GSAP — che scrivono `style="…"` a ogni fotogramma — restano bloccati.
 * Se qualcuno rimettesse il nonce qui, l'applicazione si fermerebbe
 * senza un errore: questo test è il posto in cui se ne accorge.
 */
test("gli stili in linea passano, e senza nonce", () => {
  const styleSrc = politicaContenuti({ nonce: "n" })
    .split("; ")
    .find((d) => d.startsWith("style-src"));

  assert.ok(styleSrc?.includes("'unsafe-inline'"));
  assert.ok(!styleSrc!.includes("nonce-"), "un nonce qui disattiverebbe unsafe-inline");
});

test("il realtime passa: il websocket è scritto, non dedotto", () => {
  const csp = politicaContenuti({ nonce: "n", supabaseUrl: SUPA });
  const connect = csp.split("; ").find((d) => d.startsWith("connect-src"));

  assert.ok(connect?.includes("https://abcdefgh.supabase.co"));
  assert.ok(connect!.includes("wss://abcdefgh.supabase.co"));
});

test("senza Supabase la policy resta valida e chiusa su sé stessa", () => {
  const csp = politicaContenuti({ nonce: "n" });
  assert.match(csp, /connect-src 'self'/);
  assert.ok(!csp.includes("undefined"));
  assert.ok(!csp.includes("null"));
});

test("le direttive che chiudono le porte ci sono tutte", () => {
  const csp = politicaContenuti({ nonce: "n", supabaseUrl: SUPA });
  for (const attesa of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ]) {
    assert.ok(csp.includes(attesa), attesa);
  }
});

test("nessuna direttiva contiene un carattere che ne aprirebbe un'altra", () => {
  // Un nonce arriva da `crypto.randomUUID()` in base64, ma la funzione
  // non lo verifica: se un giorno arrivasse da altrove, un punto e
  // virgola dentro il valore aggiungerebbe direttive a piacere.
  const csp = politicaContenuti({ nonce: "n", supabaseUrl: SUPA });
  assert.equal(csp.split("; ").length, csp.split(";").length);
});

test("HSTS c'è, dura, e non si iscrive da sé alla lista di precarico", () => {
  const hsts = INTESTAZIONI_FISSE.find(([k]) => k === "Strict-Transport-Security")?.[1];
  assert.ok(hsts);
  assert.match(hsts, /max-age=\d{8,}/);
  assert.ok(hsts.includes("includeSubDomains"));
  assert.ok(!hsts.includes("preload"), "iscriversi al precarico non lo decide una costante");
});

test("il clickjacking è chiuso due volte, e va bene così", () => {
  const chiavi = INTESTAZIONI_FISSE.map(([k]) => k);
  assert.ok(chiavi.includes("X-Frame-Options"));
  assert.match(politicaContenuti({ nonce: "n" }), /frame-ancestors 'none'/);
});

/*
 * Il websocket del ricaricamento a caldo. `'self'` non copre `ws:` — lo
 * schema è diverso da quello della pagina — e senza questa voce
 * `next dev` perde l'aggiornamento automatico senza dirlo.
 *
 * In produzione non deve esserci: un `ws://localhost` in una policy di
 * produzione è una porta aperta su niente, ma è comunque una porta che
 * qualcuno un giorno legge e non capisce.
 */
test("il ricaricamento a caldo passa in sviluppo e sparisce in produzione", () => {
  const dev = politicaContenuti({ nonce: "n", supabaseUrl: SUPA, sviluppo: true });
  assert.match(dev, /connect-src [^;]*ws:\/\/localhost:\*/);

  const prod = politicaContenuti({ nonce: "n", supabaseUrl: SUPA, sviluppo: false });
  assert.ok(!prod.includes("localhost"), "nessun localhost in produzione");
  assert.ok(!prod.includes("127.0.0.1"));
});
