import type { Metadata } from "next";
import Link from "next/link";
import { requirePatientDashboard } from "@/lib/data/patient";
import { letture } from "@/lib/data/paziente-sezioni";
import { componiRisultati } from "@/lib/patient/risultati";
import { FINESTRE, inFinestra, variazione, type FinestraId } from "@/lib/patient/andamento";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { Grafico } from "@/components/patient/grafico";
import { HighlightsCard } from "@/components/patient/lists";
import { sezioneDi } from "@/lib/patient/sezioni";
import { Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Progressi" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * I progressi.
 *
 * La finestra temporale sta nell'URL e non nello stato di un componente:
 * così un periodo si può condividere, tornare indietro funziona, e la
 * pagina resta interamente server-side — nessun JavaScript per cambiare
 * un grafico che il server sa già disegnare.
 *
 * Si mostrano solo i parametri con almeno due misure. Uno solo non è un
 * progresso, ed è più onesto non disegnarlo che disegnare un punto e
 * lasciar credere a una linea.
 */

const SEZIONE = sezioneDi("/progressi")!;

export default async function ProgressiPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const { periodo } = await searchParams;
  // Un anno di default, non tre mesi: in una clinica di longevità i
  // pannelli sono trimestrali, e una finestra di novanta giorni mostrerebbe
  // quasi sempre una sola rilevazione — cioè nessun andamento.
  const scelta = (FINESTRE.find((f) => f.id === periodo)?.id ?? "1a") as FinestraId;
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

  const gruppi = componiRisultati(await letture());

  const punteggio = inFinestra(
    data.scoreHistory.map((p) => ({ data: p.measuredOn, valore: p.score })),
    scelta,
    oggi,
  );

  const serie = gruppi
    .flatMap((g) => g.righe)
    .map((riga) => ({ riga, punti: inFinestra(riga.storico, scelta, oggi) }))
    .filter((s) => s.punti.length >= 2);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      {/* ── Il periodo ───────────────────────────────────────────── */}
      <nav aria-label="Periodo" className="flex flex-wrap gap-1.5">
        {FINESTRE.map((finestra) => (
          <Link
            key={finestra.id}
            href={`/progressi?periodo=${finestra.id}`}
            scroll={false}
            aria-current={finestra.id === scelta ? "page" : undefined}
            className={cx(
              "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
              finestra.id === scelta
                ? "bg-ink-900 text-bone-50"
                : "bg-bone-100 text-ink-500 hover:bg-bone-200 hover:text-ink-900",
            )}
          >
            {finestra.etichetta}
          </Link>
        ))}
      </nav>

      {/* ── Il punteggio ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Unique Longevity Score"
          hint={
            punteggio.length < 2
              ? "Servono due rilevazioni nel periodo scelto."
              : (() => {
                  const v = variazione(punteggio, true);
                  return v
                    ? `Da ${Math.round(v.primo)} a ${Math.round(v.ultimo)} punti in questo periodo.`
                    : undefined;
                })()
          }
        />
        <div className="px-6 pb-6 pt-2">
          {punteggio.length < 2 ? (
            <EmptyState>
              Prova ad allargare il periodo: la linea compare quando ci sono almeno due
              rilevazioni.
            </EmptyState>
          ) : (
            <Grafico
              punti={punteggio}
              altezza={160}
              etichetta={`Andamento del punteggio, ${punteggio.length} rilevazioni`}
            />
          )}
        </div>
      </Card>

      <HighlightsCard highlights={data.highlights} />

      {/* ── I parametri ──────────────────────────────────────────── */}
      {serie.length === 0 ? (
        <Card>
          <CardHeader title="Parametri" />
          <EmptyState>
            Nessun parametro con almeno due misure in questo periodo. Prova ad allargarlo.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="I tuoi parametri"
            hint={`${serie.length} con almeno due misure nel periodo scelto.`}
          />
          <div className="grid gap-px overflow-hidden bg-bone-200/70 sm:grid-cols-2">
            {serie.map(({ riga, punti }) => {
              const v = variazione(punti, riga.miglioramento !== false);
              return (
                <div key={riga.code} className="bg-white px-6 py-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[14px] font-medium text-ink-900">{riga.label}</h3>
                    {v ? (
                      <span
                        className={cx(
                          "text-[13px] font-medium tnum",
                          riga.miglioramento === true
                            ? "text-signal-positive"
                            : riga.miglioramento === false
                              ? "text-signal-attention"
                              : "text-ink-400",
                        )}
                      >
                        {v.delta > 0 ? "+" : "−"}
                        {Math.abs(v.delta).toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                        {riga.unit ? ` ${riga.unit}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <Grafico
                    punti={punti}
                    altezza={72}
                    riferimento={riga.riferimento}
                    salireEMeglio={riga.miglioramento !== false}
                    etichetta={`Andamento di ${riga.label}`}
                    className="mt-3"
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Il verso della freccia non è il segno del numero: che una variazione sia un
        miglioramento lo decide la curva di quel parametro, la stessa che alimenta
        il tuo punteggio. La glicata che scende migliora; la massa muscolare che
        scende no.
      </p>
    </div>
  );
}
