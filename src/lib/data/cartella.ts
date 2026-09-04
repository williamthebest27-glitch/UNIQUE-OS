import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeJourneyStage,
  type JourneyInput,
  type JourneyResult,
} from "@/lib/journey/stages";
import type { LongevityScore, ScorePoint, ScoreTrend } from "@/lib/domain/types";
import {
  confrontaMisure,
  metricheMancanti,
  type MisuraStorica,
  type Variazione,
} from "@/lib/clinical/cartella-domande";
import { getMetric } from "@/lib/score/metrics";
import { PILLAR_LABELS, type PillarKey } from "@/lib/score/pillars";

/**
 * La cartella clinica, letta per sezioni.
 *
 * Il workspace del paziente è una rotta per sezione, e ogni sezione
 * chiede solo ciò che disegna. La cartella intera in un `await` sarebbe
 * comoda da scrivere e sbagliata da aprire: chi entra per registrare
 * l'esito di una visita pagherebbe anche lo storico delle misure, la
 * knowledge base e il registro degli accessi.
 *
 * `getIntestazione` è l'eccezione, ed è memoizzata: la chiedono il
 * layout e quasi tutte le sezioni, e senza `cache` sarebbero due letture
 * identiche per ogni pagina.
 *
 * **Nessuna funzione qui filtra per paziente a mano.** Il `patient_id`
 * nelle query serve a scegliere di *chi* si parla, non a decidere chi
 * può leggerlo: quello lo fa `can_access_patient()` nella Row Level
 * Security, e se questo file avesse un errore Postgres restituirebbe
 * comunque zero righe.
 */

/* ── Intestazione ─────────────────────────────────────────────────── */

export interface CareTeamMembro {
  nome: string;
  titolo: string | null;
  specialita: string | null;
  ruolo: string | null;
}

export interface IntestazionePaziente {
  id: string;
  nome: string;
  codice: string | null;
  dataNascita: string | null;
  eta: number | null;
  sesso: string | null;
  altezzaCm: number | null;
  telefono: string | null;
  email: string | null;
  sede: string | null;
  careTeam: CareTeamMembro[];
  score: number | null;
  scorePrecedente: number | null;
  scoreIl: string | null;
  copertura: number | null;
  fase: JourneyResult | null;
  membership: { piano: string | null; stato: string | null; scadeIl: string | null } | null;
  crediti: { disponibili: number; assegnati: number; usati: number } | null;
  prossimaVisita: { id: string; servizio: string; quando: string } | null;
  /** Quanti valori estratti aspettano una revisione per questo paziente. */
  inRevisione: number;
  /** Quanti referti nessuno ha ancora aperto. */
  refertiDaLeggere: number;
}

function calcolaEta(dataNascita: string | null): number | null {
  if (!dataNascita) return null;
  const nato = new Date(dataNascita);
  const ora = new Date();
  let anni = ora.getUTCFullYear() - nato.getUTCFullYear();
  const primaDelCompleanno =
    ora.getUTCMonth() < nato.getUTCMonth() ||
    (ora.getUTCMonth() === nato.getUTCMonth() && ora.getUTCDate() < nato.getUTCDate());
  if (primaDelCompleanno) anni -= 1;
  return anni;
}

function giorniDa(iso: string | null, oggi: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${oggi}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * L'intestazione fissa del workspace.
 *
 * Nome, età, care team, punteggio, fase del percorso, membership,
 * crediti, prossima visita e le due code aperte. È ciò che resta visibile
 * scorrendo qualunque sezione, e la ragione per cui esiste: un medico
 * che legge una nota clinica deve continuare a sapere di chi la sta
 * leggendo.
 */
export const getIntestazione = cache(
  async (patientId: string): Promise<IntestazionePaziente | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const oggi = new Date().toISOString().slice(0, 10);

    const [
      pazienteRes,
      scoreRes,
      membershipRes,
      creditiRes,
      visitaRes,
      proposteRes,
      refertiRes,
      programRes,
      leadRes,
      visiteFatteRes,
    ] = await Promise.all([
      supabase
        .from("patients")
        .select(
          "id, patient_code, date_of_birth, sex_at_birth, height_cm, profile:profiles!patients_profile_id_fkey(full_name, email, phone), location:locations(name), care_team_members(role_in_team, professionals(title, specialty, profiles(full_name)))",
        )
        .eq("id", patientId)
        .maybeSingle(),

      supabase
        .from("longevity_scores")
        .select("score, previous_score, measured_on, coverage")
        .eq("patient_id", patientId)
        .order("measured_on", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("memberships")
        .select("status, is_active, ends_on, created_at, tier:membership_tiers(name)")
        .eq("patient_id", patientId)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("credit_balances")
        .select("available, total_credited, total_used")
        .eq("patient_id", patientId)
        .maybeSingle(),

      supabase
        .from("appointments")
        .select("id, service_name, starts_at")
        .eq("patient_id", patientId)
        .in("status", ["scheduled", "confirmed"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("measurement_proposals")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId)
        .eq("status", "needs_review"),

      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId)
        .eq("review_state", "pending"),

      supabase
        .from("program_enrollments")
        .select("status, started_on, updated_at")
        .eq("patient_id", patientId)
        .order("started_on", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("leads")
        .select("status")
        .eq("patient_id", patientId)
        .limit(1)
        .maybeSingle(),

      supabase
        .from("appointments")
        .select("starts_at")
        .eq("patient_id", patientId)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .limit(1),
    ]);

    const riga = pazienteRes.data as unknown as {
      id: string;
      patient_code: string | null;
      date_of_birth: string | null;
      sex_at_birth: string | null;
      height_cm: number | null;
      profile: { full_name: string; email: string | null; phone: string | null } | null;
      location: { name: string } | null;
      care_team_members: {
        role_in_team: string | null;
        professionals: {
          title: string | null;
          specialty: string | null;
          profiles: { full_name: string } | null;
        } | null;
      }[];
    } | null;

    if (!riga) return null;

    const score = scoreRes.data as {
      score: number;
      previous_score: number | null;
      measured_on: string;
      coverage: number | null;
    } | null;

    const membership = membershipRes.data as {
      status: string;
      is_active: boolean;
      ends_on: string | null;
      created_at: string;
      tier: { name: string } | null;
    } | null;

    const crediti = creditiRes.data as {
      available: number | string;
      total_credited: number | string;
      total_used: number | string;
    } | null;

    const programma = programRes.data as {
      status: string;
      started_on: string;
      updated_at: string;
    } | null;

    const lead = leadRes.data as { status: string } | null;
    const ultimaVisita = ((visiteFatteRes.data ?? []) as { starts_at: string }[])[0] ?? null;

    const fase = computeJourneyStage({
      leadLost: lead?.status === "lost",
      hasBookedFirstVisit: ultimaVisita !== null || visitaRes.data !== null,
      hasScore: score !== null,
      lastScoreOn: score?.measured_on ?? null,
      hasPlan: programma !== null,
      membershipProposedAt:
        membership && !membership.is_active ? membership.created_at : null,
      membershipActive: Boolean(membership?.is_active && membership.status === "active"),
      membershipEnded: Boolean(
        membership && ["cancelled", "expired"].includes(membership.status),
      ),
      programActive: programma?.status === "active",
      lastActivityOn:
        ultimaVisita?.starts_at.slice(0, 10) ??
        programma?.updated_at.slice(0, 10) ??
        null,
      today: oggi,
    });

    const visita = visitaRes.data as {
      id: string;
      service_name: string;
      starts_at: string;
    } | null;

    return {
      id: riga.id,
      nome: riga.profile?.full_name ?? "Paziente",
      codice: riga.patient_code,
      dataNascita: riga.date_of_birth,
      eta: calcolaEta(riga.date_of_birth),
      sesso: riga.sex_at_birth,
      altezzaCm: riga.height_cm === null ? null : Number(riga.height_cm),
      telefono: riga.profile?.phone ?? null,
      email: riga.profile?.email ?? null,
      sede: riga.location?.name ?? null,
      careTeam: (riga.care_team_members ?? [])
        .filter((m) => m.professionals?.profiles?.full_name)
        .map((m) => ({
          nome: m.professionals!.profiles!.full_name,
          titolo: m.professionals?.title ?? null,
          specialita: m.professionals?.specialty ?? null,
          ruolo: m.role_in_team,
        })),
      score: score ? Number(score.score) : null,
      scorePrecedente: score?.previous_score === null ? null : Number(score?.previous_score),
      scoreIl: score?.measured_on ?? null,
      copertura: score?.coverage === null ? null : Number(score?.coverage),
      fase,
      membership: membership
        ? {
            piano: membership.tier?.name ?? null,
            stato: membership.status,
            scadeIl: membership.ends_on,
          }
        : null,
      crediti: crediti
        ? {
            disponibili: Number(crediti.available),
            assegnati: Number(crediti.total_credited),
            usati: Number(crediti.total_used),
          }
        : null,
      prossimaVisita: visita
        ? { id: visita.id, servizio: visita.service_name, quando: visita.starts_at }
        : null,
      inRevisione: proposteRes.count ?? 0,
      refertiDaLeggere: refertiRes.count ?? 0,
    };
  },
);

/* ── La sintesi clinica ───────────────────────────────────────────── */

export interface ValoreFuoriRange {
  metrica: string;
  valore: number;
  unita: string | null;
  misurataIl: string;
  /** L'intervallo stampato sul referto, quando c'è. */
  riferimento: { basso: number | null; alto: number | null } | null;
  /** Vero se supera la soglia con cui Unique chiede la firma di un medico. */
  sogliaClinica: boolean;
}

export interface PanoramicaClinica {
  /** Le due rilevazioni a confronto, per ogni metrica che ne ha due. */
  variazioni: Variazione[];
  migliorate: Variazione[];
  peggiorate: Variazione[];
  stabili: number;
  /** I valori dell'ultima rilevazione che stanno fuori. */
  fuoriRange: ValoreFuoriRange[];
  /** Metriche del catalogo di cui non esiste nessuna misura. */
  mancanti: { codice: string; label: string; fonte: string }[];
  /** I pilastri non calcolabili nell'ultimo punteggio. */
  pilastriMancanti: string[];
  ultimaRilevazioneIl: string | null;
  penultimaRilevazioneIl: string | null;
  /** Quante misure approvate ci sono in tutto. */
  totaleMisure: number;
  /** Le note e valutazioni più recenti: cosa ha scritto chi ha visitato. */
  note: {
    id: string;
    tipo: string;
    titolo: string | null;
    corpo: string;
    autore: string | null;
    quando: string;
    condivisa: boolean;
  }[];
  prossimiControlli: { servizio: string; quando: string }[];
}

/**
 * La situazione clinica, ricostruita dalle misure.
 *
 * **Non c'è nessun giudizio nuovo in questa funzione.** «Migliorato» e
 * «peggiorato» li decide `confrontaMisure`, che guarda il punteggio che
 * ogni valore ottiene sulla **propria curva di normalizzazione** — la
 * stessa che alimenta il Longevity Score. È la ragione per cui una
 * glicata che scende si legge come un miglioramento e un colesterolo
 * HDL che scende no, senza che qui dentro esista un elenco di eccezioni.
 *
 * Riporta fatti: questo valore era così, adesso è così, sta dentro o
 * fuori dall'intervallo. Cosa significhi per quella persona è medicina,
 * e non è scritto da nessuna parte in questo file.
 *
 * Legge solo le misure **approvate**. Ciò che è ancora in coda di
 * revisione non entra: sarebbe un valore non validato presentato come
 * un fatto, ed è esattamente l'errore che la coda esiste per evitare.
 */
export async function getPanoramicaClinica(
  patientId: string,
): Promise<PanoramicaClinica | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const [misureRes, punteggioRes, noteRes, visiteRes] = await Promise.all([
    supabase
      .from("measurements")
      .select("metric_code, label, value, unit, ref_low, ref_high, measured_on")
      .eq("patient_id", patientId)
      .not("value", "is", null)
      .order("measured_on", { ascending: false })
      .limit(600),

    supabase
      .from("longevity_scores")
      .select("measured_on, score_pillars(key, value)")
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("clinical_notes")
      .select(
        "id, kind, title, body, visible_to_patient, created_at, author:profiles(full_name)",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("appointments")
      .select("service_name, starts_at")
      .eq("patient_id", patientId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(5),
  ]);

  const righe = (misureRes.data ?? []) as {
    metric_code: string;
    label: string;
    value: number;
    unit: string | null;
    ref_low: number | null;
    ref_high: number | null;
    measured_on: string;
  }[];

  const misure: MisuraStorica[] = righe.map((m) => ({
    code: m.metric_code,
    value: Number(m.value),
    measuredOn: m.measured_on,
  }));

  const variazioni = confrontaMisure(misure);

  /* ── Fuori range ──────────────────────────────────────────── */
  /* Solo l'ultimo valore per metrica: lo stesso LDL alto misurato tre
     volte è un valore da seguire, non tre segnalazioni. */
  const vista = new Set<string>();
  const fuoriRange: ValoreFuoriRange[] = [];

  for (const m of righe) {
    if (vista.has(m.metric_code)) continue;
    vista.add(m.metric_code);

    const valore = Number(m.value);
    const basso = m.ref_low === null ? null : Number(m.ref_low);
    const alto = m.ref_high === null ? null : Number(m.ref_high);

    const fuoriLaboratorio =
      (basso !== null && valore < basso) || (alto !== null && valore > alto);
    const sogliaClinica = getMetric(m.metric_code)?.clinicalAlert?.(valore) ?? false;

    if (!fuoriLaboratorio && !sogliaClinica) continue;

    fuoriRange.push({
      metrica: m.label,
      valore,
      unita: m.unit,
      misurataIl: m.measured_on,
      riferimento: basso !== null || alto !== null ? { basso, alto } : null,
      sogliaClinica,
    });
  }

  /* ── Le date delle due rilevazioni a confronto ────────────── */
  const date = [...new Set(righe.map((m) => m.measured_on))].sort((a, b) =>
    b.localeCompare(a),
  );

  const punteggio = punteggioRes.data as {
    measured_on: string;
    score_pillars: { key: string; value: number | null }[] | null;
  } | null;

  return {
    variazioni,
    migliorate: variazioni.filter((v) => v.direzione === "migliorato"),
    peggiorate: variazioni.filter((v) => v.direzione === "peggiorato"),
    stabili: variazioni.filter((v) => v.direzione === "stabile").length,
    fuoriRange: fuoriRange.sort(
      (a, b) =>
        Number(b.sogliaClinica) - Number(a.sogliaClinica) ||
        b.misurataIl.localeCompare(a.misurataIl),
    ),
    mancanti: metricheMancanti(misure).map((m) => ({
      codice: m.code,
      label: m.label,
      fonte: m.source,
    })),
    pilastriMancanti: (punteggio?.score_pillars ?? [])
      .filter((p) => p.value === null)
      .map((p) => PILLAR_LABELS[p.key as PillarKey] ?? p.key),
    ultimaRilevazioneIl: date[0] ?? null,
    penultimaRilevazioneIl: date[1] ?? null,
    totaleMisure: righe.length,
    note: ((noteRes.data ?? []) as unknown as {
      id: string;
      kind: string;
      title: string | null;
      body: string;
      visible_to_patient: boolean;
      created_at: string;
      author: { full_name: string } | null;
    }[]).map((n) => ({
      id: n.id,
      tipo: n.kind,
      titolo: n.title,
      corpo: n.body,
      autore: n.author?.full_name ?? null,
      quando: n.created_at,
      condivisa: n.visible_to_patient,
    })),
    prossimiControlli: ((visiteRes.data ?? []) as {
      service_name: string;
      starts_at: string;
    }[]).map((v) => ({ servizio: v.service_name, quando: v.starts_at })),
  };
}

/* ── Lo Score, per intero ─────────────────────────────────────────── */

export interface PilastroDettagliato {
  chiave: PillarKey;
  label: string;
  valore: number | null;
  copertura: number | null;
  delta: number | null;
  /** Le metriche che lo compongono, con l'ultimo valore noto. */
  metriche: {
    codice: string;
    label: string;
    unita: string;
    valore: number | null;
    misurataIl: string | null;
    direzione: Variazione["direzione"] | null;
    deltaPunteggio: number | null;
    fuoriSoglia: boolean;
  }[];
}

export interface ScoreCompleto {
  score: number | null;
  precedente: number | null;
  misuratoIl: string | null;
  copertura: number | null;
  etaBiologica: number | null;
  storico: { misuratoIl: string; score: number }[];
  pilastri: PilastroDettagliato[];
  /** Le variazioni che hanno mosso il punteggio, dalla più forte. */
  fattori: Variazione[];
  /** Da quanti giorni il punteggio non viene rifatto. */
  giorniDaUltimo: number | null;
  /**
   * Lo stesso punteggio nella forma che conosce la Signature.
   *
   * Il componente dell'hero è quello della Patient App e non va
   * riscritto: la figura generativa è la stessa persona vista dal
   * medico, e due disegni diversi dello stesso punteggio sarebbero due
   * verità. Qui si adatta la forma, non si ricalcola niente.
   */
  perHero: LongevityScore | null;
  storicoPerHero: ScorePoint[];
}

/**
 * Lo Score con dentro il perché.
 *
 * Un numero che cambia da 74 a 78 senza dire cosa l'ha mosso è un numero
 * di cui fidarsi o non fidarsi — e in clinica «fidarsi» non è una
 * categoria utile. I fattori sono le variazioni delle singole metriche
 * ordinate per quanto hanno pesato sulla propria curva: sono la
 * risposta alla sola domanda che conta guardando un punteggio salito.
 */
export async function getScoreCompleto(patientId: string): Promise<ScoreCompleto | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const [storicoRes, misureRes] = await Promise.all([
    supabase
      .from("longevity_scores")
      .select(
        "id, score, previous_score, measured_on, coverage, biological_age, trend, summary, score_pillars(key, label, value, coverage, delta)",
      )
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(12),

    supabase
      .from("measurements")
      .select("metric_code, label, value, unit, measured_on")
      .eq("patient_id", patientId)
      .not("value", "is", null)
      .order("measured_on", { ascending: false })
      .limit(600),
  ]);

  const storico = (storicoRes.data ?? []) as unknown as {
    id: string;
    score: number;
    previous_score: number | null;
    measured_on: string;
    coverage: number | null;
    biological_age: number | null;
    trend: ScoreTrend | null;
    summary: string | null;
    score_pillars: {
      key: string;
      label: string;
      value: number | null;
      coverage: number | null;
      delta: number | null;
    }[];
  }[];

  const ultimo = storico[0] ?? null;

  const righe = (misureRes.data ?? []) as {
    metric_code: string;
    label: string;
    value: number;
    unit: string | null;
    measured_on: string;
  }[];

  const variazioni = confrontaMisure(
    righe.map((m) => ({
      code: m.metric_code,
      value: Number(m.value),
      measuredOn: m.measured_on,
    })),
  );

  const pilastri: PilastroDettagliato[] = (ultimo?.score_pillars ?? []).map((p) => {
    const chiave = p.key as PillarKey;
    const metriche = variazioni
      .filter((v) => getMetric(v.code)?.pillar === chiave)
      .map((v) => ({
        codice: v.code,
        label: v.label,
        unita: v.unit,
        valore: v.attuale,
        misurataIl: v.attualeIl,
        direzione: v.direzione,
        deltaPunteggio: v.deltaPunteggio,
        fuoriSoglia: v.fuoriSoglia,
      }));

    return {
      chiave,
      label: p.label ?? PILLAR_LABELS[chiave] ?? p.key,
      valore: p.value === null ? null : Number(p.value),
      copertura: p.coverage === null ? null : Number(p.coverage),
      delta: p.delta === null ? null : Number(p.delta),
      metriche,
    };
  });

  const storicoPerHero: ScorePoint[] = [...storico]
    .reverse()
    .map((s) => ({ measuredOn: s.measured_on, score: Number(s.score) }));

  return {
    score: ultimo ? Number(ultimo.score) : null,
    precedente: ultimo?.previous_score === null ? null : Number(ultimo?.previous_score),
    misuratoIl: ultimo?.measured_on ?? null,
    copertura: ultimo?.coverage === null ? null : Number(ultimo?.coverage),
    etaBiologica: ultimo?.biological_age === null ? null : Number(ultimo?.biological_age),
    storico: [...storico]
      .reverse()
      .map((s) => ({ misuratoIl: s.measured_on, score: Number(s.score) })),
    storicoPerHero,
    perHero: ultimo
      ? {
          id: ultimo.id,
          measuredOn: ultimo.measured_on,
          score: Number(ultimo.score),
          previousScore:
            ultimo.previous_score === null ? null : Number(ultimo.previous_score),
          trend: ultimo.trend,
          biologicalAge:
            ultimo.biological_age === null ? null : Number(ultimo.biological_age),
          summary: ultimo.summary,
          coverage: ultimo.coverage === null ? null : Number(ultimo.coverage),
          pillars: pilastri.map((p) => ({
            key: p.chiave,
            label: p.label,
            value: p.valore,
            coverage: p.copertura,
            delta: p.delta,
          })),
        }
      : null,
    pilastri,
    // Solo le metriche che hanno davvero mosso qualcosa, dalla più
    // forte: un elenco di trenta righe fra cui ventisette dicono «stabile»
    // nasconde le tre che contano.
    fattori: variazioni
      .filter((v) => v.deltaPunteggio !== null && v.direzione !== "stabile")
      .sort(
        (a, b) => Math.abs(b.deltaPunteggio ?? 0) - Math.abs(a.deltaPunteggio ?? 0),
      ),
    giorniDaUltimo: giorniDa(ultimo?.measured_on ?? null, oggi),
  };
}

/* ── I documenti della cartella ───────────────────────────────────── */

export interface DocumentoInCartella {
  id: string;
  titolo: string;
  tipo: string;
  emessoIl: string | null;
  caricatoIl: string;
  dimensione: number | null;
  caricatoDa: string | null;
  statoRevisione: string;
  revisionatoDa: string | null;
  revisionatoIl: string | null;
  notaRevisione: string | null;
  /** L'ultima analisi del motore: `pending`, `completed`, `failed` o null. */
  statoAnalisi: string | null;
  sintesiAnalisi: string | null;
  /** Quanti valori quel referto ha prodotto, e quanti aspettano ancora. */
  valoriEstratti: number;
  valoriInAttesa: number;
}

/**
 * I referti in cartella, con i due stati che non vanno confusi.
 *
 * `statoAnalisi` dice se il motore ha letto il PDF: è un fatto tecnico,
 * e un referto scansionato risulta «analizzato» senza che nessuno abbia
 * capito cosa c'è scritto. `statoRevisione` dice se una persona l'ha
 * guardato. Solo il secondo è un'informazione clinica, ed è la ragione
 * per cui la migrazione che lo ha introdotto esiste.
 */
export async function getDocumentiPaziente(
  patientId: string,
): Promise<DocumentoInCartella[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  const [documentiRes, proposteRes] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, title, kind, issued_on, created_at, size_bytes, review_state, reviewed_at, review_note, " +
          "uploader:profiles!documents_uploaded_by_fkey(full_name), " +
          "revisore:profiles!documents_reviewed_by_fkey(full_name), " +
          "analyses:document_analyses(id, status, summary, created_at)",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(60),

    supabase
      .from("measurement_proposals")
      .select("status, analysis:document_analyses(document_id)")
      .eq("patient_id", patientId)
      .limit(400),
  ]);

  // Quante misure ha prodotto ciascun referto, e quante sono ancora in
  // coda: è il numero che rende leggibile «analizzato» — un referto con
  // nove valori in attesa non è lavoro finito.
  const estratti = new Map<string, { totale: number; inAttesa: number }>();

  for (const p of (proposteRes.data ?? []) as unknown as {
    status: string;
    analysis: { document_id: string } | null;
  }[]) {
    const doc = p.analysis?.document_id;
    if (!doc) continue;
    const conto = estratti.get(doc) ?? { totale: 0, inAttesa: 0 };
    conto.totale += 1;
    if (p.status === "needs_review") conto.inAttesa += 1;
    estratti.set(doc, conto);
  }

  return ((documentiRes.data ?? []) as unknown as {
    id: string;
    title: string;
    kind: string;
    issued_on: string | null;
    created_at: string;
    size_bytes: number | null;
    review_state: string;
    reviewed_at: string | null;
    review_note: string | null;
    uploader: { full_name: string } | null;
    revisore: { full_name: string } | null;
    analyses: { id: string; status: string; summary: string | null; created_at: string }[] | null;
  }[]).map((r) => {
    const ultima = [...(r.analyses ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
    const conto = estratti.get(r.id) ?? { totale: 0, inAttesa: 0 };

    return {
      id: r.id,
      titolo: r.title,
      tipo: r.kind,
      emessoIl: r.issued_on,
      caricatoIl: r.created_at,
      dimensione: r.size_bytes === null ? null : Number(r.size_bytes),
      caricatoDa: r.uploader?.full_name ?? null,
      statoRevisione: r.review_state,
      revisionatoDa: r.revisore?.full_name ?? null,
      revisionatoIl: r.reviewed_at,
      notaRevisione: r.review_note,
      statoAnalisi: ultima?.status ?? null,
      sintesiAnalisi: ultima?.summary ?? null,
      valoriEstratti: conto.totale,
      valoriInAttesa: conto.inAttesa,
    };
  });
}

/* ── Il piano ─────────────────────────────────────────────────────── */

export interface PianoClinico {
  percorso: {
    id: string;
    nome: string;
    descrizione: string | null;
    stato: string;
    iniziatoIl: string;
    finisceIl: string | null;
    progresso: number;
    passiFatti: number;
    passiTotali: number;
    durataGiorni: number | null;
  } | null;
  /** Le azioni consigliate: sono gli interventi del piano. */
  interventi: {
    id: string;
    titolo: string;
    descrizione: string | null;
    pilastro: string | null;
    origine: string;
    stato: string;
    scadenzaIl: string | null;
    priorita: number;
  }[];
  /** Proposte di percorso in attesa di una decisione medica. */
  proposte: {
    id: string;
    titolo: string;
    descrizione: string | null;
    propostaDa: string | null;
    quando: string;
  }[];
  /** I servizi acquistati: cosa il paziente ha già pagato. */
  servizi: {
    id: string;
    nome: string;
    descrizione: string | null;
    creditiAssegnati: number;
    acquistatoIl: string;
  }[];
  /** Quando tocca rifare il punto. */
  prossimaRivalutazione: { quando: string; motivo: string } | null;
}

export async function getPiano(patientId: string): Promise<PianoClinico | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const [percorsoRes, azioniRes, proposteRes, serviziRes, scoreRes] = await Promise.all([
    supabase
      .from("program_enrollments")
      .select(
        "id, status, started_on, ends_on, progress_pct, steps_done, steps_total, program:programs(name, description, duration_days)",
      )
      .eq("patient_id", patientId)
      .order("started_on", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("recommended_actions")
      .select("id, title, description, pillar_key, source, status, due_on, priority")
      .eq("patient_id", patientId)
      .order("priority", { ascending: true })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(40),

    supabase
      .from("care_plan_proposals")
      .select(
        "id, title, description, created_at, proposer:profiles!care_plan_proposals_proposed_by_fkey(full_name)",
      )
      .eq("patient_id", patientId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("service_purchases")
      .select("id, credits_granted, purchased_on, service:services(name, description)")
      .eq("patient_id", patientId)
      .order("purchased_on", { ascending: false })
      .limit(20),

    supabase
      .from("longevity_scores")
      .select("measured_on")
      .eq("patient_id", patientId)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const percorso = percorsoRes.data as unknown as {
    id: string;
    status: string;
    started_on: string;
    ends_on: string | null;
    progress_pct: number;
    steps_done: number;
    steps_total: number;
    program: { name: string; description: string | null; duration_days: number | null } | null;
  } | null;

  const ultimoScore = (scoreRes.data as { measured_on: string } | null)?.measured_on ?? null;
  const giorniDaScore = giorniDa(ultimoScore, oggi);

  return {
    percorso: percorso
      ? {
          id: percorso.id,
          nome: percorso.program?.name ?? "Percorso",
          descrizione: percorso.program?.description ?? null,
          stato: percorso.status,
          iniziatoIl: percorso.started_on,
          finisceIl: percorso.ends_on,
          progresso: Number(percorso.progress_pct),
          passiFatti: percorso.steps_done,
          passiTotali: percorso.steps_total,
          durataGiorni: percorso.program?.duration_days ?? null,
        }
      : null,

    interventi: ((azioniRes.data ?? []) as {
      id: string;
      title: string;
      description: string | null;
      pillar_key: string | null;
      source: string;
      status: string;
      due_on: string | null;
      priority: number;
    }[]).map((a) => ({
      id: a.id,
      titolo: a.title,
      descrizione: a.description,
      pilastro: a.pillar_key
        ? (PILLAR_LABELS[a.pillar_key as PillarKey] ?? a.pillar_key)
        : null,
      origine: a.source,
      stato: a.status,
      scadenzaIl: a.due_on,
      priorita: a.priority,
    })),

    proposte: ((proposteRes.data ?? []) as unknown as {
      id: string;
      title: string;
      description: string | null;
      created_at: string;
      proposer: { full_name: string } | null;
    }[]).map((p) => ({
      id: p.id,
      titolo: p.title,
      descrizione: p.description,
      propostaDa: p.proposer?.full_name ?? null,
      quando: p.created_at,
    })),

    servizi: ((serviziRes.data ?? []) as unknown as {
      id: string;
      credits_granted: number;
      purchased_on: string;
      service: { name: string; description: string | null } | null;
    }[]).map((s) => ({
      id: s.id,
      nome: s.service?.name ?? "Servizio",
      descrizione: s.service?.description ?? null,
      creditiAssegnati: Number(s.credits_granted),
      acquistatoIl: s.purchased_on,
    })),

    /*
     * La prossima rivalutazione non è una data in tabella: è derivata.
     * Un campo scritto a mano si disallinea al primo controllo spostato,
     * e una data sbagliata in un piano di cura è peggio di nessuna data.
     */
    prossimaRivalutazione:
      ultimoScore === null
        ? { quando: oggi, motivo: "Nessun punteggio registrato: il primo è da fare." }
        : giorniDaScore !== null && giorniDaScore >= 120
          ? {
              quando: oggi,
              motivo: `Ultimo punteggio ${giorniDaScore} giorni fa: la finestra trimestrale è passata.`,
            }
          : {
              quando: new Date(
                Date.parse(`${ultimoScore}T00:00:00Z`) + 120 * 86_400_000,
              )
                .toISOString()
                .slice(0, 10),
              motivo: `Quattro mesi dall'ultimo punteggio del ${ultimoScore}.`,
            },
  };
}

/* ── Il percorso ──────────────────────────────────────────────────── */

export interface PercorsoPaziente {
  fase: JourneyResult;
  /** I fatti che hanno prodotto la fase: servono a spiegare l'avanzamento. */
  fatti: JourneyInput;
  membership: {
    piano: string | null;
    stato: string;
    attiva: boolean;
    iniziaIl: string | null;
    finisceIl: string | null;
    rinnovaIl: string | null;
    rinnovoAutomatico: boolean;
  } | null;
  crediti: {
    assegnati: number;
    usati: number;
    disponibili: number;
    movimenti: {
      id: string;
      tipo: string;
      importo: number;
      descrizione: string | null;
      quando: string;
    }[];
  } | null;
  /** Le tappe già percorse, ricostruite dai fatti e non da un campo. */
  tappe: { quando: string; cosa: string }[];
}

/**
 * Dove si trova il paziente nel suo percorso, e perché.
 *
 * Restituisce anche i `fatti` in ingresso, non solo la fase: è l'unico
 * modo perché la schermata possa dire **cosa manca** senza tenere una
 * seconda copia delle regole. Chi disegna la mappa passa questi stessi
 * fatti a `avanzamento()`, che li rilegge al positivo.
 */
export async function getPercorsoPaziente(
  patientId: string,
): Promise<PercorsoPaziente | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const [membershipRes, creditiRes, movimentiRes, programRes, leadRes, visiteRes, scoreRes] =
    await Promise.all([
      supabase
        .from("memberships")
        .select(
          "status, is_active, starts_on, ends_on, renews_on, auto_renew, created_at, tier:membership_tiers(name)",
        )
        .eq("patient_id", patientId)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("credit_balances")
        .select("available, total_credited, total_used")
        .eq("patient_id", patientId)
        .maybeSingle(),

      supabase
        .from("credit_entries")
        .select("id, entry_type, amount, description, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("program_enrollments")
        .select("status, started_on, updated_at")
        .eq("patient_id", patientId)
        .order("started_on", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("leads")
        .select("status, first_seen_at")
        .eq("patient_id", patientId)
        .limit(1)
        .maybeSingle(),

      supabase
        .from("appointments")
        .select("starts_at, status")
        .eq("patient_id", patientId)
        .order("starts_at", { ascending: true })
        .limit(60),

      supabase
        .from("longevity_scores")
        .select("measured_on")
        .eq("patient_id", patientId)
        .order("measured_on", { ascending: true })
        .limit(20),
    ]);

  const membership = membershipRes.data as unknown as {
    status: string;
    is_active: boolean;
    starts_on: string | null;
    ends_on: string | null;
    renews_on: string | null;
    auto_renew: boolean;
    created_at: string;
    tier: { name: string } | null;
  } | null;

  const programma = programRes.data as {
    status: string;
    started_on: string;
    updated_at: string;
  } | null;

  const lead = leadRes.data as { status: string; first_seen_at: string } | null;

  const visite = (visiteRes.data ?? []) as { starts_at: string; status: string }[];
  const punteggi = (scoreRes.data ?? []) as { measured_on: string }[];
  const svolte = visite.filter((v) => v.status === "completed");

  const fatti: JourneyInput = {
    leadLost: lead?.status === "lost",
    hasBookedFirstVisit: visite.length > 0,
    hasScore: punteggi.length > 0,
    lastScoreOn: punteggi.at(-1)?.measured_on ?? null,
    hasPlan: programma !== null,
    membershipProposedAt:
      membership && !membership.is_active ? membership.created_at : null,
    membershipActive: Boolean(membership?.is_active && membership.status === "active"),
    membershipEnded: Boolean(
      membership && ["cancelled", "expired"].includes(membership.status),
    ),
    programActive: programma?.status === "active",
    lastActivityOn:
      svolte.at(-1)?.starts_at.slice(0, 10) ??
      programma?.updated_at.slice(0, 10) ??
      null,
    today: oggi,
  };

  const crediti = creditiRes.data as {
    available: number | string;
    total_credited: number | string;
    total_used: number | string;
  } | null;

  /*
   * Le tappe si ricostruiscono dai fatti, non da un campo di stato.
   *
   * È la stessa scelta del customer journey: uno storico scritto a mano
   * si disallinea al primo passaggio dimenticato, e a quel punto
   * racconta un percorso che non è successo.
   */
  const tappe: { quando: string; cosa: string }[] = [];
  if (lead) tappe.push({ quando: lead.first_seen_at.slice(0, 10), cosa: "Primo contatto" });
  if (visite[0]) {
    tappe.push({ quando: visite[0].starts_at.slice(0, 10), cosa: "Prima visita" });
  }
  if (punteggi[0]) {
    tappe.push({ quando: punteggi[0].measured_on, cosa: "Primo Longevity Score" });
  }
  if (membership?.starts_on) {
    tappe.push({ quando: membership.starts_on, cosa: "Membership attivata" });
  }
  if (programma) {
    tappe.push({ quando: programma.started_on, cosa: "Percorso avviato" });
  }

  return {
    fase: computeJourneyStage(fatti),
    fatti,
    membership: membership
      ? {
          piano: membership.tier?.name ?? null,
          stato: membership.status,
          attiva: membership.is_active,
          iniziaIl: membership.starts_on,
          finisceIl: membership.ends_on,
          rinnovaIl: membership.renews_on,
          rinnovoAutomatico: membership.auto_renew,
        }
      : null,
    crediti: crediti
      ? {
          assegnati: Number(crediti.total_credited),
          usati: Number(crediti.total_used),
          disponibili: Number(crediti.available),
          movimenti: ((movimentiRes.data ?? []) as {
            id: string;
            entry_type: string;
            amount: number | string;
            description: string | null;
            created_at: string;
          }[]).map((m) => ({
            id: m.id,
            tipo: m.entry_type,
            importo: Number(m.amount),
            descrizione: m.description,
            quando: m.created_at,
          })),
        }
      : null,
    tappe: tappe.sort((a, b) => a.quando.localeCompare(b.quando)),
  };
}
