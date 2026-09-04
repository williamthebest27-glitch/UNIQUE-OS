import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  migliori,
  punteggioSuCampi,
  ricercaUtile,
  termini,
  type ConPunteggio,
} from "@/lib/ricerca/corrispondenza";
import { cercaConoscenza, type VoceCorrente } from "@/lib/knowledge/queries";

/**
 * La ricerca globale dell'area clinica.
 *
 * Sei domande diverse dietro un campo solo — un paziente, un referto,
 * una visita, un task, una nota, una procedura — e la risposta arriva
 * divisa per categoria invece che in una classifica unica. Un elenco
 * misto costringerebbe a leggere ogni riga per capire *cosa* è, che è
 * esattamente il lavoro che una ricerca dovrebbe risparmiare.
 *
 * **Il filtro lo fa il database, non questo file.** Le query non
 * nominano il care team: la Row Level Security restituisce già solo ciò
 * che chi cerca ha titolo di vedere. Una ricerca globale è il posto in
 * cui un filtro dimenticato farebbe più danno, ed è la ragione per cui
 * non ce n'è nessuno da dimenticare.
 *
 * La corrispondenza si calcola in TypeScript e non con `ilike`: le
 * regole stanno in `lib/ricerca/corrispondenza.ts`, sono pure e testate,
 * e trovano «Nicolò» scrivendo «nicolo» — cosa che `ilike` non fa senza
 * un'estensione e un indice che oggi non esistono.
 */

export interface RisultatoPaziente {
  id: string;
  nome: string;
  codice: string | null;
  ultimoScore: number | null;
  ultimoScoreIl: string | null;
}

export interface RisultatoDocumento {
  id: string;
  titolo: string;
  tipo: string;
  patientId: string;
  paziente: string;
  quando: string;
  statoRevisione: string;
}

export interface RisultatoVisita {
  id: string;
  servizio: string;
  patientId: string;
  paziente: string;
  quando: string;
  stato: string;
}

export interface RisultatoTask {
  id: string;
  titolo: string;
  dettaglio: string | null;
  patientId: string | null;
  paziente: string | null;
  scadenzaIl: string | null;
  stato: string;
}

export interface RisultatoNota {
  id: string;
  tipo: string;
  titolo: string | null;
  estratto: string;
  patientId: string;
  paziente: string;
  quando: string;
}

export interface Risultati {
  query: string;
  utile: boolean;
  pazienti: RisultatoPaziente[];
  documenti: RisultatoDocumento[];
  visite: RisultatoVisita[];
  task: RisultatoTask[];
  note: RisultatoNota[];
  conoscenza: VoceCorrente[];
  totale: number;
}

/** Quanti risultati per categoria. Oltre, si affina la ricerca. */
const PER_CATEGORIA = 8;

/**
 * Quante righe si leggono per categoria prima di ordinarle.
 *
 * La corrispondenza si calcola qui, quindi il database deve consegnare
 * un campione. Non è una ricerca a testo pieno e non pretende di
 * esserlo: su una clinica sono le righe che contano, e il giorno in cui
 * non bastassero il posto da cambiare è questo — una `search_*` in
 * Postgres, come già esiste per la knowledge base.
 */
const CAMPIONE = 400;

export async function cerca(query: string): Promise<Risultati> {
  const vuoto: Risultati = {
    query,
    utile: false,
    pazienti: [],
    documenti: [],
    visite: [],
    task: [],
    note: [],
    conoscenza: [],
    totale: 0,
  };

  if (!isSupabaseConfigured() || !ricercaUtile(query)) return vuoto;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return vuoto;

  const supabase = await createSupabaseServerClient();
  const cercati = termini(query);

  const [
    pazientiRes,
    documentiRes,
    visiteRes,
    taskRes,
    noteRes,
    conoscenza,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id, patient_code, profile:profiles(full_name, email)")
      .limit(CAMPIONE),

    supabase
      .from("documents")
      .select(
        "id, title, kind, created_at, issued_on, review_state, patient_id, patient:patients(profile:profiles(full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(CAMPIONE),

    supabase
      .from("appointments")
      .select(
        "id, service_name, starts_at, status, patient_id, patient:patients(profile:profiles(full_name))",
      )
      .order("starts_at", { ascending: false })
      .limit(CAMPIONE),

    supabase
      .from("tasks")
      .select(
        "id, title, detail, due_on, status, patient_id, patient:patients(profile:profiles(full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(CAMPIONE),

    supabase
      .from("clinical_notes")
      .select(
        "id, kind, title, body, created_at, patient_id, patient:patients(profile:profiles(full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(CAMPIONE),

    // La knowledge base ha già la sua ricerca a testo pieno in Postgres,
    // e legge dalla vista di ciò che è vero **oggi**: usarla è anche
    // l'unico modo di non far comparire il prezzo dell'anno scorso.
    cercaConoscenza(query, PER_CATEGORIA).catch(() => []),
  ]);

  /* ── Pazienti ─────────────────────────────────────────────── */
  const righePazienti = (pazientiRes.data ?? []) as unknown as {
    id: string;
    patient_code: string | null;
    profile: { full_name: string; email: string | null } | null;
  }[];

  const pazientiScelti = migliori<RisultatoPaziente>(
    righePazienti.map<ConPunteggio<RisultatoPaziente>>((r) => ({
      voce: {
        id: r.id,
        nome: r.profile?.full_name ?? "Paziente",
        codice: r.patient_code,
        ultimoScore: null,
        ultimoScoreIl: null,
      },
      punti: punteggioSuCampi(
        [r.profile?.full_name, r.patient_code, r.profile?.email],
        cercati,
      ),
    })),
    PER_CATEGORIA,
  );

  // Il punteggio più recente solo per i pazienti trovati: chiederlo per
  // tutto il campione sarebbe quattrocento righe per mostrarne otto.
  if (pazientiScelti.length > 0) {
    const { data } = await supabase
      .from("longevity_scores")
      .select("patient_id, score, measured_on")
      .in(
        "patient_id",
        pazientiScelti.map((p) => p.id),
      )
      .order("measured_on", { ascending: false });

    const ultimi = new Map<string, { score: number; measuredOn: string }>();
    for (const r of (data ?? []) as {
      patient_id: string;
      score: number;
      measured_on: string;
    }[]) {
      if (!ultimi.has(r.patient_id)) {
        ultimi.set(r.patient_id, { score: Number(r.score), measuredOn: r.measured_on });
      }
    }

    for (const p of pazientiScelti) {
      const ultimo = ultimi.get(p.id);
      p.ultimoScore = ultimo?.score ?? null;
      p.ultimoScoreIl = ultimo?.measuredOn ?? null;
    }
  }

  /* ── Documenti ────────────────────────────────────────────── */
  const documenti = migliori<RisultatoDocumento>(
    ((documentiRes.data ?? []) as unknown as {
      id: string;
      title: string;
      kind: string;
      created_at: string;
      issued_on: string | null;
      review_state: string;
      patient_id: string;
      patient: { profile: { full_name: string } | null } | null;
    }[]).map((r) => ({
      voce: {
        id: r.id,
        titolo: r.title,
        tipo: r.kind,
        patientId: r.patient_id,
        paziente: r.patient?.profile?.full_name ?? "Paziente",
        quando: r.issued_on ?? r.created_at,
        statoRevisione: r.review_state,
      },
      punti: punteggioSuCampi(
        [r.title, r.patient?.profile?.full_name],
        cercati,
      ),
    })),
    PER_CATEGORIA,
  );

  /* ── Visite ───────────────────────────────────────────────── */
  const visite = migliori<RisultatoVisita>(
    ((visiteRes.data ?? []) as unknown as {
      id: string;
      service_name: string;
      starts_at: string;
      status: string;
      patient_id: string;
      patient: { profile: { full_name: string } | null } | null;
    }[]).map((r) => ({
      voce: {
        id: r.id,
        servizio: r.service_name,
        patientId: r.patient_id,
        paziente: r.patient?.profile?.full_name ?? "Paziente",
        quando: r.starts_at,
        stato: r.status,
      },
      punti: punteggioSuCampi(
        [r.service_name, r.patient?.profile?.full_name],
        cercati,
      ),
    })),
    PER_CATEGORIA,
  );

  /* ── Task ─────────────────────────────────────────────────── */
  const task = migliori<RisultatoTask>(
    ((taskRes.data ?? []) as unknown as {
      id: string;
      title: string;
      detail: string | null;
      due_on: string | null;
      status: string;
      patient_id: string | null;
      patient: { profile: { full_name: string } | null } | null;
    }[]).map((r) => ({
      voce: {
        id: r.id,
        titolo: r.title,
        dettaglio: r.detail,
        patientId: r.patient_id,
        paziente: r.patient?.profile?.full_name ?? null,
        scadenzaIl: r.due_on,
        stato: r.status,
      },
      punti: punteggioSuCampi(
        [r.title, r.detail, r.patient?.profile?.full_name],
        cercati,
      ),
    })),
    PER_CATEGORIA,
  );

  /* ── Note cliniche ────────────────────────────────────────── */
  const note = migliori<RisultatoNota>(
    ((noteRes.data ?? []) as unknown as {
      id: string;
      kind: string;
      title: string | null;
      body: string;
      created_at: string;
      patient_id: string;
      patient: { profile: { full_name: string } | null } | null;
    }[]).map((r) => ({
      voce: {
        id: r.id,
        tipo: r.kind,
        titolo: r.title,
        // Un estratto e non il corpo intero: una nota clinica in un
        // elenco di risultati va riconosciuta, non letta.
        estratto: r.body.length > 180 ? `${r.body.slice(0, 180)}…` : r.body,
        patientId: r.patient_id,
        paziente: r.patient?.profile?.full_name ?? "Paziente",
        quando: r.created_at,
      },
      punti: punteggioSuCampi([r.title, r.body], cercati),
    })),
    PER_CATEGORIA,
  );

  return {
    query,
    utile: true,
    pazienti: pazientiScelti,
    documenti,
    visite,
    task,
    note,
    conoscenza,
    totale:
      pazientiScelti.length +
      documenti.length +
      visite.length +
      task.length +
      note.length +
      conoscenza.length,
  };
}
