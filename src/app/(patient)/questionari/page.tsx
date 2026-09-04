import type { Metadata } from "next";
import Link from "next/link";
import { requirePatientDashboard } from "@/lib/data/patient";
import { questionari } from "@/lib/data/paziente-sezioni";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, ChevronIcon, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Questionari" };
export const dynamic = "force-dynamic";

/**
 * I questionari.
 *
 * Prima quelli da fare, poi quelli fatti. Sopra ogni riga il tempo che
 * serve davvero — quattro minuti, sei minuti — perché la ragione più
 * comune per cui un questionario resta a metà è che chi lo apre non sa
 * quanto durerà.
 */

const SEZIONE = sezioneDi("/questionari")!;

export default async function QuestionariPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const elenco = await questionari();
  const daFare = elenco.filter((q) => q.stato !== "completed");
  const fatti = elenco.filter((q) => q.stato === "completed");

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <Card>
        <CardHeader
          title="Da completare"
          action={daFare.length > 0 ? <Badge tone="brand">{daFare.length}</Badge> : undefined}
        />
        {daFare.length === 0 ? (
          <EmptyState>
            Nessun questionario in sospeso. Quando il team clinico te ne assegna uno, lo trovi qui.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80 pb-2">
            {daFare.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/questionari/${q.id}`}
                  className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="text-[15px] font-medium text-ink-900">{q.titolo}</h3>
                      {q.stato === "in_progress" ? <Badge tone="brand">A metà</Badge> : null}
                    </div>
                    {q.descrizione ? (
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">{q.descrizione}</p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                      <span>circa {q.minutiStimati} minuti</span>
                      {q.scadeIl ? (
                        <span
                          className={cx(
                            "tnum",
                            new Date(q.scadeIl) < new Date() ? "text-signal-alert" : undefined,
                          )}
                        >
                          entro il {formatShortDate(q.scadeIl)} · {formatRelativeDays(q.scadeIl)}
                        </span>
                      ) : null}
                    </div>

                    {q.progressoPct > 0 ? (
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bone-200">
                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{ width: `${q.progressoPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-400 tnum">
                          {Math.round(q.progressoPct)}%
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Già consegnati" />
        {fatti.length === 0 ? (
          <EmptyState>Nessun questionario consegnato finora.</EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80 pb-2">
            {fatti.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/questionari/${q.id}`}
                  className="group flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-bone-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-ink-900">{q.titolo}</span>
                    {q.completatoIl ? (
                      <span className="mt-0.5 block text-xs text-ink-400 tnum">
                        consegnato il {formatShortDate(q.completatoIl)}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone="positive">Consegnato</Badge>
                  <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Le tue risposte le legge il team clinico e concorrono al tuo punteggio solo
        dopo che un professionista le ha validate. Nessuna risposta diventa una
        misura da sola.
      </p>
    </div>
  );
}
