import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appUrl,
  inDimostrazione,
  isSupabaseConfigured,
  modalitaDimostrativaAmmessa,
} from "./config.ts";

/**
 * L'origine dei link di accesso.
 *
 * `appUrl` legge l'ambiente a ogni chiamata, quindi basta impostarlo
 * attorno alla chiamata e rimetterlo com'era subito dopo.
 */
const CHIAVI = ["NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

function con(ambiente: Partial<Record<(typeof CHIAVI)[number], string>>): string {
  const precedente: Record<string, string | undefined> = {};
  for (const k of CHIAVI) {
    precedente[k] = process.env[k];
    const v = ambiente[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return appUrl();
  } finally {
    for (const k of CHIAVI) {
      const v = precedente[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("la variabile esplicita vince su tutto", () => {
  assert.equal(
    con({
      NEXT_PUBLIC_APP_URL: "https://unique.example.it",
      VERCEL_PROJECT_PRODUCTION_URL: "altro.vercel.app",
    }),
    "https://unique.example.it",
  );
});

test("la barra finale non si somma a quella del percorso", () => {
  const url = con({ NEXT_PUBLIC_APP_URL: "https://unique.example.it/" });
  assert.equal(url, "https://unique.example.it");
  assert.equal(`${url}/auth/callback`, "https://unique.example.it/auth/callback");
});

test("su Vercel senza variabile si usa il dominio di produzione", () => {
  assert.equal(
    con({
      VERCEL_PROJECT_PRODUCTION_URL: "unique-os-three.vercel.app",
      VERCEL_URL: "deploy-abc.vercel.app",
    }),
    "https://unique-os-three.vercel.app",
  );
});

test("in anteprima si ripiega sull'URL del deploy", () => {
  assert.equal(con({ VERCEL_URL: "deploy-abc.vercel.app" }), "https://deploy-abc.vercel.app");
});

test("in locale resta localhost", () => {
  assert.equal(con({}), "http://localhost:3000");
});

test("un valore già completo di protocollo non viene raddoppiato", () => {
  assert.equal(con({ VERCEL_URL: "https://deploy-abc.vercel.app" }), "https://deploy-abc.vercel.app");
});

/* ── La modalità dimostrativa non deve esistere in produzione ────── */

/**
 * Perché questi due test valgono più della riga che verificano.
 *
 * La modalità dimostrativa nasce come comodità di sviluppo e diventa un
 * problema di sicurezza nel momento in cui raggiunge un ambiente
 * pubblico: senza configurazione l'applicazione serviva un profilo
 * paziente finto **a chiunque**, con il proxy che lasciava passare tutto.
 * Il guasto non aveva sintomi — il sito funzionava — ed è il genere di
 * cosa che si scopre da fuori.
 *
 * `NODE_ENV` è di sola lettura nei tipi di Node, ma resta una proprietà
 * di un oggetto: si scrive con `Reflect.set` e si rimette com'era.
 */
function conAmbiente<T>(valore: string | undefined, fn: () => T): T {
  const precedente = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", valore);
  try {
    return fn();
  } finally {
    Reflect.set(process.env, "NODE_ENV", precedente);
  }
}

test("in produzione la modalità dimostrativa non è ammessa", () => {
  assert.equal(conAmbiente("production", modalitaDimostrativaAmmessa), false);
});

test("in sviluppo e nei test lo è", () => {
  assert.equal(conAmbiente("development", modalitaDimostrativaAmmessa), true);
  assert.equal(conAmbiente("test", modalitaDimostrativaAmmessa), true);
});

test("senza chiavi e in produzione non si finisce in dimostrazione", () => {
  // Le chiavi sono lette all'import del modulo e qui sono vuote: è
  // esattamente lo scenario del deploy senza variabili d'ambiente.
  assert.equal(isSupabaseConfigured(), false);
  assert.equal(conAmbiente("production", inDimostrazione), false);
  assert.equal(conAmbiente("development", inDimostrazione), true);
});
