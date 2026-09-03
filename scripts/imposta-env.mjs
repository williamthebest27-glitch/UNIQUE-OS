/**
 * Collega l'applicazione al progetto Supabase.
 *
 * Chiede l'URL e la chiave pubblica, li scrive in `.env.local` e poi
 * verifica sul serio: interroga il database e controlla che la Row Level
 * Security stia facendo il suo mestiere. Meglio scoprire qui che la chiave
 * è quella sbagliata, invece che davanti a una pagina vuota.
 *
 * Le chiavi restano sul tuo computer: nessuno le legge, non passano da
 * nessuna parte se non dal tuo progetto Supabase.
 *
 *   npm run env:collega
 */
import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(RADICE, ".env.local");
const ESEMPIO = join(RADICE, ".env.example");

const rl = createInterface({ input: process.stdin, output: process.stdout });

/**
 * Legge una riga, dalla tastiera o da una pipe.
 *
 * `rl.question` da sola non basta: quando lo script è alimentato da una
 * pipe, l'input finisce prima che la seconda domanda venga posta, la
 * risposta non arriva mai e il processo resta fermo senza spiegare perché.
 * Qui le righe si accumulano appena arrivano, e la domanda o ne trova una
 * pronta o aspetta la prossima — senza mai restare appesa.
 */
const arrivate = [];
let attesa = null;
let chiuso = false;

rl.on("line", (riga) => {
  if (attesa) {
    const risolvi = attesa;
    attesa = null;
    risolvi(riga);
  } else {
    arrivate.push(riga);
  }
});

rl.on("close", () => {
  chiuso = true;
  if (attesa) {
    const risolvi = attesa;
    attesa = null;
    risolvi("");
  }
});

const domanda = async (testo) => {
  process.stdout.write(testo);
  if (arrivate.length > 0) {
    const riga = arrivate.shift();
    process.stdout.write(riga + "\n");
    return riga;
  }
  if (chiuso) {
    process.stdout.write("\n");
    return "";
  }
  return new Promise((res) => (attesa = res));
};

// ── Il file di partenza ─────────────────────────────────────────────
let testo = existsSync(FILE)
  ? readFileSync(FILE, "utf8")
  : existsSync(ESEMPIO)
    ? readFileSync(ESEMPIO, "utf8")
    : "";

const leggi = (chiave) => {
  const m = testo.match(new RegExp(`^${chiave}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
};

const scrivi = (chiave, valore) => {
  const riga = `${chiave}=${valore}`;
  testo = new RegExp(`^${chiave}=.*$`, "m").test(testo)
    ? testo.replace(new RegExp(`^${chiave}=.*$`, "m"), riga)
    : `${testo.replace(/\n*$/, "")}\n${riga}\n`;
};

console.log("\nDove trovare i valori: Supabase → Project Settings → API.");
console.log("Invio senza scrivere nulla lascia il valore che c'è già.\n");

// ── URL ─────────────────────────────────────────────────────────────
const urlAttuale = leggi("NEXT_PUBLIC_SUPABASE_URL");
const url =
  (await domanda(`Project URL${urlAttuale ? ` [${urlAttuale}]` : ""}: `)).trim() || urlAttuale;

if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
  console.log(`\n✘ L'URL non ha la forma attesa: https://xxxxxxxx.supabase.co`);
  console.log(`  Ricevuto: ${url || "(vuoto)"}`);
  rl.close();
  process.exit(1);
}

// ── Chiave pubblica ─────────────────────────────────────────────────
/*
 * Supabase ha due generazioni di chiavi. I progetti nuovi mostrano una
 * "Publishable key" che comincia per sb_publishable_; quelli più vecchi
 * la "anon public", che è un JWT e comincia per eyJ. Vanno bene entrambe:
 * sono pubbliche per definizione e finiscono nel browser. A proteggere i
 * dati non è la chiave, è la Row Level Security.
 *
 * Quella da NON mettere qui è la secret / service_role: scavalca la RLS.
 */
const chiaveAttuale = leggi("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const etichetta = chiaveAttuale ? ` [impostata, ${chiaveAttuale.length} caratteri]` : "";
const chiave =
  (await domanda(`Publishable key (o anon public)${etichetta}: `)).trim() || chiaveAttuale;

rl.close();

if (!chiave) {
  console.log("\n✘ Senza chiave l'applicazione resta in modalità dimostrativa.");
  process.exit(1);
}

if (/^sb_secret_/i.test(chiave) || /service_role/i.test(chiave)) {
  console.log("\n✘ Questa è la chiave segreta: scavalca la Row Level Security e non va mai");
  console.log("  nel browser. Serve la Publishable key (sb_publishable_…) o la anon public (eyJ…).");
  process.exit(1);
}

if (!/^(sb_publishable_|eyJ)/.test(chiave)) {
  console.log("\n⚠ La chiave non comincia né per sb_publishable_ né per eyJ. Provo lo stesso.");
}

// ── Prova sul campo ─────────────────────────────────────────────────
console.log("\nProvo il collegamento…");

const intestazioni = { apikey: chiave, Authorization: `Bearer ${chiave}` };
let esito = 0;

try {
  // Una tabella protetta: da anonimi deve rispondere, e rispondere vuoto.
  const r = await fetch(`${url}/rest/v1/patients?select=id&limit=1`, { headers: intestazioni });
  const corpo = await r.text();

  if (r.status === 401 || r.status === 403) {
    console.log(`✘ La chiave non è accettata dal progetto (HTTP ${r.status}).`);
    console.log("  Controlla di aver copiato la chiave di QUESTO progetto, per intero.");
    esito = 1;
  } else if (r.status === 404) {
    console.log("✘ Il progetto risponde, ma la tabella `patients` non esiste.");
    console.log("  Mancano le migrazioni: vedi docs/collegare-supabase.md, punto 2.");
    esito = 1;
  } else if (!r.ok) {
    console.log(`✘ Il progetto risponde HTTP ${r.status}: ${corpo.slice(0, 200)}`);
    esito = 1;
  } else if (corpo.trim() === "[]") {
    console.log("✔ Collegato, e la Row Level Security funziona: da anonimo non si vede nulla.");
  } else {
    console.log("⚠ Collegato, ma da anonimo si vedono già delle righe.");
    console.log("  La Row Level Security su `patients` va controllata prima di inserire dati veri.");
    esito = 1;
  }
} catch (errore) {
  console.log(`✘ Il progetto non risponde: ${errore.message}`);
  console.log("  Controlla l'URL e la connessione.");
  esito = 1;
}

if (esito !== 0) process.exit(esito);

// ── Si scrive solo quando ha funzionato ─────────────────────────────
scrivi("NEXT_PUBLIC_SUPABASE_URL", url);
scrivi("NEXT_PUBLIC_SUPABASE_ANON_KEY", chiave);
if (!leggi("NEXT_PUBLIC_APP_URL")) scrivi("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

writeFileSync(FILE, testo);

console.log("\n✔ Scritto in .env.local");
console.log("\nOra riavvia il server: Ctrl+C e poi  npm run dev");
console.log("Il badge «Modalità dimostrativa» deve sparire.\n");
