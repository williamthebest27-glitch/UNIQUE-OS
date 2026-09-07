/**
 * Esegue tutte le migrazioni su un Postgres vero, prima di Supabase.
 *
 * pglite è Postgres compilato in WebAssembly: gira in Node, senza Docker
 * e senza server. Ogni migrazione viene applicata in transazione, nello
 * stesso ordine in cui la si incolla nella SQL Console, e alla fine si
 * controllano le tre cose che in clinica non possono sbagliare: che ogni
 * tabella abbia la Row Level Security accesa, che abbia almeno una policy,
 * e che ogni vista sia `security_invoker`.
 *
 * Perché esiste: una migrazione che fallisce a metà in Supabase lascia lo
 * schema in uno stato incerto. Meglio scoprirlo qui — per esempio che
 * `create or replace view` non sa rinominare né riordinare le colonne, e
 * che una vista va eliminata e ricreata.
 *
 *   npm run db:verifica          migrazioni + controlli
 *   npm run db:verifica -- seed  anche i dati dimostrativi
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, "..");
const MIGRAZIONI = join(RADICE, "supabase", "migrations");
const SUPABASE = join(RADICE, "supabase");

const conSeed = process.argv.includes("seed");
const EMAIL_PAZIENTE = "paziente.prova@esempio.it";
const EMAIL_PRO = "medico.prova@esempio.it";

const db = await PGlite.create({ extensions: { pgcrypto } });
const q = async (sql, params) => (await db.query(sql, params)).rows;

let uscita = 0;

await db.exec(readFileSync(join(QUI, "supabase-preambolo.sql"), "utf8"));

// ── Le migrazioni ───────────────────────────────────────────────────
const file = readdirSync(MIGRAZIONI).filter((f) => f.endsWith(".sql")).sort();

for (const f of file) {
  const t0 = Date.now();
  try {
    await db.exec("begin;\n" + readFileSync(join(MIGRAZIONI, f), "utf8") + "\ncommit;");
    console.log(`✔ ${f}  (${Date.now() - t0}ms)`);
  } catch (errore) {
    console.log(`✘ ${f}`);
    console.log(`   ${errore.message}`);
    if (errore.hint) console.log(`   suggerimento: ${errore.hint}`);
    try { await db.exec("rollback;"); } catch {}
    process.exit(1);
  }
}

// ── I seed dimostrativi ─────────────────────────────────────────────
if (conSeed) {
  console.log("");
  // Il trigger su auth.users crea il profilo, esattamente come in Supabase.
  await q("insert into auth.users (email) values ($1), ($2)", [EMAIL_PAZIENTE, EMAIL_PRO]);

  for (const nome of [
    "demo-paziente.sql",
    "demo-clinica.sql",
    "demo-marketing.sql",
    "demo-paziente-sezioni.sql",
  ]) {
    const sql = readFileSync(join(SUPABASE, nome), "utf8")
      .replaceAll("'INSERISCI-LA-TUA-EMAIL@esempio.it'", `'${EMAIL_PAZIENTE}'`)
      .replace(/v_pro_email(\s+)text(\s*):=(\s*)''/, `v_pro_email$1text$2:=$3'${EMAIL_PRO}'`);
    try {
      await db.exec("begin;\n" + sql + "\ncommit;");
      console.log(`✔ ${nome}`);
    } catch (errore) {
      console.log(`✘ ${nome}\n   ${errore.message}`);
      try { await db.exec("rollback;"); } catch {}
      process.exit(1);
    }
  }
}

// ── La segregazione dei ruoli ───────────────────────────────────────
/*
 * Che la Row Level Security sia accesa non dice che sia giusta.
 *
 * Qui si verifica la promessa che conta davvero: marketing e reception
 * non vedono dati sanitari. Serve il ruolo `authenticated` — con cui
 * Supabase esegue le query — perché il proprietario delle tabelle
 * scavalca la RLS e vedrebbe tutto anche se le policy fossero perfette.
 */
if (conSeed) {
  console.log("\n── segregazione dei ruoli ──");

  await db.exec("grant usage on schema public to authenticated");
  await db.exec(
    "grant select, insert, update, delete on all tables in schema public to authenticated",
  );
  await db.exec("grant execute on all functions in schema public to authenticated");

  const CLINICO = [
    ["misure cliniche", "select id from public.measurements"],
    ["documenti", "select id from public.documents"],
    ["note cliniche", "select id from public.clinical_notes"],
    ["punteggi", "select id from public.longevity_scores"],
    ["questionari", "select id from public.patient_assessments"],
    ["consensi", "select id from public.patient_consents"],
    // I fili amministrativi la reception li deve vedere: è chi risponde
    // di appuntamenti e fatture. Quelli clinici no, mai.
    [
      "messaggi clinici",
      `select m.id from public.messages m
         join public.message_threads t on t.id = m.thread_id
        where t.category = 'clinical'`,
    ],
  ];

  /*
   * Un controllo vale quanto i dati su cui gira.
   *
   * Una tabella vuota passa qualunque verifica di permessi: "la
   * reception non vede i questionari" sarebbe vero nel modo in cui è
   * vero che non vede una tabella che non esiste. Qui si pretende che
   * ogni query dell'elenco, eseguita **senza restrizioni**, trovi almeno
   * una riga — altrimenti il test dopo non prova niente.
   */
  const senzaRighe = [];
  for (const [nome, sql] of CLINICO) {
    if ((await q(sql)).length === 0) senzaRighe.push(nome);
  }
  if (senzaRighe.length > 0) {
    console.log(`✘ il controllo girerebbe a vuoto — nessuna riga in: ${senzaRighe.join(", ")}`);
    uscita = 1;
  }

  const comeRuolo = async (ruolo, email) => {
    const [{ id }] = await q("insert into auth.users (email) values ($1) returning id", [email]);
    await q("update public.profiles set role = $1 where id = $2", [ruolo, id]);
    await db.exec(`set request.jwt.claim.sub = '${id}'`);
    await db.exec("set role authenticated");

    const visti = [];
    for (const [nome, sql] of CLINICO) {
      try {
        if ((await q(sql)).length > 0) visti.push(nome);
      } catch {
        // Permesso negato è il comportamento giusto: niente da segnalare.
      }
    }

    await db.exec("reset role");

    if (visti.length === 0) {
      console.log(`✔ ${ruolo}: nessun dato sanitario`);
    } else {
      console.log(`✘ ${ruolo} vede dati sanitari: ${visti.join(", ")}`);
      uscita = 1;
    }
  };

  /*
   * Un paziente non vede l'altro.
   *
   * È lo scenario che conta più di tutti: cambiare un id in un URL o in
   * una chiamata. Nella Patient App gli id non compaiono, ma non è
   * quella la difesa — la difesa è che una riga di un altro paziente non
   * esiste per la sessione di questo, qualunque query si scriva.
   *
   * Il test crea un secondo paziente vuoto, entra come lui e prova a
   * leggere **tutto** senza filtri: se la Row Level Security regge, non
   * torna niente. Le stesse query, eseguite dal primo paziente, devono
   * invece restituire le sue righe — altrimenti staremmo festeggiando
   * un database che non risponde.
   */
  const PROPRI = [
    ["misure", "select id from public.measurements"],
    ["documenti", "select id from public.documents"],
    ["punteggi", "select id from public.longevity_scores"],
    ["questionari", "select id from public.patient_assessments"],
    ["messaggi", "select id from public.messages"],
    ["conversazioni", "select id from public.message_threads"],
    ["consensi", "select id from public.patient_consents"],
    ["crediti", "select id from public.credit_entries"],
    ["appuntamenti", "select id from public.appointments"],
  ];

  const comePaziente = async (profiloId) => {
    await db.exec(`set request.jwt.claim.sub = '${profiloId}'`);
    await db.exec("set role authenticated");
    const visti = [];
    for (const [nome, sql] of PROPRI) {
      try {
        if ((await q(sql)).length > 0) visti.push(nome);
      } catch {
        // Permesso negato: la riga non si vede, ed è quello che vogliamo.
      }
    }
    await db.exec("reset role");
    return visti;
  };

  const [primo] = await q(
    "select p.id, p.profile_id from public.patients p order by p.created_at limit 1",
  );

  if (!primo) {
    console.log("✘ nessun paziente dimostrativo: isolamento non verificabile");
    uscita = 1;
  } else {
    // Il secondo paziente: stesso ruolo, scheda diversa, nessun dato.
    const [{ id: altroProfilo }] = await q(
      "insert into auth.users (email) values ($1) returning id",
      ["verifica.paziente@esempio.it"],
    );
    await q("update public.profiles set role = 'patient' where id = $1", [altroProfilo]);
    await q("insert into public.patients (profile_id) values ($1)", [altroProfilo]);

    const suoi = await comePaziente(primo.profile_id);
    const altrui = await comePaziente(altroProfilo);

    if (suoi.length === 0) {
      console.log("✘ il paziente non vede nemmeno i propri dati: il test non prova nulla");
      uscita = 1;
    } else if (altrui.length > 0) {
      console.log(`✘ un paziente vede i dati di un altro: ${altrui.join(", ")}`);
      uscita = 1;
    } else {
      console.log(`✔ paziente: vede i propri dati (${suoi.length} tabelle), nessuno degli altri`);
    }
  }

  await comeRuolo("marketing", "verifica.marketing@esempio.it");
  await comeRuolo("reception", "verifica.reception@esempio.it");
}

// ── Le comunicazioni interne ────────────────────────────────────────
/*
 * La promessa: un medico non legge le comunicazioni dell'intera clinica.
 *
 * È la sola cosa che rende usabile uno strumento in cui si scrive di
 * persone. La difesa non è che l'interfaccia non mostri il pulsante — è
 * che una riga di una conversazione a cui non si partecipa non esiste
 * per quella sessione, qualunque query si scriva.
 *
 * Il secondo controllo è più sottile e vale quanto il primo: chiedere un
 * consulto **apre** la cartella allo specialista destinatario. È voluto —
 * un parere dato senza guardare gli esami vale quanto un'opinione al
 * telefono — ma va provato che si apra a lui e a nessun altro.
 */
if (conSeed) {
  console.log("\n── comunicazioni interne ──");

  const come = async (profilo, fn) => {
    await db.exec(`set request.jwt.claim.sub = '${profilo}'`);
    await db.exec("set role authenticated");
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  };

  const interno = async (email, reparto) => {
    const [{ id }] = await q("insert into auth.users (email) values ($1) returning id", [
      email,
    ]);
    await q("update public.profiles set role = 'professional', full_name = $2 where id = $1", [
      id,
      email.split("@")[0],
    ]);
    await q("insert into public.professionals (profile_id, discipline) values ($1, 'physician')", [
      id,
    ]);
    if (reparto) {
      await q(
        `insert into public.department_members (department_id, profile_id)
         select id, $2 from public.departments where slug = $1
         on conflict do nothing`,
        [reparto, id],
      );
    }
    return id;
  };

  const chiede = await interno("verifica.medicina@esempio.it", "medicina");
  const risponde = await interno("verifica.diagnostica@esempio.it", "diagnostica");
  const estraneo = await interno("verifica.estraneo@esempio.it", null);

  const controlli = [];
  const verifica = (nome, atteso, ottenuto) => {
    controlli.push({ nome, ok: atteso === ottenuto });
  };

  // ── Una comunicazione indirizzata a un reparto ──
  const [{ open_conversation: conv }] = await come(chiede, () =>
    q(`select public.open_conversation(
         'Verifica della segregazione', 'Prima riga.', 'department', 'normal',
         (select id from public.departments where slug = 'diagnostica'),
         null, '{}'::uuid[],
         array[(select id from public.departments where slug = 'diagnostica')],
         'info')`),
  );

  const vede = async (profilo) =>
    (
      await come(profilo, () =>
        q("select id from public.conversations where id = $1", [conv]),
      )
    ).length > 0;

  verifica("chi apre vede la propria comunicazione", true, await vede(chiede));
  verifica("il reparto destinatario la vede", true, await vede(risponde));
  verifica("chi non c'entra non la vede", false, await vede(estraneo));

  // Nemmeno i messaggi: la policy dei messaggi passa dalla stessa funzione.
  const righe = await come(estraneo, () =>
    q("select id from public.conversation_messages where conversation_id = $1", [conv]),
  );
  verifica("chi non c'entra non ne legge i messaggi", true, righe.length === 0);

  // ── Scrivere dove non si partecipa ──
  let respinto = false;
  try {
    await come(estraneo, () =>
      q("select public.post_message($1, 'Non dovrei riuscirci.')", [conv]),
    );
  } catch {
    respinto = true;
  }
  verifica("chi non c'entra non può scriverci", true, respinto);

  // ── Il consulto come motivo di cura ──
  const [paziente] = await q(
    "select id from public.patients order by created_at limit 1",
  );

  const cartella = async (profilo) =>
    (
      await come(profilo, () =>
        q("select id from public.patients where id = $1", [paziente.id]),
      )
    ).length > 0;

  verifica("prima del consulto lo specialista non vede la cartella", false, await cartella(risponde));

  // Chi chiede deve avere titolo sul paziente: lo si mette nel care team,
  // che è la strada normale, non una scorciatoia del test.
  await q(
    `insert into public.care_team_members (patient_id, professional_id)
     select $1, id from public.professionals where profile_id = $2
     on conflict do nothing`,
    [paziente.id, chiede],
  );

  const [{ request_consultation: consulto }] = await come(chiede, () =>
    q(
      `select public.request_consultation(
         $1,
         (select id from public.departments where slug = 'diagnostica'),
         'Verifica dell''accesso per consulto', null, 'normal', null, null)`,
      [paziente.id],
    ),
  );

  verifica("il consulto apre la cartella allo specialista", true, await cartella(risponde));
  verifica("e non la apre a nessun altro", false, await cartella(estraneo));

  /*
   * La macchina a stati, percorsa per intero.
   *
   * `advance_consultation` è la funzione più lunga della migrazione e
   * fa cinque cose in una transazione. Un corpo plpgsql viene analizzato
   * alla creazione ma non eseguito: un errore in un ramo che nessuno
   * percorre si scopre in produzione, il giorno in cui uno specialista
   * prova a rispondere.
   */
  const stato = async () =>
    (
      await q("select status from public.clinical_consultations where id = $1", [
        consulto,
      ])
    )[0]?.status;

  await come(risponde, () =>
    q("select public.advance_consultation($1, 'taken')", [consulto]),
  );
  verifica("prendere in carico porta a «taken»", "taken", await stato());

  await come(risponde, () =>
    q("select public.advance_consultation($1, 'answered', $2)", [
      consulto,
      "Nessuna controindicazione al carico progressivo.",
    ]),
  );
  verifica("rispondere porta a «answered»", "answered", await stato());

  const [{ count: quante }] = await q(
    `select count(*)::int from public.conversation_messages m
      join public.clinical_consultations k on k.conversation_id = m.conversation_id
     where k.id = $1`,
    [consulto],
  );
  verifica("la risposta resta collegata alla richiesta", true, quante >= 2);

  await come(chiede, () =>
    q("select public.advance_consultation($1, 'closed')", [consulto]),
  );
  verifica("chiudere porta a «closed»", "closed", await stato());

  let chiusoRespinge = false;
  try {
    await come(risponde, () =>
      q("select public.advance_consultation($1, 'taken')", [consulto]),
    );
  } catch {
    chiusoRespinge = true;
  }
  verifica("un consulto chiuso non si riapre di lato", true, chiusoRespinge);

  const falliti = controlli.filter((c) => !c.ok);
  for (const c of controlli.filter((c) => c.ok)) console.log(`✔ ${c.nome}`);
  for (const c of falliti) console.log(`✘ ${c.nome}`);
  if (falliti.length > 0) uscita = 1;
}

// ── I controlli che contano ─────────────────────────────────────────
console.log("\n── sicurezza dello schema ──");

const senzaRls = await q(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  order by 1`);

const senzaPolicy = await q(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  order by 1`);

// Una vista senza security_invoker gira con i permessi del proprietario e
// scavalca la RLS delle tabelle che legge: restituirebbe i dati di tutti.
const senzaInvoker = await q(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') <> 'true'
  order by 1`);

const esito = (etichetta, righe) => {
  if (righe.length === 0) {
    console.log(`✔ ${etichetta}: nessuna`);
  } else {
    console.log(`✘ ${etichetta}: ${righe.map((r) => r.relname).join(", ")}`);
    uscita = 1;
  }
};

esito("tabelle senza Row Level Security", senzaRls);
esito("tabelle con RLS ma senza policy", senzaPolicy);
esito("viste senza security_invoker", senzaInvoker);

const [totali] = await q(`
  select
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r') as tabelle,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='v') as viste,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public') as funzioni,
    (select count(*)::int from pg_policy) as policy,
    (select count(*)::int from pg_type t join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' and t.typtype='e') as enum`);

console.log(
  `\n${file.length} migrazioni · ${totali.tabelle} tabelle · ${totali.viste} viste · ` +
    `${totali.funzioni} funzioni · ${totali.policy} policy · ${totali.enum} enum`,
);

if (conSeed) {
  const [saldi] = await q("select * from public.credit_balances limit 1");
  console.log("saldi del paziente dimostrativo:", JSON.stringify(saldi));
}

process.exit(uscita);
