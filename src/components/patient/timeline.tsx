import type { TimelineEvent, TimelineKind } from "@/lib/domain/types";
import { formatDayMonth, formatShortDate } from "@/lib/format";
import {
  CalendarIcon,
  Card,
  CardHeader,
  DocumentIcon,
  EmptyState,
  PathIcon,
  SparkIcon,
  cx,
} from "@/components/ui/primitives";

/**
 * La Health Timeline.
 *
 * Un evento per riga, dal più recente. L'anno compare solo quando cambia:
 * ripeterlo a ogni riga sarebbe rumore, ometterlo del tutto renderebbe
 * illeggibile uno storico lungo.
 */

const KIND_STYLE: Record<TimelineKind, { icon: React.ReactNode; dot: string; label: string }> = {
  score: { icon: <SparkIcon />, dot: "bg-brand-600", label: "Longevity Score" },
  appointment: { icon: <CalendarIcon />, dot: "bg-gold-500", label: "Visita" },
  document: { icon: <DocumentIcon />, dot: "bg-ink-400", label: "Documento" },
  program_start: { icon: <PathIcon />, dot: "bg-brand-500", label: "Percorso" },
  program_end: { icon: <PathIcon />, dot: "bg-bone-300", label: "Percorso" },
};

function anno(iso: string): string {
  return formatShortDate(iso).slice(-4);
}

export function Timeline({
  events,
  title = "Health Timeline",
  hint = "Tutto quello che è successo, in ordine.",
}: {
  events: TimelineEvent[];
  title?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} hint={hint} />

      {events.length === 0 ? (
        <EmptyState>
          La timeline si popola da sola con visite, referti e punteggi.
        </EmptyState>
      ) : (
        <ol className="mt-3 px-6 pb-6">
          {events.map((event, index) => {
            const style = KIND_STYLE[event.kind];
            const isLast = index === events.length - 1;
            const mostraAnno = index === 0 || anno(event.occurredAt) !== anno(events[index - 1].occurredAt);

            return (
              <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                {/* Il filo verticale si ferma sull'ultimo evento. */}
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[5px] top-4 h-full w-px bg-bone-200"
                  />
                ) : null}

                <span
                  aria-hidden="true"
                  className={cx(
                    "relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white",
                    style.dot,
                  )}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-ink-400 tnum first-letter:uppercase">
                      {formatDayMonth(event.occurredAt)}
                      {mostraAnno ? ` ${anno(event.occurredAt)}` : ""}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.08em] text-ink-300">
                      {style.label}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[15px] font-medium leading-snug text-ink-900">
                    {event.title}
                  </p>

                  {event.detail ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">
                      {event.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
