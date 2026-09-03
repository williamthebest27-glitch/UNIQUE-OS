import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { CreditsCard, MEMBERSHIP_STATUS_LABELS } from "@/components/patient/cards";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";
import { getCreditLedger } from "@/lib/data/appointments";
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
  billingPortalUrl,
  getPaymentMethods,
  getPayments,
} from "@/lib/data/billing";
import { CREDIT_ENTRY_LABELS, type CreditEntryKind } from "@/lib/credits/rules";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

function Voce({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-bone-200 px-6 py-3.5 first:border-t-0">
      <dt className="text-[13px] text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink-900">{children}</dd>
    </div>
  );
}

function euro(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export default async function CreditiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const [metodi, pagamenti, movimenti] = await Promise.all([
    getPaymentMethods(),
    getPayments(),
    getCreditLedger(),
  ]);

  const portale = billingPortalUrl();
  const m = data.membership;
  const { granted, used, reserved, available } = m.credits;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading
        title="Membership e crediti"
        subtitle="Il tuo piano, i movimenti e i crediti ancora a disposizione."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <CreditsCard membership={m} />

        {/* ── I quattro numeri, distinti ───────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="I tuoi crediti"
            hint="I crediti prenotati sono impegnati sulle visite che hai già fissato."
          />
          <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden bg-bone-200/70 sm:grid-cols-4">
            {[
              ["Assegnati", granted],
              ["Utilizzati", used],
              ["Prenotati", reserved],
              ["Disponibili", available],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white px-5 py-5">
                <dt className="text-[13px] text-ink-500">{label}</dt>
                <dd className="mt-1 font-display text-[28px] leading-none text-ink-900 tnum">
                  {Number(value).toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* ── Il piano ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Il tuo piano" />
          {m.planName === null ? (
            <EmptyState>
              Nessuna membership attiva. La segreteria può attivarne una quando
              vuoi.
            </EmptyState>
          ) : (
            <dl className="mt-2 pb-2">
              <Voce label="Piano">
                <span className="flex flex-wrap items-center gap-2">
                  {m.planName}
                  {m.status ? (
                    <Badge tone={m.status === "active" ? "positive" : "attention"}>
                      {MEMBERSHIP_STATUS_LABELS[m.status]}
                    </Badge>
                  ) : null}
                </span>
              </Voce>

              {m.startsOn ? (
                <Voce label="Attivata il">
                  <span className="tnum">{formatShortDate(m.startsOn)}</span>
                </Voce>
              ) : null}

              {m.endsOn ? (
                <Voce label="Scadenza">
                  <span className="tnum">{formatShortDate(m.endsOn)}</span>
                </Voce>
              ) : null}

              <Voce label="Rinnovo">
                {m.autoRenew ? (
                  <>
                    Automatico
                    {m.renewsOn ? (
                      <span className="text-ink-500">
                        {" "}
                        · il <span className="tnum">{formatShortDate(m.renewsOn)}</span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  "Non attivo — il piano si concluderà alla scadenza"
                )}
              </Voce>

              <Voce label="Metodo di pagamento">
                {m.paymentBrand || m.paymentLast4 ? (
                  <span className="tnum">
                    {m.paymentBrand ?? "Carta"}
                    {m.paymentLast4 ? ` ···· ${m.paymentLast4}` : ""}
                  </span>
                ) : (
                  <span className="text-ink-400">Non registrato</span>
                )}
              </Voce>
            </dl>
          )}
        </Card>

        {/* ── Metodo di pagamento ──────────────────────────────── */}
        <Card>
          <CardHeader
            title="Metodo di pagamento"
            hint="I dati della carta sono custoditi dal gestore dei pagamenti, non da Unique."
          />
          {metodi.length === 0 ? (
            <EmptyState>Nessun metodo di pagamento registrato.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-bone-200/80">
              {metodi.map((metodo) => (
                <li
                  key={metodo.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5"
                >
                  <span className="text-[15px] text-ink-900 tnum">
                    {metodo.brand ?? "Carta"}
                    {metodo.last4 ? ` ···· ${metodo.last4}` : ""}
                    {metodo.expMonth && metodo.expYear ? (
                      <span className="ml-2 text-sm text-ink-400">
                        {String(metodo.expMonth).padStart(2, "0")}/{metodo.expYear}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {metodo.isDefault ? <Badge tone="brand">Predefinito</Badge> : null}
                    {metodo.inScadenza ? <Badge tone="attention">In scadenza</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="px-6 py-5">
            {portale ? (
              <a
                href={portale}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
              >
                Aggiorna il metodo di pagamento
              </a>
            ) : (
              <p className="text-sm text-ink-500">
                Per cambiare la carta, scrivi alla segreteria: il portale dei
                pagamenti non è ancora collegato.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-400">
              L’aggiornamento avviene sulle pagine del gestore dei pagamenti. Il
              numero della carta non passa mai da Unique OS.
            </p>
          </div>
        </Card>

        {/* ── Pagamenti ────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Pagamenti" />
          {pagamenti.length === 0 ? (
            <EmptyState>Nessun pagamento registrato.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
              {pagamenti.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink-900">
                      {p.description ?? PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400 tnum">
                      {p.paidAt
                        ? formatShortDate(p.paidAt)
                        : p.dueOn
                          ? `scadenza ${formatShortDate(p.dueOn)}`
                          : ""}
                      {p.failureReason ? ` · ${p.failureReason}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] text-ink-700 tnum">
                      {euro(p.amountCents, p.currency)}
                    </span>
                    <Badge tone={p.status === "paid" ? "positive" : p.status === "failed" ? "attention" : "neutral"}>
                      {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Movimenti dei crediti ────────────────────────────── */}
        <Card>
          <CardHeader
            title="Movimenti dei crediti"
            hint="Ogni passaggio lascia una riga: nulla viene riscritto."
          />
          {movimenti.length === 0 ? (
            <EmptyState>Nessun movimento.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
              {movimenti.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-900">
                      {m.description ?? CREDIT_ENTRY_LABELS[m.kind as CreditEntryKind] ?? m.kind}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {CREDIT_ENTRY_LABELS[m.kind as CreditEntryKind] ?? m.kind} ·{" "}
                      <span className="tnum">{formatShortDate(m.createdAt)}</span>
                    </p>
                  </div>
                  <span
                    className={cx(
                      "text-[15px] font-medium tnum",
                      m.amount > 0 ? "text-signal-positive" : "text-ink-700",
                    )}
                  >
                    {m.amount > 0 ? "+" : "−"}
                    {Math.abs(m.amount).toLocaleString("it-IT", {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Servizi extra ────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Servizi extra"
            hint="Acquisti fuori dal piano."
          />
          {m.extras.length === 0 ? (
            <EmptyState>Nessun servizio extra acquistato.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
              {m.extras.map((extra) => (
                <li key={extra.id} className="px-6 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[15px] text-ink-900">{extra.name}</span>
                    <span className="text-[15px] text-ink-700 tnum">
                      {euro(extra.priceCents, extra.currency)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-400 tnum">
                    {formatShortDate(extra.purchasedOn)}
                    {extra.creditsGranted > 0
                      ? ` · +${extra.creditsGranted.toLocaleString("it-IT")} crediti`
                      : ""}
                  </p>
                  {extra.description ? (
                    <p className="mt-1 text-sm text-ink-500">{extra.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
