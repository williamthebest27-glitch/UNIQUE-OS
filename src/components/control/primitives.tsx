import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * Elementi della control room.
 *
 * Su fondo scuro le regole cambiano: i bordi si fanno con l'opacità, non
 * con un grigio, e i numeri devono avere cifre tabulari o le colonne
 * ballano a ogni aggiornamento.
 */

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/45">
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 font-display text-[30px] leading-none tnum",
          tone === "good" ? "text-jade-300" : tone === "warn" ? "text-gold-300" : "text-bone-50",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-bone-50/40">{hint}</p> : null}
    </div>
  );
}

/** Striscia di indicatori, separati da una linea sottile. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-white/10 ring-1 ring-white/10 sm:grid-cols-4 [&>*]:bg-ink-900">
      {children}
    </div>
  );
}

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card bg-white/[0.04] ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-1">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-bone-50/70">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-xs text-bone-50/40">{hint}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Riga({
  label,
  sub,
  value,
  extra,
}: {
  label: string;
  sub?: string;
  value: string;
  extra?: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[15px] text-bone-50">{label}</p>
        {sub ? <p className="mt-0.5 text-xs text-bone-50/40">{sub}</p> : null}
      </div>
      <div className="text-right">
        <p className="text-[15px] text-bone-50 tnum">{value}</p>
        {extra ? <p className="mt-0.5 text-xs text-bone-50/40 tnum">{extra}</p> : null}
      </div>
    </li>
  );
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-bone-50/40">{children}</p>;
}

/** Barra di riempimento: verde fin quando c'è margine, ambra quando stringe. */
export function Barra({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cx(
          "h-full rounded-full",
          ratio >= 0.95 ? "bg-signal-alert" : ratio >= 0.8 ? "bg-gold-500" : "bg-jade-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
