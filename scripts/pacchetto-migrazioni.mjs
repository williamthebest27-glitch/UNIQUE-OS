/**
 * Prepara le migrazioni da incollare nella SQL Editor di Supabase.
 *
 * Applicarne quattordici una alla volta è il modo migliore per saltarne
 * una, o per accorgersi al decimo tentativo che il terzo non era andato a
 * buon fine. Questo script le unisce in un file solo, **dopo** averlo
 * eseguito per intero su un Postgres vero: se il pacchetto arriva in
 * fondo, non ti consegna qualcosa che si rompe a metà.
 *
 * Il file esce in `supabase/locale/`, che Git ignora. Non è un segreto —
 * sono le stesse migrazioni del repository — ma è una copia di lavoro, e
 * le copie di lavoro non si committano.
 *
 *   npm run db:pacchetto              tutte le migrazioni
 *   npm run db:pacchetto -- --da 10   solo dalla decima in poi
 *
 * Il secondo modo serve a un database già in piedi: rieseguire le prime
 * nove su uno schema esistente fallirebbe, perché `create table` non è
 * un'operazione ripetibile.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, "..");
const MIGRAZIONI = join(RADICE, "supabase", "migrations");
const USCITA = join(RADICE, "supabase", "locale", "migrazioni-da-applicare.sql");

const argomenti = process.argv.slice(2);
const indiceDa = argomenti.indexOf("--da");
const da = indiceDa >= 0 ? Number(argomenti[indiceDa + 1]) : 1;

if (!Number.isInteger(da) || da < 1) {
  console.error("--da vuole il numero della prima migrazione da includere (1 è la prima).");
  process.exit(1);
}

const tutte = readdirSync(MIGRAZIONI).filter((f) => f.endsWith(".sql")).sort();
const scelte = tutte.slice(da - 1);

if (scelte.length === 0) {
  console.error(`Non ci sono migrazioni dalla ${da} in poi: ce ne sono ${tutte.length}.`);
  process.exit(1);
}

/*
 * La prova.
 *
 * Le migrazioni precedenti a quelle scelte vanno comunque applicate —
 * altrimenti si proverebbe il pacchetto su un database vuoto, che non è
 * la situazione di chi lo userà. Il pacchetto invece si esegue **in una
 * transazione sola**, come farà la SQL Editor: è lì che si scopre se due
 * migrazioni scritte per essere separate non reggono insieme.
 */
const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(readFileSync(join(QUI, "supabase-preambolo.sql"), "utf8"));

for (const f of tutte.slice(0, da - 1)) {
  await db.exec("begin;\n" + readFileSync(join(MIGRAZIONI, f), "utf8") + "\ncommit;");
}

/*
 * L'avvertenza sullo storage.
 *
 * La seconda migrazione crea due policy su `storage.objects`, che in
 * alcuni progetti Supabase non è modificabile via SQL. In un pacchetto
 * unico quel fallimento porta indietro tutto: chi lo incolla deve sapere
 * cosa fare invece di ritrovarsi con uno schema vuoto e un errore
 * incomprensibile.
 */
const CON_STORAGE = scelte.some((f) => f.includes("rls_policies"));

const notaStorage = CON_STORAGE
  ? `--
-- SE SI FERMA SU storage.objects
--   In alcuni progetti quella tabella non è modificabile via SQL. Il
--   pacchetto torna indietro per intero: applica allora le migrazioni una
--   alla volta dalla cartella supabase/migrations/, salta le due policy
--   dello storage e creale da Storage → patient-documents → Policies con
--   le stesse espressioni che trovi in fondo a quel file.
`
  : "";

const intestazione = `-- ═══════════════════════════════════════════════════════════════════
-- UNIQUE OS — migrazioni da applicare
--
-- Generato da \`npm run db:pacchetto\`. Contiene ${scelte.length} migrazioni,
-- dalla ${scelte[0]}
-- alla ${scelte.at(-1)}.
--
-- COME SI USA
--   1. Supabase → SQL Editor → New query.
--   2. Incolla tutto questo file.
--   3. Run. Una sola volta: le migrazioni non sono ripetibili.
--
-- Se qualcosa fallisce, la transazione torna indietro per intero e lo
-- schema resta com'era. È il motivo per cui si incolla tutto insieme
-- invece che un pezzo alla volta.
${notaStorage}--
-- L'ultima riga di questo file è un controllo: se al termine vedi una
-- tabella con dei numeri, è andata.
-- ═══════════════════════════════════════════════════════════════════

begin;
`;

const corpo = scelte
  .map((f) => {
    const sql = readFileSync(join(MIGRAZIONI, f), "utf8");
    return `\n-- ───────────────────────────────────────────────────────────────\n-- ${f}\n-- ───────────────────────────────────────────────────────────────\n\n${sql}`;
  })
  .join("\n");

// Dopo il commit, un controllo che si legge a colpo d'occhio: la SQL
// Editor mostra il risultato dell'ultima istruzione, e questa è l'unica
// che restituisce righe.
const controllo = `
-- ───────────────────────────────────────────────────────────────
-- È andata?
-- ───────────────────────────────────────────────────────────────
select
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r')                       as tabelle,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v')                       as viste,
  (select count(*)::int from pg_policy)                                   as policy,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as tabelle_senza_rls;
`;

const pacchetto = `${intestazione}${corpo}\ncommit;\n${controllo}`;

try {
  await db.exec(pacchetto);
} catch (errore) {
  console.log("✘ Il pacchetto non regge in una transazione sola.");
  console.log(`   ${errore.message}`);
  if (errore.hint) console.log(`   suggerimento: ${errore.hint}`);
  console.log("\nNessun file scritto: meglio niente che qualcosa che si rompe a metà.");
  process.exit(1);
}

const [conteggi] = (
  await db.query(`
  select
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r') as tabelle,
    (select count(*)::int from pg_policy) as policy`)
).rows;

mkdirSync(dirname(USCITA), { recursive: true });
writeFileSync(USCITA, pacchetto, "utf8");

await db.close();

const kb = Math.round(pacchetto.length / 1024);

console.log(`✔ ${scelte.length} migrazioni provate in una transazione sola su Postgres.`);
console.log(`  Alla fine: ${conteggi.tabelle} tabelle, ${conteggi.policy} policy.`);
console.log(`\nPacchetto scritto (${kb} KB):`);
console.log(`  supabase/locale/migrazioni-da-applicare.sql`);
console.log(`\nIncollalo nella SQL Editor di Supabase ed eseguilo una volta sola.`);
