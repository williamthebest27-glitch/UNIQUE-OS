import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * I numeri del lavoro clinico.
 *
 * Non sono i numeri della direzione — quelli stanno nel Control Center e
 * parlano di fatturato, capacità e margine. Questi rispondono a una
 * domanda diversa e più scomoda: **i pazienti che seguo stanno
 * migliorando?**
 *
 * Tre scelte che rendono onesti questi numeri:
 *
 *   **Migliorato e peggiorato si contano su chi ha due punteggi.** Un
 *   paziente con un solo Score non è stabile: è senza confronto. Metterlo
 *   fra gli stabili gonfierebbe la colonna che nessuno guarda e
 *   svuoterebbe le due che contano.
 *
 *   **Il periodo è dichiarato ovunque.** «Dodici pazienti migliorati» non
 *   vuol dire niente senza sapere su quanti e in quanto tempo.
 *
 *   **Il perimetro è quello della Row Level Security.** Un professionista
 *   vede i propri pazienti, la direzione tutti: lo stesso report letto da
 *   due persone dà due numeri, ed è corretto che sia così.
 */

export interface FinestraReport {
  id: string;
  etichetta: string;
  giorni: number;
}

export const FINESTRE_REPORT: FinestraReport[] = [
  { id: "30g", etichetta: "30 giorni", giorni: 30 },
  { id: "90g", etichetta: "3 mesi", giorni: 90 },
  { id: "180g", etichetta: "6 mesi", giorni: 180 },
  { id: "365g", etichetta: "12 mesi", giorni: 365 },
];

export function finestraDa(id: string | undefined): FinestraReport {
  return FINESTRE_REPORT.find((f) => f.id === id) ?? FINESTRE_REPORT[1];
}

export interface ReportClinici {
  finestra: FinestraReport;
  da: string;

  /** Pazienti in carico, e quanti hanno avuto attività nella finestra. */
  pazientiTotali: number;
  pazientiAttivi: number;

  /** Punteggi calcolati nella finestra, e quanti erano una ripetizione. */
  assessment: number;
  reassessment: number;
  /** Pazienti che non hanno mai avuto un punteggio. */
  senzaPunteggio: number;
  /** Pazienti il cui punteggio è più vecchio della finestra di controllo. */
  daRivalutare: number;

  /** Confronto fra l'ultimo punteggio e il precedente, per chi ne ha due. */
  migliorati: number;
  peggiorati: number;
  stabili: number;
  senzaConfronto: number;
  /** Variazione media in punti, fra chi ha due punteggi. Null se nessuno. */
  variazioneMedia: number | null;
  /** Media dei punteggi più recenti. */
  punteggioMedio: number | null;

  /** Visite svolte, disdette e mancate presentazioni nella finestra. */
  visiteSvolte: number;
  visiteDisdette: number;
  mancatePresentazioni: number;
  /** Visite passate a cui manca ancora l'esito. */
  visiteAperte: number;

  /** Task chiusi e ancora aperti. */
  taskChiusi: number;
  taskAperti: number;
  taskScaduti: number;

  /** Referti arrivati, e quanti nessuno ha ancora aperto. */
  refertiArrivati: number;
  refertiDaRevisionare: number;
  refertiApprovati: number;

  /** Percorsi attivi e loro avanzamento medio. */
  percorsiAttivi: number;
  aderenzaMedia: number | null;

  /** Cosa ha fatto chi guarda, nella finestra. */
  mieAttivita: {
    note: number;
    misure: number;
    revisioni: number;
  };
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Oltre questi giorni senza un nuovo punteggio, tocca rivalutare. */
const GIORNI_RIVALUTAZIONE = 120;

function media(valori: number[]): number | null {
  if (valori.length === 0) return null;
  return valori.reduce((somma, v) => somma + v, 0) / valori.length;
}

export async function getReportClinici(
  periodo?: string,
): Promise<ReportClinici | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  const finestra = finestraDa(periodo);
  const oggi = ROMA.format(new Date());
  const da = new Date(Date.now() - finestra.giorni * 86_400_000).toISOString();
  const daGiorno = da.slice(0, 10);

  const [
    pazientiRes,
    punteggiRes,
    visiteRes,
    aperteRes,
    taskRes,
    refertiRes,
    percorsiRes,
    mieNoteRes,
    mieMisureRes,
    mieRevisioniRes,
  ] = await Promise.all([
    supabase.from("patients").select("id").limit(500),

    // Tutto lo storico dei punteggi dei pazienti visibili: serve sia per
    // contare quelli nella finestra sia per confrontare gli ultimi due.
    supabase
      .from("longevity_scores")
      .select("patient_id, score, previous_score, measured_on")
      .order("measured_on", { ascending: false })
      .limit(2000),

    supabase
      .from("appointments")
      .select("status, attendance, patient_id")
      .gte("starts_at", da)
      .limit(1500),

    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", new Date().toISOString()),

    supabase
      .from("tasks")
      .select("status, due_on, completed_at")
      .limit(600),

    supabase
      .from("documents")
      .select("review_state, created_at")
      .gte("created_at", da)
      .limit(600),

    supabase
      .from("program_enrollments")
      .select("status, progress_pct")
      .eq("status", "active")
      .limit(400),

    supabase
      .from("clinical_notes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .gte("created_at", da),

    supabase
      .from("measurements")
      .select("id", { count: "exact", head: true })
      .eq("entered_by", profile.id)
      .gte("created_at", da),

    supabase
      .from("measurement_proposals")
      .select("id", { count: "exact", head: true })
      .eq("reviewed_by", profile.id)
      .gte("reviewed_at", da),
  ]);

  const pazienti = (pazientiRes.data ?? []) as { id: string }[];
  const idPazienti = new Set(pazienti.map((p) => p.id));

  /* ── Punteggi ─────────────────────────────────────────────── */
  const righePunteggi = (punteggiRes.data ?? []) as {
    patient_id: string;
    score: number;
    previous_score: number | null;
    measured_on: string;
  }[];

  const ultimi = new Map<string, { score: number; precedente: number | null; quando: string }>();
  let assessment = 0;
  let reassessment = 0;

  for (const r of righePunteggi) {
    if (r.measured_on >= daGiorno) {
      assessment += 1;
      if (r.previous_score !== null) reassessment += 1;
    }
    if (!ultimi.has(r.patient_id)) {
      ultimi.set(r.patient_id, {
        score: Number(r.score),
        precedente: r.previous_score === null ? null : Number(r.previous_score),
        quando: r.measured_on,
      });
    }
  }

  let migliorati = 0;
  let peggiorati = 0;
  let stabili = 0;
  let daRivalutare = 0;
  const variazioni: number[] = [];
  const punteggi: number[] = [];

  for (const id of idPazienti) {
    const ultimo = ultimi.get(id);
    if (!ultimo) continue;

    punteggi.push(ultimo.score);

    const eta = Math.round(
      (Date.parse(`${oggi}T00:00:00Z`) - Date.parse(`${ultimo.quando}T00:00:00Z`)) /
        86_400_000,
    );
    if (eta > GIORNI_RIVALUTAZIONE) daRivalutare += 1;

    if (ultimo.precedente === null) continue;

    const delta = ultimo.score - ultimo.precedente;
    variazioni.push(delta);
    // Sotto il punto la differenza è rumore di arrotondamento, non un
    // miglioramento: chiamarlo tale gonfierebbe la colonna buona.
    if (delta >= 1) migliorati += 1;
    else if (delta <= -1) peggiorati += 1;
    else stabili += 1;
  }

  const conConfronto = migliorati + peggiorati + stabili;
  const conPunteggio = punteggi.length;

  /* ── Visite ───────────────────────────────────────────────── */
  const visite = (visiteRes.data ?? []) as {
    status: string;
    attendance: string;
    patient_id: string;
  }[];

  const attivi = new Set(visite.filter((v) => v.status === "completed").map((v) => v.patient_id));

  /* ── Task ─────────────────────────────────────────────────── */
  const task = (taskRes.data ?? []) as {
    status: string;
    due_on: string | null;
    completed_at: string | null;
  }[];

  /* ── Referti ──────────────────────────────────────────────── */
  const referti = (refertiRes.data ?? []) as { review_state: string; created_at: string }[];

  /* ── Percorsi ─────────────────────────────────────────────── */
  const percorsi = (percorsiRes.data ?? []) as { progress_pct: number }[];

  return {
    finestra,
    da: daGiorno,

    pazientiTotali: pazienti.length,
    pazientiAttivi: attivi.size,

    assessment,
    reassessment,
    senzaPunteggio: pazienti.length - conPunteggio,
    daRivalutare,

    migliorati,
    peggiorati,
    stabili,
    senzaConfronto: conPunteggio - conConfronto,
    variazioneMedia: media(variazioni),
    punteggioMedio: media(punteggi),

    visiteSvolte: visite.filter((v) => v.status === "completed").length,
    visiteDisdette: visite.filter((v) => v.status === "cancelled").length,
    mancatePresentazioni: visite.filter((v) => v.status === "no_show").length,
    visiteAperte: aperteRes.count ?? 0,

    taskChiusi: task.filter(
      (t) => t.status !== "open" && t.completed_at !== null && t.completed_at >= da,
    ).length,
    taskAperti: task.filter((t) => t.status === "open").length,
    taskScaduti: task.filter(
      (t) => t.status === "open" && t.due_on !== null && t.due_on < oggi,
    ).length,

    refertiArrivati: referti.length,
    refertiDaRevisionare: referti.filter((r) => r.review_state === "pending").length,
    refertiApprovati: referti.filter((r) => r.review_state === "approved").length,

    percorsiAttivi: percorsi.length,
    aderenzaMedia: media(percorsi.map((p) => Number(p.progress_pct))),

    mieAttivita: {
      note: mieNoteRes.count ?? 0,
      misure: mieMisureRes.count ?? 0,
      revisioni: mieRevisioniRes.count ?? 0,
    },
  };
}
