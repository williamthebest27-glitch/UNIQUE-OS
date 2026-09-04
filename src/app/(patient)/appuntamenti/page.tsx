import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { getOpenSlots, getPatientAppointments } from "@/lib/data/appointments";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { BookButton, CancelButton } from "@/components/appointments/booking";
import { formatCredits, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { CANCELLATION_HOURS } from "@/lib/credits/rules";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Appuntamenti" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

const ESITO_LABEL: Record<string, string> = {
  completed: "Svolta",
  cancelled: "Disdetta",
  no_show: "Non presentato",
};

export default async function AppuntamentiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const [{ prossimi, passati }, slots] = await Promise.all([
    getPatientAppointments(),
    getOpenSlots(),
  ]);

  const disponibili = data.membership.credits.available;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={sezioneDi("/appuntamenti")!.titolo} subtitle={sezioneDi("/appuntamenti")!.sottotitolo} />

      {/* ── In programma ─────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="In programma"
          action={
            <span className="text-xs text-ink-400 tnum">
              {formatCredits(disponibili)} disponibili
            </span>
          }
        />
        {prossimi.length === 0 ? (
          <EmptyState>
            Nessuna visita in programma. Qui sotto trovi le disponibilità.
          </EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {prossimi.map((appt) => (
              <li
                key={appt.id}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-900">
                    {appt.serviceName}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                    {formatWeekdayDayMonth(appt.startsAt)} · ore{" "}
                    <span className="tnum">{formatTime(appt.startsAt)}</span>
                    {appt.location ? ` · ${appt.location}` : ""}
                  </p>
                  {appt.professionalName ? (
                    <p className="mt-0.5 text-sm text-ink-500">
                      con {appt.professionalName}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {appt.status === "confirmed" ? <Badge tone="positive">Confermata</Badge> : null}
                    {appt.creditsCost > 0 ? (
                      <Badge>{formatCredits(appt.creditsCost)}</Badge>
                    ) : null}
                    {appt.source !== "unique_os" ? (
                      <Badge>Dal gestionale</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 sm:w-[260px]">
                  <CancelButton
                    appointmentId={appt.id}
                    startsAt={appt.startsAt}
                    credits={appt.creditsCost}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Disponibilità ────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Disponibilità"
          hint="Prenotando, i crediti passano da disponibili a prenotati."
        />
        {slots.length === 0 ? (
          <EmptyState>
            Nessuna disponibilità aperta. Per fissare una visita, scrivi alla
            segreteria.
          </EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-900">
                    {slot.serviceName}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                    {formatWeekdayDayMonth(slot.startsAt)} · ore{" "}
                    <span className="tnum">{formatTime(slot.startsAt)}</span>
                    {slot.professionalName ? ` · ${slot.professionalName}` : ""}
                  </p>
                </div>

                <BookButton
                  slotId={slot.id}
                  credits={slot.creditsCost}
                  disabled={disponibili < slot.creditsCost}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Storico ──────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Storico" />
        {passati.length === 0 ? (
          <EmptyState>Nessuna visita nello storico.</EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {passati.map((appt) => (
              <li
                key={appt.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">{appt.serviceName}</p>
                  <p className="mt-0.5 text-sm text-ink-500 tnum">
                    {formatShortDate(appt.startsAt)}
                    {appt.cancelReason ? ` · ${appt.cancelReason}` : ""}
                  </p>
                </div>
                {ESITO_LABEL[appt.status] ? (
                  <Badge tone={appt.status === "completed" ? "positive" : "neutral"}>
                    {ESITO_LABEL[appt.status]}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
