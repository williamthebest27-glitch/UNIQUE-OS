import type {
  Appointment,
  CreditSummary,
  ProgramEnrollment,
} from "@/lib/domain/types";
import {
  formatCredits,
  formatRelativeDays,
  formatShortDate,
  formatTime,
  formatWeekdayDayMonth,
} from "@/lib/format";
import {
  Badge,
  CalendarIcon,
  Card,
  CreditIcon,
  EmptyState,
  PathIcon,
  cx,
} from "@/components/ui/primitives";

function TileHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-ink-400">
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.09em]">
        {label}
      </h2>
    </div>
  );
}

/* ── Prossima visita ──────────────────────────────────────────────── */

export function NextVisitCard({ appointment }: { appointment: Appointment | null }) {
  return (
    <Card className="flex flex-col p-6">
      <TileHeader icon={<CalendarIcon />} label="Prossima visita" />

      {appointment === null ? (
        <EmptyState>
          Non hai visite in programma. La segreteria ti contatterà per il
          prossimo controllo.
        </EmptyState>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <p className="font-display text-[22px] leading-tight text-ink-900">
            {appointment.serviceName}
          </p>

          <p className="mt-3 text-sm text-ink-700 first-letter:uppercase">
            {formatWeekdayDayMonth(appointment.startsAt)}
          </p>
          <p className="text-sm text-ink-500 tnum">
            ore {formatTime(appointment.startsAt)}
            {appointment.location ? ` · ${appointment.location}` : ""}
          </p>

          {appointment.professional ? (
            <p className="mt-3 text-sm text-ink-500">
              con{" "}
              <span className="font-medium text-ink-800">
                {appointment.professional.title
                  ? `${appointment.professional.title} `
                  : ""}
                {appointment.professional.fullName}
              </span>
            </p>
          ) : null}

          <div className="mt-auto flex items-center gap-2 pt-5">
            <Badge tone="jade">{formatRelativeDays(appointment.startsAt)}</Badge>
            {appointment.status === "confirmed" ? (
              <Badge>Confermata</Badge>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Percorso attivo ──────────────────────────────────────────────── */

export function ProgramCard({ enrollment }: { enrollment: ProgramEnrollment | null }) {
  return (
    <Card className="flex flex-col p-6">
      <TileHeader icon={<PathIcon />} label="Percorso attivo" />

      {enrollment === null ? (
        <EmptyState>
          Nessun percorso attivo. Dopo la prossima visita ne troverai uno qui.
        </EmptyState>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <p className="font-display text-[22px] leading-tight text-ink-900">
            {enrollment.programName}
          </p>

          {enrollment.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">
              {enrollment.description}
            </p>
          ) : null}

          <div className="mt-auto pt-6">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-500 tnum">
                {enrollment.stepsDone} di {enrollment.stepsTotal} tappe
              </span>
              <span className="font-display text-[22px] text-ink-900 tnum">
                {Math.round(enrollment.progressPct)}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bone-200">
              <div
                className="h-full rounded-full bg-jade-600"
                style={{ width: `${enrollment.progressPct}%` }}
              />
            </div>
            {enrollment.endsOn ? (
              <p className="mt-3 text-xs text-ink-400">
                Si conclude il {formatShortDate(enrollment.endsOn)}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Crediti e membership ─────────────────────────────────────────── */

export function CreditsCard({ credits }: { credits: CreditSummary }) {
  const usedPct =
    credits.totalCredited > 0
      ? Math.min(100, (credits.totalUsed / credits.totalCredited) * 100)
      : 0;

  return (
    <Card className="flex flex-col p-6">
      <TileHeader icon={<CreditIcon />} label="Crediti" />

      <div className="mt-4 flex flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[44px] leading-none text-ink-900 tnum">
            {credits.balance.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          </span>
          <span className="text-sm text-ink-400">
            {credits.balance === 1 ? "disponibile" : "disponibili"}
          </span>
        </div>

        <p className="mt-3 text-sm text-ink-500 tnum">
          {formatCredits(credits.totalUsed)} utilizzati su{" "}
          {credits.totalCredited.toLocaleString("it-IT")}
        </p>

        {/* La barra mostra il consumato: è la parte che il paziente
            vuole controllare a colpo d occhio. */}
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-bone-200"
          role="img"
          aria-label={`${Math.round(usedPct)} percento dei crediti utilizzato`}
        >
          <div
            className={cx(
              "h-full rounded-full",
              usedPct > 80 ? "bg-signal-attention" : "bg-gold-500",
            )}
            style={{ width: `${usedPct}%` }}
          />
        </div>

        {credits.membershipName ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
            <Badge tone="gold">{credits.membershipName}</Badge>
            {credits.membershipEndsOn ? (
              <span className="text-xs text-ink-400">
                fino al {formatShortDate(credits.membershipEndsOn)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
