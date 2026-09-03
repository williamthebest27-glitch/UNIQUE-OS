import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * CRM.
 *
 * Il valore economico generato da un lead **non si scrive** sul lead: si
 * legge dai pagamenti del paziente in cui si è trasformato. Un numero
 * copiato in due posti prima o poi diverge, e in un CRM il numero
 * sbagliato è quello su cui si decide quanto spendere in pubblicità.
 */

export const LEAD_STATUSES = [
  "new_lead",
  "contacted",
  "qualified",
  "booking_proposed",
  "booked",
  "patient",
  "member",
  "inactive",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new_lead: "Nuovo lead",
  contacted: "Contattato",
  qualified: "Qualificato",
  booking_proposed: "Appuntamento proposto",
  booked: "Prenotato",
  patient: "Paziente",
  member: "Membro",
  inactive: "Inattivo",
  lost: "Perso",
};

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Sito",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  phone: "Telefono",
  referral: "Passaparola",
  walk_in: "Di persona",
  other: "Altro",
};

export interface LeadRiga {
  id: string;
  fullName: string | null;
  status: LeadStatus;
  source: string;
  campaign: string | null;
  serviceInterest: string | null;
  firstSeenAt: string;
  lastActivityAt: string | null;
  ownerName: string | null;
  patientId: string | null;
  attivita: number;
  /** Generato dal paziente in cui si è convertito. */
  valoreCents: number;
}

export interface Imbuto {
  status: LeadStatus;
  label: string;
  count: number;
}

export interface PerOrigine {
  key: string;
  label: string;
  lead: number;
  convertiti: number;
  conversionRate: number;
  valoreCents: number;
}

export interface CrmBoard {
  righe: LeadRiga[];
  imbuto: Imbuto[];
  perCanale: PerOrigine[];
  perCampagna: PerOrigine[];
  totaleLead: number;
  totaleConvertiti: number;
  valoreTotaleCents: number;
}

export async function getCrmBoard(): Promise<CrmBoard | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const { data: leadData } = await supabase
    .from("leads")
    .select(
      "id, full_name, status, source, campaign, first_seen_at, last_activity_at, patient_id, converted_at, service:services(name), owner:profiles(full_name)",
    )
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(200);

  const leads = (leadData ?? []) as unknown as {
    id: string;
    full_name: string | null;
    status: LeadStatus;
    source: string;
    campaign: string | null;
    first_seen_at: string;
    last_activity_at: string | null;
    patient_id: string | null;
    converted_at: string | null;
    service: { name: string } | null;
    owner: { full_name: string } | null;
  }[];

  // ── Valore generato: dai pagamenti dei pazienti convertiti ──────
  const idPazienti = leads.map((l) => l.patient_id).filter((x): x is string => x !== null);
  const valorePerPaziente = new Map<string, number>();

  if (idPazienti.length > 0) {
    const { data } = await supabase
      .from("payments")
      .select("patient_id, amount_cents")
      .eq("status", "paid")
      .in("patient_id", idPazienti);

    for (const p of (data ?? []) as { patient_id: string; amount_cents: number }[]) {
      valorePerPaziente.set(
        p.patient_id,
        (valorePerPaziente.get(p.patient_id) ?? 0) + p.amount_cents,
      );
    }
  }

  // ── Conteggio delle conversazioni ───────────────────────────────
  const attivitaPerLead = new Map<string, number>();
  if (leads.length > 0) {
    const { data } = await supabase
      .from("lead_activities")
      .select("lead_id")
      .in(
        "lead_id",
        leads.map((l) => l.id),
      );

    for (const a of (data ?? []) as { lead_id: string }[]) {
      attivitaPerLead.set(a.lead_id, (attivitaPerLead.get(a.lead_id) ?? 0) + 1);
    }
  }

  const righe: LeadRiga[] = leads.map((l) => ({
    id: l.id,
    fullName: l.full_name,
    status: l.status,
    source: l.source,
    campaign: l.campaign,
    serviceInterest: l.service?.name ?? null,
    firstSeenAt: l.first_seen_at,
    lastActivityAt: l.last_activity_at,
    ownerName: l.owner?.full_name ?? null,
    patientId: l.patient_id,
    attivita: attivitaPerLead.get(l.id) ?? 0,
    valoreCents: l.patient_id ? (valorePerPaziente.get(l.patient_id) ?? 0) : 0,
  }));

  // ── Imbuto ──────────────────────────────────────────────────────
  const imbuto: Imbuto[] = LEAD_STATUSES.map((status) => ({
    status,
    label: LEAD_STATUS_LABELS[status],
    count: righe.filter((r) => r.status === status).length,
  }));

  // ── Per canale e per campagna ───────────────────────────────────
  const convertito = (r: LeadRiga) =>
    r.patientId !== null || ["patient", "member"].includes(r.status);

  function raggruppa(
    keyOf: (r: LeadRiga) => string | null,
    labelOf: (key: string) => string,
  ): PerOrigine[] {
    const gruppi = new Map<string, LeadRiga[]>();
    for (const r of righe) {
      const k = keyOf(r);
      if (k === null) continue;
      const lista = gruppi.get(k) ?? [];
      lista.push(r);
      gruppi.set(k, lista);
    }

    return [...gruppi.entries()]
      .map(([key, lista]) => {
        const convertiti = lista.filter(convertito).length;
        return {
          key,
          label: labelOf(key),
          lead: lista.length,
          convertiti,
          conversionRate: lista.length === 0 ? 0 : convertiti / lista.length,
          valoreCents: lista.reduce((acc, r) => acc + r.valoreCents, 0),
        };
      })
      .sort((a, b) => b.valoreCents - a.valoreCents || b.lead - a.lead);
  }

  return {
    righe,
    imbuto,
    perCanale: raggruppa((r) => r.source, (k) => CHANNEL_LABELS[k] ?? k),
    perCampagna: raggruppa((r) => r.campaign, (k) => k),
    totaleLead: righe.length,
    totaleConvertiti: righe.filter(convertito).length,
    valoreTotaleCents: righe.reduce((acc, r) => acc + r.valoreCents, 0),
  };
}
