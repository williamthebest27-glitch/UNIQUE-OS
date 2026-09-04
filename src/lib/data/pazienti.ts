import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAttenzione } from "@/lib/data/attenzione";
import { computeJourneyStage, type JourneyStage } from "@/lib/journey/stages";
import type { PrioritaAttenzione } from "@/lib/clinical/attenzione";
import {
  migliori,
  punteggioSuCampi,
  ricercaUtile,
  termini,
} from "@/lib/ricerca/corrispondenza";

/**
 * L'elenco dei pazienti, per chi li segue.
 *
 * L'elenco di prima mostrava nome, codice e ultimo punteggio. Bastava a
 * trovare qualcuno, non bastava a **scegliere chi guardare**: e quella è
 * la domanda vera quando si apre un elenco di duecento persone.
 *
 * Qui ogni riga porta cinque cose che rispondono a quella domanda —
 * quanto attenzione richiede, dove sta nel percorso, quando l'abbiamo
 * sentito l'ultima volta, quando lo rivediamo, come va il punteggio — e
 * i filtri lavorano su quelle. Il livello di attenzione non è un campo:
 * viene dagli stessi segnali del command center, quindi un paziente non
 * può risultare tranquillo qui e urgente lì.
 *
 * **Nessuna query filtra per care team.** La Row Level Security
 * restituisce già solo i pazienti seguiti.
 */

export interface PazienteInLista {
  id: string;
  nome: string;
  codice: string | null;
  sede: string | null;
  score: number | null;
  scorePrecedente: number | null;
  scoreIl: string | null;
  /** Su, giù o fermo rispetto al punteggio precedente. */
  trend: "up" | "down" | "stable" | null;
  membership: { piano: string | null; stato: string } | null;
  /** L'ultima volta che ci siamo visti o scritti. */
  ultimoContatto: string | null;
  prossimaVisita: { quando: string; servizio: string } | null;
  fase: JourneyStage;
  faseMotivo: string;
  professionisti: string[];
  /** Quante segnalazioni aperte, e quante urgenti. */
  segnali: number;
  urgenti: number;
  /** La priorità più alta fra i suoi segnali. Null se non ne ha. */
  attenzione: PrioritaAttenzione | null;
}

export type OrdinePazienti = "attenzione" | "nome" | "score" | "contatto" | "visita";

export interface FiltriPazienti {
  q?: string;
  fase?: string;
  /** `urgente` | `attenzione` | `tranquilli`. */
  livello?: string;
  membership?: string;
  ordine?: OrdinePazienti;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function getElencoPazienti(
  filtri: FiltriPazienti = {},
): Promise<PazienteInLista[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();
  const oggi = ROMA.format(new Date());
  const adesso = new Date().toISOString();

  const [pazientiRes, attenzione] = await Promise.all([
    supabase
      .from("patients")
      .select(
        "id, patient_code, profile:profiles!patients_profile_id_fkey(full_name, email), location:locations(name), care_team_members(professionals(title, profiles(full_name)))",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    getAttenzione(),
  ]);

  const righe = (pazientiRes.data ?? []) as unknown as {
    id: string;
    patient_code: string | null;
    profile: { full_name: string; email: string | null } | null;
    location: { name: string } | null;
    care_team_members: {
      professionals: { title: string | null; profiles: { full_name: string } | null } | null;
    }[];
  }[];

  if (righe.length === 0) return [];
  const ids = righe.map((r) => r.id);

  const [scoreRes, membershipRes, visiteRes, futureRes, programRes, leadRes] =
    await Promise.all([
      supabase
        .from("longevity_scores")
        .select("patient_id, score, previous_score, measured_on")
        .in("patient_id", ids)
        .order("measured_on", { ascending: false })
        .limit(900),

      supabase
        .from("memberships")
        .select("patient_id, status, is_active, created_at, tier:membership_tiers(name)")
        .in("patient_id", ids)
        .limit(400),

      supabase
        .from("appointments")
        .select("patient_id, starts_at")
        .in("patient_id", ids)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .limit(1200),

      supabase
        .from("appointments")
        .select("patient_id, starts_at, service_name")
        .in("patient_id", ids)
        .in("status", ["scheduled", "confirmed"])
        .gte("starts_at", adesso)
        .order("starts_at", { ascending: true })
        .limit(400),

      supabase
        .from("program_enrollments")
        .select("patient_id, status, updated_at")
        .in("patient_id", ids)
        .limit(400),

      supabase.from("leads").select("patient_id, status").in("patient_id", ids).limit(400),
    ]);

  /* ── Indici ───────────────────────────────────────────────── */
  const punteggi = new Map<
    string,
    { score: number; precedente: number | null; misuratoIl: string }
  >();
  for (const s of (scoreRes.data ?? []) as {
    patient_id: string;
    score: number;
    previous_score: number | null;
    measured_on: string;
  }[]) {
    if (punteggi.has(s.patient_id)) continue;
    punteggi.set(s.patient_id, {
      score: Number(s.score),
      precedente: s.previous_score === null ? null : Number(s.previous_score),
      misuratoIl: s.measured_on,
    });
  }

  const membership = new Map<
    string,
    { piano: string | null; stato: string; attiva: boolean; creataIl: string }
  >();
  for (const m of (membershipRes.data ?? []) as unknown as {
    patient_id: string;
    status: string;
    is_active: boolean;
    created_at: string;
    tier: { name: string } | null;
  }[]) {
    const esistente = membership.get(m.patient_id);
    // A parità, vince quella attiva: un paziente può avere una vecchia
    // membership scaduta e una nuova in corso.
    if (!esistente || (m.is_active && !esistente.attiva)) {
      membership.set(m.patient_id, {
        piano: m.tier?.name ?? null,
        stato: m.status,
        attiva: m.is_active,
        creataIl: m.created_at,
      });
    }
  }

  const ultimaVisita = new Map<string, string>();
  for (const v of (visiteRes.data ?? []) as { patient_id: string; starts_at: string }[]) {
    if (!ultimaVisita.has(v.patient_id)) ultimaVisita.set(v.patient_id, v.starts_at);
  }

  const prossima = new Map<string, { quando: string; servizio: string }>();
  for (const v of (futureRes.data ?? []) as {
    patient_id: string;
    starts_at: string;
    service_name: string;
  }[]) {
    if (!prossima.has(v.patient_id)) {
      prossima.set(v.patient_id, { quando: v.starts_at, servizio: v.service_name });
    }
  }

  const programmi = new Map<string, { status: string; updated_at: string }>();
  for (const p of (programRes.data ?? []) as {
    patient_id: string;
    status: string;
    updated_at: string;
  }[]) {
    const esistente = programmi.get(p.patient_id);
    if (!esistente || (p.status === "active" && esistente.status !== "active")) {
      programmi.set(p.patient_id, { status: p.status, updated_at: p.updated_at });
    }
  }

  const lead = new Map(
    ((leadRes.data ?? []) as { patient_id: string; status: string }[]).map((l) => [
      l.patient_id,
      l.status,
    ]),
  );

  /* ── I segnali, per paziente ──────────────────────────────── */
  const perPaziente = new Map<string, { totale: number; urgenti: number; massima: PrioritaAttenzione }>();
  for (const s of attenzione.segnali) {
    if (!s.patientId) continue;
    const conto = perPaziente.get(s.patientId) ?? {
      totale: 0,
      urgenti: 0,
      massima: 3 as PrioritaAttenzione,
    };
    conto.totale += 1;
    if (s.priorita === 1) conto.urgenti += 1;
    if (s.priorita < conto.massima) conto.massima = s.priorita;
    perPaziente.set(s.patientId, conto);
  }

  /* ── Composizione ─────────────────────────────────────────── */
  let elenco: PazienteInLista[] = righe.map((r) => {
    const punteggio = punteggi.get(r.id) ?? null;
    const piano = membership.get(r.id) ?? null;
    const programma = programmi.get(r.id) ?? null;
    const visita = ultimaVisita.get(r.id) ?? null;
    const segnali = perPaziente.get(r.id) ?? null;

    const fase = computeJourneyStage({
      leadLost: lead.get(r.id) === "lost",
      hasBookedFirstVisit: visita !== null || prossima.has(r.id),
      hasScore: punteggio !== null,
      lastScoreOn: punteggio?.misuratoIl ?? null,
      hasPlan: programma !== null,
      membershipProposedAt: piano && !piano.attiva ? piano.creataIl : null,
      membershipActive: Boolean(piano?.attiva && piano.stato === "active"),
      membershipEnded: Boolean(piano && ["cancelled", "expired"].includes(piano.stato)),
      programActive: programma?.status === "active",
      lastActivityOn:
        visita?.slice(0, 10) ?? programma?.updated_at.slice(0, 10) ?? null,
      today: oggi,
    });

    const trend =
      punteggio === null || punteggio.precedente === null
        ? null
        : punteggio.score > punteggio.precedente
          ? "up"
          : punteggio.score < punteggio.precedente
            ? "down"
            : "stable";

    return {
      id: r.id,
      nome: r.profile?.full_name ?? "Paziente",
      codice: r.patient_code,
      sede: r.location?.name ?? null,
      score: punteggio?.score ?? null,
      scorePrecedente: punteggio?.precedente ?? null,
      scoreIl: punteggio?.misuratoIl ?? null,
      trend: trend as PazienteInLista["trend"],
      membership: piano ? { piano: piano.piano, stato: piano.stato } : null,
      ultimoContatto: visita,
      prossimaVisita: prossima.get(r.id) ?? null,
      fase: fase.stage,
      faseMotivo: fase.reason,
      professionisti: (r.care_team_members ?? [])
        .map((m) =>
          [m.professionals?.title, m.professionals?.profiles?.full_name]
            .filter(Boolean)
            .join(" "),
        )
        .filter((n) => n.length > 0),
      segnali: segnali?.totale ?? 0,
      urgenti: segnali?.urgenti ?? 0,
      attenzione: segnali?.massima ?? null,
    };
  });

  /* ── Filtri ───────────────────────────────────────────────── */
  if (filtri.fase) {
    elenco = elenco.filter((p) => p.fase === filtri.fase);
  }

  if (filtri.livello === "urgente") {
    elenco = elenco.filter((p) => p.urgenti > 0);
  } else if (filtri.livello === "attenzione") {
    elenco = elenco.filter((p) => p.segnali > 0);
  } else if (filtri.livello === "tranquilli") {
    elenco = elenco.filter((p) => p.segnali === 0);
  }

  if (filtri.membership === "attiva") {
    elenco = elenco.filter((p) => p.membership?.stato === "active");
  } else if (filtri.membership === "nessuna") {
    elenco = elenco.filter((p) => p.membership === null);
  }

  if (filtri.q && ricercaUtile(filtri.q)) {
    const cercati = termini(filtri.q);
    elenco = migliori(
      elenco.map((p) => ({
        voce: p,
        punti: punteggioSuCampi([p.nome, p.codice], cercati),
      })),
      100,
    );
    // Con una ricerca in corso l'ordine è la pertinenza: qualunque altro
    // criterio rimescolerebbe risultati già ordinati da chi ha scritto.
    return elenco;
  }

  /* ── Ordinamento ──────────────────────────────────────────── */
  const ordine = filtri.ordine ?? "attenzione";

  return [...elenco].sort((a, b) => {
    switch (ordine) {
      case "nome":
        return a.nome.localeCompare(b.nome, "it");
      case "score":
        return (b.score ?? -1) - (a.score ?? -1);
      case "contatto":
        // Chi non si vede da più tempo viene prima: è la domanda per cui
        // si ordina per ultimo contatto.
        return (a.ultimoContatto ?? "").localeCompare(b.ultimoContatto ?? "");
      case "visita":
        // Senza prossima visita si finisce in fondo, non in cima: una
        // data mancante non è imminente.
        if (!a.prossimaVisita && !b.prossimaVisita) return a.nome.localeCompare(b.nome, "it");
        if (!a.prossimaVisita) return 1;
        if (!b.prossimaVisita) return -1;
        return a.prossimaVisita.quando.localeCompare(b.prossimaVisita.quando);
      case "attenzione":
      default:
        return (
          (a.attenzione ?? 9) - (b.attenzione ?? 9) ||
          b.urgenti - a.urgenti ||
          b.segnali - a.segnali ||
          a.nome.localeCompare(b.nome, "it")
        );
    }
  });
}
