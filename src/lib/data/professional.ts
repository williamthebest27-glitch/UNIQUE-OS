import type { AppNotification } from "@/lib/domain/types";
import type { Discipline } from "@/lib/professionals/disciplines";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * La giornata di un professionista.
 *
 * Nessuna query filtra per care team a mano: la Row Level Security
 * restituisce già solo i pazienti assegnati. Qui si decide cosa mostrare,
 * non chi può vederlo.
 */

export interface AppuntamentoBreve {
  id: string;
  patientId: string;
  patientName: string;
  serviceName: string;
  startsAt: string;
  location: string | null;
  status: string;
}

export interface DocumentoBreve {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  createdAt: string;
}

export interface TaskBreve {
  id: string;
  title: string;
  detail: string | null;
  dueOn: string | null;
  patientId: string | null;
  patientName: string | null;
}

export interface DaRivalutare {
  patientId: string;
  patientName: string;
  lastScoreOn: string | null;
  giorni: number | null;
}

export interface ProfessionalDashboard {
  discipline: Discipline;
  oggi: AppuntamentoBreve[];
  prossimi: AppuntamentoBreve[];
  documentiNuovi: DocumentoBreve[];
  task: TaskBreve[];
  notifiche: AppNotification[];
  daRivedere: number;
  daRivalutare: DaRivalutare[];
}

/** Oltre questi giorni senza un nuovo punteggio, il paziente va richiamato. */
const GIORNI_PER_RIVALUTAZIONE = 120;

const ROME_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** La data a Roma, non quella del server: l'agenda è quella della clinica. */
function dataRomana(iso: string | Date): string {
  return ROME_DATE.format(typeof iso === "string" ? new Date(iso) : iso);
}

function giorniDa(dateIso: string): number {
  const a = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${dataRomana(new Date())}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

interface AppointmentRow {
  id: string;
  service_name: string;
  starts_at: string;
  location: string | null;
  status: string;
  patient: { id: string; profile: { full_name: string } | null } | null;
}

export async function getProfessionalDashboard(): Promise<ProfessionalDashboard | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  const ora = new Date();
  const daIeri = new Date(ora.getTime() - 36 * 3600 * 1000).toISOString();
  const aOttoGiorni = new Date(ora.getTime() + 8 * 24 * 3600 * 1000).toISOString();
  const daDueSettimane = new Date(ora.getTime() - 14 * 24 * 3600 * 1000).toISOString();

  const [proRes, apptRes, docRes, taskRes, notifRes, propRes, patientsRes] =
    await Promise.all([
      supabase
        .from("professionals")
        .select("id, discipline")
        .eq("profile_id", profile.id)
        .maybeSingle(),

      supabase
        .from("appointments")
        .select(
          "id, service_name, starts_at, location, status, patient:patients(id, profile:profiles(full_name))",
        )
        .in("status", ["scheduled", "confirmed"])
        .gte("starts_at", daIeri)
        .lte("starts_at", aOttoGiorni)
        .order("starts_at", { ascending: true })
        .limit(40),

      supabase
        .from("documents")
        .select("id, title, created_at, patient:patients(id, profile:profiles(full_name))")
        .gte("created_at", daDueSettimane)
        .order("created_at", { ascending: false })
        .limit(8),

      supabase
        .from("tasks")
        .select("id, title, detail, due_on, patient:patients(id, profile:profiles(full_name))")
        .eq("status", "open")
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(10),

      supabase
        .from("notifications")
        .select("id, title, body, link_url, read_at, created_at")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("measurement_proposals")
        .select("id")
        .eq("status", "needs_review"),

      supabase
        .from("patients")
        .select("id, profile:profiles(full_name)")
        .limit(200),
    ]);

  const discipline =
    (proRes.data as { discipline: Discipline } | null)?.discipline ?? "other";

  const appuntamenti = ((apptRes.data ?? []) as unknown as AppointmentRow[]).map((row) => ({
    id: row.id,
    patientId: row.patient?.id ?? "",
    patientName: row.patient?.profile?.full_name ?? "Paziente",
    serviceName: row.service_name,
    startsAt: row.starts_at,
    location: row.location,
    status: row.status,
  }));

  const oggiRoma = dataRomana(ora);
  const oggi = appuntamenti.filter((a) => dataRomana(a.startsAt) === oggiRoma);
  const prossimi = appuntamenti.filter((a) => dataRomana(a.startsAt) > oggiRoma).slice(0, 6);

  // ── Pazienti da rivalutare ────────────────────────────────────
  const pazienti = (patientsRes.data ?? []) as unknown as {
    id: string;
    profile: { full_name: string } | null;
  }[];

  const ultimoPunteggio = new Map<string, string>();

  if (pazienti.length > 0) {
    const { data: scoreRows } = await supabase
      .from("longevity_scores")
      .select("patient_id, measured_on")
      .in(
        "patient_id",
        pazienti.map((p) => p.id),
      )
      .order("measured_on", { ascending: false });

    for (const row of (scoreRows ?? []) as { patient_id: string; measured_on: string }[]) {
      if (!ultimoPunteggio.has(row.patient_id)) {
        ultimoPunteggio.set(row.patient_id, row.measured_on);
      }
    }
  }

  const daRivalutare: DaRivalutare[] = pazienti
    .map((p) => {
      const last = ultimoPunteggio.get(p.id) ?? null;
      return {
        patientId: p.id,
        patientName: p.profile?.full_name ?? "Paziente",
        lastScoreOn: last,
        giorni: last ? giorniDa(last) : null,
      };
    })
    // Chi non ha mai avuto un punteggio viene prima: è il caso più urgente.
    .filter((p) => p.giorni === null || p.giorni > GIORNI_PER_RIVALUTAZIONE)
    .sort((a, b) => (b.giorni ?? Number.MAX_SAFE_INTEGER) - (a.giorni ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8);

  return {
    discipline,
    oggi,
    prossimi,
    documentiNuovi: ((docRes.data ?? []) as unknown as {
      id: string;
      title: string;
      created_at: string;
      patient: { id: string; profile: { full_name: string } | null } | null;
    }[]).map((row) => ({
      id: row.id,
      patientId: row.patient?.id ?? "",
      patientName: row.patient?.profile?.full_name ?? "Paziente",
      title: row.title,
      createdAt: row.created_at,
    })),
    task: ((taskRes.data ?? []) as unknown as {
      id: string;
      title: string;
      detail: string | null;
      due_on: string | null;
      patient: { id: string; profile: { full_name: string } | null } | null;
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      dueOn: row.due_on,
      patientId: row.patient?.id ?? null,
      patientName: row.patient?.profile?.full_name ?? null,
    })),
    notifiche: ((notifRes.data ?? []) as {
      id: string;
      title: string;
      body: string | null;
      link_url: string | null;
      read_at: string | null;
      created_at: string;
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      linkUrl: row.link_url,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    daRivedere: (propRes.data ?? []).length,
    daRivalutare,
  };
}

/* ── Sezioni dell'area clinica ──────────────────────────────────────
 *
 * Le tre pagine che stanno dietro le voci Agenda, Documenti e Task del
 * menu. Sono le stesse cose che la home mostra in anteprima: qui senza
 * il taglio dell'anteprima, perché è dove si va quando l'elenco corto
 * non basta più.
 */

/** I numeri che il menu mostra accanto alle voci. Due conteggi, niente righe. */
export async function getProNavCounts(): Promise<{ revisioni: number; task: number }> {
  const supabase = await createSupabaseServerClient();

  const [revisioni, task] = await Promise.all([
    supabase
      .from("measurement_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  return { revisioni: revisioni.count ?? 0, task: task.count ?? 0 };
}

export interface GiornoAgenda {
  /** Data a Roma, `YYYY-MM-DD`: è la chiave con cui si raggruppa. */
  data: string;
  visite: AppuntamentoBreve[];
}

/**
 * L'agenda dei prossimi giorni, raggruppata per giornata.
 *
 * Parte da oggi: ciò che è già passato appartiene alla cartella del
 * paziente, non all'agenda.
 */
export async function getAgenda(giorni = 30): Promise<GiornoAgenda[]> {
  const supabase = await createSupabaseServerClient();

  const ora = new Date();
  const daIeri = new Date(ora.getTime() - 24 * 3600 * 1000).toISOString();
  const fino = new Date(ora.getTime() + giorni * 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from("appointments")
    .select(
      "id, service_name, starts_at, location, status, patient:patients(id, profile:profiles(full_name))",
    )
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", daIeri)
    .lte("starts_at", fino)
    .order("starts_at", { ascending: true })
    .limit(200);

  const oggiRoma = dataRomana(ora);
  const gruppi = new Map<string, AppuntamentoBreve[]>();

  for (const row of (data ?? []) as unknown as AppointmentRow[]) {
    const giorno = dataRomana(row.starts_at);
    // Il margine di 24 ore serve al fuso, non a mostrare ieri.
    if (giorno < oggiRoma) continue;

    const lista = gruppi.get(giorno) ?? [];
    lista.push({
      id: row.id,
      patientId: row.patient?.id ?? "",
      patientName: row.patient?.profile?.full_name ?? "Paziente",
      serviceName: row.service_name,
      startsAt: row.starts_at,
      location: row.location,
      status: row.status,
    });
    gruppi.set(giorno, lista);
  }

  return [...gruppi.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, visite]) => ({ data, visite }));
}

export interface DocumentoInArrivo extends DocumentoBreve {
  kind: string;
  issuedOn: string | null;
  /** Stato dell'ultima analisi del motore AI, `null` se non è mai stata fatta. */
  statoAnalisi: string | null;
}

/** I documenti dei pazienti seguiti, dal più recente. */
export async function getDocumentiRecenti(limite = 60): Promise<DocumentoInArrivo[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("documents")
    .select(
      "id, title, kind, issued_on, created_at, analyses:document_analyses(status, created_at), patient:patients(id, profile:profiles(full_name))",
    )
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    kind: string;
    issued_on: string | null;
    created_at: string;
    analyses: { status: string; created_at: string }[] | null;
    patient: { id: string; profile: { full_name: string } | null } | null;
  }[]).map((row) => {
    const ultima = [...(row.analyses ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];

    return {
      id: row.id,
      patientId: row.patient?.id ?? "",
      patientName: row.patient?.profile?.full_name ?? "Paziente",
      title: row.title,
      kind: row.kind,
      issuedOn: row.issued_on,
      createdAt: row.created_at,
      statoAnalisi: ultima?.status ?? null,
    };
  });
}

export interface TaskCompleto extends TaskBreve {
  status: string;
  completedAt: string | null;
}

/** I task: prima quelli aperti per scadenza, poi i chiusi di recente. */
export async function getTask(): Promise<{ aperti: TaskCompleto[]; chiusi: TaskCompleto[] }> {
  const supabase = await createSupabaseServerClient();

  const daDueSettimane = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const [apertiRes, chiusiRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, detail, due_on, status, completed_at, patient:patients(id, profile:profiles(full_name))",
      )
      .eq("status", "open")
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase
      .from("tasks")
      .select(
        "id, title, detail, due_on, status, completed_at, patient:patients(id, profile:profiles(full_name))",
      )
      .neq("status", "open")
      .gte("completed_at", daDueSettimane)
      .order("completed_at", { ascending: false })
      .limit(15),
  ]);

  const mappa = (rows: unknown): TaskCompleto[] =>
    ((rows ?? []) as {
      id: string;
      title: string;
      detail: string | null;
      due_on: string | null;
      status: string;
      completed_at: string | null;
      patient: { id: string; profile: { full_name: string } | null } | null;
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      dueOn: row.due_on,
      patientId: row.patient?.id ?? null,
      patientName: row.patient?.profile?.full_name ?? null,
      status: row.status,
      completedAt: row.completed_at,
    }));

  return { aperti: mappa(apertiRes.data), chiusi: mappa(chiusiRes.data) };
}
