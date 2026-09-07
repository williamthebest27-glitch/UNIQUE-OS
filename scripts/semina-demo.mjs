/**
 * Popola un progetto Supabase con una clinica finta, per provarla.
 *
 * Dieci professionisti, una segretaria, dieci pazienti, e fra loro
 * conversazioni vere: dirette, di gruppo, verso un reparto, fra due
 * reparti, più tre consulti in tre stati diversi e un passaggio di
 * consegne. Serve a rispondere alla domanda che nessun test automatico
 * risponde — *com'è usare questa cosa quando dentro c'è della gente.*
 *
 * ---
 *
 * Due scelte che vale la pena spiegare, perché entrambe hanno
 * un'alternativa più corta e peggiore.
 *
 * **Gli account li crea l'Admin API, non un `insert` in `auth.users`.**
 * Scrivere a mano in quella tabella è possibile e sembra funzionare:
 * il profilo nasce, il nome compare. Poi si prova ad accedere e non si
 * entra, perché mancano la riga in `auth.identities` e mezza dozzina di
 * colonne che GoTrue si aspetta — e che cambiano fra una versione e
 * l'altra. `auth.admin.createUser` le conosce; noi no, e non è nostro
 * mestiere.
 *
 * **Le conversazioni le creano gli utenti, non la chiave di servizio.**
 * La chiave service-role scavalca la Row Level Security: con quella si
 * possono scrivere le righe direttamente, ed è più veloce. Ma
 * `auth.uid()` sarebbe null, quindi le conversazioni nascerebbero senza
 * autore e senza partecipanti — cioè invisibili a tutti, incluso chi le
 * ha «aperte». Qui invece lo script fa l'accesso come ciascun medico e
 * chiama le stesse funzioni che chiama l'interfaccia. Costa qualche
 * secondo in più e in cambio il seed è anche una prova end-to-end: se
 * `open_conversation` o `advance_consultation` si rompono, questo script
 * non arriva in fondo.
 *
 *   npm run demo:semina                 crea tutto, password generata
 *   npm run demo:semina -- --password X password scelta da te
 *   npm run demo:semina -- --si         senza chiedere conferma
 *   npm run demo:pulisci                cancella tutto ciò che ha creato
 *
 * NON eseguirlo su un progetto con dati veri. Chiede conferma mostrando
 * l'indirizzo del progetto proprio per quello.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Il dominio delle email finte.
 *
 * `.local` non è un dominio registrabile e non risolve: nessuna di
 * queste caselle può ricevere posta, nemmeno per sbaglio. È anche il
 * modo in cui `--elimina` riconosce cosa ha creato — e la ragione per
 * cui non va cambiato con qualcosa di plausibile.
 */
const DOMINIO = "demo.unique.local";

/* ── Ambiente ─────────────────────────────────────────────────────── */

function leggiEnv() {
  const file = join(RADICE, ".env.local");
  const valori = {};

  if (existsSync(file)) {
    for (const riga of readFileSync(file, "utf8").split("\n")) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) valori[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }

  // L'ambiente del processo vince sul file: è così che si punta lo
  // script a un progetto diverso senza toccare `.env.local`.
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || valori.NEXT_PUBLIC_SUPABASE_URL || "",
    anon:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      valori.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    service:
      process.env.SUPABASE_SERVICE_ROLE_KEY || valori.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

const argomenti = process.argv.slice(2);
const ha = (nome) => argomenti.includes(nome);
const valore = (nome) => {
  const i = argomenti.indexOf(nome);
  return i >= 0 ? argomenti[i + 1] : null;
};

const elimina = ha("--elimina");
const senzaChiedere = ha("--si");

const env = leggiEnv();

if (!env.url || !env.service) {
  console.error(
    "Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Stanno in .env.local: `npm run env:collega` scrive le prime due, la\n" +
      "chiave di servizio si copia da Supabase → Settings → API.",
  );
  process.exit(1);
}

if (!elimina && !env.anon) {
  console.error(
    "Serve anche NEXT_PUBLIC_SUPABASE_ANON_KEY: le conversazioni le creano\n" +
      "gli utenti facendo l'accesso, non la chiave di servizio.",
  );
  process.exit(1);
}

const admin = createClient(env.url, env.service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ── Le persone ───────────────────────────────────────────────────── */

/**
 * Dieci professionisti, e non dieci medici uguali.
 *
 * Sei sono medici; gli altri quattro coprono le discipline che Unique ha
 * davvero. Serve a provare le tre schermate di apertura — medico,
 * infermieristica, diagnostica — che con dieci profili identici sarebbe
 * rimasta una sola provata su tre.
 */
const PROFESSIONISTI = [
  { nome: "Alessandro Conti",  titolo: "Dott.",    disciplina: "physician",    reparto: "medicina",        specialita: "Medicina della longevità" },
  { nome: "Chiara Neri",       titolo: "Dott.ssa", disciplina: "physician",    reparto: "diagnostica",     specialita: "Radiodiagnostica" },
  { nome: "Marco Vallone",     titolo: "Dott.",    disciplina: "physician",    reparto: "medicina",        specialita: "Cardiologia" },
  { nome: "Giulia Sartori",    titolo: "Dott.ssa", disciplina: "physician",    reparto: "diagnostica",     specialita: "Patologia clinica" },
  { nome: "Andrea Lombardi",   titolo: "Dott.",    disciplina: "physician",    reparto: "medicina",        specialita: "Endocrinologia" },
  { nome: "Francesca Riva",    titolo: "Dott.ssa", disciplina: "physician",    reparto: "medicina",        specialita: "Medicina interna" },
  { nome: "Sara Greco",        titolo: "Inf.",     disciplina: "nurse",        reparto: "infermieristica", specialita: "Assistenza ambulatoriale" },
  { nome: "Elena Ferraro",     titolo: "Dott.ssa", disciplina: "nutritionist", reparto: "nutrizione",      specialita: "Nutrizione clinica" },
  { nome: "Paolo Rinaldi",     titolo: "Dott.",    disciplina: "osteopath",    reparto: "osteopatia",      specialita: "Osteopatia strutturale" },
  { nome: "Silvia Mancini",    titolo: "Dott.ssa", disciplina: "psychologist", reparto: "psicologia",      specialita: "Psicologia della salute" },
];

const SEGRETARIA = {
  nome: "Martina Fabbri",
  ruolo: "reception",
  reparto: "accoglienza",
};

const PAZIENTI = [
  { nome: "Marta Bellini",    nascita: "1979-04-12", sesso: "F", altezza: 168 },
  { nome: "Giulio Ferrante",  nascita: "1965-11-03", sesso: "M", altezza: 181 },
  { nome: "Ambra Rossi",      nascita: "1988-07-25", sesso: "F", altezza: 172 },
  { nome: "Davide Colombo",   nascita: "1972-01-30", sesso: "M", altezza: 176 },
  { nome: "Chiara Vitali",    nascita: "1991-09-14", sesso: "F", altezza: 165 },
  { nome: "Stefano Marchetti",nascita: "1958-03-08", sesso: "M", altezza: 179 },
  { nome: "Laura Gentile",    nascita: "1983-12-21", sesso: "F", altezza: 170 },
  { nome: "Nicola Serra",     nascita: "1995-06-17", sesso: "M", altezza: 184 },
  { nome: "Beatrice Longo",   nascita: "1968-08-02", sesso: "F", altezza: 163 },
  { nome: "Tommaso Pagano",   nascita: "1976-02-11", sesso: "M", altezza: 178 },
];

/** Da «Marta Bellini» a «marta.bellini@demo.unique.local». */
function emailDi(nome) {
  const slug = nome
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug}@${DOMINIO}`;
}

/* ── Utilità ──────────────────────────────────────────────────────── */

function esci(messaggio) {
  console.error(`\n✘ ${messaggio}`);
  process.exit(1);
}

/** Ferma tutto al primo errore: un seed a metà è peggio di nessun seed. */
function controlla(etichetta, { error }) {
  if (error) esci(`${etichetta}: ${error.message}`);
}

async function conferma(domanda) {
  if (senzaChiedere) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const risposta = (await rl.question(`${domanda} [scrivi SI] `)).trim();
  rl.close();
  return risposta === "SI";
}

/** Tutti gli utenti del dominio finto, sfogliando le pagine. */
async function utentiDemo() {
  const trovati = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pagina,
      perPage: 200,
    });
    if (error) esci(`elenco utenti: ${error.message}`);
    const righe = data?.users ?? [];
    trovati.push(...righe.filter((u) => (u.email ?? "").endsWith(`@${DOMINIO}`)));
    if (righe.length < 200) break;
  }
  return trovati;
}

/* ── Pulizia ──────────────────────────────────────────────────────── */

/**
 * Toglie tutto ciò che questo script ha creato.
 *
 * L'ordine conta. Cancellare gli utenti fa cadere a cascata profili,
 * pazienti, schede professionali e tutto ciò che vi pende — ma **non**
 * le conversazioni, che tengono `created_by` con `on delete set null`.
 * Senza il primo passaggio resterebbero dei fili senza autore e senza
 * partecipanti: invisibili a chiunque e impossibili da cancellare
 * dall'interfaccia. Prima le conversazioni, poi le persone.
 */
async function pulisci() {
  const utenti = await utentiDemo();

  if (utenti.length === 0) {
    console.log(`Nessun utente @${DOMINIO}: niente da togliere.`);
    return;
  }

  console.log(`Trovati ${utenti.length} account @${DOMINIO}.`);
  if (!(await conferma(`Li cancello da ${env.url}, con tutto ciò che hanno prodotto?`))) {
    console.log("Annullato.");
    return;
  }

  const ids = utenti.map((u) => u.id);

  const { data: conversazioni } = await admin
    .from("conversations")
    .select("id")
    .in("created_by", ids);

  const idConv = (conversazioni ?? []).map((c) => c.id);
  if (idConv.length > 0) {
    controlla(
      "conversazioni",
      await admin.from("conversations").delete().in("id", idConv),
    );
    console.log(`✔ conversazioni rimosse: ${idConv.length}`);
  }

  let quanti = 0;
  for (const u of utenti) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.log(`  ✘ ${u.email}: ${error.message}`);
    else quanti++;
  }

  console.log(`✔ account rimossi: ${quanti}`);
}

/* ── Semina ───────────────────────────────────────────────────────── */

async function creaAccount(nome, password) {
  const email = emailDi(nome);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });

  if (!error) return { id: data.user.id, email, nome };

  // Già presente da un giro precedente: si riusa invece di fallire, così
  // lo script si può rieseguire senza prima pulire.
  if (/already|exist|registered/i.test(error.message)) {
    const esistenti = await utentiDemo();
    const trovato = esistenti.find((u) => u.email === email);
    if (trovato) {
      // La password viene riallineata: quella stampata a fine corsa deve
      // funzionare anche per gli account che c'erano già.
      await admin.auth.admin.updateUserById(trovato.id, { password });
      return { id: trovato.id, email, nome, riusato: true };
    }
  }

  esci(`account ${email}: ${error.message}`);
}

async function semina() {
  const password = valore("--password") ?? `demo-${randomBytes(6).toString("hex")}`;

  if (password.length < 12) {
    esci("La password deve essere lunga almeno dodici caratteri.");
  }

  console.log(`Progetto: ${env.url}`);
  console.log(
    `Sto per creare ${PROFESSIONISTI.length} professionisti, 1 segretaria e ` +
      `${PAZIENTI.length} pazienti finti, tutti @${DOMINIO}.`,
  );

  if (!(await conferma("Se questo progetto contiene dati veri, fermati adesso."))) {
    console.log("Annullato.");
    return;
  }

  /* ── I reparti devono esistere ──────────────────────────────── */
  const { data: reparti, error: erroreReparti } = await admin
    .from("departments")
    .select("id, slug");

  if (erroreReparti) esci(`reparti: ${erroreReparti.message}`);

  const repartoPer = new Map((reparti ?? []).map((r) => [r.slug, r.id]));

  if (repartoPer.size === 0) {
    esci(
      "Nessun reparto nel database. Applica prima la migrazione\n" +
        "  20260907100000_comunicazioni_interne.sql\n" +
        "che li crea: senza, non c'è dove mettere le persone.",
    );
  }

  /* ── Professionisti ─────────────────────────────────────────── */
  console.log("\n── professionisti ──");
  const medici = [];

  for (const p of PROFESSIONISTI) {
    const account = await creaAccount(p.nome, password);

    controlla(
      `profilo ${p.nome}`,
      await admin
        .from("profiles")
        .update({ role: "professional", full_name: p.nome })
        .eq("id", account.id),
    );

    const { data: pro, error } = await admin
      .from("professionals")
      .upsert(
        {
          profile_id: account.id,
          title: p.titolo,
          specialty: p.specialita,
          discipline: p.disciplina,
          is_active: true,
        },
        { onConflict: "profile_id" },
      )
      .select("id")
      .single();

    if (error) esci(`scheda di ${p.nome}: ${error.message}`);

    const repartoId = repartoPer.get(p.reparto);
    if (repartoId) {
      controlla(
        `reparto di ${p.nome}`,
        await admin
          .from("department_members")
          .upsert(
            { department_id: repartoId, profile_id: account.id, ended_at: null },
            { onConflict: "department_id,profile_id" },
          ),
      );
    }

    medici.push({ ...account, ...p, professionalId: pro.id, repartoId });
    console.log(`✔ ${p.titolo} ${p.nome} — ${p.reparto}`);
  }

  /* ── Segretaria ─────────────────────────────────────────────── */
  console.log("\n── accoglienza ──");
  const segretaria = await creaAccount(SEGRETARIA.nome, password);

  controlla(
    "profilo segretaria",
    await admin
      .from("profiles")
      .update({ role: SEGRETARIA.ruolo, full_name: SEGRETARIA.nome })
      .eq("id", segretaria.id),
  );

  const repartoAccoglienza = repartoPer.get(SEGRETARIA.reparto);
  if (repartoAccoglienza) {
    controlla(
      "reparto segretaria",
      await admin
        .from("department_members")
        .upsert(
          {
            department_id: repartoAccoglienza,
            profile_id: segretaria.id,
            ended_at: null,
          },
          { onConflict: "department_id,profile_id" },
        ),
    );
  }
  console.log(`✔ ${SEGRETARIA.nome} — reception`);

  /* ── Pazienti ───────────────────────────────────────────────── */
  console.log("\n── pazienti ──");
  const pazienti = [];

  for (const [i, p] of PAZIENTI.entries()) {
    const account = await creaAccount(p.nome, password);

    controlla(
      `profilo ${p.nome}`,
      await admin
        .from("profiles")
        .update({ role: "patient", full_name: p.nome })
        .eq("id", account.id),
    );

    const { data: paziente, error } = await admin
      .from("patients")
      .upsert(
        {
          profile_id: account.id,
          patient_code: `DEMO-${String(i + 1).padStart(3, "0")}`,
          date_of_birth: p.nascita,
          sex_at_birth: p.sesso,
          height_cm: p.altezza,
        },
        { onConflict: "profile_id" },
      )
      .select("id")
      .single();

    if (error) esci(`paziente ${p.nome}: ${error.message}`);

    /*
     * Il care team, e non è un dettaglio di popolamento.
     *
     * La Row Level Security non guarda il ruolo, guarda il team: un
     * professionista senza assegnazioni entra nell'area clinica e non
     * vede nessuno. Ogni paziente va a un medico di Medicina più un
     * secondo professionista, a rotazione — così ciascuno ha una lista
     * diversa, che è l'unica condizione in cui si può provare davvero
     * che uno non vede i pazienti dell'altro.
     */
    const diMedicina = medici.filter((m) => m.reparto === "medicina");
    const referente = diMedicina[i % diMedicina.length];
    const altri = medici.filter((m) => m.reparto !== "medicina");
    const secondo = altri[i % altri.length];

    for (const [m, ruolo] of [
      [referente, "Referente clinico"],
      [secondo, "Care team"],
    ]) {
      controlla(
        `team di ${p.nome}`,
        await admin.from("care_team_members").upsert(
          {
            patient_id: paziente.id,
            professional_id: m.professionalId,
            role_in_team: ruolo,
            ended_at: null,
          },
          { onConflict: "patient_id,professional_id" },
        ),
      );
    }

    pazienti.push({ ...account, ...p, patientId: paziente.id, referente, secondo });
    console.log(`✔ ${p.nome} — ${referente.nome} · ${secondo.nome}`);
  }

  /* ── Le conversazioni, create da chi le userebbe ─────────────── */
  console.log("\n── conversazioni ──");

  /** Un client con la sessione di una persona: le RPC vedranno il suo `auth.uid()`. */
  async function come(persona) {
    const client = createClient(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: persona.email,
      password,
    });
    if (error) esci(`accesso come ${persona.email}: ${error.message}`);
    return client;
  }

  const [conti, neri, vallone, sartori, lombardi, riva, greco, ferraro] = medici;

  const comeConti = await come(conti);
  const comeNeri = await come(neri);
  const comeGreco = await come(greco);
  const comeVallone = await come(vallone);

  const apri = async (client, argomenti, etichetta) => {
    const { data, error } = await client.rpc("open_conversation", argomenti);
    if (error) esci(`${etichetta}: ${error.message}`);
    console.log(`✔ ${etichetta}`);
    return data;
  };

  // Medico → medico.
  await apri(
    comeConti,
    {
      p_title: `Secondo parere su ${pazienti[0].nome}`,
      p_body:
        "Ho un dubbio sul profilo lipidico: LDL 148 con HDL basso, ma nessun altro fattore. Prima di impostare la terapia mi piacerebbe sentirti.",
      p_kind: "direct",
      p_priority: "normal",
      p_profiles: [vallone.id],
      p_message_kind: "request",
    },
    "diretta — Conti → Vallone",
  );

  // Medico → gruppo di medici.
  await apri(
    comeConti,
    {
      p_title: `Rivalutazione del piano — ${pazienti[2].nome}`,
      p_body:
        "Riepilogo: aderenza buona, sonno frammentato da due settimane, composizione corporea stabile. Propongo di rivedere il carico e l'apporto proteico. Pareri?",
      p_kind: "group",
      p_priority: "normal",
      p_patient: pazienti[2].patientId,
      p_profiles: [ferraro.id, riva.id],
      p_message_kind: "info",
    },
    "gruppo — Conti, Ferraro, Riva",
  );

  // Medico → reparto.
  await apri(
    comeVallone,
    {
      p_title: "Disponibilità per ecocardiogrammi di giovedì",
      p_body:
        "Ho tre pazienti che varrebbe la pena vedere giovedì mattina. C'è spazio o conviene spostarli alla settimana prossima?",
      p_kind: "department",
      p_priority: "normal",
      p_department: repartoPer.get("diagnostica"),
      p_departments: [repartoPer.get("diagnostica")],
      p_message_kind: "request",
    },
    "verso reparto — Vallone → Diagnostica",
  );

  // Reparto → reparto.
  await apri(
    comeNeri,
    {
      p_title: "Preparazione dei pazienti ai prelievi",
      p_body:
        "Chiedo cortesemente di segnare sul promemoria il digiuno di dodici ore: questa settimana abbiamo rimandato due prelievi su otto.",
      p_kind: "department",
      p_priority: "high",
      p_department: repartoPer.get("infermieristica"),
      p_departments: [repartoPer.get("diagnostica"), repartoPer.get("infermieristica")],
      p_message_kind: "info",
    },
    "fra reparti — Diagnostica → Infermieristica",
  );

  // Passaggio di consegne, per la schermata dell'infermieristica.
  await apri(
    comeGreco,
    {
      p_title: "Passaggio di consegne — turno pomeridiano",
      p_body: `${pazienti[0].nome} ha saltato la somministrazione delle 14: riprogrammata alle 18. ${pazienti[1].nome} è a digiuno da stamattina per il prelievo.`,
      p_kind: "department",
      p_priority: "high",
      p_department: repartoPer.get("infermieristica"),
      p_departments: [repartoPer.get("infermieristica")],
      p_message_kind: "transfer",
    },
    "consegne — Greco → Infermieristica",
  );

  // Comunicazione urgente, per vedere la priorità in pagina.
  await apri(
    comeVallone,
    {
      p_title: `Valore critico — ${pazienti[5].nome}`,
      p_body:
        "Potassio 6,2 sul prelievo di stamattina. Ho già contattato il paziente; segnalo qui perché resti tracciato.",
      p_kind: "department",
      p_priority: "critical",
      p_patient: pazienti[5].patientId,
      p_department: repartoPer.get("medicina"),
      p_departments: [repartoPer.get("medicina"), repartoPer.get("diagnostica")],
      p_message_kind: "exam",
    },
    "critica — Vallone → Medicina e Diagnostica",
  );

  /* ── Tre consulti, in tre stati ──────────────────────────────── */
  console.log("\n── consulti ──");

  const chiediConsulto = async (client, argomenti, etichetta) => {
    const { data, error } = await client.rpc("request_consultation", argomenti);
    if (error) esci(`${etichetta}: ${error.message}`);
    console.log(`✔ ${etichetta}`);
    return data;
  };

  // Aperto: nessuno l'ha ancora preso in carico.
  await chiediConsulto(
    comeConti,
    {
      p_patient: pazienti[0].patientId,
      p_department: repartoPer.get("diagnostica"),
      p_reason: "Ecocardiogramma prima di riprendere il carico",
      p_description:
        "Troponina 0,08 il mese scorso, dolore toracico atipico dopo sforzo. ECG a riposo nella norma. Ha ripreso l'allenamento due settimane fa.",
      p_priority: "urgent",
      p_due_at: new Date(Date.now() + 2 * 86400_000).toISOString(),
    },
    "aperto — urgente, Conti → Diagnostica",
  );

  // Preso in carico.
  const preso = await chiediConsulto(
    comeConti,
    {
      p_patient: pazienti[3].patientId,
      p_department: repartoPer.get("nutrizione"),
      p_reason: "Rivalutazione dell'apporto proteico",
      p_description:
        "Massa magra in calo di 1,4 kg in sei mesi a parità di allenamento.",
      p_priority: "normal",
    },
    "richiesto — Conti → Nutrizione",
  );

  const comeFerraro = await come(ferraro);
  controlla(
    "presa in carico",
    await comeFerraro.rpc("advance_consultation", {
      p_consultation: preso,
      p_status: "taken",
    }),
  );
  console.log("✔ preso in carico — Ferraro");

  // Risposto: la risposta resta collegata alla richiesta.
  const risposto = await chiediConsulto(
    comeVallone,
    {
      p_patient: pazienti[6].patientId,
      p_department: repartoPer.get("diagnostica"),
      p_reason: "Lettura del pannello tiroideo",
      p_description: "TSH 5,8 con FT4 nella norma, paziente asintomatica.",
      p_priority: "normal",
    },
    "richiesto — Vallone → Diagnostica",
  );

  const comeSartori = await come(sartori);
  controlla(
    "risposta al consulto",
    await comeSartori.rpc("advance_consultation", {
      p_consultation: risposto,
      p_status: "answered",
      p_answer:
        "Quadro compatibile con ipotiroidismo subclinico. Non indicherei terapia adesso: ricontrollo fra tre mesi con anticorpi anti-TPO.",
    }),
  );
  console.log("✔ risposto — Sartori");

  /* ── Una conversazione con un paziente ───────────────────────── */
  console.log("\n── con il paziente ──");

  const comeLombardi = await come(lombardi);
  const { error: erroreFilo } = await comeLombardi.rpc("open_thread", {
    p_subject: "Esito degli esami di questo mese",
    p_body:
      "Ho letto i suoi esami: sono nella norma, con un miglioramento sul profilo glicemico. Ne parliamo alla prossima visita.",
    p_category: "clinical",
    p_patient: pazienti[1].patientId,
  });
  if (erroreFilo) esci(`filo con il paziente: ${erroreFilo.message}`);
  console.log(`✔ ${lombardi.nome} → ${pazienti[1].nome}`);

  /* ── Il riepilogo ────────────────────────────────────────────── */
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Password di tutti gli account:");
  console.log(`  ${password}`);
  console.log("═══════════════════════════════════════════════════\n");
  console.log("Da provare, in tre finestre diverse:");
  console.log(`  ${conti.email}      medico — Medicina`);
  console.log(`  ${greco.email}      infermieristica`);
  console.log(`  ${neri.email}       diagnostica`);
  console.log(`  ${emailDi(SEGRETARIA.nome)}   reception — Control Center`);
  console.log(`  ${pazienti[1].email}  paziente\n`);
  console.log("Per togliere tutto:  npm run demo:pulisci");
}

/* ── Avvio ────────────────────────────────────────────────────────── */

if (elimina) await pulisci();
else await semina();
