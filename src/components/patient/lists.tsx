import Link from "next/link";
import type {
  ActionSource,
  DocumentKind,
  PatientDocument,
  ProgressHighlight,
  RecommendedAction,
} from "@/lib/domain/types";
import { formatFileSize, formatRelativeDays, formatShortDate } from "@/lib/format";
import {
  Badge,
  Card,
  CardHeader,
  ChevronIcon,
  DeltaPill,
  DocumentIcon,
  EmptyState,
  SparkIcon,
  cx,
} from "@/components/ui/primitives";

/* ── Azioni consigliate ───────────────────────────────────────────── */

const SOURCE_LABEL: Record<ActionSource, string> = {
  professional: "Dal tuo medico",
  protocol: "Dal protocollo",
  brain: "Unique Brain",
};

const PRIORITY_TONE: Record<1 | 2 | 3, string> = {
  1: "bg-signal-attention",
  2: "bg-brand-500",
  3: "bg-bone-300",
};

function ActionRow({ action }: { action: RecommendedAction }) {
  const isDone = action.status === "done";

  return (
    <li>
      {/*
        Anche questa riga prometteva un'apertura che non c'era: freccia,
        fondo che si schiarisce, freccia che scorre. Le azioni non hanno
        una pagina propria — le apre e le chiude la clinica, non il
        paziente — ma vivono tutte in Piano, raggruppate per pilastro, ed
        è lì che si va a vederle per intero.
      */}
      <Link
        href="/piano"
        className="group relative flex gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
      >
        {/* La priorità è un filo verticale, non un badge: informa senza
            competere con il titolo. */}
        <span
          className={cx("mt-1.5 w-0.5 shrink-0 rounded-full", PRIORITY_TONE[action.priority])}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={cx(
                "text-[15px] font-medium leading-snug",
                isDone ? "text-ink-400 line-through" : "text-ink-900",
              )}
            >
              {action.title}
            </h3>
            <ChevronIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
          </div>

          {action.description ? (
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              {action.description}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge tone={action.source === "brain" ? "brand" : "neutral"}>
              {SOURCE_LABEL[action.source]}
            </Badge>
            {action.status === "in_progress" ? <Badge tone="brand">In corso</Badge> : null}
            {action.dueOn ? (
              <span className="text-xs text-ink-400">
                entro il {formatShortDate(action.dueOn)} · {formatRelativeDays(action.dueOn)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function ActionsCard({ actions }: { actions: RecommendedAction[] }) {
  const open = actions.filter((a) => a.status !== "dismissed" && a.status !== "done");

  return (
    <Card>
      <CardHeader
        title="Azioni consigliate"
        hint="Le leve che spostano di più il tuo punteggio in questo momento."
      />
      {open.length === 0 ? (
        <EmptyState>Nessuna azione in sospeso. Continua così.</EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
          {open.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Documenti ────────────────────────────────────────────────────── */

const KIND_LABEL: Record<DocumentKind, string> = {
  lab_report: "Esame di laboratorio",
  imaging: "Diagnostica per immagini",
  prescription: "Prescrizione",
  consent: "Consenso",
  care_plan: "Piano di cura",
  invoice: "Fattura",
  other: "Documento",
};

export function DocumentsCard({ documents }: { documents: PatientDocument[] }) {
  const unreadCount = documents.filter((d) => d.isNewForPatient).length;

  return (
    <Card>
      <CardHeader
        title="Documenti e risultati"
        action={unreadCount > 0 ? <Badge tone="brand">{unreadCount} nuovi</Badge> : undefined}
      />
      {documents.length === 0 ? (
        <EmptyState>
          Qui troverai referti, esami e piani di cura appena vengono caricati.
        </EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              {/*
                La riga è un collegamento, e fino a poco fa non lo era.
                Aveva la freccia, il fondo che si schiarisce al passaggio
                e la freccia che scorre di due pixel: tutte le promesse
                di un elemento che si apre, e sotto non c'era niente. Un
                paziente che tocca il proprio referto e non vede
                succedere niente conclude — ragionevolmente — che
                l'applicazione è rotta.
              */}
              <Link
                href={`/documenti/${doc.id}`}
                className="group flex items-start gap-3.5 px-6 py-4 transition-colors hover:bg-bone-50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bone-100 text-ink-500">
                  <DocumentIcon className="h-4.5 w-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <h3 className="text-[15px] font-medium leading-snug text-ink-900">
                      {doc.title}
                    </h3>
                    {doc.isNewForPatient ? (
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                        aria-label="Non ancora aperto"
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {KIND_LABEL[doc.kind]}
                    {doc.issuedOn ? ` · ${formatShortDate(doc.issuedOn)}` : ""}
                    {doc.sizeBytes ? ` · ${formatFileSize(doc.sizeBytes)}` : ""}
                  </p>
                </div>

                <ChevronIcon className="mt-2 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Messaggi ─────────────────────────────────────────────────────── */

/**
 * Le conversazioni con la clinica, sulla home.
 *
 * Sostituisce una `NotificationsCard` che era stata scritta, mai usata
 * da nessuna pagina, e intitolata «Messaggi» pur mostrando notifiche —
 * che sono un'altra cosa e hanno già la loro sezione. Le sue righe, per
 * giunta, non portavano da nessuna parte.
 *
 * Questa mostra i fili veri e ognuno si apre. La risposta del proprio
 * medico è ciò che un paziente torna a controllare più spesso: non
 * averla sulla home significava obbligarlo a cercarla nel menu ogni
 * volta.
 */
export interface FiloInHome {
  id: string;
  oggetto: string;
  anteprima: string | null;
  ultimoMessaggioIl: string;
  nonLetti: number;
}

export function MessagesCard({ fili }: { fili: FiloInHome[] }) {
  const daLeggere = fili.reduce((s, f) => s + f.nonLetti, 0);

  return (
    <Card>
      <CardHeader
        title="Messaggi"
        action={daLeggere > 0 ? <Badge tone="brand">{daLeggere} da leggere</Badge> : undefined}
      />
      {fili.length === 0 ? (
        <EmptyState>
          Nessuna conversazione. Puoi scrivere alla clinica dalla sezione Messaggi.
        </EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
          {fili.map((filo) => (
            <li key={filo.id}>
              <Link
                href={`/messaggi/${filo.id}`}
                className="group flex items-start gap-3 px-6 py-4 transition-colors hover:bg-bone-50"
              >
                <span
                  className={cx(
                    "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                    filo.nonLetti > 0 ? "bg-brand-500" : "bg-bone-300",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <h3
                    className={cx(
                      "text-[15px] leading-snug text-ink-900",
                      filo.nonLetti > 0 ? "font-semibold" : "font-medium",
                    )}
                  >
                    {filo.oggetto}
                  </h3>
                  {filo.anteprima ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-500">
                      {filo.anteprima}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-ink-400 first-letter:uppercase">
                    {formatRelativeDays(filo.ultimoMessaggioIl)}
                  </p>
                </div>
                <ChevronIcon className="mt-1.5 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Progressi ottenuti ───────────────────────────────────────────── */

export function HighlightsCard({ highlights }: { highlights: ProgressHighlight[] }) {
  if (highlights.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Progressi ottenuti"
        hint="Da quando hai iniziato il percorso."
        action={<SparkIcon className="h-4 w-4 text-gold-500" />}
      />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-card bg-bone-200/70 lg:grid-cols-4">
        {highlights.map((item) => (
          <div key={item.id} className="bg-white px-6 py-5">
            <dt className="text-[13px] text-ink-500">{item.label}</dt>
            <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-[26px] leading-none text-ink-900 tnum">
                {item.value}
              </span>
              {item.change ? (
                <DeltaPill
                  text={item.change}
                  direction={item.direction}
                  isImprovement={item.isImprovement}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
