import type { CSSProperties } from "react";
import type { LongevityScore, ScorePoint } from "@/lib/domain/types";
import { formatDelta, formatMonthYear, formatShortDate } from "@/lib/format";
import { Card, cx } from "@/components/ui/primitives";
import { Signature } from "@/components/patient/signature";

/* ── Ripiego: l'anello, su fondo scuro ────────────────────────────── */

const RING_RADIUS = 84;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingFallback({ score }: { score: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - Math.min(Math.max(score, 0), 100) / 100);
  const ringStyle = {
    "--ring-circumference": `${RING_CIRCUMFERENCE}`,
    "--ring-offset": `${offset}`,
    strokeDasharray: RING_CIRCUMFERENCE,
    strokeDashoffset: offset,
  } as CSSProperties;

  return (
    <div className="flex h-full w-full items-center justify-end pr-[10%]">
      <svg viewBox="0 0 200 200" className="h-[260px] w-[260px] opacity-90">
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-jade-500)" />
            <stop offset="100%" stopColor="var(--color-lume-500)" />
          </linearGradient>
        </defs>
        <g transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="10" />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="url(#score-gradient)"
            strokeWidth="10"
            strokeLinecap="round"
            className="animate-score-draw"
            style={ringStyle}
          />
        </g>
      </svg>
    </div>
  );
}

/* ── Andamento, su fondo scuro ────────────────────────────────────── */

function ScoreSparkline({ history }: { history: ScorePoint[] }) {
  if (history.length < 2) return null;

  const width = 260;
  const top = 10;
  const bottom = 62;
  const values = history.map((p) => p.score);
  // Scala sui dati, non su 0–100: altrimenti quattro punti di crescita
  // diventano una linea piatta e il progresso non si vede.
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;

  const points = history.map((point, i) => ({
    x: (i / (history.length - 1)) * width,
    y: bottom - ((point.score - min) / (max - min)) * (bottom - top),
    ...point,
  }));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},72 L0,72 Z`;
  const last = points[points.length - 1];

  return (
    <figure className="mt-7 max-w-[300px]">
      <figcaption className="sr-only">
        Andamento dell’Unique Longevity Score nelle ultime {history.length} rilevazioni
      </figcaption>
      <svg viewBox="0 0 260 72" className="h-auto w-full" role="img">
        <defs>
          <linearGradient id="spark-fill-dark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-lume-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-lume-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill-dark)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-lume-300)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r="4.5" fill="var(--color-ink-900)" />
        <circle cx={last.x} cy={last.y} r="3" fill="var(--color-lume-300)" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-bone-50/40 tnum">
        <span>{formatMonthYear(history[0].measuredOn)}</span>
        <span>{formatMonthYear(last.measuredOn)}</span>
      </div>
    </figure>
  );
}

/* ── Pilastri ─────────────────────────────────────────────────────── */

function PillarBar({
  label,
  value,
  coverage,
  delta,
  index,
}: {
  label: string;
  value: number | null;
  coverage: number | null;
  delta: number | null;
  index: number;
}) {
  // Un pilastro senza dati sufficienti non vale zero: vale "non lo sappiamo
  // ancora". Mostrare uno zero sarebbe una bugia con l’aria di un dato.
  if (value === null) {
    return (
      <div data-reveal="" style={{ "--i": index } as CSSProperties}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-ink-700">{label}</span>
          <span className="text-[13px] font-semibold text-ink-300">—</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-bone-200" />
        <span className="mt-1.5 inline-block text-[11px] text-ink-400">
          Servono più dati per calcolarlo
        </span>
      </div>
    );
  }

  return (
    <div data-reveal="" style={{ "--i": index } as CSSProperties}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink-700">{label}</span>
        <span className="font-display text-[17px] font-medium text-ink-900 tnum">
          {Math.round(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bone-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-jade-600 to-jade-400 transition-[width] duration-[1.4s] ease-[var(--ease-out-expo)]"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[11px]">
        {delta !== null ? (
          <span
            className={cx(
              "font-medium tnum",
              delta > 0 ? "text-jade-600" : delta < 0 ? "text-signal-alert" : "text-ink-300",
            )}
          >
            {formatDelta(delta)} dal controllo precedente
          </span>
        ) : null}
        {coverage !== null && coverage < 0.999 ? (
          <span className="text-ink-300 tnum">dati al {Math.round(coverage * 100)}%</span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Composizione ─────────────────────────────────────────────────── */

export function ScoreHero({
  score,
  history,
  seed,
}: {
  score: LongevityScore | null;
  history: ScorePoint[];
  /** Ciò che rende la figura personale: di solito l’id del paziente. */
  seed: string;
}) {
  // Un paziente appena preso in carico non ha ancora un punteggio. Meglio
  // dirgli quando arriverà che mostrargli uno zero.
  if (score === null) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <div className="mx-auto flex h-[132px] w-[132px] items-center justify-center rounded-full border-[13px] border-bone-200">
          <span className="font-display text-[38px] text-ink-300">—</span>
        </div>
        <h2 className="mt-7 font-display text-[26px] text-ink-900">
          La tua Signature arriva presto
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-500">
          Il punteggio viene calcolato dopo il primo pannello di esami. Da quel
          momento la vedrai qui: una figura unica, che cambia con la tua salute.
        </p>
      </Card>
    );
  }

  const delta = score.previousScore !== null ? score.score - score.previousScore : null;
  const pillars = score.pillars.map((p) => p.value);

  return (
    <Card className="overflow-hidden ring-0 shadow-lift">
      {/* ── La Signature ─────────────────────────────────────────── */}
      <div className="hero-dark min-h-[460px] sm:min-h-[520px]">
        <div className="hero-glow" />

        <div className="absolute inset-0">
          <Signature
            pillars={pillars}
            score={score.score}
            seed={seed}
            fallback={<RingFallback score={score.score} />}
          />
        </div>

        <div className="hero-veil" />

        <div className="relative z-10 flex h-full min-h-[460px] flex-col justify-between p-7 sm:min-h-[520px] sm:p-10">
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-bone-50/50">
            <span className="h-px w-8 bg-lume-500/70" />
            Unique Longevity Score
          </div>

          <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-14">
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="score-figure text-[116px] text-bone-50 tnum sm:text-[144px]"
                  data-reveal=""
                >
                  {Math.round(score.score)}
                </span>
                <span className="font-display text-[26px] text-bone-50/35">/100</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {delta !== null ? (
                  <span
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tnum",
                      "bg-white/10 ring-1 ring-white/10",
                      delta >= 0 ? "text-lume-300" : "text-gold-300",
                    )}
                  >
                    <svg
                      viewBox="0 0 10 10"
                      className={cx("h-2 w-2", delta < 0 && "rotate-180")}
                      aria-hidden="true"
                    >
                      <path d="M5 1.5 9 8H1z" fill="currentColor" />
                    </svg>
                    {formatDelta(delta)} punti
                  </span>
                ) : null}
                <span className="text-sm text-bone-50/45">
                  rilevato il {formatShortDate(score.measuredOn)}
                </span>
              </div>
            </div>

            <div className="max-w-[440px]">
              {score.summary ? (
                <p className="font-display text-[21px] leading-[1.3] text-bone-50/90 sm:text-[24px]">
                  {score.summary}
                </p>
              ) : null}

              {score.biologicalAge !== null ? (
                <p className="mt-4 text-sm text-bone-50/55">
                  Età biologica stimata{" "}
                  <strong className="font-display text-[19px] font-medium text-bone-50 tnum">
                    {score.biologicalAge.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                  </strong>{" "}
                  anni
                </p>
              ) : null}

              <ScoreSparkline history={history} />
            </div>
          </div>
        </div>
      </div>

      {/* ── I sette pilastri ─────────────────────────────────────── */}
      <div className="border-t border-bone-200 bg-bone-50/70 px-7 py-7 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
            I sette pilastri
          </h3>
          {score.coverage !== null ? (
            <span className="text-xs text-ink-400 tnum">
              calcolato sul {Math.round(score.coverage * 100)}% dei parametri previsti
            </span>
          ) : null}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {score.pillars.map((pillar, i) => (
            <PillarBar
              key={pillar.key}
              label={pillar.label}
              value={pillar.value}
              coverage={pillar.coverage}
              delta={pillar.delta}
              index={i}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
