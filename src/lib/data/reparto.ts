import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profiloDi, type ProfiloOperativo } from "@/lib/clinical/profili";
import type { Discipline } from "@/lib/professionals/disciplines";
import type { Priorita, StatoConsulto } from "@/lib/comunicazioni/tipi";
import { getGiro, type VoceGiro } from "@/lib/data/terapie";
import { getRichieste, type RichiestaEsameLab } from "@/lib/data/laboratorio";

/**
 * Il lavoro di chi non passa la giornata in ambulatorio.
 *
 * Il command center clinico (`data/comando.ts`) risponde alla domanda di
 * un medico: *cosa sta succedendo ai miei pazienti e cosa devo
 * decidere.* Sono le domande giuste per chi visita, e sono le domande
 * sbagliate per chi somministra una terapia o valida un pannello di
 * laboratorio — che di pazienti «propri» non ne ha, e guarda la giornata
 * per reparto.
 *
 * Qui vivono le letture di quelle due giornate. Nessuna di esse filtra
 * per care team a mano: la Row Level Security restituisce già solo ciò
 * che chi guarda ha titolo di vedere, e un `where` applicativo in più
 * sarebbe una seconda regola da tenere allineata alla prima.
 */

/* ── Chi sta guardando ────────────────────────────────────────────── */

export interface Identita {
  profiloId: string;
  professionalId: string | null;
  discipline: Discipline | null;
  /** Gli slug dei reparti di cui fa parte oggi. */
  reparti: string[];
  nomiReparti: string[];
  profilo: ProfiloOperativo;
}

/**
 * Disciplina e reparti, in due letture.
 *
 * Serve prima di ogni altra cosa in `/pro`, perché decide *quale*
 * schermata comporre. È deliberatamente povera: un id, una disciplina e
 * degli slug. Tutto il resto lo chiedono le funzioni che seguono, e solo
 * quelle che servono al profilo che è uscito.
 */
export async function getIdentitaOperativa(): Promise<Identita | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  const [proRes, repartiRes] = await Promise.all([
    supabase
      .from("professionals")
      .select("id, discipline")
      .eq("profile_id", profile.id)
      .maybeSingle(),

    supabase
      .from("department_members")
      .select("department:departments(slug, name)")
      .eq("profile_id", profile.id)
      .is("ended_at", null)
      .limit(50),
  ]);

  const pro = proRes.data as { id: string; discipline: Discipline } | null;

  const reparti = (repartiRes.data ?? []) as unknown as {
    department: { slug: string; name: string } | null;
  }[];

  const slug = reparti.map((r) => r.department?.slug).filter(Boolean) as string[];
  const nomi = reparti.map((r) => r.department?.name).filter(Boolean) as string[];

  return {
    profiloId: profile.id,
    professionalId: pro?.id ?? null,
    discipline: pro?.discipline ?? null,
    reparti: slug,
    nomiReparti: nomi,
    profilo: profiloDi({ discipline: pro?.discipline ?? null, reparti: slug }),
  };
}

/* ── La giornata dell'infermieristica ─────────────────────────────── */

export interface AzionePiano {
  id: string;
  patientId: string;
  paziente: string;
  titolo: string;
  dettaglio: string | null;
  scadenza: string | null;
  /** 1 alta, 2 media, 3 bassa: la stessa scala delle azioni consigliate. */
  priorita: number;
  /** Vero se la scadenza è già passata. */
  arretrata: boolean;
}

export interface Consegna {
  id: string;
  conversationId: string;
  titolo: string;
  autore: string;
  reparto: string | null;
  corpo: string;
  priorita: Priorita;
  quando: string;
}

export interface Infermieristica {
  /** Le dosi vere, dalle prescrizioni. */
  giro: VoceGiro[];
  /** Le azioni del piano di cura in scadenza: un'altra coda, un altro mestiere. */
  azioniPiano: AzionePiano[];
  consegne: Consegna[];
  /** Pazienti di oggi che non hanno ancora nessuna misura registrata oggi. */
  parametriDaRegistrare: { patientId: string; paziente: string; ora: string }[];
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function oggiRoma(): string {
  return ROMA.format(new Date());
}

/**
 * Cosa c'è da somministrare, da registrare e da passare al turno dopo.
 *
 * Quattro code, e la differenza fra le prime due è quella che conta:
 *
 *   **Il giro** sono le dosi vere — farmaco, dose, via, orario — che
 *   nascono dalle prescrizioni. È la coda del carrello: si porta alle
 *   otto, si registra riga per riga, e ogni riga resta anche se nessuno
 *   la tocca.
 *
 *   **Le azioni del piano** (`recommended_actions`) sono un'altra cosa e
 *   un altro mestiere: «cammina trenta minuti», «prenota il controllo».
 *   È la stessa riga che il paziente vede nella sua applicazione, qui
 *   guardata dall'altro lato. Mescolarle con i farmaci avrebbe messo un
 *   consiglio sullo stile di vita accanto a una dose di ramipril, con lo
 *   stesso pulsante sotto.
 *
 *   **Parametri** non è una coda a sé: è l'agenda di oggi meno chi ha
 *   già una misura registrata oggi. Una tabella «parametri da
 *   registrare» sarebbe stata una lista da tenere in pari a mano, e una
 *   lista da tenere in pari a mano va fuori sincrono il primo giorno in
 *   cui qualcuno registra una misura da un'altra schermata.
 *
 *   **Consegne** sono i messaggi interni di tipo «trasferimento». È il
 *   passaggio di consegne fatto con lo strumento che già esiste, non un
 *   secondo canale: quello che si scrive qui lo si ritrova nella
 *   conversazione, con le sue ricevute di lettura e il suo registro.
 */
export async function getInfermieristica(): Promise<Infermieristica> {
  const vuoto: Infermieristica = {
    giro: [],
    azioniPiano: [],
    consegne: [],
    parametriDaRegistrare: [],
  };

  if (!isSupabaseConfigured()) return vuoto;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return vuoto;

  const supabase = await createSupabaseServerClient();

  const oggi = oggiRoma();
  const fraUnaSettimana = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const inizioGiornata = `${oggi}T00:00:00Z`;
  const fineGiornata = `${oggi}T23:59:59Z`;

  const [giro, azioniRes, visiteRes, misureRes, consegneRes] = await Promise.all([
    // Il giro passa da `medication_round`, che ordina già arretrate
    // prima e poi per orario: l'ordine è parte della risposta, e
    // rifarlo qui sarebbe stato un secondo ordinamento da allineare.
    getGiro(),

    supabase
      .from("recommended_actions")
      .select(
        "id, patient_id, title, description, due_on, priority, status, " +
          "patient:patients(profile:profiles(full_name))",
      )
      .in("status", ["suggested", "accepted", "in_progress"])
      .not("due_on", "is", null)
      .lte("due_on", fraUnaSettimana)
      .order("due_on", { ascending: true })
      .limit(60),

    supabase
      .from("appointments")
      .select(
        "id, starts_at, patient_id, patient:patients(profile:profiles(full_name))",
      )
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", inizioGiornata)
      .lte("starts_at", fineGiornata)
      .order("starts_at", { ascending: true })
      .limit(60),

    supabase
      .from("measurements")
      .select("patient_id")
      .eq("measured_on", oggi)
      .limit(500),

    supabase
      .from("conversation_messages")
      .select(
        "id, conversation_id, body, priority, created_at, " +
          "author:profiles(full_name), department:departments(name), " +
          "conversation:conversations(title)",
      )
      .eq("kind", "transfer")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const azioniPiano = ((azioniRes.data ?? []) as unknown as {
    id: string;
    patient_id: string;
    title: string;
    description: string | null;
    due_on: string | null;
    priority: number;
    patient: { profile: { full_name: string } | null } | null;
  }[]).map((a) => ({
    id: a.id,
    patientId: a.patient_id,
    paziente: a.patient?.profile?.full_name ?? "Paziente",
    titolo: a.title,
    dettaglio: a.description,
    scadenza: a.due_on,
    priorita: a.priority,
    arretrata: a.due_on !== null && a.due_on < oggi,
  }));

  // Chi ha già una misura di oggi non compare fra i parametri da
  // registrare: la coda si svuota da sé registrandoli.
  const conMisura = new Set(
    ((misureRes.data ?? []) as { patient_id: string }[]).map((m) => m.patient_id),
  );

  const visti = new Set<string>();
  const parametriDaRegistrare: Infermieristica["parametriDaRegistrare"] = [];

  for (const v of (visiteRes.data ?? []) as unknown as {
    id: string;
    starts_at: string;
    patient_id: string;
    patient: { profile: { full_name: string } | null } | null;
  }[]) {
    if (conMisura.has(v.patient_id) || visti.has(v.patient_id)) continue;
    visti.add(v.patient_id);
    parametriDaRegistrare.push({
      patientId: v.patient_id,
      paziente: v.patient?.profile?.full_name ?? "Paziente",
      ora: v.starts_at,
    });
  }

  const consegne = ((consegneRes.data ?? []) as unknown as {
    id: string;
    conversation_id: string;
    body: string;
    priority: Priorita;
    created_at: string;
    author: { full_name: string } | null;
    department: { name: string } | null;
    conversation: { title: string } | null;
  }[]).map((c) => ({
    id: c.id,
    conversationId: c.conversation_id,
    titolo: c.conversation?.title ?? "Passaggio di consegne",
    autore: c.author?.full_name ?? "Collega",
    reparto: c.department?.name ?? null,
    corpo: c.body.length > 220 ? `${c.body.slice(0, 220)}…` : c.body,
    priorita: c.priority,
    quando: c.created_at,
  }));

  return {
    giro,
    azioniPiano: azioniPiano.sort(
      (a, b) =>
        Number(b.arretrata) - Number(a.arretrata) ||
        a.priorita - b.priorita ||
        (a.scadenza ?? "").localeCompare(b.scadenza ?? ""),
    ),
    consegne,
    parametriDaRegistrare,
  };
}

/* ── La giornata della diagnostica ────────────────────────────────── */

export interface RichiestaEsame {
  id: string;
  conversationId: string;
  patientId: string;
  paziente: string;
  motivo: string;
  priorita: Priorita;
  stato: StatoConsulto;
  richiedente: string | null;
  incaricato: string | null;
  scadenza: string | null;
  quando: string;
}

export interface DaValidare {
  id: string;
  patientId: string;
  paziente: string;
  etichetta: string;
  valore: string;
  misuratoIl: string;
  /** Perché il motore non se l'è sentita di applicarlo da solo. */
  motivi: string[];
  confidenza: number;
}

export interface RefertoInLavorazione {
  id: string;
  patientId: string;
  paziente: string;
  titolo: string;
  tipo: string;
  stato: string;
  caricatoIl: string;
  /** Vero per l'imaging: la radiologia guarda quella colonna. */
  immagine: boolean;
}

export interface Diagnostica {
  /** Le richieste di esame vere, con la loro catena di stati. */
  esami: RichiestaEsameLab[];
  /** Le richieste di parere: un consulto è un'altra cosa da un prelievo. */
  richieste: RichiestaEsame[];
  daValidare: DaValidare[];
  referti: RefertoInLavorazione[];
}

/**
 * Il banco della diagnostica: laboratorio e imaging insieme.
 *
 * Sono due schermate in un ospedale e una sola qui, ed è una scelta
 * consapevole: Unique ha **un** reparto di diagnostica, e dividerlo in
 * due dashboard avrebbe significato due elenchi mezzi vuoti e la domanda
 * «dove sta la mia richiesta» ogni volta che una TAC e un prelievo
 * arrivano insieme. La colonna «tipo» distingue le due, e il filtro sui
 * referti lo fa in un clic.
 *
 * Ciò che non c'è, e non si finge: **i campioni**. Tracciare una provetta
 * dal prelievo al risultato è una catena di custodia, con etichette,
 * accettazione e stato per contenitore — una cosa vera, che vuole le sue
 * tabelle e il suo hardware. Mostrarne una finta accanto a dati veri
 * sarebbe stato il modo più rapido per far perdere fiducia in tutto il
 * resto della schermata.
 */
export async function getDiagnostica(): Promise<Diagnostica> {
  const vuoto: Diagnostica = { esami: [], richieste: [], daValidare: [], referti: [] };

  if (!isSupabaseConfigured()) return vuoto;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return vuoto;

  const supabase = await createSupabaseServerClient();

  const [esami, richiesteRes, validareRes, refertiRes] = await Promise.all([
    getRichieste({ soloAperte: true, limite: 60 }),

    // I consulti arrivati ai reparti di chi guarda: la RLS di
    // `clinical_consultations` passa da `conversation_visible`, quindi
    // qui non serve filtrare per reparto — arrivano già solo i propri.
    supabase
      .from("clinical_consultations")
      .select(
        "id, conversation_id, patient_id, reason, priority, status, due_at, created_at, " +
          "patient:patients(profile:profiles(full_name)), " +
          "requester:profiles!clinical_consultations_requested_by_fkey(full_name), " +
          "assignee:profiles!clinical_consultations_assignee_id_fkey(full_name)",
      )
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("measurement_proposals")
      .select(
        "id, patient_id, label, value, unit, category, measured_on, confidence, " +
          "review_reasons, patient:patients(profile:profiles(full_name))",
      )
      .eq("status", "needs_review")
      .order("measured_on", { ascending: false })
      .limit(50),

    supabase
      .from("documents")
      .select(
        "id, patient_id, title, kind, review_state, created_at, " +
          "patient:patients(profile:profiles(full_name))",
      )
      .in("kind", ["lab_report", "imaging"])
      .neq("review_state", "approved")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const richieste = ((richiesteRes.data ?? []) as unknown as {
    id: string;
    conversation_id: string;
    patient_id: string;
    reason: string;
    priority: Priorita;
    status: StatoConsulto;
    due_at: string | null;
    created_at: string;
    patient: { profile: { full_name: string } | null } | null;
    requester: { full_name: string } | null;
    assignee: { full_name: string } | null;
  }[]).map((k) => ({
    id: k.id,
    conversationId: k.conversation_id,
    patientId: k.patient_id,
    paziente: k.patient?.profile?.full_name ?? "Paziente",
    motivo: k.reason,
    priorita: k.priority,
    stato: k.status,
    richiedente: k.requester?.full_name ?? null,
    incaricato: k.assignee?.full_name ?? null,
    scadenza: k.due_at,
    quando: k.created_at,
  }));

  const daValidare = ((validareRes.data ?? []) as unknown as {
    id: string;
    patient_id: string;
    label: string;
    value: number | null;
    unit: string | null;
    category: string | null;
    measured_on: string;
    confidence: number;
    review_reasons: string[];
    patient: { profile: { full_name: string } | null } | null;
  }[]).map((p) => ({
    id: p.id,
    patientId: p.patient_id,
    paziente: p.patient?.profile?.full_name ?? "Paziente",
    etichetta: p.label,
    valore:
      p.value !== null
        ? `${p.value}${p.unit ? ` ${p.unit}` : ""}`
        : (p.category ?? "—"),
    misuratoIl: p.measured_on,
    motivi: p.review_reasons ?? [],
    confidenza: p.confidence,
  }));

  const referti = ((refertiRes.data ?? []) as unknown as {
    id: string;
    patient_id: string;
    title: string;
    kind: string;
    review_state: string;
    created_at: string;
    patient: { profile: { full_name: string } | null } | null;
  }[]).map((d) => ({
    id: d.id,
    patientId: d.patient_id,
    paziente: d.patient?.profile?.full_name ?? "Paziente",
    titolo: d.title,
    tipo: d.kind === "imaging" ? "Imaging" : "Laboratorio",
    stato: d.review_state,
    caricatoIl: d.created_at,
    immagine: d.kind === "imaging",
  }));

  return { esami, richieste, daValidare, referti };
}
