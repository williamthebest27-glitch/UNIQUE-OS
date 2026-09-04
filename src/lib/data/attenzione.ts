import { cache } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMetric } from "@/lib/score/metrics";
import { PILLAR_LABELS, type PillarKey } from "@/lib/score/pillars";
import {
  segnaliAttenzione,
  type AnomaliaFatto,
  type DocumentoFatto,
  type FattiAttenzione,
  type MessaggioFatto,
  type PazienteFatto,
  type PropostaFatto,
  type SegnaleAttenzione,
  type TaskFatto,
  type VisitaFatto,
} from "@/lib/clinical/attenzione";

/**
 * I fatti che alimentano il centro di attenzione.
 *
 * Qui non si decide niente: si legge il database e si costruisce la
 * struttura che le regole pure sanno leggere. È la stessa divisione di
 * `data/nba.ts` — e la ragione è la stessa: una soglia si discute
 * guardando `clinical/attenzione.ts`, non ricostruendola da otto query.
 *
 * **Nessuna query filtra per paziente.** La Row Level Security
 * restituisce già solo i pazienti del proprio care team: un
 * professionista non può ricevere qui una segnalazione su una persona
 * che non segue, nemmeno se questo file avesse un errore.
 */

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dataRomana(iso: string | Date): string {
  return ROMA.format(typeof iso === "string" ? new Date(iso) : iso);
}

function giorniDa(iso: string | null, oggi: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${oggi}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/* ── Fuori range ──────────────────────────────────────────────────── */

/**
 * Se un valore stia fuori, e secondo chi.
 *
 * Due intervalli diversi, e la differenza non è accademica. Quello del
 * laboratorio è **stampato sul referto**: dirlo è riportare un fatto.
 * Quello del catalogo è la soglia con cui Unique decide che un valore
 * ha bisogno di un medico: è un giudizio, versionato insieme
 * all'algoritmo dello Score.
 *
 * Il primo ha la precedenza quando c'è, perché è ciò che il paziente
 * legge sul proprio foglio — e una schermata che dice «nella norma» su
 * un valore segnato fuori dal laboratorio mette il professionista nella
 * posizione di dover spiegare una discordanza che non ha creato.
 */
function fuoriRange(
  code: string,
  value: number,
  refLow: number | null,
  refHigh: number | null,
): boolean {
  if (refLow !== null && value < refLow) return true;
  if (refHigh !== null && value > refHigh) return true;
  return getMetric(code)?.clinicalAlert?.(value) ?? false;
}

/* ── Righe del database ───────────────────────────────────────────── */

interface RigaProposta {
  id: string;
  patient_id: string;
  label: string;
  created_at: string;
  review_reasons: string[] | null;
  patient: { profile: { full_name: string } | null } | null;
  analysis: { document: { id: string; title: string } | null } | null;
}

interface RigaDocumento {
  id: string;
  patient_id: string;
  title: string;
  created_at: string;
  review_state: string;
  patient: { profile: { full_name: string } | null } | null;
}

interface RigaMisura {
  patient_id: string;
  metric_code: string;
  label: string;
  value: number | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  measured_on: string;
  patient: { profile: { full_name: string } | null } | null;
}

interface RigaVisita {
  id: string;
  patient_id: string;
  service_name: string;
  starts_at: string;
  status: string;
  patient: { profile: { full_name: string } | null } | null;
}

interface RigaTask {
  id: string;
  title: string;
  due_on: string | null;
  priority: number;
  origin: string;
  owner_id: string | null;
  created_at: string;
  patient_id: string | null;
  patient: { profile: { full_name: string } | null } | null;
  owner: { full_name: string } | null;
}

interface RigaFilo {
  id: string;
  patient_id: string;
  subject: string;
  category: string;
  last_message_at: string;
  patient: { profile: { full_name: string } | null } | null;
}

/**
 * Il motivo di revisione che segnala una soglia clinica.
 *
 * Vive in `brain/validation.ts` come `ReviewReason`. Qui basta la
 * stringa: importare il modulo trascinerebbe dentro il validatore
 * intero per confrontare una parola.
 */
const MOTIVO_SOGLIA = "clinical_threshold";

/* ── Raccolta ─────────────────────────────────────────────────────── */

export interface Attenzione {
  segnali: SegnaleAttenzione[];
  /** Il profilo che sta guardando: serve a dire «miei» e «del team». */
  profileId: string | null;
  /** Quanti segnali questa persona ha rimandato e non sono ancora tornati. */
  messiATacere: number;
}

interface Silenzio {
  motivo: string | null;
  fino: string;
}

interface Raccolta {
  /** Tutti i segnali che le regole producono, soppressioni comprese. */
  tutti: SegnaleAttenzione[];
  /** Le soppressioni ancora valide di chi sta guardando. */
  silenzi: Map<string, Silenzio>;
  profileId: string | null;
}

/**
 * La lettura completa: fatti, regole, e le soppressioni non ancora
 * scadute.
 *
 * Restituisce **tutti** i segnali, non quelli visibili. Filtrare qui
 * dentro renderebbe impossibile la schermata delle segnalazioni
 * rimandate — che deve poter risalire da un identificatore al segnale
 * intero, e mostrarlo com'è oggi. Chi vuole la coda da lavorare chiama
 * `getAttenzione`, che è questa più un filtro.
 *
 * Undici letture in parallelo. Sembrano tante e sono quelle che
 * servono: «cosa richiede me adesso» non ha una tabella che la
 * risponda, perché la risposta sta nell'incrocio fra referti, misure,
 * agenda, punteggi, task e messaggi. Metterle in serie costerebbe
 * undici viaggi uno dopo l'altro; in parallelo ne costa uno.
 */
const raccogli = cache(async (): Promise<Raccolta> => {
  if (!isSupabaseConfigured()) return { tutti: [], silenzi: new Map(), profileId: null };

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") {
    return { tutti: [], silenzi: new Map(), profileId: null };
  }

  const supabase = await createSupabaseServerClient();

  const adesso = new Date();
  const oggi = dataRomana(adesso);
  const daTreGiorni = new Date(adesso.getTime() - 3 * 86_400_000).toISOString();
  const daNovantaGiorni = new Date(adesso.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const finoADomani = new Date(adesso.getTime() + 36 * 3600 * 1000).toISOString();
  const daDieciGiorni = new Date(adesso.getTime() - 10 * 86_400_000).toISOString();

  const [
    proposteRes,
    documentiRes,
    misureRes,
    visiteRes,
    pazientiRes,
    taskRes,
    filiRes,
    briefingRes,
    silenziRes,
  ] = await Promise.all([
    supabase
      .from("measurement_proposals")
      .select(
        "id, patient_id, label, created_at, review_reasons, patient:patients(profile:profiles(full_name)), analysis:document_analyses(document:documents(id, title))",
      )
      .eq("status", "needs_review")
      .order("created_at", { ascending: true })
      .limit(200),

    supabase
      .from("documents")
      .select(
        "id, patient_id, title, created_at, review_state, patient:patients(profile:profiles(full_name))",
      )
      .eq("review_state", "pending")
      .order("created_at", { ascending: true })
      .limit(80),

    supabase
      .from("measurements")
      .select(
        "patient_id, metric_code, label, value, unit, ref_low, ref_high, measured_on, patient:patients(profile:profiles(full_name))",
      )
      .not("value", "is", null)
      .gte("measured_on", daNovantaGiorni)
      .order("measured_on", { ascending: false })
      .limit(500),

    // Da dieci giorni indietro: una visita senza esito più vecchia di
    // così non si registra più a memoria, e tenerla accesa in eterno
    // significherebbe una coda che non si svuota mai.
    supabase
      .from("appointments")
      .select(
        "id, patient_id, service_name, starts_at, status, patient:patients(profile:profiles(full_name))",
      )
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", daDieciGiorni)
      .lte("starts_at", finoADomani)
      .order("starts_at", { ascending: true })
      .limit(120),

    supabase
      .from("patients")
      .select("id, profile:profiles(full_name)")
      .limit(300),

    supabase
      .from("tasks")
      .select(
        "id, title, due_on, priority, origin, owner_id, created_at, patient_id, patient:patients(profile:profiles(full_name)), owner:profiles!tasks_owner_id_fkey(full_name)",
      )
      .eq("status", "open")
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(80),

    supabase
      .from("message_threads")
      .select(
        "id, patient_id, subject, category, last_message_at, patient:patients(profile:profiles(full_name))",
      )
      .eq("is_closed", false)
      .order("last_message_at", { ascending: false })
      .limit(60),

    // Le sintesi pre-visita recenti: servono solo a sapere se una visita
    // di oggi è già preparata.
    supabase
      .from("patient_briefings")
      .select("patient_id")
      .gte("created_at", daTreGiorni)
      .limit(200),

    // I segnali che questa persona ha messo a tacere e non sono ancora
    // riemersi. La policy li restringe già alle proprie righe.
    supabase
      .from("signal_dismissals")
      .select("signal_id, reason, until")
      .gte("until", oggi)
      .order("until", { ascending: true })
      .limit(300),
  ]);

  /* ── Proposte ─────────────────────────────────────────────── */
  const proposte: PropostaFatto[] = ((proposteRes.data ?? []) as unknown as RigaProposta[]).map(
    (r) => ({
      id: r.id,
      patientId: r.patient_id,
      patientName: r.patient?.profile?.full_name ?? "Paziente",
      documentId: r.analysis?.document?.id ?? null,
      documentTitle: r.analysis?.document?.title ?? null,
      label: r.label,
      createdAt: r.created_at,
      fuoriSoglia: (r.review_reasons ?? []).includes(MOTIVO_SOGLIA),
    }),
  );

  const propostePerDocumento = new Map<string, number>();
  for (const p of proposte) {
    if (!p.documentId) continue;
    propostePerDocumento.set(p.documentId, (propostePerDocumento.get(p.documentId) ?? 0) + 1);
  }

  /* ── Documenti ────────────────────────────────────────────── */
  const documenti: DocumentoFatto[] = (
    (documentiRes.data ?? []) as unknown as RigaDocumento[]
  ).map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient?.profile?.full_name ?? "Paziente",
    title: r.title,
    createdAt: r.created_at,
    reviewState: r.review_state,
    proposteInAttesa: propostePerDocumento.get(r.id) ?? 0,
  }));

  /* ── Anomalie ─────────────────────────────────────────────── */
  /* Solo l'ultima misura per metrica: un LDL alto misurato tre volte
     nello stesso trimestre è un valore da seguire, non tre. */
  const vista = new Set<string>();
  const anomalie: AnomaliaFatto[] = [];

  for (const r of (misureRes.data ?? []) as unknown as RigaMisura[]) {
    const chiave = `${r.patient_id}:${r.metric_code}`;
    if (vista.has(chiave)) continue;
    vista.add(chiave);

    const valore = r.value === null ? null : Number(r.value);
    if (valore === null) continue;

    const basso = r.ref_low === null ? null : Number(r.ref_low);
    const alto = r.ref_high === null ? null : Number(r.ref_high);
    if (!fuoriRange(r.metric_code, valore, basso, alto)) continue;

    anomalie.push({
      patientId: r.patient_id,
      patientName: r.patient?.profile?.full_name ?? "Paziente",
      metrica: r.label,
      valore: r.unit
        ? `${valore.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${r.unit}`
        : valore.toLocaleString("it-IT", { maximumFractionDigits: 2 }),
      misurataIl: r.measured_on,
    });
  }

  /* ── Visite ───────────────────────────────────────────────── */
  const preparati = new Set(
    ((briefingRes.data ?? []) as { patient_id: string }[]).map((b) => b.patient_id),
  );

  const visite: VisitaFatto[] = ((visiteRes.data ?? []) as unknown as RigaVisita[]).map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient?.profile?.full_name ?? "Paziente",
    servizio: r.service_name,
    iniziaAlle: r.starts_at,
    stato: r.status,
    oggi: dataRomana(r.starts_at) === oggi,
    passata: Date.parse(r.starts_at) < adesso.getTime(),
    preparata: preparati.has(r.patient_id),
  }));

  /* ── Pazienti: punteggio, percorso, pilastri ──────────────── */
  const pazienti = await fattiPaziente(supabase, pazientiRes.data, oggi);

  /* ── Task ─────────────────────────────────────────────────── */
  const task: TaskFatto[] = ((taskRes.data ?? []) as unknown as RigaTask[]).map((r) => ({
    id: r.id,
    titolo: r.title,
    patientId: r.patient_id,
    patientName: r.patient?.profile?.full_name ?? null,
    scadenzaIl: r.due_on,
    priorita: r.priority,
    origine: r.origin,
    assegnatarioId: r.owner_id,
    assegnatario: r.owner?.full_name ?? null,
    creatoIl: r.created_at,
  }));

  /* ── Messaggi ─────────────────────────────────────────────── */
  const fili = (filiRes.data ?? []) as unknown as RigaFilo[];
  const messaggi = await fattiMessaggio(supabase, fili);

  const fatti: FattiAttenzione = {
    oggi,
    proposte,
    documenti,
    anomalie,
    visite,
    pazienti,
    task,
    messaggi,
  };

  const silenzi = new Map<string, Silenzio>(
    ((silenziRes.data ?? []) as {
      signal_id: string;
      reason: string | null;
      until: string;
    }[]).map((r) => [r.signal_id, { motivo: r.reason, fino: r.until }]),
  );

  return { tutti: segnaliAttenzione(fatti), silenzi, profileId: profile.id };
});

/**
 * La coda da lavorare: tutto, meno ciò che è stato rimandato.
 *
 * La soppressione è l'ultimo passo, non un filtro sui fatti. Togliere le
 * righe **dopo** che le regole hanno guardato tutto è ciò che tiene
 * coerente il raggruppamento: se un referto messo a tacere sparisse
 * prima, le sue proposte tornerebbero a contarsi da sole e lo stesso PDF
 * produrrebbe di nuovo nove righe invece di zero.
 */
export async function getAttenzione(): Promise<Attenzione> {
  const { tutti, silenzi, profileId } = await raccogli();
  const segnali = tutti.filter((s) => !silenzi.has(s.id));

  return { segnali, profileId, messiATacere: tutti.length - segnali.length };
}

/* ── Ciò che è stato rimandato ────────────────────────────────────── */

export interface SegnaleRimandato {
  segnale: SegnaleAttenzione;
  motivo: string | null;
  fino: string;
}

/**
 * I segnali messi a tacere e ancora vivi.
 *
 * Chi rimanda deve poter rivedere cosa ha rimandato, e vederlo com'è
 * **oggi** — non com'era il giorno in cui l'ha messo via. Un referto
 * rimandato lunedì che nel frattempo un collega ha revisionato non
 * compare qui, perché quel segnale non esiste più. Mostrarlo comunque
 * sarebbe la peggiore delle liste: cose da riprendere in mano che
 * nessuno deve più toccare.
 */
export async function getRimandati(): Promise<SegnaleRimandato[]> {
  const { tutti, silenzi } = await raccogli();

  return tutti
    .filter((s) => silenzi.has(s.id))
    .map((segnale) => {
      const silenzio = silenzi.get(segnale.id)!;
      return { segnale, motivo: silenzio.motivo, fino: silenzio.fino };
    })
    .sort((a, b) => a.fino.localeCompare(b.fino));
}

/* ── Sotto-letture ────────────────────────────────────────────────── */

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Punteggio, percorso e pilastri mancanti, per ogni paziente seguito.
 *
 * Tre query invece di una per paziente: con duecento pazienti in
 * carico, un `select` annidato per riga sarebbero duecento viaggi, e la
 * home diventerebbe la pagina più lenta dell'applicazione proprio
 * mentre cerca di essere la prima che si apre.
 */
async function fattiPaziente(
  supabase: Client,
  righe: unknown,
  oggi: string,
): Promise<PazienteFatto[]> {
  const pazienti = (righe ?? []) as unknown as {
    id: string;
    profile: { full_name: string } | null;
  }[];

  if (pazienti.length === 0) return [];
  const ids = pazienti.map((p) => p.id);

  const [scoreRes, programRes, membershipRes] = await Promise.all([
    supabase
      .from("longevity_scores")
      .select("patient_id, measured_on, score_pillars(key, value)")
      .in("patient_id", ids)
      .order("measured_on", { ascending: false })
      .limit(600),
    supabase
      .from("program_enrollments")
      .select("patient_id, status, updated_at")
      .in("patient_id", ids)
      .eq("status", "active")
      .limit(300),
    supabase
      .from("memberships")
      .select("patient_id, is_active, status")
      .in("patient_id", ids)
      .eq("status", "active")
      .limit(300),
  ]);

  const ultimoPunteggio = new Map<string, { measuredOn: string; mancanti: string[] }>();

  for (const riga of (scoreRes.data ?? []) as unknown as {
    patient_id: string;
    measured_on: string;
    score_pillars: { key: string; value: number | null }[] | null;
  }[]) {
    if (ultimoPunteggio.has(riga.patient_id)) continue;
    ultimoPunteggio.set(riga.patient_id, {
      measuredOn: riga.measured_on,
      mancanti: (riga.score_pillars ?? [])
        .filter((p) => p.value === null)
        .map((p) => PILLAR_LABELS[p.key as PillarKey] ?? p.key),
    });
  }

  const percorsi = new Map(
    ((programRes.data ?? []) as { patient_id: string; updated_at: string }[]).map((p) => [
      p.patient_id,
      p.updated_at,
    ]),
  );

  const membership = new Set(
    ((membershipRes.data ?? []) as { patient_id: string; is_active: boolean }[])
      .filter((m) => m.is_active)
      .map((m) => m.patient_id),
  );

  return pazienti.map((p) => {
    const punteggio = ultimoPunteggio.get(p.id) ?? null;
    const fermo = percorsi.get(p.id) ?? null;

    return {
      patientId: p.id,
      patientName: p.profile?.full_name ?? "Paziente",
      giorniDaPunteggio: punteggio ? giorniDa(punteggio.measuredOn, oggi) : null,
      giorniPercorsoFermo: fermo ? giorniDa(fermo, oggi) : null,
      pilastriMancanti: punteggio?.mancanti ?? [],
      membershipAttiva: membership.has(p.id),
    };
  });
}

/**
 * I fili con messaggi del paziente che nessuno ha ancora letto.
 *
 * `read_by_staff_at` è null finché uno di noi non apre il filo: è quel
 * campo, e non `read_by_patient_at`, a dire che il messaggio aspetta
 * una risposta da questa parte.
 */
async function fattiMessaggio(
  supabase: Client,
  fili: RigaFilo[],
): Promise<MessaggioFatto[]> {
  if (fili.length === 0) return [];

  const { data } = await supabase
    .from("messages")
    .select("thread_id")
    .in(
      "thread_id",
      fili.map((f) => f.id),
    )
    .eq("from_patient", true)
    .is("read_by_staff_at", null)
    .limit(400);

  const conteggi = new Map<string, number>();
  for (const m of (data ?? []) as { thread_id: string }[]) {
    conteggi.set(m.thread_id, (conteggi.get(m.thread_id) ?? 0) + 1);
  }

  return fili.map((f) => ({
    threadId: f.id,
    patientId: f.patient_id,
    patientName: f.patient?.profile?.full_name ?? "Paziente",
    oggetto: f.subject,
    ultimoIl: f.last_message_at,
    nonLetti: conteggi.get(f.id) ?? 0,
    categoria: f.category,
  }));
}
