import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";
import {
  byPatient,
  byProfessional,
  byService,
  computeAll,
  totals,
  type CompensationRule,
  type ServiceEconomics,
  type Totali,
  type Visit,
  type VisitEconomics,
} from "@/lib/economics/engine";
import { computePayouts, type PayoutReport } from "@/lib/economics/payouts";
import {
  annualFromWeekly,
  bottleneck,
  consumptionModel,
  growthHeadroom,
  occupancyByProfessional,
  weeklyProfessionalMinutes,
  weeklyRoomMinutes,
  type ConsumoDisciplina,
  type DeliveredVisit,
  type OpeningHour,
  type Room,
  type Schedule,
  type Utilizzo,
} from "@/lib/capacity/engine";

/**
 * Il Control Center.
 *
 * Una sola funzione carica tutto e poi lascia il calcolo ai motori puri:
 * qui non si fa aritmetica di margine né di capacità, si legge il
 * database e si passa il testimone. È il motivo per cui quei numeri sono
 * coperti da test e questi no — qui non c'è niente da testare.
 *
 * Riservata ad amministrazione e direzione: la Row Level Security lo
 * garantisce sui dati, questa funzione lo verifica sul ruolo.
 */

const ROME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function oggiRoma(): string {
  return ROME.format(new Date());
}

export interface KpiOggi {
  pazienti: number;
  fatturatoCents: number;
  nuoviLead: number;
  prenotazioni: number;
  conversionRate: number;
  membershipAttive: number;
  creditiUtilizzati: number;
  noShow: number;
}

export interface KpiMese {
  periodo: string;
  fatturatoCents: number;
  /** Ricavo ricorrente mensile dalle membership attive. */
  mrrCents: number;
  nuoviMembri: number;
  churn: number;
  lead: number;
  conversionRate: number;
  visite: number;
  totaliEconomici: Totali;
  perServizio: ReturnType<typeof byService>;
  perProfessionista: ReturnType<typeof byProfessional>;
  perPaziente: ReturnType<typeof byPatient>;
  /** Valore medio generato per paziente attivo. */
  ltvCents: number;
  retention: number;
}

export interface KpiCapacita {
  minutiSettimanaClinica: number;
  minutiSettimanaProfessionisti: number;
  utilizzi: Utilizzo[];
  collo: Utilizzo | null;
  nomiProfessionisti: Map<string, string>;
  modelloConsumo: ConsumoDisciplina[];
  membriAttivi: number;
  margineCrescita: { membriAggiuntivi: number; vincolo: string | null };
  capacitaAnnuaPerDisciplina: Map<string, number>;
}

export interface ControlData {
  oggi: KpiOggi;
  mese: KpiMese;
  capacita: KpiCapacita;
  compensi: PayoutReport;
  righeEconomiche: VisitEconomics[];
}

interface AppointmentRow {
  id: string;
  service_id: string | null;
  professional_id: string | null;
  patient_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export async function getControlCenter(periodo?: string): Promise<ControlData | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) return null;

  const supabase = await createSupabaseServerClient();

  const oggi = oggiRoma();
  const mese = periodo ?? oggi.slice(0, 7);
  const inizioMese = `${mese}-01`;
  // Il primo del mese successivo, senza aritmetica sui giorni.
  const [anno, mm] = mese.split("-").map(Number);
  const fineMese = mm === 12 ? `${anno + 1}-01-01` : `${anno}-${String(mm + 1).padStart(2, "0")}-01`;

  const [
    pazientiRes,
    leadRes,
    apptRes,
    membershipRes,
    tiersRes,
    paymentsRes,
    creditiRes,
    serviziRes,
    regoleRes,
    professionistiRes,
    stanzeRes,
    orariRes,
    turniRes,
  ] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id, status, first_seen_at, converted_at, lost_at"),
    supabase
      .from("appointments")
      .select("id, service_id, professional_id, patient_id, starts_at, ends_at, status")
      .gte("starts_at", `${inizioMese}T00:00:00Z`)
      .lt("starts_at", `${fineMese}T00:00:00Z`),
    supabase
      .from("memberships")
      .select("id, patient_id, status, is_active, starts_on, ends_on, cancelled_at, tier_id"),
    supabase.from("membership_tiers").select("id, name, price_cents, billing_period"),
    supabase
      .from("payments")
      .select("amount_cents, status, paid_at")
      .eq("status", "paid")
      .gte("paid_at", `${inizioMese}T00:00:00Z`)
      .lt("paid_at", `${fineMese}T00:00:00Z`),
    supabase
      .from("credit_entries")
      .select("amount, entry_type, created_at")
      .eq("entry_type", "consumption")
      .gte("created_at", `${oggi}T00:00:00Z`),
    supabase.from("services").select("id, slug, name, price_cents, material_cost_cents, discipline"),
    supabase
      .from("compensation_rules")
      .select("id, professional_id, service_id, professional_share, min_monthly_visits"),
    supabase.from("professionals").select("id, discipline, profile:profiles(full_name)"),
    supabase.from("rooms").select("id, name, is_active"),
    supabase.from("opening_hours").select("weekday, opens_at, closes_at, room_id"),
    supabase.from("professional_schedules").select("professional_id, weekday, starts_at, ends_at"),
  ]);

  /* ── Anagrafiche ────────────────────────────────────────────── */
  const servizi = new Map<string, ServiceEconomics>();
  const disciplinaServizio = new Map<string, string>();

  for (const s of (serviziRes.data ?? []) as {
    id: string;
    slug: string;
    name: string;
    price_cents: number;
    material_cost_cents: number;
    discipline: string | null;
  }[]) {
    servizi.set(s.id, {
      id: s.id,
      slug: s.slug,
      name: s.name,
      priceCents: s.price_cents,
      materialCostCents: s.material_cost_cents,
    });
    disciplinaServizio.set(s.id, s.discipline ?? "other");
  }

  const regole: CompensationRule[] = (
    (regoleRes.data ?? []) as {
      id: string;
      professional_id: string | null;
      service_id: string | null;
      professional_share: number;
      min_monthly_visits: number;
    }[]
  ).map((r) => ({
    id: r.id,
    professionalId: r.professional_id,
    serviceId: r.service_id,
    professionalShare: Number(r.professional_share),
    minMonthlyVisits: r.min_monthly_visits,
  }));

  const professionisti = (professionistiRes.data ?? []) as unknown as {
    id: string;
    discipline: string;
    profile: { full_name: string } | null;
  }[];

  const nomiProfessionisti = new Map(
    professionisti.map((p) => [p.id, p.profile?.full_name ?? "Professionista"]),
  );
  const disciplinaProfessionista = new Map(professionisti.map((p) => [p.id, p.discipline]));

  /* ── Visite ─────────────────────────────────────────────────── */
  const appuntamenti = (apptRes.data ?? []) as AppointmentRow[];

  const erogate: Visit[] = appuntamenti
    .filter((a) => ["completed", "no_show"].includes(a.status) && a.service_id)
    .map((a) => ({
      appointmentId: a.id,
      serviceId: a.service_id as string,
      professionalId: a.professional_id,
      patientId: a.patient_id,
      occurredAt: a.starts_at,
      outcome: a.status === "no_show" ? ("no_show" as const) : ("completed" as const),
    }));

  const righeEconomiche = computeAll(erogate, servizi, regole);
  const totaliEconomici = totals(righeEconomiche);

  /* ── Membership e ricavi ────────────────────────────────────── */
  const tiers = new Map(
    ((tiersRes.data ?? []) as {
      id: string;
      name: string;
      price_cents: number;
      billing_period: string;
    }[]).map((t) => [t.id, t]),
  );

  const memberships = (membershipRes.data ?? []) as {
    id: string;
    patient_id: string;
    status: string;
    is_active: boolean;
    starts_on: string;
    ends_on: string | null;
    cancelled_at: string | null;
    tier_id: string;
  }[];

  const attive = memberships.filter((m) => m.is_active && m.status === "active");

  // Un piano annuale vale un dodicesimo al mese: il ricorrente si misura
  // sul mese, altrimenti confronta pere con mele.
  const mrrCents = attive.reduce((acc, m) => {
    const tier = tiers.get(m.tier_id);
    if (!tier) return acc;
    const divisore = tier.billing_period === "year" ? 12 : 1;
    return acc + Math.round(tier.price_cents / divisore);
  }, 0);

  const nuoviMembri = memberships.filter(
    (m) => m.starts_on >= inizioMese && m.starts_on < fineMese,
  ).length;

  const churn = memberships.filter(
    (m) => m.cancelled_at && m.cancelled_at >= inizioMese && m.cancelled_at < fineMese,
  ).length;

  const fatturatoMeseCents = ((paymentsRes.data ?? []) as { amount_cents: number }[]).reduce(
    (acc, p) => acc + p.amount_cents,
    0,
  );

  /* ── CRM ────────────────────────────────────────────────────── */
  const leads = (leadRes.data ?? []) as {
    id: string;
    status: string;
    first_seen_at: string;
    converted_at: string | null;
    lost_at: string | null;
  }[];

  const leadDelMese = leads.filter(
    (l) => l.first_seen_at >= inizioMese && l.first_seen_at < fineMese,
  );
  const convertitiDelMese = leads.filter(
    (l) => l.converted_at && l.converted_at >= inizioMese && l.converted_at < fineMese,
  );

  const conversionMese =
    leadDelMese.length === 0 ? 0 : convertitiDelMese.length / leadDelMese.length;

  const leadOggi = leads.filter((l) => l.first_seen_at.slice(0, 10) === oggi).length;
  const convertitiOggi = leads.filter((l) => l.converted_at?.slice(0, 10) === oggi).length;

  /* ── Oggi ───────────────────────────────────────────────────── */
  const apptOggi = appuntamenti.filter((a) => a.starts_at.slice(0, 10) === oggi);

  const consumatiOggi = ((creditiRes.data ?? []) as { amount: number }[]).reduce(
    (acc, c) => acc + Math.abs(Number(c.amount)),
    0,
  );

  const fatturatoOggiCents = ((paymentsRes.data ?? []) as {
    amount_cents: number;
    paid_at: string | null;
  }[])
    .filter((p) => p.paid_at?.slice(0, 10) === oggi)
    .reduce((acc, p) => acc + p.amount_cents, 0);

  const oggiKpi: KpiOggi = {
    pazienti: pazientiRes.count ?? 0,
    fatturatoCents: fatturatoOggiCents,
    nuoviLead: leadOggi,
    prenotazioni: apptOggi.length,
    conversionRate: leadOggi === 0 ? 0 : convertitiOggi / leadOggi,
    membershipAttive: attive.length,
    creditiUtilizzati: consumatiOggi,
    noShow: apptOggi.filter((a) => a.status === "no_show").length,
  };

  /* ── Capacità ───────────────────────────────────────────────── */
  const stanze = ((stanzeRes.data ?? []) as { id: string; name: string; is_active: boolean }[]).map(
    (r): Room => ({ id: r.id, name: r.name, isActive: r.is_active }),
  );

  const orari = ((orariRes.data ?? []) as {
    weekday: number;
    opens_at: string;
    closes_at: string;
    room_id: string | null;
  }[]).map((h): OpeningHour => ({
    weekday: h.weekday,
    opensAt: h.opens_at.slice(0, 5),
    closesAt: h.closes_at.slice(0, 5),
    roomId: h.room_id,
  }));

  const turni = ((turniRes.data ?? []) as {
    professional_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
  }[]).map((s): Schedule => ({
    professionalId: s.professional_id,
    weekday: s.weekday,
    startsAt: s.starts_at.slice(0, 5),
    endsAt: s.ends_at.slice(0, 5),
  }));

  const consegnate: DeliveredVisit[] = appuntamenti
    .filter((a) => a.status === "completed")
    .map((a) => ({
      professionalId: a.professional_id,
      discipline: a.professional_id
        ? (disciplinaProfessionista.get(a.professional_id) ??
          disciplinaServizio.get(a.service_id ?? "") ??
          "other")
        : (disciplinaServizio.get(a.service_id ?? "") ?? "other"),
      startsAt: a.starts_at,
      endsAt: a.ends_at,
    }));

  const settimaneNelMese = 30 / 7;
  const utilizzi = occupancyByProfessional(consegnate, turni, settimaneNelMese);

  const minutiPerProfessionista = weeklyProfessionalMinutes(turni);
  const capacitaAnnuaPerDisciplina = new Map<string, number>();
  for (const [professionalId, minuti] of minutiPerProfessionista) {
    const d = disciplinaProfessionista.get(professionalId) ?? "other";
    capacitaAnnuaPerDisciplina.set(
      d,
      (capacitaAnnuaPerDisciplina.get(d) ?? 0) + annualFromWeekly(minuti),
    );
  }

  const modelloConsumo = consumptionModel(consegnate, attive.length, 30);

  const capacita: KpiCapacita = {
    minutiSettimanaClinica: weeklyRoomMinutes(stanze, orari),
    minutiSettimanaProfessionisti: [...minutiPerProfessionista.values()].reduce(
      (a, b) => a + b,
      0,
    ),
    utilizzi,
    collo: bottleneck(utilizzi),
    nomiProfessionisti,
    modelloConsumo,
    membriAttivi: attive.length,
    margineCrescita: growthHeadroom(attive.length, modelloConsumo, capacitaAnnuaPerDisciplina),
    capacitaAnnuaPerDisciplina,
  };

  /* ── Nomi pazienti per l'aggregazione ───────────────────────── */
  const idPazienti = [...new Set(righeEconomiche.map((r) => r.patientId))];
  const nomiPazienti = new Map<string, string>();

  if (idPazienti.length > 0) {
    const { data } = await supabase
      .from("patients")
      .select("id, profile:profiles(full_name)")
      .in("id", idPazienti);

    for (const p of (data ?? []) as unknown as {
      id: string;
      profile: { full_name: string } | null;
    }[]) {
      nomiPazienti.set(p.id, p.profile?.full_name ?? "Paziente");
    }
  }

  const pazientiAttivi = idPazienti.length;

  return {
    oggi: oggiKpi,
    mese: {
      periodo: mese,
      fatturatoCents: fatturatoMeseCents,
      mrrCents,
      nuoviMembri,
      churn,
      lead: leadDelMese.length,
      conversionRate: conversionMese,
      visite: erogate.length,
      totaliEconomici,
      perServizio: byService(righeEconomiche),
      perProfessionista: byProfessional(righeEconomiche, nomiProfessionisti),
      perPaziente: byPatient(righeEconomiche, nomiPazienti),
      ltvCents: pazientiAttivi === 0 ? 0 : Math.round(totaliEconomici.grossCents / pazientiAttivi),
      // Quota di membership sopravvissute al mese.
      retention:
        attive.length + churn === 0 ? 1 : attive.length / (attive.length + churn),
    },
    capacita,
    compensi: computePayouts(righeEconomiche, mese, nomiProfessionisti),
    righeEconomiche,
  };
}
