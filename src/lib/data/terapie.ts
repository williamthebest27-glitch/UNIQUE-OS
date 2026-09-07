import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StatoDose, StatoTerapia, Via } from "@/lib/clinical/terapie";

/**
 * La terapia, letta.
 *
 * Due domande diverse e due funzioni diverse, ed è la stessa distinzione
 * che c'è nello schema:
 *
 *   `getTerapie(paziente)`  cosa è stato deciso per questa persona, con
 *                           accanto quanto è stato davvero somministrato.
 *                           È la vista del medico, in cartella.
 *
 *   `getGiro()`             cosa c'è da dare adesso, di chiunque. È la
 *                           vista dell'infermieristica, e non parte da un
 *                           paziente perché un turno non parte da un
 *                           paziente.
 *
 * Nessuna delle due filtra per care team a mano: la Row Level Security
 * restituisce già solo i pazienti su cui chi guarda ha titolo.
 */

/* ── La terapia di una persona ────────────────────────────────────── */

export interface Dose {
  id: string;
  previstaPer: string;
  stato: StatoDose;
  somministrataIl: string | null;
  somministrataDa: string | null;
  motivo: string | null;
  nota: string | null;
  /** Prevista, e l'ora è passata. */
  arretrata: boolean;
}

export interface Terapia {
  id: string;
  pazienteId: string;
  farmaco: string;
  dose: string;
  frequenza: string;
  via: Via;
  istruzioni: string | null;
  orari: string[];
  inizio: string;
  fine: string | null;
  stato: StatoTerapia;
  motivoStato: string | null;
  prescrittore: string | null;
  creataIl: string;
  /** Le ultime somministrazioni, dalla più recente. */
  somministrazioni: Dose[];
  /** Quante ne sono state date su quante erano previste, negli ultimi 14 giorni. */
  aderenza: { date: number; previste: number } | null;
}

interface RigaTerapia {
  id: string;
  patient_id: string;
  medication: string;
  dose: string;
  frequency: string;
  route: Via;
  instructions: string | null;
  times: string[] | null;
  starts_on: string;
  ends_on: string | null;
  status: StatoTerapia;
  status_reason: string | null;
  created_at: string;
  prescriber: { full_name: string } | null;
}

interface RigaDose {
  id: string;
  prescription_id: string;
  scheduled_at: string;
  status: StatoDose;
  given_at: string | null;
  reason: string | null;
  note: string | null;
  given_by_profile: { full_name: string } | null;
}

/**
 * Le terapie di un paziente, con le loro somministrazioni.
 *
 * Due letture e non una per terapia: le prescrizioni, poi tutte le dosi
 * di tutte insieme. Una query per prescrizione sarebbe stata una decina
 * di viaggi verso il database per disegnare una schermata sola.
 *
 * L'aderenza si calcola sugli ultimi quattordici giorni e **conta le
 * dosi ancora `due` nel passato come non date**, perché è quello che
 * sono: una dose prevista per ieri alle otto che nessuno ha registrato
 * non è «in attesa», è saltata senza che nessuno l'abbia scritto. Il
 * numero serve proprio a far vedere quel buco.
 */
export async function getTerapie(
  patientId: string,
  opzioni: { includiChiuse?: boolean } = {},
): Promise<Terapia[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("prescriptions")
    .select(
      "id, patient_id, medication, dose, frequency, route, instructions, times, " +
        "starts_on, ends_on, status, status_reason, created_at, " +
        "prescriber:profiles(full_name)",
    )
    .eq("patient_id", patientId)
    .order("starts_on", { ascending: false })
    .limit(80);

  if (!opzioni.includiChiuse) {
    query = query.in("status", ["active", "suspended"]);
  }

  const { data } = await query;
  const righe = (data ?? []) as unknown as RigaTerapia[];
  if (righe.length === 0) return [];

  const { data: dosi } = await supabase
    .from("medication_administrations")
    .select(
      "id, prescription_id, scheduled_at, status, given_at, reason, note, " +
        "given_by_profile:profiles(full_name)",
    )
    .in(
      "prescription_id",
      righe.map((r) => r.id),
    )
    .order("scheduled_at", { ascending: false })
    .limit(600);

  const adesso = Date.now();
  const dueSettimaneFa = adesso - 14 * 86_400_000;

  const per = new Map<string, Dose[]>();
  const conti = new Map<string, { date: number; previste: number }>();

  for (const d of (dosi ?? []) as unknown as RigaDose[]) {
    const quando = Date.parse(d.scheduled_at);

    const elenco = per.get(d.prescription_id) ?? [];
    elenco.push({
      id: d.id,
      previstaPer: d.scheduled_at,
      stato: d.status,
      somministrataIl: d.given_at,
      somministrataDa: d.given_by_profile?.full_name ?? null,
      motivo: d.reason,
      nota: d.note,
      arretrata: d.status === "due" && quando < adesso,
    });
    per.set(d.prescription_id, elenco);

    // Solo le dosi già scadute entrano nell'aderenza: quelle di stasera
    // non sono ancora state mancate.
    if (quando >= dueSettimaneFa && quando <= adesso && d.status !== "not_needed") {
      const c = conti.get(d.prescription_id) ?? { date: 0, previste: 0 };
      c.previste += 1;
      if (d.status === "given") c.date += 1;
      conti.set(d.prescription_id, c);
    }
  }

  return righe.map((r) => ({
    id: r.id,
    pazienteId: r.patient_id,
    farmaco: r.medication,
    dose: r.dose,
    frequenza: r.frequency,
    via: r.route,
    istruzioni: r.instructions,
    orari: (r.times ?? []).map((t) => t.slice(0, 5)),
    inizio: r.starts_on,
    fine: r.ends_on,
    stato: r.status,
    motivoStato: r.status_reason,
    prescrittore: r.prescriber?.full_name ?? null,
    creataIl: r.created_at,
    somministrazioni: (per.get(r.id) ?? []).slice(0, 30),
    aderenza: conti.get(r.id) ?? null,
  }));
}

/* ── Il giro ──────────────────────────────────────────────────────── */

export interface VoceGiro {
  id: string;
  prescriptionId: string;
  pazienteId: string;
  paziente: string;
  farmaco: string;
  dose: string;
  via: Via;
  istruzioni: string | null;
  previstaPer: string;
  stato: StatoDose;
  arretrata: boolean;
}

/**
 * Il giro delle somministrazioni.
 *
 * L'ordine — arretrate prima, poi per orario — lo decide la funzione del
 * database, non questa: è parte della risposta e non della
 * presentazione, e riordinare qui avrebbe voluto dire due ordinamenti da
 * tenere allineati.
 *
 * La finestra predefinita è dodici ore indietro e dodici avanti: un
 * turno vede quello che ha davanti e quello che ha trovato aperto
 * entrando.
 */
export async function getGiro(opzioni: {
  da?: Date;
  a?: Date;
  soloDaFare?: boolean;
} = {}): Promise<VoceGiro[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("medication_round", {
    p_from: (opzioni.da ?? new Date(Date.now() - 12 * 3600_000)).toISOString(),
    p_to: (opzioni.a ?? new Date(Date.now() + 12 * 3600_000)).toISOString(),
  });

  if (error) return [];

  const righe = ((data ?? []) as {
    id: string;
    prescription_id: string;
    patient_id: string;
    paziente: string;
    medication: string;
    dose: string;
    route: Via;
    instructions: string | null;
    scheduled_at: string;
    status: StatoDose;
    overdue: boolean;
  }[]).map((r) => ({
    id: r.id,
    prescriptionId: r.prescription_id,
    pazienteId: r.patient_id,
    paziente: r.paziente,
    farmaco: r.medication,
    dose: r.dose,
    via: r.route,
    istruzioni: r.instructions,
    previstaPer: r.scheduled_at,
    stato: r.status,
    arretrata: r.overdue,
  }));

  return opzioni.soloDaFare ? righe.filter((r) => r.stato === "due") : righe;
}

/**
 * Le terapie attive di una persona, in una riga sola.
 *
 * Serve al copilot clinico e alla sintesi pre-visita, dove «cosa sta
 * prendendo» è una delle prime cose da sapere e una schermata di
 * dettaglio sarebbe di troppo.
 */
export async function terapieAttiveInBreve(patientId: string): Promise<string[]> {
  const terapie = await getTerapie(patientId);
  return terapie
    .filter((t) => t.stato === "active")
    .map((t) => `${t.farmaco} ${t.dose} — ${t.frequenza}`);
}
