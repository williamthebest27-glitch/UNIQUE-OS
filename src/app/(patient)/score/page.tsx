import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { ScoreHero } from "@/components/patient/score-hero";
import { Grafico } from "@/components/patient/grafico";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatDelta, formatShortDate } from "@/lib/format";
import { Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Longevity Score" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Il punteggio, per esteso.
 *
 * La home mostra il numero; qui si spiega da dove viene. Ogni pilastro
 * porta con sé tre cose che di solito mancano: quanto vale, di quanto si
 * è mosso, e **su quanti dei dati previsti è calcolato**. L'ultima è la
 * più importante: un pilastro all'ottanta per cento calcolato sul
 * quaranta per cento dei parametri non è un pilastro all'ottanta per
 * cento, ed è disonesto presentarlo come tale.
 */

const SEZIONE = sezioneDi("/score")!;

export default async function ScorePage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const { score, scoreHistory } = data;
  const incompleti = score?.pillars.filter((p) => p.value === null) ?? [];

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <ScoreHero score={score} history={scoreHistory} seed={data.profile.id} />

      {score === null ? null : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── L'andamento ──────────────────────────────────────── */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Come si è mosso"
              hint={
                scoreHistory.length < 2
                  ? "Serve una seconda rilevazione per disegnare un andamento."
                  : `${scoreHistory.length} rilevazioni, dalla prima a oggi.`
              }
            />
            <div className="px-6 pb-6 pt-2">
              {scoreHistory.length < 2 ? (
                <EmptyState>
                  Il primo punteggio è il punto di partenza. La linea compare dal secondo controllo.
                </EmptyState>
              ) : (
                <Grafico
                  punti={scoreHistory.map((p) => ({ data: p.measuredOn, valore: p.score }))}
                  altezza={150}
                  etichetta={`Andamento dell'Unique Longevity Score su ${scoreHistory.length} rilevazioni`}
                />
              )}
            </div>
          </Card>

          {/* ── Cosa manca ───────────────────────────────────────── */}
          <Card>
            <CardHeader
              title="Copertura dei dati"
              hint="Su quanta parte dei parametri previsti è calcolato."
            />
            <div className="px-6 pb-6 pt-3">
              {score.coverage !== null ? (
                <>
                  <p className="font-display text-[36px] leading-none text-ink-900 tnum">
                    {Math.round(score.coverage * 100)}%
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-bone-200">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${score.coverage * 100}%` }}
                    />
                  </div>
                </>
              ) : null}

              <p className="mt-4 text-sm leading-relaxed text-ink-500">
                {incompleti.length === 0
                  ? "Tutti i pilastri hanno dati sufficienti per essere calcolati."
                  : `Non calcolabili per dati mancanti: ${incompleti.map((p) => p.label).join(", ")}. Il punteggio complessivo resta parziale finché mancano.`}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── I pilastri, uno per uno ──────────────────────────────── */}
      {score === null ? null : (
        <Card>
          <CardHeader
            title="I sette pilastri"
            hint={`Rilevati il ${formatShortDate(score.measuredOn)}.`}
          />
          <ul className="divide-y divide-bone-200/80 pb-2">
            {score.pillars.map((pilastro) => (
              <li key={pilastro.key} className="px-6 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[16px] font-medium text-ink-900">{pilastro.label}</h3>
                  <span className="font-display text-[26px] leading-none text-ink-900 tnum">
                    {pilastro.value === null ? (
                      <span className="text-[18px] text-ink-300">Non calcolabile</span>
                    ) : (
                      Math.round(pilastro.value)
                    )}
                  </span>
                </div>

                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bone-200">
                  {pilastro.value === null ? null : (
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-500 transition-[width] duration-[1.4s] ease-[var(--ease-out-expo)]"
                      style={{ width: `${pilastro.value}%` }}
                    />
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-[13px]">
                  {pilastro.delta !== null ? (
                    <span
                      className={cx(
                        "font-medium tnum",
                        pilastro.delta > 0
                          ? "text-signal-positive"
                          : pilastro.delta < 0
                            ? "text-signal-alert"
                            : "text-ink-300",
                      )}
                    >
                      {formatDelta(pilastro.delta)} dal controllo precedente
                    </span>
                  ) : null}
                  {pilastro.coverage !== null && pilastro.coverage < 0.999 ? (
                    <span className="text-ink-400 tnum">
                      calcolato sul {Math.round(pilastro.coverage * 100)}% dei parametri
                    </span>
                  ) : null}
                  {pilastro.value === null ? (
                    <span className="text-ink-400">
                      Servono più dati. Li raccogliamo alla prossima visita.
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        L&apos;Unique Longevity Score è uno strumento di percorso, non una
        diagnosi. Pesi e curve sono in validazione con il team medico, e la
        versione dell&apos;algoritmo è registrata su ogni rilevazione: un cambio
        di formula non si confonde mai con un tuo miglioramento.
      </p>
    </div>
  );
}
