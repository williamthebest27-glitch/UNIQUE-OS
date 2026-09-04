import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";
import { leggiDomande, type Domanda, type Risposta } from "@/lib/patient/questionari";
import type { Lettura } from "@/lib/patient/risultati";
import {
  mockConversazioni,
  mockLetture,
  mockPatientDashboard,
  mockQuestionari,
} from "@/lib/mock/patient-dashboard";

/**
 * Le letture delle sezioni nuove della Patient App.
 *
 * Nessuna query filtra per paziente a mano, e non è pigrizia: il filtro
 * lo mette la Row Level Security, che nessun errore di questo file può
 * aggirare. Se una query qui fosse sbagliata, Postgres non
 * restituirebbe comunque righe che l'utente non ha diritto di vedere —
 * ed è per questo che un id nell'URL non è mai una chiave.
 */

/** L'id della propria scheda clinica. Serve solo a chi deve scrivere. */
export async function mioPatientId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return "demo";
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

/* ── Risultati ────────────────────────────────────────────────────── */

/**
 * Tutte le misure del paziente, in forma grezza.
 *
 * Il raggruppamento, il confronto e il giudizio "è migliorato" li fa
 * `@/lib/patient/risultati`, che è puro e ha i suoi test. Qui si legge e
 * basta.
 */
export async function letture(): Promise<Lettura[]> {
  if (!isSupabaseConfigured()) return mockLetture;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("measurements")
    .select("metric_code, label, value, category, unit, ref_low, ref_high, measured_on")
    .order("measured_on", { ascending: true })
    .limit(2000);

  return ((data ?? []) as {
    metric_code: string;
    label: string;
    value: number | string | null;
    category: string | null;
    unit: string | null;
    ref_low: number | string | null;
    ref_high: number | string | null;
    measured_on: string;
  }[]).map((r) => ({
    metricCode: r.metric_code,
    label: r.label,
    unit: r.unit,
    value: r.value === null ? null : Number(r.value),
    category: r.category,
    refLow: r.ref_low === null ? null : Number(r.ref_low),
    refHigh: r.ref_high === null ? null : Number(r.ref_high),
    measuredOn: r.measured_on,
  }));
}

/* ── Questionari ──────────────────────────────────────────────────── */

export type StatoQuestionario = "not_started" | "in_progress" | "completed";

export interface QuestionarioInElenco {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: StatoQuestionario;
  progressoPct: number;
  minutiStimati: number;
  scadeIl: string | null;
  completatoIl: string | null;
  domande: Domanda[];
  risposte: Record<string, Risposta>;
}

interface RigaQuestionario {
  id: string;
  status: StatoQuestionario;
  progress_pct: number | string;
  due_on: string | null;
  completed_at: string | null;
  questions: unknown;
  answers: Record<string, Risposta> | null;
  template: { title: string; description: string | null; estimated_minutes: number } | null;
}

export async function questionari(): Promise<QuestionarioInElenco[]> {
  if (!isSupabaseConfigured()) return mockQuestionari;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patient_assessments")
    .select(
      "id, status, progress_pct, due_on, completed_at, questions, answers, template:assessment_templates(title, description, estimated_minutes)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as unknown as RigaQuestionario[]).map((r) => ({
    id: r.id,
    titolo: r.template?.title ?? "Questionario",
    descrizione: r.template?.description ?? null,
    stato: r.status,
    progressoPct: Number(r.progress_pct ?? 0),
    minutiStimati: r.template?.estimated_minutes ?? 5,
    scadeIl: r.due_on,
    completatoIl: r.completed_at,
    domande: leggiDomande(r.questions),
    risposte: r.answers ?? {},
  }));
}

export async function questionario(id: string): Promise<QuestionarioInElenco | null> {
  if (!isSupabaseConfigured()) return mockQuestionari.find((q) => q.id === id) ?? null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patient_assessments")
    .select(
      "id, status, progress_pct, due_on, completed_at, questions, answers, template:assessment_templates(title, description, estimated_minutes)",
    )
    .eq("id", id)
    .maybeSingle();

  const r = data as unknown as RigaQuestionario | null;
  if (!r) return null;

  return {
    id: r.id,
    titolo: r.template?.title ?? "Questionario",
    descrizione: r.template?.description ?? null,
    stato: r.status,
    progressoPct: Number(r.progress_pct ?? 0),
    minutiStimati: r.template?.estimated_minutes ?? 5,
    scadeIl: r.due_on,
    completatoIl: r.completed_at,
    domande: leggiDomande(r.questions),
    risposte: r.answers ?? {},
  };
}

/* ── Messaggi ─────────────────────────────────────────────────────── */

export type CategoriaFilo = "clinical" | "administrative";

export interface FiloInElenco {
  id: string;
  oggetto: string;
  categoria: CategoriaFilo;
  chiusa: boolean;
  ultimoMessaggioIl: string;
  nonLetti: number;
  anteprima: string | null;
}

export interface MessaggioInFilo {
  id: string;
  testo: string;
  dalPaziente: boolean;
  autore: string | null;
  creatoIl: string;
  lettoDalPaziente: boolean;
}

export async function conversazioni(): Promise<FiloInElenco[]> {
  if (!isSupabaseConfigured()) return mockConversazioni;

  const supabase = await createSupabaseServerClient();
  const { data: fili } = await supabase
    .from("message_threads")
    .select("id, subject, category, is_closed, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);

  const righe = (fili ?? []) as {
    id: string;
    subject: string;
    category: CategoriaFilo;
    is_closed: boolean;
    last_message_at: string;
  }[];
  if (righe.length === 0) return [];

  // Un solo giro per le anteprime e i non letti: una query per filo
  // sarebbe cinquanta query per una pagina che ne mostra dieci.
  const { data: messaggi } = await supabase
    .from("messages")
    .select("thread_id, body, from_patient, read_by_patient_at, created_at")
    .in("thread_id", righe.map((f) => f.id))
    .order("created_at", { ascending: false })
    .limit(500);

  const perFilo = new Map<string, { body: string; from_patient: boolean; read_by_patient_at: string | null }[]>();
  for (const m of (messaggi ?? []) as {
    thread_id: string;
    body: string;
    from_patient: boolean;
    read_by_patient_at: string | null;
    created_at: string;
  }[]) {
    perFilo.set(m.thread_id, [...(perFilo.get(m.thread_id) ?? []), m]);
  }

  return righe.map((f) => {
    const suoi = perFilo.get(f.id) ?? [];
    return {
      id: f.id,
      oggetto: f.subject,
      categoria: f.category,
      chiusa: f.is_closed,
      ultimoMessaggioIl: f.last_message_at,
      // Non letti dal paziente: quelli scritti dalla clinica e mai aperti.
      nonLetti: suoi.filter((m) => !m.from_patient && m.read_by_patient_at === null).length,
      anteprima: suoi[0]?.body ?? null,
    };
  });
}

export async function conversazione(
  id: string,
): Promise<{ filo: FiloInElenco; messaggi: MessaggioInFilo[] } | null> {
  if (!isSupabaseConfigured()) {
    const filo = mockConversazioni.find((c) => c.id === id);
    return filo ? { filo, messaggi: [] } : null;
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: filoRes }, { data: messaggiRes }] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, subject, category, is_closed, last_message_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, body, from_patient, created_at, read_by_patient_at, author:profiles(full_name)")
      .eq("thread_id", id)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const f = filoRes as {
    id: string;
    subject: string;
    category: CategoriaFilo;
    is_closed: boolean;
    last_message_at: string;
  } | null;
  if (!f) return null;

  const messaggi = ((messaggiRes ?? []) as unknown as {
    id: string;
    body: string;
    from_patient: boolean;
    created_at: string;
    read_by_patient_at: string | null;
    author: { full_name: string } | null;
  }[]).map((m) => ({
    id: m.id,
    testo: m.body,
    dalPaziente: m.from_patient,
    autore: m.author?.full_name ?? null,
    creatoIl: m.created_at,
    lettoDalPaziente: m.read_by_patient_at !== null,
  }));

  return {
    filo: {
      id: f.id,
      oggetto: f.subject,
      categoria: f.category,
      chiusa: f.is_closed,
      ultimoMessaggioIl: f.last_message_at,
      nonLetti: messaggi.filter((m) => !m.dalPaziente && !m.lettoDalPaziente).length,
      anteprima: messaggi[messaggi.length - 1]?.testo ?? null,
    },
    messaggi,
  };
}

/* ── Notifiche ────────────────────────────────────────────────────── */

export interface Notifica {
  id: string;
  titolo: string;
  corpo: string | null;
  link: string | null;
  lettaIl: string | null;
  creataIl: string;
}

export async function notifiche(limite = 40): Promise<Notifica[]> {
  if (!isSupabaseConfigured()) {
    return mockPatientDashboard.notifications.map((n) => ({
      id: n.id,
      titolo: n.title,
      corpo: n.body,
      link: n.linkUrl,
      lettaIl: n.readAt,
      creataIl: n.createdAt,
    }));
  }

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link_url, read_at, created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as {
    id: string;
    title: string;
    body: string | null;
    link_url: string | null;
    read_at: string | null;
    created_at: string;
  }[]).map((n) => ({
    id: n.id,
    titolo: n.title,
    corpo: n.body,
    link: n.link_url,
    lettaIl: n.read_at,
    creataIl: n.created_at,
  }));
}

/* ── Profilo e consensi ───────────────────────────────────────────── */

export type TipoConsenso = "privacy_policy" | "health_data" | "marketing" | "research";

export interface Consenso {
  tipo: TipoConsenso;
  concesso: boolean;
  versione: string;
  decisoIl: string;
}

/** I consensi obbligatori per usare Unique OS. Gli altri sono una scelta. */
export const CONSENSI_OBBLIGATORI: TipoConsenso[] = ["privacy_policy", "health_data"];

export const ETICHETTE_CONSENSO: Record<TipoConsenso, { titolo: string; spiegazione: string }> = {
  privacy_policy: {
    titolo: "Informativa privacy",
    spiegazione: "Come trattiamo i tuoi dati e per quanto tempo li conserviamo.",
  },
  health_data: {
    titolo: "Trattamento dei dati sanitari",
    spiegazione:
      "Senza questo consenso non possiamo calcolare il tuo punteggio né conservare referti e misure.",
  },
  marketing: {
    titolo: "Comunicazioni commerciali",
    spiegazione: "Novità, iniziative ed eventi. Puoi revocarlo quando vuoi, senza perdere nulla.",
  },
  research: {
    titolo: "Ricerca in forma anonima",
    spiegazione: "I tuoi dati, privati del nome, contribuiscono a migliorare il modello dello Score.",
  },
};

export interface Preferenze {
  email: boolean;
  appointmentReminders: boolean;
  results: boolean;
  messages: boolean;
}

const PREFERENZE_DEFAULT: Preferenze = {
  email: true,
  appointmentReminders: true,
  results: true,
  messages: true,
};

export interface Profilo {
  id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  consensi: Consenso[];
  preferenze: Preferenze;
}

export async function profilo(): Promise<Profilo | null> {
  const corrente = await getCurrentProfile();
  if (!corrente) return null;

  if (!isSupabaseConfigured()) {
    // I consensi obbligatori risultano dati: un paziente dimostrativo che
    // apre l'app non deve trovarsi in cima "completa i consensi", che
    // sarebbe un allarme finto su una schermata di esempio.
    return {
      id: corrente.id,
      nome: corrente.firstName ?? corrente.fullName,
      cognome: null,
      email: corrente.email,
      telefono: null,
      consensi: CONSENSI_OBBLIGATORI.map((tipo) => ({
        tipo,
        concesso: true,
        versione: "v1",
        decisoIl: "2026-02-14T09:00:00Z",
      })),
      preferenze: PREFERENZE_DEFAULT,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: riga }, { data: consensiRes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, full_name, email, phone, notification_prefs")
      .eq("id", corrente.id)
      .maybeSingle(),
    supabase.from("consent_current").select("kind, granted, policy_version, decided_at"),
  ]);

  const p = riga as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string;
    email: string | null;
    phone: string | null;
    notification_prefs: Partial<Record<string, boolean>> | null;
  } | null;
  if (!p) return null;

  const prefs = p.notification_prefs ?? {};

  return {
    id: p.id,
    nome: p.first_name ?? p.full_name.split(" ")[0] ?? "",
    cognome: p.last_name ?? (p.full_name.split(" ").slice(1).join(" ") || null),
    email: p.email,
    telefono: p.phone,
    consensi: ((consensiRes ?? []) as {
      kind: TipoConsenso;
      granted: boolean;
      policy_version: string;
      decided_at: string;
    }[]).map((c) => ({
      tipo: c.kind,
      concesso: c.granted,
      versione: c.policy_version,
      decisoIl: c.decided_at,
    })),
    preferenze: {
      email: prefs.email ?? PREFERENZE_DEFAULT.email,
      appointmentReminders: prefs.appointment_reminders ?? PREFERENZE_DEFAULT.appointmentReminders,
      results: prefs.results ?? PREFERENZE_DEFAULT.results,
      messages: prefs.messages ?? PREFERENZE_DEFAULT.messages,
    },
  };
}

/** I consensi obbligatori che mancano o sono stati revocati. */
export function consensiMancanti(consensi: readonly Consenso[]): string[] {
  return CONSENSI_OBBLIGATORI.filter(
    (tipo) => !consensi.some((c) => c.tipo === tipo && c.concesso),
  ).map((tipo) => ETICHETTE_CONSENSO[tipo].titolo.toLowerCase());
}

/* ── I contatori del menu ─────────────────────────────────────────── */

/**
 * I pallini accanto alle voci: messaggi non letti, questionari da fare.
 *
 * Due conteggi, non due elenchi: il layout gira a ogni pagina e non deve
 * pagare la lettura di conversazioni che nessuno sta guardando.
 */
export async function contatoriNav(): Promise<{
  messaggiNonLetti: number;
  questionariDaFare: number;
  notificheNonLette: number;
}> {
  if (!isSupabaseConfigured()) {
    return {
      messaggiNonLetti: mockConversazioni.reduce((s, c) => s + c.nonLetti, 0),
      questionariDaFare: mockQuestionari.filter((q) => q.stato !== "completed").length,
      notificheNonLette: mockPatientDashboard.notifications.filter((n) => n.readAt === null).length,
    };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { messaggiNonLetti: 0, questionariDaFare: 0, notificheNonLette: 0 };

  const supabase = await createSupabaseServerClient();
  const [messaggi, questionariRes, notificheRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("from_patient", false)
      .is("read_by_patient_at", null),
    supabase
      .from("patient_assessments")
      .select("id", { count: "exact", head: true })
      .neq("status", "completed"),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .is("read_at", null),
  ]);

  return {
    messaggiNonLetti: messaggi.count ?? 0,
    questionariDaFare: questionariRes.count ?? 0,
    notificheNonLette: notificheRes.count ?? 0,
  };
}
