import type { TimelineEvent, TimelineKind } from "@/lib/domain/types";
import { formatDayMonth, formatShortDate } from "@/lib/format";
import {
  CATEGORIE_TIMELINE,
  ETICHETTE_CATEGORIA_TIMELINE,
  NOTE_CATEGORIA_TIMELINE,
  type CategoriaTimeline,
} from "@/lib/clinical/timeline";
import { NavLink } from "@/components/shell/nav-link";
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
 *
 * Il pallino colorato non è decorazione. Scorrendo trecento righe si
 * legge la colonna dei pallini prima del testo, e i colori sono
 * assegnati per **peso clinico** e non per varietà: rosso il marchio sui
 * fatti che riguardano il corpo — punteggio, esami, referti — oro su ciò
 * che è stato deciso, grigio su ciò che è stato detto o archiviato. Sei
 * colori diversi avrebbero reso la colonna un arcobaleno da decifrare.
 */

const KIND_STYLE: Record<
  TimelineKind,
  { icon: React.ReactNode; dot: string; label: string }
> = {
  score: { icon: <SparkIcon />, dot: "bg-brand-600", label: "Longevity Score" },
  measurement: { icon: <SparkIcon />, dot: "bg-brand-600", label: "Esami" },
  report: { icon: <DocumentIcon />, dot: "bg-brand-500", label: "Referto" },
  appointment: { icon: <CalendarIcon />, dot: "bg-gold-500", label: "Visita" },
  prescription: { icon: <DocumentIcon />, dot: "bg-gold-500", label: "Prescrizione" },
  therapy: { icon: <PathIcon />, dot: "bg-gold-500", label: "Terapia" },
  note: { icon: <DocumentIcon />, dot: "bg-ink-400", label: "Nota" },
  thread: { icon: <DocumentIcon />, dot: "bg-ink-400", label: "Conversazione" },
  // Oro e non rosso: un consulto è una richiesta di decisione, non un
  // fatto trovato nel corpo. Il rosso resta ai tre che lo sono.
  consultation: { icon: <DocumentIcon />, dot: "bg-gold-500", label: "Consulto" },
  internal: { icon: <DocumentIcon />, dot: "bg-ink-400", label: "Comunicazione" },
  document: { icon: <DocumentIcon />, dot: "bg-bone-300", label: "Documento" },
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
  filtri,
}: {
  events: TimelineEvent[];
  title?: string;
  hint?: string;
  /** Quando c'è, sopra l'elenco compare la riga dei filtri. */
  filtri?: FiltriTimeline;
}) {
  return (
    <Card>
      <CardHeader title={title} hint={hint} />

      {filtri ? (
        <div className="px-6 pt-3">
          <BarraFiltri {...filtri} />
        </div>
      ) : null}

      {events.length === 0 ? (
        <EmptyState>
          {filtri?.attiva
            ? NOTE_CATEGORIA_TIMELINE[filtri.attiva]
            : "La timeline si popola da sola con visite, referti, esami e punteggi."}
        </EmptyState>
      ) : (
        <ol className="mt-3 px-6 pb-6">
          {events.map((event, index) => {
            const style = KIND_STYLE[event.kind] ?? KIND_STYLE.document;
            const isLast = index === events.length - 1;
            const mostraAnno =
              index === 0 || anno(event.occurredAt) !== anno(events[index - 1].occurredAt);

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

/* ── I filtri ─────────────────────────────────────────────────────── */

export interface FiltriTimeline {
  /** Dove tornano i collegamenti. Il filtro finisce in `?vista=`. */
  base: string;
  attiva: CategoriaTimeline | null;
  /** Quante righe ha ciascuna categoria: zero non si clicca. */
  conteggi: Record<string, number>;
}

/**
 * La riga dei filtri.
 *
 * Collegamenti e non un componente client con lo stato: **il filtro ha
 * un indirizzo**, quindi «gli esami di questa persona» si mette fra i
 * preferiti, si manda a un collega e torna indietro con il tasto del
 * browser. Uno `useState` avrebbe risparmiato una navigazione e tolto
 * tutte e tre le cose — è la stessa scelta delle sezioni della cartella.
 *
 * Una categoria vuota resta visibile ma spenta e non cliccabile: farla
 * sparire avrebbe fatto ballare la riga da un paziente all'altro, e
 * un'assenza che si vede dice qualcosa — «di questa persona non abbiamo
 * referti» è un'informazione clinica.
 */
function BarraFiltri({ base, attiva, conteggi }: FiltriTimeline) {
  const totale = Object.values(conteggi).reduce((n, v) => n + v, 0);

  return (
    <nav
      aria-label="Filtra la timeline"
      className="-mx-1 flex gap-1.5 overflow-x-auto pb-1"
    >
      <Chip href={base} attiva={attiva === null} conta={totale}>
        Tutto
      </Chip>

      {CATEGORIE_TIMELINE.map((c) => {
        const n = conteggi[c] ?? 0;
        return (
          <Chip
            key={c}
            href={`${base}?vista=${c}`}
            attiva={attiva === c}
            conta={n}
            spenta={n === 0}
            titolo={NOTE_CATEGORIA_TIMELINE[c]}
          >
            {ETICHETTE_CATEGORIA_TIMELINE[c]}
          </Chip>
        );
      })}
    </nav>
  );
}

function Chip({
  href,
  attiva,
  conta,
  spenta = false,
  titolo,
  children,
}: {
  href: string;
  attiva: boolean;
  conta: number;
  spenta?: boolean;
  titolo?: string;
  children: React.ReactNode;
}) {
  const contenuto = (
    <>
      {children}
      {conta > 0 ? (
        <span
          className={cx(
            "ml-1.5 text-[11px] tnum",
            attiva ? "text-brand-600" : "text-ink-300",
          )}
        >
          {conta}
        </span>
      ) : null}
    </>
  );

  if (spenta) {
    return (
      <span
        aria-disabled="true"
        title={titolo}
        className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink-300 ring-1 ring-bone-200/70"
      >
        {contenuto}
      </span>
    );
  }

  return (
    <NavLink
      href={href}
      aria-current={attiva ? "page" : undefined}
      title={titolo}
      className={cx(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
        attiva
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-ink-500 ring-1 ring-bone-200 hover:bg-bone-100 hover:text-ink-900",
      )}
    >
      {contenuto}
    </NavLink>
  );
}
