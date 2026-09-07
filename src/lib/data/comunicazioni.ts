import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PESO_PRIORITA,
  type GenereConversazione,
  type Priorita,
  type StatoConsulto,
  type TipoMessaggio,
  type Vista,
} from "@/lib/comunicazioni/tipi";

/**
 * Le comunicazioni interne, lette.
 *
 * Nessuna query qui filtra per partecipazione a mano: la Row Level
 * Security restituisce già solo le conversazioni che chi guarda ha
 * titolo di vedere. Un `where` applicativo in più sarebbe una seconda
 * regola da tenere allineata alla prima, e le due divergono sempre —
 * di solito nel verso che apre, non in quello che chiude.
 *
 * Quello che si decide qui è **cosa mostrare e in che ordine**, che è
 * un'altra domanda.
 */

/* ── Reparti ──────────────────────────────────────────────────────── */

export interface Reparto {
  id: string;
  slug: string;
  nome: string;
  descrizione: string | null;
  clinico: boolean;
  attivo: boolean;
  disciplina: string | null;
  /** Quante persone ci lavorano oggi. */
  membri: number;
  /** Vero se chi guarda ne fa parte. */
  mio: boolean;
}

interface RigaReparto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_clinical: boolean;
  is_active: boolean;
  discipline: string | null;
  sort_order: number;
}

export async function getReparti(soloAttivi = true): Promise<Reparto[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("departments")
    .select("id, slug, name, description, is_clinical, is_active, discipline, sort_order")
    .order("sort_order", { ascending: true })
    .limit(200);

  if (soloAttivi) query = query.eq("is_active", true);

  const [repartiRes, membriRes] = await Promise.all([
    query,
    supabase
      .from("department_members")
      .select("department_id, profile_id")
      .is("ended_at", null)
      .limit(2000),
  ]);

  const membri = new Map<string, number>();
  const miei = new Set<string>();

  for (const m of (membriRes.data ?? []) as {
    department_id: string;
    profile_id: string;
  }[]) {
    membri.set(m.department_id, (membri.get(m.department_id) ?? 0) + 1);
    if (m.profile_id === profile.id) miei.add(m.department_id);
  }

  return ((repartiRes.data ?? []) as RigaReparto[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    nome: r.name,
    descrizione: r.description,
    clinico: r.is_clinical,
    attivo: r.is_active,
    disciplina: r.discipline,
    membri: membri.get(r.id) ?? 0,
    mio: miei.has(r.id),
  }));
}

/* ── L'elenco delle conversazioni ─────────────────────────────────── */

export interface VoceInbox {
  id: string;
  titolo: string;
  genere: GenereConversazione;
  priorita: Priorita;
  chiusa: boolean;
  repartoId: string | null;
  reparto: string | null;
  pazienteId: string | null;
  paziente: string | null;
  consultoId: string | null;
  statoConsulto: StatoConsulto | null;
  ultimoIl: string;
  anteprima: string | null;
  nonLetti: number;
  silenziata: boolean;
  /** Vero se l'ha aperta chi sta guardando. */
  mia: boolean;
  /** I nomi che compaiono nell'elenco: persone e reparti. */
  con: string[];
}

interface RigaConversazione {
  id: string;
  kind: GenereConversazione;
  title: string;
  priority: Priorita;
  is_closed: boolean;
  department_id: string | null;
  patient_id: string | null;
  consultation_id: string | null;
  created_by: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  department: { name: string } | null;
  patient: { profile: { full_name: string } | null } | null;
  consultation: { status: StatoConsulto } | null;
}

const CAMPI_CONVERSAZIONE =
  "id, kind, title, priority, is_closed, department_id, patient_id, consultation_id, " +
  "created_by, last_message_at, last_message_preview, " +
  "department:departments(name), patient:patients(profile:profiles(full_name)), " +
  "consultation:clinical_consultations!conversations_consultation_fk(status)";

/** Quante conversazioni si leggono per una schermata. Oltre, c'è la ricerca. */
const TETTO = 120;

export interface FiltriInbox {
  /** Lo slug del reparto, quando si guarda da lì. */
  reparto?: string | null;
  ricerca?: string | null;
  pazienteId?: string | null;
}

/**
 * Le sei code, applicate a un insieme già letto.
 *
 * Pura di proposito, e fuori da `getInbox`: la pagina legge **una volta
 * sola** e da quell'unico insieme ricava sia l'elenco da mostrare sia i
 * numeri accanto a ciascuna coda. Sei query separate avrebbero prodotto
 * sei momenti diversi della giornata, e il numero accanto a «Non lette»
 * avrebbe smesso di corrispondere alle righe che si vedono cliccandoci —
 * che è il modo più rapido per far smettere di fidarsi di un contatore.
 */
export function filtraPerVista(voci: VoceInbox[], vista: Vista): VoceInbox[] {
  switch (vista) {
    case "non-lette":
      return voci.filter((v) => v.nonLetti > 0);
    case "importanti":
      return voci.filter((v) => PESO_PRIORITA[v.priorita] >= PESO_PRIORITA.high);
    case "urgenti":
      return voci.filter((v) => PESO_PRIORITA[v.priorita] >= PESO_PRIORITA.urgent);
    case "mie":
      return voci.filter((v) => v.mia);
    case "consulti":
      return voci.filter((v) => v.genere === "consultation");
    default:
      return voci;
  }
}

/**
 * La inbox.
 *
 * Tre letture e non una per riga: le conversazioni, i partecipanti di
 * tutte insieme, i non letti di tutte insieme. È la differenza fra una
 * pagina che apre in un colpo e una che fa centoventi viaggi verso il
 * database per disegnare centoventi pallini.
 *
 * La ricerca passa dal database — `search_communications` interroga
 * l'indice testuale — e non da un `filter` in memoria: filtrare qui
 * avrebbe cercato solo dentro le prime centoventi righe, cioè avrebbe
 * risposto «non trovato» su tutto ciò che conta di più, che è vecchio.
 */
export async function getInbox(filtri: FiltriInbox = {}): Promise<VoceInbox[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();
  const cerca = (filtri.ricerca ?? "").trim();

  // Con una ricerca in corso l'insieme di partenza non è "le più
  // recenti" ma "quelle che contengono la parola": due insiemi diversi,
  // e intersecarli lato applicazione avrebbe perso le vecchie.
  let idsRicerca: string[] | null = null;
  if (cerca.length > 1) {
    const { data } = await supabase.rpc("search_communications", {
      p_query: cerca,
      p_limit: TETTO,
    });
    idsRicerca = ((data ?? []) as { conversation_id: string }[]).map(
      (r) => r.conversation_id,
    );
    if (idsRicerca.length === 0) return [];
  }

  let query = supabase
    .from("conversations")
    .select(CAMPI_CONVERSAZIONE)
    .order("last_message_at", { ascending: false })
    .limit(TETTO);

  if (idsRicerca) query = query.in("id", idsRicerca);
  if (filtri.pazienteId) query = query.eq("patient_id", filtri.pazienteId);

  if (filtri.reparto) {
    const { data: reparto } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", filtri.reparto)
      .maybeSingle();

    const repartoId = (reparto as { id: string } | null)?.id;
    if (!repartoId) return [];

    // Il reparto "di casa" oppure il reparto fra i partecipanti: sono
    // due modi diversi di appartenere e l'elenco li deve mostrare
    // entrambi, o una conversazione aperta *verso* il reparto sparisce.
    const { data: partecipazioni } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("department_id", repartoId)
      .is("left_at", null)
      .limit(500);

    const ids = new Set(
      ((partecipazioni ?? []) as { conversation_id: string }[]).map(
        (p) => p.conversation_id,
      ),
    );

    const { data: diCasa } = await supabase
      .from("conversations")
      .select("id")
      .eq("department_id", repartoId)
      .limit(500);

    for (const c of (diCasa ?? []) as { id: string }[]) ids.add(c.id);
    if (ids.size === 0) return [];

    query = query.in("id", [...ids]);
  }

  const { data } = await query;
  const righe = (data ?? []) as unknown as RigaConversazione[];
  if (righe.length === 0) return [];

  const ids = righe.map((r) => r.id);

  const [partecipantiRes, nonLettiRes] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select(
        "conversation_id, profile_id, department_id, profile:profiles(full_name), department:departments!conversation_participants_department_id_fkey(name)",
      )
      .in("conversation_id", ids)
      .is("left_at", null)
      .limit(1000),

    supabase.rpc("my_unread_conversations"),
  ]);

  const nomi = new Map<string, string[]>();
  for (const p of (partecipantiRes.data ?? []) as unknown as {
    conversation_id: string;
    profile_id: string | null;
    department_id: string | null;
    profile: { full_name: string } | null;
    department: { name: string } | null;
  }[]) {
    // Sé stessi non si elencano: «Con: te, Cardiologia» non dice niente
    // a nessuno, e ruba la riga al nome che serve.
    if (p.profile_id === profile.id) continue;
    const nome = p.department?.name ?? p.profile?.full_name;
    if (!nome) continue;
    const elenco = nomi.get(p.conversation_id) ?? [];
    if (!elenco.includes(nome)) elenco.push(nome);
    nomi.set(p.conversation_id, elenco);
  }

  const stato = new Map<string, { unread: number; muted: boolean }>();
  for (const r of (nonLettiRes.data ?? []) as {
    conversation_id: string;
    unread: number;
    is_muted: boolean;
  }[]) {
    stato.set(r.conversation_id, { unread: r.unread ?? 0, muted: r.is_muted });
  }

  return righe.map((r) => {
    const s = stato.get(r.id);
    return {
      id: r.id,
      titolo: r.title,
      genere: r.kind,
      priorita: r.priority,
      chiusa: r.is_closed,
      repartoId: r.department_id,
      reparto: r.department?.name ?? null,
      pazienteId: r.patient_id,
      paziente: r.patient?.profile?.full_name ?? null,
      consultoId: r.consultation_id,
      statoConsulto: r.consultation?.status ?? null,
      ultimoIl: r.last_message_at,
      anteprima: r.last_message_preview,
      nonLetti: s?.unread ?? 0,
      silenziata: s?.muted ?? false,
      mia: r.created_by === profile.id,
      con: nomi.get(r.id) ?? [],
    };
  });
}

/* ── Una conversazione ────────────────────────────────────────────── */

export interface MessaggioInterno {
  id: string;
  autoreId: string | null;
  autore: string;
  reparto: string | null;
  tipo: TipoMessaggio;
  priorita: Priorita;
  corpo: string;
  documentId: string | null;
  quando: string;
  /** Vero se l'ha scritto chi sta guardando. */
  mio: boolean;
  /** Chi l'ha aperto, oltre all'autore. */
  lettoDa: string[];
}

export interface Partecipante {
  id: string;
  profileId: string | null;
  departmentId: string | null;
  nome: string;
  /** «Reparto» oppure la disciplina/ruolo della persona. */
  qualifica: string | null;
  reparto: boolean;
  proprietario: boolean;
}

export interface Consulto {
  id: string;
  conversationId: string;
  pazienteId: string;
  paziente: string | null;
  motivo: string;
  descrizione: string | null;
  priorita: Priorita;
  stato: StatoConsulto;
  repartoDestinatario: string | null;
  repartoRichiedente: string | null;
  richiedente: string | null;
  incaricato: string | null;
  incaricatoId: string | null;
  scadenza: string | null;
  presoInCaricoIl: string | null;
  rispostoIl: string | null;
  chiusoIl: string | null;
  risposta: string | null;
  creatoIl: string;
}

export interface Allegato {
  id: string;
  nome: string;
  mime: string | null;
  bytes: number | null;
  documentId: string | null;
  storagePath: string | null;
  quando: string;
}

export interface ConversazioneInterna {
  id: string;
  titolo: string;
  genere: GenereConversazione;
  priorita: Priorita;
  chiusa: boolean;
  reparto: string | null;
  pazienteId: string | null;
  paziente: string | null;
  creataIl: string;
  /** Vero se chi guarda può scriverci. */
  scrivibile: boolean;
  silenziata: boolean;
  messaggi: MessaggioInterno[];
  partecipanti: Partecipante[];
  consulto: Consulto | null;
  allegati: Allegato[];
}

/**
 * Una conversazione con dentro tutto ciò che serve a leggerla.
 *
 * **Non** la segna letta: farlo in una funzione di lettura significa che
 * un `router.refresh()` di realtime la marca letta anche se la scheda è
 * minimizzata in un angolo. Segnare è un gesto, e sta in un'azione.
 */
export async function getConversazione(
  id: string,
): Promise<ConversazioneInterna | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  const [convRes, messaggiRes, partecipantiRes, allegatiRes, mieiRepartiRes] =
    await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, kind, title, priority, is_closed, patient_id, created_at, " +
          "department:departments(name), patient:patients(profile:profiles(full_name)), " +
          "consultation:clinical_consultations!conversations_consultation_fk(" +
          "id, patient_id, reason, description, priority, status, due_at, taken_at, " +
          "answered_at, closed_at, answer, created_at, assignee_id, " +
          "target:departments!clinical_consultations_target_department_id_fkey(name), " +
          "requesting:departments!clinical_consultations_requesting_department_id_fkey(name), " +
          "requester:profiles!clinical_consultations_requested_by_fkey(full_name), " +
          "assignee:profiles!clinical_consultations_assignee_id_fkey(full_name))",
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("conversation_messages")
      .select(
        "id, author_id, kind, priority, body, document_id, created_at, " +
          "author:profiles(full_name), department:departments(name)",
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(400),

    supabase
      .from("conversation_participants")
      .select(
        "id, profile_id, department_id, role, is_muted, " +
          "profile:profiles(full_name, role), department:departments!conversation_participants_department_id_fkey(name)",
      )
      .eq("conversation_id", id)
      .is("left_at", null)
      .limit(120),

    supabase
      .from("conversation_attachments")
      .select("id, file_name, mime_type, size_bytes, document_id, storage_path, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(60),

    // I reparti di chi guarda: servono a sapere se può **scrivere**, che
    // non è la stessa cosa che poter leggere.
    supabase
      .from("department_members")
      .select("department_id")
      .eq("profile_id", profile.id)
      .is("ended_at", null)
      .limit(50),
    ]);

  const c = convRes.data as unknown as {
    id: string;
    kind: GenereConversazione;
    title: string;
    priority: Priorita;
    is_closed: boolean;
    patient_id: string | null;
    created_at: string;
    department: { name: string } | null;
    patient: { profile: { full_name: string } | null } | null;
    consultation: {
      id: string;
      patient_id: string;
      reason: string;
      description: string | null;
      priority: Priorita;
      status: StatoConsulto;
      due_at: string | null;
      taken_at: string | null;
      answered_at: string | null;
      closed_at: string | null;
      answer: string | null;
      created_at: string;
      assignee_id: string | null;
      target: { name: string } | null;
      requesting: { name: string } | null;
      requester: { full_name: string } | null;
      assignee: { full_name: string } | null;
    } | null;
  } | null;

  if (!c) return null;

  const messaggiGrezzi = (messaggiRes.data ?? []) as unknown as {
    id: string;
    author_id: string | null;
    kind: TipoMessaggio;
    priority: Priorita;
    body: string;
    document_id: string | null;
    created_at: string;
    author: { full_name: string } | null;
    department: { name: string } | null;
  }[];

  // Le ricevute in una lettura sola: una per messaggio sarebbe stata una
  // query per riga, e una conversazione lunga ne ha trecento.
  const ricevute = new Map<string, string[]>();
  if (messaggiGrezzi.length > 0) {
    const { data } = await supabase
      .from("conversation_message_reads")
      .select("message_id, profile:profiles(full_name)")
      .in(
        "message_id",
        messaggiGrezzi.map((m) => m.id),
      )
      .limit(2000);

    for (const r of (data ?? []) as unknown as {
      message_id: string;
      profile: { full_name: string } | null;
    }[]) {
      const nome = r.profile?.full_name;
      if (!nome) continue;
      const elenco = ricevute.get(r.message_id) ?? [];
      elenco.push(nome);
      ricevute.set(r.message_id, elenco);
    }
  }

  const partecipanti = (partecipantiRes.data ?? []) as unknown as {
    id: string;
    profile_id: string | null;
    department_id: string | null;
    role: string;
    is_muted: boolean;
    profile: { full_name: string; role: string } | null;
    department: { name: string } | null;
  }[];

  const mio = partecipanti.find((p) => p.profile_id === profile.id);

  /*
   * Chi può scrivere.
   *
   * La regola è la stessa di `conversation_writable` nel database, e
   * ricalcolarla qui serve a una cosa sola: non disegnare un campo di
   * scrittura a chi il database respingerebbe. Un pulsante che produce
   * un errore insegna a non fidarsi degli altri pulsanti.
   *
   * L'errore facile — e che c'era — è dire «scrivibile se fra i
   * partecipanti c'è un reparto». È falso: dev'esserci un reparto **di
   * cui chi guarda fa parte**. La direzione legge le conversazioni
   * cliniche di un paziente senza esserne parte, e vedeva il campo.
   */
  const mieiReparti = new Set(
    ((mieiRepartiRes.data ?? []) as { department_id: string }[]).map(
      (r) => r.department_id,
    ),
  );

  const scrivibile =
    !c.is_closed &&
    (mio !== undefined ||
      partecipanti.some(
        (p) => p.department_id !== null && mieiReparti.has(p.department_id),
      ));

  const k = c.consultation;

  return {
    id: c.id,
    titolo: c.title,
    genere: c.kind,
    priorita: c.priority,
    chiusa: c.is_closed,
    reparto: c.department?.name ?? null,
    pazienteId: c.patient_id,
    paziente: c.patient?.profile?.full_name ?? null,
    creataIl: c.created_at,
    scrivibile,
    silenziata: mio?.is_muted ?? false,

    messaggi: messaggiGrezzi.map((m) => ({
      id: m.id,
      autoreId: m.author_id,
      autore: m.author?.full_name ?? "Profilo rimosso",
      reparto: m.department?.name ?? null,
      tipo: m.kind,
      priorita: m.priority,
      corpo: m.body,
      documentId: m.document_id,
      quando: m.created_at,
      mio: m.author_id === profile.id,
      lettoDa: (ricevute.get(m.id) ?? []).filter(
        (n) => n !== (m.author?.full_name ?? ""),
      ),
    })),

    partecipanti: partecipanti.map((p) => ({
      id: p.id,
      profileId: p.profile_id,
      departmentId: p.department_id,
      nome: p.department?.name ?? p.profile?.full_name ?? "—",
      qualifica: p.department_id ? "Reparto" : (p.profile?.role ?? null),
      reparto: p.department_id !== null,
      proprietario: p.role === "owner",
    })),

    consulto: k
      ? {
          id: k.id,
          conversationId: c.id,
          pazienteId: k.patient_id,
          paziente: c.patient?.profile?.full_name ?? null,
          motivo: k.reason,
          descrizione: k.description,
          priorita: k.priority,
          stato: k.status,
          repartoDestinatario: k.target?.name ?? null,
          repartoRichiedente: k.requesting?.name ?? null,
          richiedente: k.requester?.full_name ?? null,
          incaricato: k.assignee?.full_name ?? null,
          incaricatoId: k.assignee_id,
          scadenza: k.due_at,
          presoInCaricoIl: k.taken_at,
          rispostoIl: k.answered_at,
          chiusoIl: k.closed_at,
          risposta: k.answer,
          creatoIl: k.created_at,
        }
      : null,

    allegati: ((allegatiRes.data ?? []) as {
      id: string;
      file_name: string;
      mime_type: string | null;
      size_bytes: number | null;
      document_id: string | null;
      storage_path: string | null;
      created_at: string;
    }[]).map((a) => ({
      id: a.id,
      nome: a.file_name,
      mime: a.mime_type,
      bytes: a.size_bytes,
      documentId: a.document_id,
      storagePath: a.storage_path,
      quando: a.created_at,
    })),
  };
}

/* ── I consulti ───────────────────────────────────────────────────── */

export interface VoceConsulto extends Consulto {
  /** Righe non lette nella conversazione del consulto. */
  nonLetti: number;
}

/**
 * La lavagna dei consulti.
 *
 * L'ordine non è cronologico: prima ciò che nessuno ha preso in carico,
 * poi per priorità, poi per data. Un consulto urgente aperto due giorni
 * fa deve stare sopra uno normale di stamattina, o la lavagna diventa
 * un registro e smette di essere una coda.
 */
export async function getConsulti(opzioni: {
  soloMiei?: boolean;
  soloAperti?: boolean;
  pazienteId?: string | null;
} = {}): Promise<VoceConsulto[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("clinical_consultations")
    .select(
      "id, conversation_id, patient_id, reason, description, priority, status, due_at, " +
        "taken_at, answered_at, closed_at, answer, created_at, assignee_id, requested_by, " +
        "patient:patients(profile:profiles(full_name)), " +
        "target:departments!clinical_consultations_target_department_id_fkey(name), " +
        "requesting:departments!clinical_consultations_requesting_department_id_fkey(name), " +
        "requester:profiles!clinical_consultations_requested_by_fkey(full_name), " +
        "assignee:profiles!clinical_consultations_assignee_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (opzioni.soloAperti) query = query.neq("status", "closed");
  if (opzioni.pazienteId) query = query.eq("patient_id", opzioni.pazienteId);
  if (opzioni.soloMiei) query = query.eq("requested_by", profile.id);

  const [res, nonLettiRes] = await Promise.all([
    query,
    supabase.rpc("my_unread_conversations"),
  ]);

  const nonLetti = new Map<string, number>();
  for (const r of (nonLettiRes.data ?? []) as {
    conversation_id: string;
    unread: number;
  }[]) {
    nonLetti.set(r.conversation_id, r.unread ?? 0);
  }

  const righe = (res.data ?? []) as unknown as {
    id: string;
    conversation_id: string;
    patient_id: string;
    reason: string;
    description: string | null;
    priority: Priorita;
    status: StatoConsulto;
    due_at: string | null;
    taken_at: string | null;
    answered_at: string | null;
    closed_at: string | null;
    answer: string | null;
    created_at: string;
    assignee_id: string | null;
    patient: { profile: { full_name: string } | null } | null;
    target: { name: string } | null;
    requesting: { name: string } | null;
    requester: { full_name: string } | null;
    assignee: { full_name: string } | null;
  }[];

  const voci: VoceConsulto[] = righe.map((k) => ({
    id: k.id,
    conversationId: k.conversation_id,
    pazienteId: k.patient_id,
    paziente: k.patient?.profile?.full_name ?? null,
    motivo: k.reason,
    descrizione: k.description,
    priorita: k.priority,
    stato: k.status,
    repartoDestinatario: k.target?.name ?? null,
    repartoRichiedente: k.requesting?.name ?? null,
    richiedente: k.requester?.full_name ?? null,
    incaricato: k.assignee?.full_name ?? null,
    incaricatoId: k.assignee_id,
    scadenza: k.due_at,
    presoInCaricoIl: k.taken_at,
    rispostoIl: k.answered_at,
    chiusoIl: k.closed_at,
    risposta: k.answer,
    creatoIl: k.created_at,
    nonLetti: nonLetti.get(k.conversation_id) ?? 0,
  }));

  const ordineStato: Record<StatoConsulto, number> = {
    open: 0,
    taken: 1,
    in_review: 2,
    answered: 3,
    closed: 4,
  };

  return voci.sort(
    (a, b) =>
      ordineStato[a.stato] - ordineStato[b.stato] ||
      PESO_PRIORITA[b.priorita] - PESO_PRIORITA[a.priorita] ||
      b.creatoIl.localeCompare(a.creatoIl),
  );
}

/* ── I numeri ─────────────────────────────────────────────────────── */

export interface RiepilogoComunicazioni {
  nonLette: number;
  conversazioniConNonLetti: number;
  consultiAperti: number;
  consultiDaPrendereInCarico: number;
  urgenti: number;
  ultime: VoceInbox[];
}

/**
 * Il riquadro nella schermata di apertura.
 *
 * I numeri e l'elenco nascono dalle **stesse righe**: un contatore che
 * dice «3 urgenti» sopra un elenco che ne mostra due è il modo più
 * rapido per far smettere di fidarsi di un cruscotto, e nasce sempre da
 * due query che contano la stessa cosa con due `where` diversi.
 */
export async function getRiepilogoComunicazioni(): Promise<RiepilogoComunicazioni> {
  const vuoto: RiepilogoComunicazioni = {
    nonLette: 0,
    conversazioniConNonLetti: 0,
    consultiAperti: 0,
    consultiDaPrendereInCarico: 0,
    urgenti: 0,
    ultime: [],
  };

  if (!isSupabaseConfigured()) return vuoto;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return vuoto;

  const [inbox, consulti] = await Promise.all([
    getInbox(),
    getConsulti({ soloAperti: true }),
  ]);

  const conNonLetti = inbox.filter((v) => v.nonLetti > 0);

  return {
    nonLette: conNonLetti.reduce((n, v) => n + v.nonLetti, 0),
    conversazioniConNonLetti: conNonLetti.length,
    consultiAperti: consulti.length,
    consultiDaPrendereInCarico: consulti.filter((k) => k.stato === "open").length,
    urgenti: inbox.filter(
      (v) => !v.chiusa && PESO_PRIORITA[v.priorita] >= PESO_PRIORITA.urgent,
    ).length,
    ultime: inbox.slice(0, 4),
  };
}

/** Il numero accanto alla voce di menu. Una funzione, una riga di risposta. */
export async function contaNonLette(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("count_unread_communications");
  return typeof data === "number" ? data : 0;
}

/* ── Chi si può scrivere ──────────────────────────────────────────── */

export interface Collega {
  profileId: string;
  nome: string;
  qualifica: string | null;
  reparti: string[];
}

/**
 * I destinatari possibili.
 *
 * `profiles` è ristretta dalla Row Level Security: un professionista
 * vede sé stesso e i colleghi che la policy gli concede. L'elenco parte
 * dai membri dei reparti — che sono l'organigramma, e sono leggibili da
 * chi lavora in Unique — così anche chi non ha una policy diretta sui
 * profili altrui trova comunque qualcuno a cui scrivere.
 */
export async function getColleghi(): Promise<Collega[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("department_members")
    .select("profile_id, profile:profiles(full_name, role), department:departments(name)")
    .is("ended_at", null)
    .limit(600);

  const per = new Map<string, Collega>();

  for (const m of (data ?? []) as unknown as {
    profile_id: string;
    profile: { full_name: string; role: string } | null;
    department: { name: string } | null;
  }[]) {
    if (m.profile_id === profile.id) continue;
    if (!m.profile?.full_name) continue;

    const c = per.get(m.profile_id) ?? {
      profileId: m.profile_id,
      nome: m.profile.full_name,
      qualifica: m.profile.role,
      reparti: [],
    };
    if (m.department?.name && !c.reparti.includes(m.department.name)) {
      c.reparti.push(m.department.name);
    }
    per.set(m.profile_id, c);
  }

  return [...per.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

/* ── Il registro ──────────────────────────────────────────────────── */

export interface RigaRegistro {
  id: number;
  azione: string;
  attore: string | null;
  quando: string;
  conversazione: string | null;
  conversationId: string | null;
  pazienteId: string | null;
  dettagli: Record<string, unknown>;
}

export const ETICHETTE_REGISTRO: Record<string, string> = {
  "communication.opened": "Ha aperto una comunicazione",
  "communication.message.sent": "Ha scritto un messaggio",
  "communication.read": "Ha letto",
  "communication.closed": "Ha chiuso la comunicazione",
  "communication.reopened": "Ha riaperto la comunicazione",
  "communication.participant.added": "Ha aggiunto un partecipante",
  "communication.attachment.added": "Ha caricato un allegato",
  "consultation.requested": "Ha richiesto un consulto",
  "consultation.taken": "Ha preso in carico il consulto",
  "consultation.in_review": "Ha messo il consulto in valutazione",
  "consultation.answered": "Ha risposto al consulto",
  "consultation.closed": "Ha chiuso il consulto",
};

export function etichettaRegistro(azione: string): string {
  return ETICHETTE_REGISTRO[azione] ?? azione;
}

/**
 * Il registro delle comunicazioni.
 *
 * Non ha un controllo di ruolo, e non gli servirebbe: `audit_log` ha due
 * policy che decidono al posto suo — la direzione vede tutto, chi
 * partecipa a una conversazione ne vede le tracce. Se questa query fosse
 * sbagliata, Postgres non restituirebbe comunque righe di conversazioni
 * altrui.
 */
export async function getRegistroComunicazioni(opzioni: {
  conversationId?: string | null;
  limite?: number;
} = {}): Promise<RigaRegistro[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("audit_log")
    .select(
      "id, action, entity_id, patient_id, metadata, created_at, actor:profiles(full_name)",
    )
    .eq("entity", "conversation")
    .order("created_at", { ascending: false })
    .limit(opzioni.limite ?? 150);

  if (opzioni.conversationId) query = query.eq("entity_id", opzioni.conversationId);

  const { data } = await query;
  const righe = (data ?? []) as unknown as {
    id: number;
    action: string;
    entity_id: string | null;
    patient_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    actor: { full_name: string } | null;
  }[];

  if (righe.length === 0) return [];

  // I titoli in una lettura sola. La RLS li filtra da sé: di una
  // conversazione che non si vede resta la riga senza il titolo, ed è
  // corretto — il registro dice che è successo qualcosa, non cosa.
  const ids = [...new Set(righe.map((r) => r.entity_id).filter(Boolean))] as string[];
  const titoli = new Map<string, string>();

  if (ids.length > 0) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, title")
      .in("id", ids);
    for (const c of (conv ?? []) as { id: string; title: string }[]) {
      titoli.set(c.id, c.title);
    }
  }

  return righe.map((r) => ({
    id: r.id,
    azione: r.action,
    attore: r.actor?.full_name ?? null,
    quando: r.created_at,
    conversationId: r.entity_id,
    conversazione: r.entity_id ? (titoli.get(r.entity_id) ?? null) : null,
    pazienteId: r.patient_id,
    dettagli: r.metadata ?? {},
  }));
}
