import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tendenza, type StatoEsame } from "@/lib/clinical/laboratorio";
import type { Priorita } from "@/lib/comunicazioni/tipi";

/**
 * Il laboratorio, letto.
 *
 * Due cose diverse, e la seconda è quella che un medico guarda per
 * prima:
 *
 *   `getRichieste()`   la coda degli esami, con lo stato e i tempi. È
 *                      la vista di chi esegue.
 *
 *   `getAndamenti()`   la serie storica dei parametri: `13,8 → 13,1 →
 *                      12,4 → 11,9`. È la vista di chi cura, ed è la
 *                      cosa che due valori a confronto non sanno dire.
 */

/* ── La coda ──────────────────────────────────────────────────────── */

export interface RichiestaEsameLab {
  id: string;
  pazienteId: string;
  paziente: string;
  pannello: string;
  codici: string[];
  domanda: string | null;
  priorita: Priorita;
  stato: StatoEsame;
  richiedente: string | null;
  reparto: string | null;
  chiestoIl: string;
  prelevatoIl: string | null;
  risultatiIl: string | null;
  validatoIl: string | null;
  validatoDa: string | null;
  documentId: string | null;
  note: string | null;
  motivoAnnullamento: string | null;
  /** Quanti valori sono già in cartella legati a questa richiesta. */
  valori: number;
  /** Ore trascorse dalla richiesta, per le code che si allungano. */
  oreInAttesa: number;
}

const CAMPI =
  "id, patient_id, panel, tests, clinical_question, priority, status, " +
  "requested_at, collected_at, resulted_at, validated_at, document_id, notes, cancel_reason, " +
  "patient:patients(profile:profiles(full_name)), " +
  "department:departments(name), " +
  "requester:profiles!lab_orders_requested_by_fkey(full_name), " +
  "validator:profiles!lab_orders_validated_by_fkey(full_name)";

interface RigaRichiesta {
  id: string;
  patient_id: string;
  panel: string;
  tests: string[] | null;
  clinical_question: string | null;
  priority: Priorita;
  status: StatoEsame;
  requested_at: string;
  collected_at: string | null;
  resulted_at: string | null;
  validated_at: string | null;
  document_id: string | null;
  notes: string | null;
  cancel_reason: string | null;
  patient: { profile: { full_name: string } | null } | null;
  department: { name: string } | null;
  requester: { full_name: string } | null;
  validator: { full_name: string } | null;
}

/**
 * Le richieste di esame.
 *
 * Due letture: le richieste, poi quante misure sono già legate a
 * ciascuna. Il conteggio serve a distinguere «validato con ventiquattro
 * valori in cartella» da «validato e basta» — che è il caso in cui il
 * referto è arrivato ma i valori non sono stati estratti, e va visto.
 */
export async function getRichieste(opzioni: {
  pazienteId?: string | null;
  soloAperte?: boolean;
  limite?: number;
} = {}): Promise<RichiestaEsameLab[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("lab_orders")
    .select(CAMPI)
    .order("requested_at", { ascending: false })
    .limit(opzioni.limite ?? 60);

  if (opzioni.pazienteId) query = query.eq("patient_id", opzioni.pazienteId);
  if (opzioni.soloAperte) {
    query = query.not("status", "in", '("validated","cancelled")');
  }

  const { data } = await query;
  const righe = (data ?? []) as unknown as RigaRichiesta[];
  if (righe.length === 0) return [];

  const { data: misure } = await supabase
    .from("measurements")
    .select("lab_order_id")
    .in(
      "lab_order_id",
      righe.map((r) => r.id),
    )
    .limit(2000);

  const conti = new Map<string, number>();
  for (const m of (misure ?? []) as { lab_order_id: string | null }[]) {
    if (!m.lab_order_id) continue;
    conti.set(m.lab_order_id, (conti.get(m.lab_order_id) ?? 0) + 1);
  }

  const adesso = Date.now();

  return righe.map((r) => ({
    id: r.id,
    pazienteId: r.patient_id,
    paziente: r.patient?.profile?.full_name ?? "Paziente",
    pannello: r.panel,
    codici: r.tests ?? [],
    domanda: r.clinical_question,
    priorita: r.priority,
    stato: r.status,
    richiedente: r.requester?.full_name ?? null,
    reparto: r.department?.name ?? null,
    chiestoIl: r.requested_at,
    prelevatoIl: r.collected_at,
    risultatiIl: r.resulted_at,
    validatoIl: r.validated_at,
    validatoDa: r.validator?.full_name ?? null,
    documentId: r.document_id,
    note: r.notes,
    motivoAnnullamento: r.cancel_reason,
    valori: conti.get(r.id) ?? 0,
    oreInAttesa: Math.round((adesso - Date.parse(r.requested_at)) / 3_600_000),
  }));
}

/* ── Gli andamenti ────────────────────────────────────────────────── */

export interface PuntoSerie {
  valore: number;
  misuratoIl: string;
  delta: number | null;
  fuori: boolean;
}

export interface AndamentoParametro {
  codice: string;
  etichetta: string;
  unita: string | null;
  riferimento: { basso: number | null; alto: number | null } | null;
  punti: PuntoSerie[];
  /** L'ultimo valore, che è quello che si legge per primo. */
  ultimo: PuntoSerie;
  /** Tre rilevazioni consecutive nella stessa direzione, o null. */
  tendenza: "in-calo" | "in-salita" | null;
  /** Vero se l'ultimo valore sta fuori dall'intervallo del laboratorio. */
  fuoriOra: boolean;
}

interface RigaSerie {
  metric_code: string;
  label: string;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  measured_on: string;
  delta: number | null;
  fuori: boolean;
}

/**
 * Lo storico dei parametri di una persona.
 *
 * Una chiamata sola a `metric_series`, che raggruppa e calcola le
 * variazioni in SQL con una window function. Farlo in memoria avrebbe
 * voluto dire leggere tutte le misure per ricalcolare a mano quello che
 * Postgres fa in una passata — e su una persona seguita da tre anni le
 * misure sono qualche migliaio.
 *
 * L'ordine in uscita non è alfabetico: prima ciò che sta **fuori**
 * adesso, poi ciò che ha un andamento di tre rilevazioni nella stessa
 * direzione, poi il resto. È lo stesso criterio del centro di
 * attenzione — l'elenco mette in cima ciò che richiede uno sguardo, non
 * ciò che comincia per A.
 */
export async function getAndamenti(
  patientId: string,
  opzioni: { codici?: string[] | null; punti?: number } = {},
): Promise<AndamentoParametro[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("metric_series", {
    p_patient: patientId,
    p_codes: opzioni.codici ?? null,
    p_limit: opzioni.punti ?? 12,
  });

  if (error) return [];

  const per = new Map<string, RigaSerie[]>();
  for (const r of (data ?? []) as RigaSerie[]) {
    per.set(r.metric_code, [...(per.get(r.metric_code) ?? []), r]);
  }

  const andamenti: AndamentoParametro[] = [];

  for (const [codice, righe] of per) {
    // La funzione le restituisce già in ordine di data crescente: il
    // grafico si legge da sinistra a destra come una frase.
    const punti: PuntoSerie[] = righe.map((r) => ({
      valore: Number(r.value),
      misuratoIl: r.measured_on,
      delta: r.delta === null ? null : Number(r.delta),
      fuori: r.fuori,
    }));

    const ultimo = punti.at(-1);
    if (!ultimo) continue;

    const primo = righe[0];

    andamenti.push({
      codice,
      etichetta: primo.label,
      unita: primo.unit,
      riferimento:
        primo.ref_low === null && primo.ref_high === null
          ? null
          : {
              basso: primo.ref_low === null ? null : Number(primo.ref_low),
              alto: primo.ref_high === null ? null : Number(primo.ref_high),
            },
      punti,
      ultimo,
      tendenza: tendenza(punti.map((p) => p.valore)),
      fuoriOra: ultimo.fuori,
    });
  }

  return andamenti.sort(
    (a, b) =>
      Number(b.fuoriOra) - Number(a.fuoriOra) ||
      Number(b.tendenza !== null) - Number(a.tendenza !== null) ||
      b.punti.length - a.punti.length ||
      a.etichetta.localeCompare(b.etichetta, "it"),
  );
}

/**
 * I parametri che questa persona ha, in ordine di quante rilevazioni.
 *
 * Serve al selettore: un elenco di trentacinque metriche di cui trenta
 * senza dati è un elenco che non si usa. Qui compaiono solo quelle che
 * hanno almeno una misura, con quante ne hanno accanto.
 */
export async function parametriDisponibili(
  patientId: string,
): Promise<{ codice: string; etichetta: string; quante: number }[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("measurements")
    .select("metric_code, label")
    .eq("patient_id", patientId)
    .not("value", "is", null)
    .limit(3000);

  const conti = new Map<string, { etichetta: string; quante: number }>();
  for (const m of (data ?? []) as { metric_code: string; label: string }[]) {
    const c = conti.get(m.metric_code) ?? { etichetta: m.label, quante: 0 };
    c.quante += 1;
    conti.set(m.metric_code, c);
  }

  return [...conti.entries()]
    .map(([codice, c]) => ({ codice, ...c }))
    .sort((a, b) => b.quante - a.quante || a.etichetta.localeCompare(b.etichetta, "it"));
}
