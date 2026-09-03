import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { CreditsCard, MEMBERSHIP_STATUS_LABELS } from "@/components/patient/cards";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";

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
                    <Badge tone={m.status === "active" ? "jade" : "attention"}>
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
