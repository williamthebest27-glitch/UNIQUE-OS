import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPanoramicaClinica, type ValoreFuoriRange } from "@/lib/data/cartella";
import { getAndamenti, type AndamentoParametro } from "@/lib/data/laboratorio";
import { getTerapie, type Terapia } from "@/lib/data/terapie";
import type { Variazione } from "@/lib/clinical/cartella-domande";

/**
 * «Analizza paziente», e soprattutto: **cosa è cambiato dall'ultima volta.**
 *
 * ---
 *
 * La decisione che regge tutto questo file, e vale la pena scriverla per
 * intero perché è controintuitiva: **l'analisi non è generata da un
 * modello. È assemblata dai dati.**
 *
 * La tentazione era mandare la cartella a un modello e chiedergli otto
 * paragrafi. Sarebbe stato un decimo del codice e avrebbe prodotto la
 * cosa peggiore possibile in clinica: un riepilogo plausibile in cui un
 * valore su venti è inventato, e nessun modo di sapere quale. Un LDL
 * sbagliato dentro un testo ben scritto è più pericoloso di nessun
 * testo, perché viene creduto.
 *
 * Qui ogni sezione è una query. «Fuori range» sono le righe fuori
 * dall'intervallo stampato sul referto; «cosa è cambiato» è un confronto
 * di date; «terapie attuali» sono le prescrizioni attive. Nessuna di
 * queste frasi può essere sbagliata, perché nessuna di queste frasi è
 * una frase — sono dati con accanto la loro provenienza.
 *
 * Al modello resta **una** cosa, ed è l'unica in cui è bravo e in cui
 * sbagliare è recuperabile: leggere quelle sezioni e dire cosa
 * meriterebbe uno sguardo. Sta in fondo, dopo i fatti, e se non c'è —
 * perché la chiave non è configurata, o la rete è caduta — l'analisi
 * resta intera. È il contrario di come si costruiscono di solito queste
 * cose, ed è la ragione per cui questa si può usare.
 *
 * Le domande da approfondire sono anch'esse **regole**, non un modello:
 * un parametro fuori senza una nota che lo commenti, una terapia con
 * metà dosi non date, tre rilevazioni nella stessa direzione. Chi legge
 * può risalire al fatto che le ha accese, che è precisamente ciò che una
 * frase generata non permette.
 */

/* ── Le parti ─────────────────────────────────────────────────────── */

export interface EventoRecente {
  quando: string;
  cosa: string;
  dettaglio: string | null;
  categoria: string;
}

export interface DomandaDaApprofondire {
  /** La domanda, scritta come la si porrebbe a voce. */
  testo: string;
  /** Il fatto che l'ha accesa: chi legge deve poterlo verificare. */
  perche: string;
  /** Dove si va a guardare. */
  href: string | null;
}

export interface CambiamentoDallaVisita {
  /** L'ultima visita conclusa, che è il punto da cui si misura. */
  visitaIl: string | null;
  visitaServizio: string | null;
  /** Il punteggio prima e dopo, quando ce ne sono due. */
  punteggio: { prima: number; dopo: number; delta: number } | null;
  /** Le variazioni delle misure registrate dopo quella visita. */
  variazioni: Variazione[];
  refertiNuovi: { id: string; titolo: string; quando: string }[];
  terapieAvviate: { farmaco: string; dose: string; quando: string }[];
  terapieChiuse: { farmaco: string; stato: string; motivo: string | null }[];
  noteNuove: number;
  consultiAperti: number;
}

export interface AnalisiPaziente {
  paziente: { nome: string; eta: number | null; codice: string | null };
  generataIl: string;

  /** Cosa è cambiato dall'ultima visita. È la prima domanda, e sta in cima. */
  cambiamenti: CambiamentoDallaVisita;

  fuoriRange: ValoreFuoriRange[];
  /** Solo i parametri che hanno un andamento o stanno fuori: il resto è rumore. */
  andamenti: AndamentoParametro[];
  terapieAttive: Terapia[];
  eventiRecenti: EventoRecente[];
  domande: DomandaDaApprofondire[];

  /** Quante misure approvate reggono tutto questo. Serve a dichiarare il fondamento. */
  misureTotali: number;
  ultimaRilevazioneIl: string | null;
}

/* ── L'assemblaggio ───────────────────────────────────────────────── */

/**
 * Quanto indietro guardare quando non c'è nessuna visita conclusa.
 *
 * Novanta giorni: una persona senza visite recenti è una persona di cui
 * si sta rileggendo la cartella, e tre mesi sono la finestra in cui un
 * cambiamento è ancora attuale.
 */
const GIORNI_SENZA_VISITA = 90;

export async function analizzaPaziente(
  patientId: string,
): Promise<AnalisiPaziente | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  /*
   * L'ultima visita conclusa è il perno.
   *
   * `completed` e non «l'ultima in agenda»: una visita fissata per
   * domani non è un punto da cui misurare un cambiamento, e prenderla
   * come riferimento avrebbe fatto risultare «niente di nuovo» su ogni
   * paziente con un appuntamento futuro.
   */
  const { data: visita } = await supabase
    .from("appointments")
    .select("service_name, starts_at")
    .eq("patient_id", patientId)
    .eq("status", "completed")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const v = visita as { service_name: string; starts_at: string } | null;

  const da =
    v?.starts_at ??
    new Date(Date.now() - GIORNI_SENZA_VISITA * 86_400_000).toISOString();
  const daGiorno = da.slice(0, 10);

  const [
    panoramica,
    andamentiTutti,
    terapie,
    anagraficaRes,
    refertiRes,
    noteRes,
    consultiRes,
    punteggiRes,
  ] = await Promise.all([
    getPanoramicaClinica(patientId),
    getAndamenti(patientId, { punti: 12 }),
    getTerapie(patientId, { includiChiuse: true }),

    supabase
      .from("patients")
      .select("patient_code, date_of_birth, profile:profiles(full_name)")
      .eq("id", patientId)
      .maybeSingle(),

    supabase
      .from("documents")
      .select("id, title, created_at, kind")
      .eq("patient_id", patientId)
      .gte("created_at", da)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("clinical_notes")
      .select("id, created_at")
      .eq("patient_id", patientId)
      .gte("created_at", da)
      .limit(50),

    supabase
      .from("clinical_consultations")
      .select("id, status")
      .eq("patient_id", patientId)
      .neq("status", "closed")
      .limit(30),

    supabase
      .from("longevity_scores")
      .select("score, measured_on")
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(6),
  ]);

  const anagrafica = anagraficaRes.data as unknown as {
    patient_code: string | null;
    date_of_birth: string | null;
    profile: { full_name: string } | null;
  } | null;

  if (!anagrafica) return null;

  const punteggi = (punteggiRes.data ?? []) as { score: number; measured_on: string }[];

  // Il punteggio prima e dopo la visita: due rilevazioni ai due lati
  // della data, non le ultime due in assoluto.
  const dopoVisita = punteggi.find((p) => p.measured_on >= daGiorno) ?? null;
  const primaVisita = punteggi.find((p) => p.measured_on < daGiorno) ?? null;

  const referti = ((refertiRes.data ?? []) as {
    id: string;
    title: string;
    created_at: string;
    kind: string;
  }[]).filter((d) => d.kind === "lab_report" || d.kind === "imaging");

  const terapieAvviate = terapie
    .filter((t) => t.inizio >= daGiorno)
    .map((t) => ({ farmaco: t.farmaco, dose: t.dose, quando: t.inizio }));

  const terapieChiuse = terapie
    .filter((t) => t.stato === "suspended" || t.stato === "cancelled")
    .map((t) => ({ farmaco: t.farmaco, stato: t.stato, motivo: t.motivoStato }));

  const cambiamenti: CambiamentoDallaVisita = {
    visitaIl: v?.starts_at ?? null,
    visitaServizio: v?.service_name ?? null,
    punteggio:
      dopoVisita && primaVisita
        ? {
            prima: primaVisita.score,
            dopo: dopoVisita.score,
            delta: Math.round((dopoVisita.score - primaVisita.score) * 10) / 10,
          }
        : null,
    // Le variazioni della panoramica sono già il confronto fra le ultime
    // due rilevazioni: qui si tengono quelle la cui rilevazione recente
    // è successiva alla visita, che è ciò che «da allora» significa.
    variazioni: (panoramica?.variazioni ?? []).filter(
      (x) => x.attualeIl >= daGiorno,
    ),
    refertiNuovi: referti.map((d) => ({
      id: d.id,
      titolo: d.title,
      quando: d.created_at,
    })),
    terapieAvviate,
    terapieChiuse,
    noteNuove: (noteRes.data ?? []).length,
    consultiAperti: (consultiRes.data ?? []).length,
  };

  const terapieAttive = terapie.filter((t) => t.stato === "active");

  // Solo i parametri che dicono qualcosa: fuori range, oppure con tre
  // rilevazioni nella stessa direzione. Gli altri sono un elenco.
  const andamenti = andamentiTutti.filter((a) => a.fuoriOra || a.tendenza !== null);

  const eventiRecenti: EventoRecente[] = [
    ...referti.map((d) => ({
      quando: d.created_at,
      cosa: d.title,
      dettaglio: d.kind === "imaging" ? "Imaging" : "Laboratorio",
      categoria: "referto",
    })),
    ...terapieAvviate.map((t) => ({
      quando: `${t.quando}T09:00:00Z`,
      cosa: `Avviata ${t.farmaco} ${t.dose}`,
      dettaglio: null,
      categoria: "terapia",
    })),
  ]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, 12);

  return {
    paziente: {
      nome: anagrafica.profile?.full_name ?? "Paziente",
      eta: eta(anagrafica.date_of_birth),
      codice: anagrafica.patient_code,
    },
    generataIl: new Date().toISOString(),
    cambiamenti,
    fuoriRange: panoramica?.fuoriRange ?? [],
    andamenti,
    terapieAttive,
    eventiRecenti,
    domande: domandeDaApprofondire({
      fuoriRange: panoramica?.fuoriRange ?? [],
      andamenti,
      terapie: terapieAttive,
      cambiamenti,
      pilastriMancanti: panoramica?.pilastriMancanti ?? [],
      patientId,
    }),
    misureTotali: panoramica?.totaleMisure ?? 0,
    ultimaRilevazioneIl: panoramica?.ultimaRilevazioneIl ?? null,
  };
}

function eta(nascita: string | null): number | null {
  if (!nascita) return null;
  const n = new Date(nascita);
  const oggi = new Date();
  let anni = oggi.getFullYear() - n.getFullYear();
  const mese = oggi.getMonth() - n.getMonth();
  if (mese < 0 || (mese === 0 && oggi.getDate() < n.getDate())) anni--;
  return anni;
}

/* ── Le domande ───────────────────────────────────────────────────── */

/**
 * Cosa varrebbe la pena chiedersi.
 *
 * Regole scritte, non un modello, e ognuna porta con sé il fatto che
 * l'ha accesa. È la differenza fra un suggerimento che si può
 * verificare in due secondi e uno che va creduto sulla parola — e in
 * clinica il secondo, dopo la terza volta che sbaglia, viene ignorato
 * anche quando ha ragione.
 *
 * Sono deliberatamente **domande** e non raccomandazioni. «Vale la pena
 * chiedersi se la statina sia tollerata» è un invito a guardare; «sospendi
 * la statina» sarebbe una decisione clinica, e questa non è una cosa che
 * un software prende.
 */
function domandeDaApprofondire({
  fuoriRange,
  andamenti,
  terapie,
  cambiamenti,
  pilastriMancanti,
  patientId,
}: {
  fuoriRange: ValoreFuoriRange[];
  andamenti: AndamentoParametro[];
  terapie: Terapia[];
  cambiamenti: CambiamentoDallaVisita;
  pilastriMancanti: string[];
  patientId: string;
}): DomandaDaApprofondire[] {
  const domande: DomandaDaApprofondire[] = [];
  const clinico = `/pro/pazienti/${patientId}/clinico`;

  // Un valore che supera la soglia con cui Unique chiede la firma di un
  // medico non è «un valore fuori»: è il caso per cui quella soglia
  // esiste.
  for (const v of fuoriRange.filter((x) => x.sogliaClinica).slice(0, 3)) {
    domande.push({
      testo: `${v.metrica} è oltre la soglia clinica: è già stato commentato in cartella?`,
      perche: `${v.metrica} ${v.valore}${v.unita ? ` ${v.unita}` : ""} il ${v.misurataIl}.`,
      href: clinico,
    });
  }

  // Tre rilevazioni nella stessa direzione sono un andamento, e un
  // andamento è una domanda anche quando ogni singolo valore è dentro.
  for (const a of andamenti.filter((x) => x.tendenza !== null).slice(0, 3)) {
    const serie = a.punti.slice(-3).map((p) => p.valore).join(" → ");
    domande.push({
      testo: `${a.etichetta} è ${a.tendenza === "in-calo" ? "in calo" : "in salita"} da tre rilevazioni: è atteso?`,
      perche: `${serie}${a.unita ? ` ${a.unita}` : ""}.`,
      href: clinico,
    });
  }

  // Metà dosi non date è un problema di aderenza, e chi ha prescritto è
  // di solito l'ultimo a saperlo.
  for (const t of terapie) {
    if (!t.aderenza || t.aderenza.previste < 4) continue;
    if (t.aderenza.date / t.aderenza.previste >= 0.8) continue;

    domande.push({
      testo: `${t.farmaco} viene preso meno di quanto prescritto: è tollerato?`,
      perche: `${t.aderenza.date} dosi su ${t.aderenza.previste} negli ultimi quattordici giorni.`,
      href: `/pro/pazienti/${patientId}/piano`,
    });
  }

  if (cambiamenti.consultiAperti > 0) {
    domande.push({
      testo:
        cambiamenti.consultiAperti === 1
          ? "C'è un consulto ancora aperto su questa persona: serve ancora?"
          : `Ci sono ${cambiamenti.consultiAperti} consulti ancora aperti: servono ancora?`,
      perche: "Un consulto che resta aperto tiene aperto anche l'accesso alla cartella.",
      href: "/pro/comunicazioni/consulti",
    });
  }

  // Un pilastro non calcolabile non è un punteggio basso: è un dato che
  // manca, e va detto come tale.
  if (pilastriMancanti.length > 0) {
    domande.push({
      testo: `${pilastriMancanti.length === 1 ? "Un pilastro non è calcolabile" : `${pilastriMancanti.length} pilastri non sono calcolabili`}: vale la pena colmare i dati mancanti?`,
      perche: pilastriMancanti.join(", ") + ".",
      href: `/pro/pazienti/${patientId}/score`,
    });
  }

  if (
    cambiamenti.refertiNuovi.length > 0 &&
    cambiamenti.variazioni.length === 0
  ) {
    domande.push({
      testo: "Sono arrivati referti ma nessun valore nuovo è in cartella: sono stati letti?",
      perche: `${cambiamenti.refertiNuovi.length} ${cambiamenti.refertiNuovi.length === 1 ? "referto" : "referti"} dopo l'ultima visita, nessuna misura approvata da allora.`,
      href: `/pro/pazienti/${patientId}/documenti`,
    });
  }

  return domande;
}
