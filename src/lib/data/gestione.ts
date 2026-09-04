import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { romaComeIso } from "@/lib/gestione/disponibilita";

/**
 * Le letture del gestionale.
 *
 * Tutto passa dal client di sessione: la reception vede anagrafica,
 * agenda, incassi e membership — e la Row Level Security le nasconde
 * referti, misure e note. Qui non c'è un controllo di ruolo perché non
 * serve: una query sbagliata non restituirebbe comunque righe che chi
 * guarda non può vedere.
 */

export interface PazienteInElenco {
  id: string;
  profileId: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  codice: string | null;
  sede: string | null;
  membership: string | null;
  creditiDisponibili: number;
  ultimaVisita: string | null;
}

export async function elencoPazienti(ricerca?: string): Promise<PazienteInElenco[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("patients")
    .select(
      "id, profile_id, patient_code, location:locations(name), profile:profiles!patients_profile_id_fkey(full_name, email, phone)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const { data } = await query;

  const righe = (data ?? []) as unknown as {
    id: string;
    profile_id: string;
    patient_code: string | null;
    location: { name: string } | null;
    profile: { full_name: string; email: string | null; phone: string | null } | null;
  }[];

  const ids = righe.map((r) => r.id);
  if (ids.length === 0) return [];

  const [saldiRes, membershipRes, visiteRes] = await Promise.all([
    supabase.from("credit_balances").select("patient_id, available").in("patient_id", ids),
    supabase
      .from("memberships")
      .select("patient_id, status, tier:membership_tiers(name)")
      .in("patient_id", ids)
      .eq("status", "active"),
    supabase
      .from("appointments")
      .select("patient_id, starts_at")
      .in("patient_id", ids)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(2000),
  ]);

  const saldi = new Map(
    ((saldiRes.data ?? []) as { patient_id: string; available: number | string }[]).map((s) => [
      s.patient_id,
      Number(s.available),
    ]),
  );
  const piani = new Map(
    ((membershipRes.data ?? []) as unknown as { patient_id: string; tier: { name: string } | null }[]).map(
      (m) => [m.patient_id, m.tier?.name ?? "Membership"],
    ),
  );
  const ultime = new Map<string, string>();
  for (const v of (visiteRes.data ?? []) as { patient_id: string; starts_at: string }[]) {
    if (!ultime.has(v.patient_id)) ultime.set(v.patient_id, v.starts_at);
  }

  const elenco = righe.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    nome: r.profile?.full_name || "Senza nome",
    email: r.profile?.email ?? null,
    telefono: r.profile?.phone ?? null,
    codice: r.patient_code,
    sede: r.location?.name ?? null,
    membership: piani.get(r.id) ?? null,
    creditiDisponibili: saldi.get(r.id) ?? 0,
    ultimaVisita: ultime.get(r.id) ?? null,
  }));

  if (!ricerca?.trim()) return elenco;

  // La ricerca è sul nome, l'email, il telefono e il codice: le quattro
  // cose con cui una persona si presenta al banco.
  const q = ricerca.trim().toLowerCase();
  return elenco.filter(
    (p) =>
      p.nome.toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.telefono ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
      (p.codice ?? "").toLowerCase().includes(q),
  );
}

export interface SchedaOperativa {
  id: string;
  profileId: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  codice: string | null;
  dataNascita: string | null;
  codiceFiscale: string | null;
  sede: string | null;
  locationId: string | null;
  membership: {
    id: string;
    piano: string;
    status: string;
    startsOn: string;
    endsOn: string | null;
  } | null;
  crediti: { assegnati: number; usati: number; prenotati: number; disponibili: number };
  appuntamenti: {
    id: string;
    servizio: string;
    professionista: string | null;
    stanza: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
    attendance: string;
    creditsCost: number;
  }[];
  incassi: {
    id: string;
    importoCents: number;
    kind: string;
    channel: string | null;
    descrizione: string | null;
    ricevuta: string | null;
    paidAt: string | null;
    status: string;
  }[];
}

export async function schedaOperativa(patientId: string): Promise<SchedaOperativa | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();

  const [pazienteRes, saldoRes, membershipRes, appuntamentiRes, incassiRes] = await Promise.all([
    supabase
      .from("patients")
      .select(
        "id, profile_id, patient_code, date_of_birth, fiscal_code, location_id, location:locations(name), profile:profiles!patients_profile_id_fkey(full_name, email, phone)",
      )
      .eq("id", patientId)
      .maybeSingle(),
    supabase.from("credit_balances").select("*").eq("patient_id", patientId).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, status, starts_on, ends_on, tier:membership_tiers(name)")
      .eq("patient_id", patientId)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select(
        "id, service_name, starts_at, ends_at, status, attendance, credits_cost, room:rooms(name), professional:professionals(title, profile:profiles(full_name))",
      )
      .eq("patient_id", patientId)
      .order("starts_at", { ascending: false })
      .limit(30),
    supabase
      .from("payments")
      .select("id, amount_cents, kind, channel, description, receipt_no, paid_at, status")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const p = pazienteRes.data as unknown as {
    id: string;
    profile_id: string;
    patient_code: string | null;
    date_of_birth: string | null;
    fiscal_code: string | null;
    location_id: string | null;
    location: { name: string } | null;
    profile: { full_name: string; email: string | null; phone: string | null } | null;
  } | null;
  if (!p) return null;

  const saldo = saldoRes.data as {
    total_credited: number | string;
    total_used: number | string;
    total_reserved: number | string;
    available: number | string;
  } | null;

  const m = membershipRes.data as unknown as {
    id: string;
    status: string;
    starts_on: string;
    ends_on: string | null;
    tier: { name: string } | null;
  } | null;

  return {
    id: p.id,
    profileId: p.profile_id,
    nome: p.profile?.full_name || "Senza nome",
    email: p.profile?.email ?? null,
    telefono: p.profile?.phone ?? null,
    codice: p.patient_code,
    dataNascita: p.date_of_birth,
    codiceFiscale: p.fiscal_code,
    sede: p.location?.name ?? null,
    locationId: p.location_id,
    membership: m
      ? { id: m.id, piano: m.tier?.name ?? "Membership", status: m.status, startsOn: m.starts_on, endsOn: m.ends_on }
      : null,
    crediti: {
      assegnati: Number(saldo?.total_credited ?? 0),
      usati: Number(saldo?.total_used ?? 0),
      prenotati: Number(saldo?.total_reserved ?? 0),
      disponibili: Number(saldo?.available ?? 0),
    },
    appuntamenti: ((appuntamentiRes.data ?? []) as unknown as {
      id: string;
      service_name: string;
      starts_at: string;
      ends_at: string;
      status: string;
      attendance: string;
      credits_cost: number | string;
      room: { name: string } | null;
      professional: { title: string | null; profile: { full_name: string } | null } | null;
    }[]).map((a) => ({
      id: a.id,
      servizio: a.service_name,
      professionista: a.professional?.profile?.full_name
        ? [a.professional.title, a.professional.profile.full_name].filter(Boolean).join(" ")
        : null,
      stanza: a.room?.name ?? null,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      status: a.status,
      attendance: a.attendance,
      creditsCost: Number(a.credits_cost ?? 0),
    })),
    incassi: ((incassiRes.data ?? []) as {
      id: string;
      amount_cents: number;
      kind: string;
      channel: string | null;
      description: string | null;
      receipt_no: string | null;
      paid_at: string | null;
      status: string;
    }[]).map((i) => ({
      id: i.id,
      importoCents: i.amount_cents,
      kind: i.kind,
      channel: i.channel,
      descrizione: i.description,
      ricevuta: i.receipt_no,
      paidAt: i.paid_at,
      status: i.status,
    })),
  };
}

/* ── Cataloghi ────────────────────────────────────────────────────── */

export interface ServizioInCatalogo {
  id: string;
  slug: string;
  nome: string;
  descrizione: string | null;
  creditsCost: number;
  durataMin: number;
  disciplina: string | null;
  prezzoCents: number;
  materialiCents: number;
  attivo: boolean;
}

export async function elencoServizi(anchéInattivi = true): Promise<ServizioInCatalogo[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("services")
    .select("id, slug, name, description, credits_cost, duration_min, discipline, price_cents, material_cost_cents, is_active")
    .order("name", { ascending: true });
  if (!anchéInattivi) query = query.eq("is_active", true);

  const { data } = await query;
  return ((data ?? []) as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    credits_cost: number | string;
    duration_min: number;
    discipline: string | null;
    price_cents: number;
    material_cost_cents: number;
    is_active: boolean;
  }[]).map((s) => ({
    id: s.id,
    slug: s.slug,
    nome: s.name,
    descrizione: s.description,
    creditsCost: Number(s.credits_cost),
    durataMin: s.duration_min,
    disciplina: s.discipline,
    prezzoCents: s.price_cents,
    materialiCents: s.material_cost_cents,
    attivo: s.is_active,
  }));
}

export interface TurnoSettimanale {
  weekday: number;
  startsAt: string;
  endsAt: string;
}

export interface ProfessionistaInCatalogo {
  id: string;
  profileId: string;
  nome: string;
  titolo: string | null;
  specialita: string | null;
  disciplina: string;
  attivo: boolean;
  sede: string | null;
  turni: TurnoSettimanale[];
  slotFuturi: number;
}

export async function elencoProfessionisti(): Promise<ProfessionistaInCatalogo[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();

  const [proRes, turniRes, slotRes] = await Promise.all([
    supabase
      .from("professionals")
      .select("id, profile_id, title, specialty, discipline, is_active, location:locations(name), profile:profiles!professionals_profile_id_fkey(full_name)")
      .order("created_at", { ascending: true }),
    supabase
      .from("professional_schedules")
      .select("professional_id, weekday, starts_at, ends_at, valid_to")
      .or(`valid_to.is.null,valid_to.gte.${new Date().toISOString().slice(0, 10)}`),
    supabase
      .from("availability_slots")
      .select("professional_id")
      .eq("is_booked", false)
      .gte("starts_at", new Date().toISOString())
      .limit(5000),
  ]);

  const turni = new Map<string, TurnoSettimanale[]>();
  for (const t of (turniRes.data ?? []) as { professional_id: string; weekday: number; starts_at: string; ends_at: string }[]) {
    turni.set(t.professional_id, [
      ...(turni.get(t.professional_id) ?? []),
      { weekday: t.weekday, startsAt: t.starts_at.slice(0, 5), endsAt: t.ends_at.slice(0, 5) },
    ]);
  }

  const slot = new Map<string, number>();
  for (const s of (slotRes.data ?? []) as { professional_id: string }[]) {
    slot.set(s.professional_id, (slot.get(s.professional_id) ?? 0) + 1);
  }

  return ((proRes.data ?? []) as unknown as {
    id: string;
    profile_id: string;
    title: string | null;
    specialty: string | null;
    discipline: string;
    is_active: boolean;
    location: { name: string } | null;
    profile: { full_name: string } | null;
  }[]).map((p) => ({
    id: p.id,
    profileId: p.profile_id,
    nome: p.profile?.full_name || "Senza nome",
    titolo: p.title,
    specialita: p.specialty,
    disciplina: p.discipline,
    attivo: p.is_active,
    sede: p.location?.name ?? null,
    turni: (turni.get(p.id) ?? []).sort((a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt)),
    slotFuturi: slot.get(p.id) ?? 0,
  }));
}

export interface StanzaInCatalogo {
  id: string;
  nome: string;
  note: string | null;
  attiva: boolean;
}

export async function elencoStanze(): Promise<StanzaInCatalogo[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("rooms").select("id, name, notes, is_active").order("name");
  return ((data ?? []) as { id: string; name: string; notes: string | null; is_active: boolean }[]).map((r) => ({
    id: r.id,
    nome: r.name,
    note: r.notes,
    attiva: r.is_active,
  }));
}

export interface PianoInCatalogo {
  id: string;
  slug: string;
  nome: string;
  prezzoCents: number;
  crediti: number;
  periodo: string;
}

export async function elencoPiani(): Promise<PianoInCatalogo[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("membership_tiers")
    .select("id, slug, name, price_cents, credits_included, billing_period")
    .eq("is_active", true)
    .order("price_cents");
  return ((data ?? []) as {
    id: string;
    slug: string;
    name: string;
    price_cents: number;
    credits_included: number | string;
    billing_period: string;
  }[]).map((t) => ({
    id: t.id,
    slug: t.slug,
    nome: t.name,
    prezzoCents: t.price_cents,
    crediti: Number(t.credits_included),
    periodo: t.billing_period,
  }));
}

export interface IncassoInElenco {
  id: string;
  paziente: string;
  patientId: string;
  importoCents: number;
  kind: string;
  channel: string | null;
  descrizione: string | null;
  ricevuta: string | null;
  paidAt: string | null;
  status: string;
}

export async function incassiRecenti(limite = 60): Promise<IncassoInElenco[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("payments")
    .select("id, patient_id, amount_cents, kind, channel, description, receipt_no, paid_at, status, patient:patients(profile:profiles!patients_profile_id_fkey(full_name))")
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as unknown as {
    id: string;
    patient_id: string;
    amount_cents: number;
    kind: string;
    channel: string | null;
    description: string | null;
    receipt_no: string | null;
    paid_at: string | null;
    status: string;
    patient: { profile: { full_name: string } | null } | null;
  }[]).map((i) => ({
    id: i.id,
    patientId: i.patient_id,
    paziente: i.patient?.profile?.full_name ?? "Paziente",
    importoCents: i.amount_cents,
    kind: i.kind,
    channel: i.channel,
    descrizione: i.description,
    ricevuta: i.receipt_no,
    paidAt: i.paid_at,
    status: i.status,
  }));
}

export interface SedeInCatalogo {
  id: string;
  nome: string;
}

export async function elencoSedi(): Promise<SedeInCatalogo[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("locations").select("id, name").eq("is_active", true).order("name");
  return ((data ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, nome: s.name }));
}

/** Quanto è entrato oggi e nel mese: i due numeri che si guardano chiudendo la cassa. */
export interface RiepilogoIncassi {
  oggiCents: number;
  oggiQuanti: number;
  meseCents: number;
  meseQuanti: number;
}

export async function riepilogoIncassi(): Promise<RiepilogoIncassi> {
  const vuoto = { oggiCents: 0, oggiQuanti: 0, meseCents: 0, meseQuanti: 0 };
  if (!isSupabaseConfigured()) return vuoto;
  const supabase = await createSupabaseServerClient();

  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const inizioMese = romaComeIso(`${oggi.slice(0, 7)}-01`, "00:00");
  const inizioOggi = romaComeIso(oggi, "00:00");

  const { data } = await supabase
    .from("payments")
    .select("amount_cents, paid_at")
    .eq("status", "paid")
    .gte("paid_at", inizioMese)
    .limit(5000);

  const righe = (data ?? []) as { amount_cents: number; paid_at: string }[];
  const riepilogo = { ...vuoto };
  for (const r of righe) {
    riepilogo.meseCents += r.amount_cents;
    riepilogo.meseQuanti += 1;
    if (r.paid_at >= inizioOggi) {
      riepilogo.oggiCents += r.amount_cents;
      riepilogo.oggiQuanti += 1;
    }
  }
  return riepilogo;
}
