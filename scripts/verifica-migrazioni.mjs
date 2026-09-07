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

  /*
   * ── La timeline non è una scorciatoia ──────────────────────────
   *
   * `patient_timeline` unisce dieci tabelle, fra cui le conversazioni
   * interne. È `security_invoker`, quindi ogni pezzo della union porta
   * con sé la Row Level Security della tabella da cui viene — ma è
   * esattamente il genere di garanzia che si dà per scontata e che, se
   * saltasse, farebbe leggere al paziente il consulto in cui si discute
   * di lui. Una riga in questo file costa meno di quella telefonata.
   */
  const categorie = async (profilo, paziente) =>
    new Set(
      (
        await come(profilo, () =>
          q("select distinct category from public.patient_timeline where patient_id = $1", [
            paziente,
          ]),
        )
      ).map((r) => r.category),
    );

  const dalMedico = await categorie(chiede, paziente.id);
  const [{ profile_id: suoProfilo }] = await q(
    "select profile_id from public.patients where id = $1",
    [paziente.id],
  );
  const dalPaziente = await categorie(suoProfilo, paziente.id);

  verifica(
    "il medico vede le comunicazioni nella timeline",
    true,
    dalMedico.has("comunicazioni"),
  );
  verifica(
    "la timeline del medico ha più di una categoria",
    true,
    dalMedico.size > 1,
  );

  /*
   * Il paziente una riga «comunicazioni» ce l'ha, ed è giusta: sono i
   * *suoi* fili con la clinica. Quello che non deve esserci è la
   * conversazione interna, e si controlla per titolo — è l'unico modo di
   * distinguerle, visto che condividono la categoria.
   */
  const interneAlPaziente = await come(suoProfilo, () =>
    q(
      `select count(*)::int as n from public.patient_timeline
        where patient_id = $1 and kind in ('internal', 'consultation')`,
      [paziente.id],
    ),
  );
  verifica(
    "il paziente non vede le comunicazioni interne che lo riguardano",
    0,
    interneAlPaziente[0]?.n ?? 0,
  );

  const interneAlMedico = await come(chiede, () =>
    q(
      `select count(*)::int as n from public.patient_timeline
        where patient_id = $1 and kind in ('internal', 'consultation')`,
      [paziente.id],
    ),
  );
  verifica(
    "il medico che partecipa le vede",
    true,
    (interneAlMedico[0]?.n ?? 0) > 0,
  );

  /*
   * ── La terapia ─────────────────────────────────────────────────
   *
   * Due promesse, e la seconda è quella che rende la funzionalità
   * utilizzabile: **prescrivere è un atto medico, somministrare no.**
   * Un infermiere deve poter registrare cosa ha dato e non deve poter
   * cambiare la dose. Senza questo controllo la distinzione resterebbe
   * una convenzione dell'interfaccia.
   */
  const [{ prescribe: ricetta }] = await come(chiede, () =>
    q(
      `select public.prescribe(
         $1, 'Ramipril', '5 mg', 'Una compressa al mattino',
         'oral'::medication_route, array['08:00'::time], current_date, null, null)`,
      [paziente.id],
    ),
  );

  const dosi = await q(
    "select count(*)::int as n from public.medication_administrations where prescription_id = $1",
    [ricetta],
  );
  verifica("prescrivere genera le dosi dei prossimi giorni", true, (dosi[0]?.n ?? 0) > 0);

  // L'infermiere: fuori dal care team non vede niente, dentro somministra.
  const infermiere = await interno("verifica.infermiere@esempio.it", "infermieristica");
  await q("update public.professionals set discipline = 'nurse' where profile_id = $1", [
    infermiere,
  ]);
  await q(
    `insert into public.care_team_members (patient_id, professional_id)
     select $1, id from public.professionals where profile_id = $2
     on conflict do nothing`,
    [paziente.id, infermiere],
  );

  let prescriveInfermiere = false;
  try {
    await come(infermiere, () =>
      q(
        `select public.prescribe(
           $1, 'Non dovrei', '1 cp', 'ogni tanto',
           'oral'::medication_route, '{}'::time[], current_date, null, null)`,
        [paziente.id],
      ),
    );
    prescriveInfermiere = true;
  } catch {
    // Rifiutato: è il comportamento giusto.
  }
  verifica("un infermiere non può prescrivere", false, prescriveInfermiere);

  const [prima] = await q(
    "select id from public.medication_administrations where prescription_id = $1 order by scheduled_at limit 1",
    [ricetta],
  );

  await come(infermiere, () =>
    q("select public.record_administration($1, 'given')", [prima.id]),
  );
  const [dopo] = await q(
    "select status::text, given_at is not null as segnata from public.medication_administrations where id = $1",
    [prima.id],
  );
  verifica("un infermiere può somministrare", "given", dopo.status);
  verifica("l'ora del gesto la mette il database", true, dopo.segnata);

  // Una dose non data senza motivo non si registra.
  const [seconda] = await q(
    "select id from public.medication_administrations where prescription_id = $1 and status = 'due' limit 1",
    [ricetta],
  );

  let senzaMotivo = false;
  try {
    await come(infermiere, () =>
      q("select public.record_administration($1, 'refused')", [seconda.id]),
    );
    senzaMotivo = true;
  } catch {
    // Rifiutato: il motivo è obbligatorio, ed è il punto.
  }
  verifica("un rifiuto senza motivo viene respinto", false, senzaMotivo);

  // Sospendere toglie le dosi future e lascia quelle passate.
  await come(chiede, () =>
    q("select public.set_prescription_status($1, 'suspended', 'Tosse persistente.')", [
      ricetta,
    ]),
  );
  const [residue] = await q(
    `select
       count(*) filter (where status = 'due' and scheduled_at > now())::int as future,
       count(*) filter (where status = 'given')::int as fatte
     from public.medication_administrations where prescription_id = $1`,
    [ricetta],
  );
  verifica("sospendere toglie le dosi future", 0, residue.future);
  verifica("e lascia quelle già somministrate", true, residue.fatte > 0);

  /*
   * ── Il laboratorio ─────────────────────────────────────────────
   *
   * La catena ha due passaggi che non sono clic: il prelievo, che vuole
   * una persona, e la **validazione**, che vuole una firma. Il secondo è
   * quello da provare: è ciò che fa entrare un valore in cartella e da
   * lì nel Longevity Score, e se lo potesse dare chiunque il punteggio
   * si fonderebbe su numeri di cui nessuno risponde.
   */
  const [{ request_lab_order: ordine }] = await come(chiede, () =>
    q(
      `select public.request_lab_order(
         $1, 'Profilo lipidico', array['ldl','hdl'],
         'Controllo a sei mesi.', 'normal'::comms_priority, null)`,
      [paziente.id],
    ),
  );

  const [statoIniziale] = await q(
    "select status::text from public.lab_orders where id = $1",
    [ordine],
  );
  verifica("una richiesta nasce «richiesta»", "requested", statoIniziale.status);

  await come(infermiere, () =>
    q("select public.advance_lab_order($1, 'collected')", [ordine]),
  );
  await come(infermiere, () =>
    q("select public.advance_lab_order($1, 'resulted')", [ordine]),
  );
  const [dopoPrelievo] = await q(
    "select status::text, collected_at is not null as segnato from public.lab_orders where id = $1",
    [ordine],
  );
  verifica("l'infermiere può portarla avanti", "resulted", dopoPrelievo.status);
  verifica("e il prelievo resta datato", true, dopoPrelievo.segnato);

  let validaInfermiere = false;
  try {
    await come(infermiere, () => q("select public.validate_lab_order($1)", [ordine]));
    validaInfermiere = true;
  } catch {
    // Rifiutato: validare è una firma.
  }
  verifica("un infermiere non può validare", false, validaInfermiere);

  await come(chiede, () => q("select public.validate_lab_order($1)", [ordine]));
  const [validato] = await q(
    "select status::text, validated_by is not null as firmato from public.lab_orders where id = $1",
    [ordine],
  );
  verifica("un medico sì", "validated", validato.status);
  verifica("e la firma resta attaccata alla riga", true, validato.firmato);

  // La serie storica: la window function deve dare la variazione, non
  // solo i valori. Con una misura sola il delta è null, ed è giusto.
  const serie = await come(chiede, () =>
    q("select metric_code, value, delta from public.metric_series($1, null, 12)", [
      paziente.id,
    ]),
  );
  verifica("la serie storica restituisce dei punti", true, serie.length > 0);
  verifica(
    "il primo punto di ogni parametro non ha variazione",
    true,
    serie.length === 0 || serie.some((r) => r.delta === null),
  );

  /*
   * ── Il registro ────────────────────────────────────────────────
   *
   * Tre promesse, e la terza è quella che rende credibili le prime due:
   * le scritture cliniche lasciano una riga, la riga non si può
   * riscrivere, e **se qualcuno la riscrivesse comunque si vedrebbe**.
   *
   * L'ultima si prova nel solo modo in cui si può provare: manomettendo
   * il registro davvero. Il test disabilita il trigger — cosa che
   * richiede i privilegi del proprietario, cioè il caso peggiore — e
   * poi controlla che la verifica se ne accorga.
   */
  const [{ n: righeTerapia }] = await q(
    `select count(*)::int as n from public.audit_log
      where entity = 'prescriptions' and action like 'prescriptions.%'`,
  );
  verifica("una prescrizione lascia una riga nel registro", true, righeTerapia > 0);

  const [{ n: sigillate }] = await q(
    "select count(*)::int as n from public.audit_log where entry_hash is null",
  );
  verifica("ogni riga del registro è sigillata", 0, sigillate);

  // La direzione serve a `verify_audit_chain`: la verifica non è una
  // lettura come le altre.
  const [{ id: direzione }] = await q(
    "insert into auth.users (email) values ($1) returning id",
    ["verifica.direzione@esempio.it"],
  );
  await q("update public.profiles set role = 'owner' where id = $1", [direzione]);

  const rotture = await come(direzione, () =>
    q("select id from public.verify_audit_chain()"),
  );
  verifica("la catena è integra", 0, rotture.length);

  let modificaRespinta = false;
  try {
    await q("update public.audit_log set action = 'niente' where id = (select min(id) from public.audit_log)");
  } catch {
    modificaRespinta = true;
  }
  verifica("il registro non si modifica", true, modificaRespinta);

  let cancellazioneRespinta = false;
  try {
    await q("delete from public.audit_log where id = (select min(id) from public.audit_log)");
  } catch {
    cancellazioneRespinta = true;
  }
  verifica("il registro non si cancella", true, cancellazioneRespinta);

  /*
   * La manomissione, fatta davvero.
   *
   * Disabilitare un trigger richiede di essere proprietari della
   * tabella: è lo scenario peggiore, quello in cui chi manomette ha le
   * chiavi. La catena non lo impedisce — niente lo impedisce — ma lo
   * rende evidente, e «evidente» è l'unica proprietà che serve davanti
   * a chi deve giudicare.
   */
  await db.exec("alter table public.audit_log disable trigger audit_log_immutabile");
  await q(
    `update public.audit_log
        set action = 'patient.view'
      where id = (select id from public.audit_log where entry_hash is not null order by id limit 1)`,
  );
  await db.exec("alter table public.audit_log enable trigger audit_log_immutabile");

  const dopoManomissione = await come(direzione, () =>
    q("select id from public.verify_audit_chain()"),
  );
  verifica("una manomissione si vede", true, dopoManomissione.length > 0);

  /* ── I diritti della persona ───────────────────────────────── */

  const esportazione = await come(chiede, () =>
    q("select public.export_patient_data($1) as dati", [paziente.id]),
  );
  const dati = esportazione[0]?.dati ?? {};
  verifica("l'esportazione contiene l'anagrafica", true, dati.paziente != null);
  verifica("e le misure", true, Array.isArray(dati.misure));

  const [{ n: tracce }] = await q(
    "select count(*)::int as n from public.audit_log where action = 'patient.export'",
  );
  verifica("esportare lascia una traccia", true, tracce > 0);

  // La cancellazione toglie chi, non cosa: la storia clinica resta.
  const [{ n: misurePrima }] = await q(
    "select count(*)::int as n from public.measurements where patient_id = $1",
    [paziente.id],
  );

  await come(direzione, () =>
    q("select public.erase_patient($1, 'Richiesta della persona interessata.')", [
      paziente.id,
    ]),
  );

  const [dopoCancellazione] = await q(
    `select pr.full_name, pr.email,
            (select count(*)::int from public.measurements m where m.patient_id = pa.id) as misure
       from public.patients pa join public.profiles pr on pr.id = pa.profile_id
      where pa.id = $1`,
    [paziente.id],
  );
  verifica("la cancellazione toglie il nome", "Persona cancellata", dopoCancellazione.full_name);
  verifica("e i recapiti", null, dopoCancellazione.email);
  verifica("ma conserva la storia clinica", misurePrima, dopoCancellazione.misure);

  /*
   * ── I consensi ─────────────────────────────────────────────────
   *
   * Chi raccoglie una firma durante la visita è il professionista, e
   * prima non poteva registrarla. Il controllo che conta però è
   * l'altro: **la reception resta fuori.** È una promessa scritta nel
   * documento di sicurezza, e allargare la policy per comodità è
   * esattamente il modo in cui una garanzia smette di valere — non con
   * una decisione, con un'eccezione.
   */
  const consensoDiCura = await come(chiede, () =>
    q("select public.record_consent($1, 'health_data', true, 'v2', 'paper') as id", [
      paziente.id,
    ]),
  );
  verifica("un medico del team registra un consenso", true, consensoDiCura.length === 1);

  const [corrente] = await q(
    `select granted, policy_version, source, decided_by is not null as firmato
       from public.patient_consents
      where patient_id = $1 and kind = 'health_data'
      order by decided_at desc limit 1`,
    [paziente.id],
  );
  verifica("con la versione dell'informativa", "v2", corrente.policy_version);
  verifica("e l'origine dichiarata", "paper", corrente.source);
  verifica("e il nome di chi lo registra", true, corrente.firmato);

  const [{ n: tracciaConsenso }] = await q(
    "select count(*)::int as n from public.audit_log where action = 'consent.granted'",
  );
  verifica("registrare un consenso lascia una traccia", true, tracciaConsenso > 0);

  // Revocare scrive, non cancella: le due righe devono restare entrambe.
  await come(chiede, () =>
    q("select public.record_consent($1, 'health_data', false, 'v2', 'clinical')", [
      paziente.id,
    ]),
  );
  const [{ n: righeConsenso }] = await q(
    "select count(*)::int as n from public.patient_consents where patient_id = $1 and kind = 'health_data'",
    [paziente.id],
  );
  verifica("revocare aggiunge una riga invece di toglierne una", true, righeConsenso >= 2);

  let consensoInfermiere = true;
  try {
    await come(estraneo, () =>
      q("select public.record_consent($1, 'marketing', true, 'v1', 'clinical')", [
        paziente.id,
      ]),
    );
  } catch {
    consensoInfermiere = false;
  }
  verifica("chi non ha titolo sul paziente non registra consensi", false, consensoInfermiere);

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
