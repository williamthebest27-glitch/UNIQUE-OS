import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Le sezioni dell'area clinica: agenda, documenti, task.
 *
 * Nessuna query filtra per care team a mano: la Row Level Security
 * restituisce già solo i pazienti assegnati. Qui si decide cosa
 * mostrare, non chi può vederlo.
 *
 * La schermata di apertura non sta più qui. Era un riepilogo — l'agenda
 * di oggi, gli ultimi referti, i task — e riepilogare non era abbastanza:
 * elencava cose *esistenti* senza mai dire quali richiedevano una
 * decisione. Il command center la compone in `data/comando.ts` a partire
 * dai segnali del centro di attenzione, che è un'altra domanda.
 */

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

interface AppointmentRow {
  id: string;
  service_name: string;
  starts_at: string;
  location: string | null;
  status: string;
  patient: { id: string; profile: { full_name: string } | null } | null;
}

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


/* ── Sezioni dell'area clinica ──────────────────────────────────────
 *
 * Le tre pagine che stanno dietro le voci Agenda, Documenti e Task del
 * menu. Sono le stesse cose che la home mostra in anteprima: qui senza
 * il taglio dell'anteprima, perché è dove si va quando l'elenco corto
 * non basta più.
 */

/**
 * I numeri che il menu mostra accanto alle voci.
 *
 * Quattro `count` con `head: true`: contano righe senza portarne
 * nessuna. Girano nel layout, quindi su **ogni** pagina dell'area
 * clinica — è la ragione per cui qui non compare il centro di
 * attenzione. I suoi segnali costano undici letture e un motore di
 * regole: giusti da pagare quando si guarda la coda, sbagliati da pagare
 * per disegnare un pallino accanto a una voce di menu.
 *
 * Il pallino che non c'è è una scelta, non una dimenticanza: chi apre
 * l'area clinica passa dalla schermata di apertura, e lì l'urgenza è
 * scritta in grande.
 */
export async function getProNavCounts(): Promise<{
  revisioni: number;
  task: number;
  documenti: number;
  messaggi: number;
}> {
  const supabase = await createSupabaseServerClient();

  const [revisioni, task, documenti, messaggi] = await Promise.all([
    supabase
      .from("measurement_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("review_state", "pending"),
    // Scritti dal paziente e mai aperti da questa parte del filo.
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("from_patient", true)
      .is("read_by_staff_at", null),
  ]);

  return {
    revisioni: revisioni.count ?? 0,
    task: task.count ?? 0,
    documenti: documenti.count ?? 0,
    messaggi: messaggi.count ?? 0,
  };
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
  /**
   * Se una persona l'ha guardato: `pending`, `reviewed`, `approved`.
   *
   * Da non confondere con `statoAnalisi`, che dice se il **motore** ha
   * letto il PDF. Un referto scansionato può risultare analizzato senza
   * che nessuno abbia capito cosa c'è scritto.
   */
  statoRevisione: string;
  revisionatoDa: string | null;
  revisionatoIl: string | null;
  /** Quanti valori estratti da questo referto aspettano una conferma. */
  valoriInAttesa: number;
}

/** I documenti dei pazienti seguiti, dal più recente. */
export async function getDocumentiRecenti(limite = 60): Promise<DocumentoInArrivo[]> {
  const supabase = await createSupabaseServerClient();

  const [documentiRes, proposteRes] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, title, kind, issued_on, created_at, review_state, reviewed_at, " +
          "analyses:document_analyses(status, created_at), " +
          "revisore:profiles!documents_reviewed_by_fkey(full_name), " +
          "patient:patients(id, profile:profiles(full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(limite),

    supabase
      .from("measurement_proposals")
      .select("analysis:document_analyses(document_id)")
      .eq("status", "needs_review")
      .limit(400),
  ]);

  const inAttesa = new Map<string, number>();
  for (const p of (proposteRes.data ?? []) as unknown as {
    analysis: { document_id: string } | null;
  }[]) {
    const doc = p.analysis?.document_id;
    if (!doc) continue;
    inAttesa.set(doc, (inAttesa.get(doc) ?? 0) + 1);
  }

  return ((documentiRes.data ?? []) as unknown as {
    id: string;
    title: string;
    kind: string;
    issued_on: string | null;
    created_at: string;
    review_state: string;
    reviewed_at: string | null;
    analyses: { status: string; created_at: string }[] | null;
    revisore: { full_name: string } | null;
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
      statoRevisione: row.review_state,
      revisionatoDa: row.revisore?.full_name ?? null,
      revisionatoIl: row.reviewed_at,
      valoriInAttesa: inAttesa.get(row.id) ?? 0,
    };
  });
}

/* ── Task ─────────────────────────────────────────────────────────── */

export interface TaskCompleto extends TaskBreve {
  status: string;
  completedAt: string | null;
  /** 1 alta, 2 media, 3 bassa. */
  priorita: number;
  /** `professional`, `brain`, `rule`, `patient`, `system`. */
  origine: string;
  categoria: string | null;
  assegnatarioId: string | null;
  assegnatario: string | null;
  creatoIl: string;
  creatoDa: string | null;
}

export interface CodaTask {
  /** Assegnati a chi guarda. */
  miei: TaskCompleto[];
  /** Aperti e senza incaricato: sono di tutti, quindi di nessuno. */
  daPrendere: TaskCompleto[];
  /** Assegnati a un collega. */
  delTeam: TaskCompleto[];
  /** Chiusi nelle ultime due settimane. */
  chiusi: TaskCompleto[];
  /** Il profilo che sta guardando, per sapere cosa è «mio». */
  profileId: string | null;
}

/**
 * I task, divisi per chi li deve fare.
 *
 * Le tre code non sono un filtro sullo stesso elenco: sono tre stati
 * diversi del lavoro. **«Da prendere» è la più importante** e di solito
 * quella che manca — un task aperto senza incaricato è di tutti, quindi
 * di nessuno, e resta lì mentre ognuno pensa che se ne occupi qualcun
 * altro. Metterlo insieme agli altri lo nasconde.
 *
 * L'origine resta scritta su ogni riga: chi legge un task fra un mese
 * deve poter sapere se l'ha scritto una persona o se è nato da una
 * soglia. Non cambia cosa fare, cambia quanto fidarsi del titolo.
 */
export async function getTask(): Promise<CodaTask> {
  const profile = await getCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const daDueSettimane = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const colonne =
    "id, title, detail, due_on, status, completed_at, priority, origin, category, owner_id, created_at, " +
    "patient:patients(id, profile:profiles(full_name)), " +
    "owner:profiles!tasks_owner_id_fkey(full_name), " +
    "autore:profiles!professional_tasks_created_by_fkey(full_name)";

  const [apertiRes, chiusiRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(colonne)
      .eq("status", "open")
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true })
      .limit(120),
    supabase
      .from("tasks")
      .select(colonne)
      .neq("status", "open")
      .gte("completed_at", daDueSettimane)
      .order("completed_at", { ascending: false })
      .limit(30),
  ]);

  const mappa = (rows: unknown): TaskCompleto[] =>
    ((rows ?? []) as unknown as {
      id: string;
      title: string;
      detail: string | null;
      due_on: string | null;
      status: string;
      completed_at: string | null;
      priority: number;
      origin: string;
      category: string | null;
      owner_id: string | null;
      created_at: string;
      patient: { id: string; profile: { full_name: string } | null } | null;
      owner: { full_name: string } | null;
      autore: { full_name: string } | null;
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      dueOn: row.due_on,
      patientId: row.patient?.id ?? null,
      patientName: row.patient?.profile?.full_name ?? null,
      status: row.status,
      completedAt: row.completed_at,
      priorita: row.priority,
      origine: row.origin,
      categoria: row.category,
      assegnatarioId: row.owner_id,
      assegnatario: row.owner?.full_name ?? null,
      creatoIl: row.created_at,
      creatoDa: row.autore?.full_name ?? null,
    }));

  const aperti = mappa(apertiRes.data);
  const io = profile?.id ?? null;

  return {
    miei: aperti.filter((t) => io !== null && t.assegnatarioId === io),
    daPrendere: aperti.filter((t) => t.assegnatarioId === null),
    delTeam: aperti.filter(
      (t) => t.assegnatarioId !== null && t.assegnatarioId !== io,
    ),
    chiusi: mappa(chiusiRes.data),
    profileId: io,
  };
}
