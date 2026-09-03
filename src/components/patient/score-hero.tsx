import type { CSSProperties } from "react";
import type { LongevityScore, ScorePoint } from "@/lib/domain/types";
import { formatDelta, formatMonthYear, formatShortDate } from "@/lib/format";
import { Card, DeltaPill, cx } from "@/components/ui/primitives";

/* ── Anello dello Score ───────────────────────────────────────────── */

const RING_RADIUS = 84;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score }: { score: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - Math.min(Math.max(score, 0), 100) / 100);

  const ringStyle = {
    "--ring-circumference": `${RING_CIRCUMFERENCE}`,
    "--ring-offset": `${offset}`,
    strokeDasharray: RING_CIRCUMFERENCE,
    strokeDashoffset: offset,
  } as CSSProperties;

  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 200 200" className="h-[188px] w-[188px] sm:h-[212px] sm:w-[212px]">
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-jade-300)" />
            <stop offset="55%" stopColor="var(--color-jade-500)" />
            <stop offset="100%" stopColor="var(--color-jade-700)" />
          </linearGradient>
        </defs>

        {/* Il cerchio parte dalle 12 in punto, non da destra. */}
        <g transform="rotate(-90 100 100)">
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-bone-200)"
            strokeWidth="13"
          />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="url(#score-gradient)"
            strokeWidth="13"
            strokeLinecap="round"
            className="animate-score-draw"
            style={ringStyle}
          />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-0.5">
          <span className="font-display text-[62px] leading-none text-ink-900 tnum sm:text-[70px]">
            {Math.round(score)}
          </span>
          <span className="font-display text-xl text-ink-300">/100</span>
        </div>
        <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          Longevity Score
        </span>
      </div>
    </div>
  );
}

/* ── Andamento ────────────────────────────────────────────────────── */

function ScoreSparkline({ history }: { history: ScorePoint[] }) {
  if (history.length < 2) return null;

  const width = 260;
  const top = 10;
  const bottom = 66;
  const values = history.map((p) => p.score);
  // Scala sui dati, non su 0–100: altrimenti quattro punti di crescita
  // diventano una linea piatta e il progresso non si vede.
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;

  const points = history.map((point, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = bottom - ((point.score - min) / (max - min)) * (bottom - top);
    return { x, y, ...point };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},76 L0,76 Z`;
  const last = points[points.length - 1];

  return (
    <figure className="mt-6">
      <figcaption className="sr-only">
        Andamento dell’Unique Longevity Score nelle ultime {history.length} rilevazioni
      </figcaption>
      <svg viewBox="0 0 260 76" className="h-auto w-full" role="img">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-jade-500)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-jade-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-jade-600)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r="4.5" fill="white" />
        <circle cx={last.x} cy={last.y} r="3" fill="var(--color-jade-600)" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-300 tnum">
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
  delta,
}: {
  label: string;
  value: number;
  delta: number | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink-700">{label}</span>
        <span className="text-[13px] font-semibold text-ink-900 tnum">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bone-200">
        <div
          className="h-full rounded-full bg-jade-500"
          style={{ width: `${value}%` }}
        />
      </div>
      {delta !== null ? (
        <span
          className={cx(
            "mt-1.5 inline-block text-[11px] font-medium tnum",
            delta > 0 ? "text-jade-600" : delta < 0 ? "text-signal-alert" : "text-ink-300",
          )}
        >
          {formatDelta(delta)} dal controllo precedente
        </span>
      ) : null}
    </div>
  );
}

/* ── Composizione ─────────────────────────────────────────────────── */

export function ScoreHero({
  score,
  history,
}: {
  score: LongevityScore | null;
  history: ScorePoint[];
}) {
  // Un paziente appena preso in carico non ha ancora un punteggio. Meglio
  // dirgli quando arriverà che mostrargli uno zero.
  if (score === null) {
    return (
      <Card className="animate-rise-in p-8 text-center sm:p-12">
        <div className="mx-auto flex h-[132px] w-[132px] items-center justify-center rounded-full border-[13px] border-bone-200">
          <span className="font-display text-[38px] text-ink-300">—</span>
        </div>
        <h2 className="mt-7 font-display text-[24px] text-ink-900">
          Il tuo Longevity Score arriva presto
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-500">
          Il punteggio viene calcolato dopo il primo pannello di esami. Da quel
          momento lo vedrai qui, insieme al suo andamento nel tempo.
        </p>
      </Card>
    );
  }

  const delta =
    score.previousScore !== null ? score.score - score.previousScore : null;

  return (
    <Card className="animate-rise-in overflow-hidden">
      <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex justify-center lg:justify-start">
          <ScoreRing score={score.score} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {delta !== null ? (
              <DeltaPill
                text={`${formatDelta(delta)} punti`}
                direction={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
                isImprovement={delta >= 0}
              />
            ) : null}
            <span className="text-sm text-ink-400">
              rilevato il {formatShortDate(score.measuredOn)}
            </span>
          </div>

          {score.summary ? (
            <p className="mt-4 font-display text-[19px] leading-snug text-ink-800 sm:text-[21px]">
              {score.summary}
            </p>
          ) : null}

          {score.biologicalAge !== null ? (
            <p className="mt-4 text-sm text-ink-500">
              Età biologica stimata{" "}
              <strong className="font-semibold text-ink-900 tnum">
                {score.biologicalAge.toLocaleString("it-IT", {
                  maximumFractionDigits: 1,
                })}
              </strong>{" "}
              anni
            </p>
          ) : null}

          <ScoreSparkline history={history} />
        </div>
      </div>

      <div className="border-t border-bone-200 bg-bone-50/60 px-6 py-6 sm:px-8">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
          I sei pilastri
        </h3>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {score.pillars.map((pillar) => (
            <PillarBar
              key={pillar.key}
              label={pillar.label}
              value={pillar.value}
              delta={pillar.delta}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
