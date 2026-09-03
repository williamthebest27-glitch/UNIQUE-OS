import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Superfici ────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag
      className={cx(
        "rounded-card bg-white shadow-card ring-1 ring-bone-200/70",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-1">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-sm text-ink-400">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ── Indicatori ───────────────────────────────────────────────────── */

/**
 * Pastiglia di variazione. `isImprovement` è separato dalla direzione
 * perché in clinica scendere è spesso la notizia buona: la glicata che
 * cala deve leggersi verde, non rossa.
 */
export function DeltaPill({
  text,
  direction,
  isImprovement = true,
}: {
  text: string;
  direction: "up" | "down" | "flat";
  isImprovement?: boolean;
}) {
  const tone =
    direction === "flat"
      ? "bg-bone-100 text-ink-500"
      : isImprovement
        ? "bg-brand-50 text-brand-700"
        : "bg-brand-50 text-signal-alert";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-xs font-semibold tnum",
        tone,
      )}
    >
      {direction !== "flat" ? (
        <svg
          viewBox="0 0 10 10"
          className={cx("h-2.5 w-2.5", direction === "down" && "rotate-180")}
          aria-hidden="true"
        >
          <path d="M5 1.5 9 8H1z" fill="currentColor" />
        </svg>
      ) : null}
      {text}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "positive" | "gold" | "attention";
}) {
  const tones = {
    neutral: "bg-bone-100 text-ink-500 ring-bone-200",
    brand: "bg-brand-50 text-brand-700 ring-brand-100",
    positive: "bg-[#e9f6ee] text-signal-positive ring-[#cdebd8]",
    gold: "bg-gold-100 text-gold-600 ring-gold-300/60",
    attention: "bg-[#fdf6e8] text-signal-attention ring-[#f0e0bd]",
  } as const;

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Riga vuota onesta: dice cosa comparirà qui, non solo che non c’è nulla. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="px-6 py-8 text-center text-sm text-ink-400">{children}</p>
  );
}

/* ── Icone ────────────────────────────────────────────────────────── */

type IconProps = { className?: string };

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4 10.1 12.8 4.5 10.9 10.1 9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.2.7 5 1.5 6H4.5C5.3 14 6 12.2 6 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CreditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v9M9.5 10h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PathIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 19c4 0 4-6 7-6s3 6 7 6M5 19V5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
