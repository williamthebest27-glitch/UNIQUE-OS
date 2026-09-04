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
          tone === "good" ? "text-brand-300" : tone === "warn" ? "text-gold-300" : "text-bone-50",
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

/* ── Moduli ───────────────────────────────────────────────────────
   Su fondo scuro un campo di testo va disegnato, non lasciato al
   browser: il campo di sistema arriva bianco e buca lo schermo. */

const CAMPO =
  "w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[15px] text-bone-50 " +
  "placeholder:text-bone-50/25 focus:border-brand-300/60 focus:outline-none focus:ring-1 focus:ring-brand-300/40";

export function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/45">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs text-bone-50/35">{hint}</span> : null}
    </label>
  );
}

export function Testo(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CAMPO, props.className)} />;
}

export function AreaTesto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(CAMPO, "min-h-[8rem] font-mono text-[13px] leading-relaxed", props.className)}
    />
  );
}

export function Scelta(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CAMPO, "[&>option]:bg-ink-900", props.className)} />;
}

export function Bottone({
  variante = "primario",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "quieto" | "pericolo";
}) {
  return (
    <button
      {...props}
      className={cx(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40",
        variante === "primario" && "bg-brand-500 text-white hover:bg-brand-600",
        variante === "quieto" && "border border-white/12 text-bone-50/70 hover:text-bone-50",
        variante === "pericolo" && "border border-white/12 text-gold-300 hover:bg-white/[0.06]",
        props.className,
      )}
    />
  );
}

/** Pastiglia di stato: poche parole, un colore, nessuna icona. */
export function Stato({
  tono = "neutro",
  children,
}: {
  tono?: "neutro" | "buono" | "avviso" | "spento";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.07em]",
        tono === "buono" && "bg-brand-500/15 text-brand-300",
        tono === "avviso" && "bg-gold-500/15 text-gold-300",
        tono === "spento" && "bg-white/[0.06] text-bone-50/35",
        tono === "neutro" && "bg-white/[0.08] text-bone-50/60",
      )}
    >
      {children}
    </span>
  );
}

/** Barra di riempimento: verde fin quando c'è margine, ambra quando stringe. */
export function Barra({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cx(
          "h-full rounded-full",
          ratio >= 0.95 ? "bg-signal-alert" : ratio >= 0.8 ? "bg-gold-500" : "bg-signal-positive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
