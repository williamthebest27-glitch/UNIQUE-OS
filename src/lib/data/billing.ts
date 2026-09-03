import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Metodi di pagamento e incassi.
 *
 * Del metodo di pagamento qui non c'è nulla di sensibile: circuito,
 * ultime quattro cifre e mese di scadenza. Bastano a riconoscerlo e ad
 * avvisare prima che scada; tutto il resto sta dal gestore dei pagamenti.
 */

export interface MetodoPagamento {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  /** Vero se la carta è scaduta o scade entro il mese. */
  inScadenza: boolean;
}

export interface Pagamento {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  currency: string;
  description: string | null;
  dueOn: string | null;
  paidAt: string | null;
  failureReason: string | null;
  attempts: number;
}

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  membership: "Membership",
  membership_renewal: "Rinnovo membership",
  service: "Servizio singolo",
  package: "Pacchetto",
  upgrade: "Upgrade",
  extra: "Acquisto extra",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  paid: "Pagato",
  failed: "Fallito",
  refunded: "Rimborsato",
  cancelled: "Annullato",
};

/** L'indirizzo del portale del gestore dei pagamenti, se configurato. */
export function billingPortalUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_BILLING_PORTAL_URL ?? "";
  return url.length > 0 ? url : null;
}

function inScadenza(month: number | null, year: number | null): boolean {
  if (month === null || year === null) return false;
  const oggi = new Date();
  // Una carta è "in scadenza" già il mese prima: dopo è troppo tardi per
  // avvisare senza far fallire un rinnovo.
  const limite = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
  const scadenza = new Date(year, month, 1);
  return scadenza <= limite;
}

export async function getPaymentMethods(patientId?: string): Promise<MetodoPagamento[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("payment_methods")
    .select("id, brand, last4, exp_month, exp_year, is_default")
    .order("is_default", { ascending: false })
    .limit(5);

  if (patientId) query = query.eq("patient_id", patientId);

  const { data } = await query;

  return ((data ?? []) as {
    id: string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
  }[]).map((row) => ({
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    isDefault: row.is_default,
    inScadenza: inScadenza(row.exp_month, row.exp_year),
  }));
}

export async function getPayments(patientId?: string, limit = 12): Promise<Pagamento[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("payments")
    .select(
      "id, kind, status, amount_cents, currency, description, due_on, paid_at, failure_reason, attempts",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (patientId) query = query.eq("patient_id", patientId);

  const { data } = await query;

  return ((data ?? []) as {
    id: string;
    kind: string;
    status: string;
    amount_cents: number;
    currency: string;
    description: string | null;
    due_on: string | null;
    paid_at: string | null;
    failure_reason: string | null;
    attempts: number;
  }[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    dueOn: row.due_on,
    paidAt: row.paid_at,
    failureReason: row.failure_reason,
    attempts: row.attempts,
  }));
}
