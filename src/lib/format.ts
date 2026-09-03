/**
 * Formattazione condivisa.
 *
 * Il fuso è fissato a Europe/Rome invece di affidarsi a quello del
 * processo: un server in UTC e un browser a Roma renderizzerebbero orari
 * diversi per lo stesso appuntamento.
 */

const TIME_ZONE = "Europe/Rome";
const LOCALE = "it-IT";

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
});

const weekdayDayMonth = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
});

const shortDate = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const monthYear = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  year: "2-digit",
  timeZone: TIME_ZONE,
});

const clock = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export function formatWeekdayDayMonth(iso: string): string {
  return weekdayDayMonth.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

export function formatMonthYear(iso: string): string {
  return monthYear.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return clock.format(new Date(iso));
}

/** Giorni interi che separano `iso` da oggi. Negativo se è passato. */
export function daysFromToday(iso: string, now: Date = new Date()): number {
  const startOfDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffMs = startOfDay(new Date(iso)) - startOfDay(now);
  return Math.round(diffMs / 86_400_000);
}

/** "oggi", "domani", "fra 14 giorni", "3 giorni fa". */
export function formatRelativeDays(iso: string, now: Date = new Date()): string {
  const days = daysFromToday(iso, now);
  if (days === 0) return "oggi";
  if (days === 1) return "domani";
  if (days === -1) return "ieri";
  if (days > 1) return `fra ${days} giorni`;
  return `${Math.abs(days)} giorni fa`;
}

/** Segno tipografico corretto: meno (−), non trattino (-). */
export function formatDelta(value: number, unit = ""): string {
  if (value === 0) return `±0${unit}`;
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toLocaleString(LOCALE)}${unit}`;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(LOCALE, {
    maximumFractionDigits: 1,
  })} MB`;
}

/** "credito" / "crediti", con il numero davanti. */
export function formatCredits(amount: number): string {
  const n = amount.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  return `${n} ${amount === 1 ? "credito" : "crediti"}`;
}
