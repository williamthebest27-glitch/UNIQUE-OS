import type { Metadata } from "next";
import { getScoreCompleto } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { ricalcolaPunteggio } from "@/lib/brain/actions";
import { PILLAR_WEIGHTS, type PillarKey } from "@/lib/score/pillars";
import { formatDelta, formatPercent, formatShortDate } from "@/lib/format";
import { ScoreHero } from "@/components/patient/score-hero";
import { Grafico } from "@/components/patient/grafico";
import { Niente, Riquadro, Verbo } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Longevity Score" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il Longevity Score, con dentro il perché.
 *
 * Un numero che passa da 74 a 78 senza dire cosa l'ha mosso è un numero
 * di cui fidarsi o non fidarsi, e in clinica «fidarsi» non è una
 * categoria utile. Per questo la pagina è costruita al contrario di come
 * verrebbe: prima la figura e il numero, poi **subito** i fattori che
 * l'hanno cambiato, e solo dopo il dettaglio dei pilastri.
 *
 * I pesi dei pilastri sono in pagina, non nascosti nel codice. Sono
 * provvisori e da confermare dal team medico — dichiararlo dove il
 * punteggio si legge è l'unico modo perché quella conferma prima o poi
 * arrivi.
 */
export default async function ScorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getScoreCompleto(id);

  traccia({ azione: "score.view", entita: "score", patientId: id });

  if (!s) {
    return (
      <Card>
        <EmptyState>Non è stato possibile leggere il punteggio.</EmptyState>
      </Card>
    );
  }

  const delta = s.score !== null && s.precedente !== null ? s.score - s.precedente : null;

  const forti = [...s.pilastri]
    .filter((p) => p.valore !== null)
    .sort((a, b) => (b.valore ?? 0) - (a.valore ?? 0));
  const critici = [...forti].reverse();

  return (
    <div className="space-y-6">
      {/* ── La Signature ─────────────────────────────────────── */}
      <ScoreHero score={s.perHero} history={s.storicoPerHero} seed={id} />

      {/* ── I fattori ────────────────────────────────────────── */}
      <Riquadro
        titolo="Cosa ha mosso il punteggio"
        conta={s.fattori.length}
        nota="Le metriche che sono cambiate fra le ultime due rilevazioni, dalla più influente. La direzione la decide la curva di normalizzazione, non il segno del valore grezzo."
      >
        {s.fattori.length === 0 ? (
          <Niente>
            Nessuna metrica è cambiata in modo apprezzabile fra le ultime due
            rilevazioni — o non ce ne sono ancora due da confrontare.
          </Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {s.fattori.slice(0, 10).map((v) => {
              const migliorato = v.direzione === "migliorato";
              return (
                <li
                  key={v.code}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink-900">{v.label}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {v.precedente !== null ? (
                        <>
                          <span className="tnum">
                            {v.precedente.toLocaleString("it-IT", {
                              maximumFractionDigits: 2,
                            })}
                          </span>{" "}
                          <span aria-hidden="true" className="text-ink-300">
                            →
                          </span>{" "}
                        </>
                      ) : null}
                      <span className="tnum text-ink-900">
                        {v.attuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                        {v.unit ? ` ${v.unit}` : ""}
                      </span>
                      {v.precedenteIl ? (
                        <span className="ml-2 text-xs text-ink-300 tnum">
                          {formatShortDate(v.precedenteIl)} →{" "}
                          {formatShortDate(v.attualeIl)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {v.fuoriSoglia ? <Badge tone="attention">Soglia clinica</Badge> : null}
                    <span
                      className={cx(
                        "text-[15px] font-medium tnum",
                        migliorato ? "text-signal-positive" : "text-signal-alert",
                      )}
                    >
                      {v.deltaPunteggio !== null ? formatDelta(v.deltaPunteggio) : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Riquadro>

      {/* ── Andamento ────────────────────────────────────────── */}
      <Riquadro
        titolo="Andamento"
        nota={
          s.giorniDaUltimo !== null
            ? `Ultimo calcolo ${s.giorniDaUltimo} giorni fa.`
            : "Nessun punteggio ancora calcolato."
        }
        azione={
          delta !== null ? (
            <span
              className={cx(
                "text-sm font-medium tnum",
                delta > 0
                  ? "text-signal-positive"
                  : delta < 0
                    ? "text-signal-alert"
                    : "text-ink-300",
              )}
            >
              {formatDelta(Math.round(delta * 10) / 10)} dal precedente
            </span>
          ) : null
        }
      >
        <div className="px-6 pb-5 pt-3">
          {s.storico.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-300">
              Nessuna rilevazione da mostrare.
            </p>
          ) : (
            <Grafico
              punti={s.storico.map((p) => ({ data: p.misuratoIl, valore: p.score }))}
              salireEMeglio
              etichetta="Andamento del Longevity Score"
              altezza={140}
            />
          )}

          {s.storico.length > 1 ? (
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-bone-200 pt-4">
              {[...s.storico].reverse().slice(0, 6).map((p) => (
                <li key={p.misuratoIl} className="text-sm">
                  <span className="font-display text-[18px] text-ink-900 tnum">
                    {Math.round(p.score)}
                  </span>
                  <span className="ml-1.5 text-xs text-ink-400 tnum">
                    {formatShortDate(p.misuratoIl)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Riquadro>

      {/* ── Forza e criticità ────────────────────────────────── */}
      {forti.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Riquadro titolo="Aree di forza" nota="I pilastri più alti dell’ultimo calcolo.">
            <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
              {forti.slice(0, 3).map((p) => (
                <RigaPilastro key={p.chiave} pilastro={p} />
              ))}
            </ul>
          </Riquadro>

          <Riquadro titolo="Aree critiche" nota="I pilastri più bassi dell’ultimo calcolo.">
            <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
              {critici.slice(0, 3).map((p) => (
                <RigaPilastro key={p.chiave} pilastro={p} />
              ))}
            </ul>
          </Riquadro>
        </div>
      ) : null}

      {/* ── I sette pilastri, con le loro metriche ───────────── */}
      <Riquadro
        titolo="I sette pilastri"
        nota="Ogni pilastro con le metriche che lo compongono, il loro ultimo valore e la direzione."
        conta={s.pilastri.length}
      >
        {s.pilastri.length === 0 ? (
          <Niente>
            I pilastri compaiono dopo il primo calcolo del punteggio, che avviene
            appena ci sono misure approvate a sufficienza.
          </Niente>
        ) : (
          <div className="divide-y divide-bone-200/80">
            {s.pilastri.map((p) => (
              <details key={p.chiave} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-6 py-3.5 transition-colors hover:bg-bone-50 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className="text-ink-300 transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink-900">
                      {p.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-400">
                      peso {formatPercent(PILLAR_WEIGHTS[p.chiave as PillarKey] ?? 0)}
                      {p.copertura !== null && p.copertura < 0.999
                        ? ` · dati al ${Math.round(p.copertura * 100)}%`
                        : ""}
                      {` · ${p.metriche.length} ${p.metriche.length === 1 ? "metrica" : "metriche"}`}
                    </span>
                  </span>

                  {p.delta !== null ? (
                    <span
                      className={cx(
                        "shrink-0 text-sm font-medium tnum",
                        p.delta > 0
                          ? "text-signal-positive"
                          : p.delta < 0
                            ? "text-signal-alert"
                            : "text-ink-300",
                      )}
                    >
                      {formatDelta(p.delta)}
                    </span>
                  ) : null}

                  <span
                    className={cx(
                      "w-14 shrink-0 text-right font-display text-[24px] leading-none tnum",
                      p.valore === null ? "text-ink-300" : "text-ink-900",
                    )}
                  >
                    {p.valore === null ? "—" : Math.round(p.valore)}
                  </span>
                </summary>

                <div className="bg-bone-50/60 px-6 py-3">
                  {p.valore === null ? (
                    <p className="text-sm text-signal-attention">
                      Non calcolabile: mancano le misure che lo compongono.
                    </p>
                  ) : null}

                  {p.metriche.length === 0 ? (
                    <p className="text-sm text-ink-400">
                      Nessuna misura per le metriche di questo pilastro.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {p.metriche.map((m) => (
                        <li
                          key={m.codice}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm"
                        >
                          <span className="text-ink-700">{m.label}</span>
                          <span className="flex items-baseline gap-2">
                            {m.fuoriSoglia ? (
                              <span className="text-xs text-signal-attention">
                                fuori soglia
                              </span>
                            ) : null}
                            {m.deltaPunteggio !== null && m.direzione !== "stabile" ? (
                              <span
                                className={cx(
                                  "text-xs tnum",
                                  m.direzione === "migliorato"
                                    ? "text-signal-positive"
                                    : "text-signal-alert",
                                )}
                              >
                                {formatDelta(m.deltaPunteggio)}
                              </span>
                            ) : null}
                            <span className="tnum text-ink-900">
                              {m.valore === null
                                ? "—"
                                : m.valore.toLocaleString("it-IT", {
                                    maximumFractionDigits: 2,
                                  })}
                              {m.unita ? ` ${m.unita}` : ""}
                            </span>
                            {m.misurataIl ? (
                              <span className="text-xs text-ink-300 tnum">
                                {formatShortDate(m.misurataIl)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Riquadro>

      {/* ── Ricalcolo e avvertenza ───────────────────────────── */}
      <Riquadro
        titolo="Come è calcolato"
        apribile
        aperto={false}
        nota="Il punteggio non viene mai inserito: si calcola dalle misure approvate."
      >
        <div className="space-y-4 px-6 py-4 text-sm leading-relaxed text-ink-600">
          <p>
            Sette pilastri, una trentina di parametri da undici fonti, curve di
            normalizzazione e copertura dei dati dichiarata. Il punteggio si
            ricalcola da solo a ogni misura approvata; il pulsante qui sotto serve
            dopo un caricamento massivo o un cambio di formula.
          </p>

          <div className="rounded-xl bg-[#fdf6e8] px-4 py-3 ring-1 ring-[#f0e0bd]">
            <p className="text-signal-attention">
              I pesi dei pilastri e le curve di normalizzazione sono una struttura
              di lavoro, <strong className="font-medium">non un algoritmo validato clinicamente</strong>.
              Vanno confermati dal team medico. Il campo <code className="font-mono text-xs">computed_by</code>{" "}
              registra la versione usata, così un cambio di formula non si confonde
              mai con un miglioramento del paziente.
            </p>
          </div>

          <ul className="grid gap-1.5 sm:grid-cols-2">
            {Object.entries(PILLAR_WEIGHTS).map(([chiave, peso]) => (
              <li key={chiave} className="flex justify-between gap-4 text-ink-500">
                <span>{s.pilastri.find((p) => p.chiave === chiave)?.label ?? chiave}</span>
                <span className="tnum">{formatPercent(peso)}</span>
              </li>
            ))}
          </ul>

          <form action={ricalcolaPunteggio}>
            <input type="hidden" name="patientId" value={id} />
            <Verbo type="submit">Ricalcola il punteggio</Verbo>
          </form>
        </div>
      </Riquadro>
    </div>
  );
}

function RigaPilastro({
  pilastro,
}: {
  pilastro: { chiave: string; label: string; valore: number | null; delta: number | null };
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 px-6 py-3">
      <span className="text-[15px] text-ink-900">{pilastro.label}</span>
      <span className="flex items-baseline gap-3">
        {pilastro.delta !== null && pilastro.delta !== 0 ? (
          <span
            className={cx(
              "text-xs tnum",
              pilastro.delta > 0 ? "text-signal-positive" : "text-signal-alert",
            )}
          >
            {formatDelta(pilastro.delta)}
          </span>
        ) : null}
        <span className="font-display text-[20px] text-ink-900 tnum">
          {pilastro.valore === null ? "—" : Math.round(pilastro.valore)}
        </span>
      </span>
    </li>
  );
}
