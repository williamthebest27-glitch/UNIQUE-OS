/**
 * Regole del credit engine, lato interfaccia.
 *
 * L'autorità è il database: il trigger `credit_engine_sync` decide se una
 * disdetta libera il credito o lo addebita, e nessuna strada lo aggira.
 * Queste funzioni servono a **dirlo prima** al paziente — se il pulsante
 * non avverte che la disdetta è tardiva, l'addebito arriva a sorpresa.
 *
 * La soglia è la stessa di `credit_cancellation_hours()`: se cambia lì,
 * va cambiata anche qui. Sono due, ed è il prezzo dell'onestà verso
 * l'utente; il test qui sotto almeno impedisce che questa si muova da sola.
 */

export const CANCELLATION_HOURS = 24;

export type CreditEntryKind =
  | "purchase"
  | "grant"
  | "consumption"
  | "refund"
  | "expiry"
  | "adjustment"
  | "reservation"
  | "reservation_release";

export const CREDIT_ENTRY_LABELS: Record<CreditEntryKind, string> = {
  purchase: "Acquisto",
  grant: "Accredito",
  consumption: "Utilizzo",
  refund: "Rimborso",
  expiry: "Scadenza",
  adjustment: "Correzione",
  reservation: "Prenotazione",
  reservation_release: "Rilascio prenotazione",
};

/** Ore che mancano all'appuntamento. Negativo se è già passato. */
export function hoursUntil(startsAt: string, now: Date = new Date()): number {
  return (Date.parse(startsAt) - now.getTime()) / 3_600_000;
}

/** Vero se disdicendo adesso il credito torna disponibile. */
export function isFreeCancellation(startsAt: string, now: Date = new Date()): boolean {
  return hoursUntil(startsAt, now) >= CANCELLATION_HOURS;
}

export type CancellationOutcome = "released" | "charged";

export function cancellationOutcome(
  startsAt: string,
  now: Date = new Date(),
): CancellationOutcome {
  return isFreeCancellation(startsAt, now) ? "released" : "charged";
}

/** Cosa dire al paziente prima che confermi la disdetta. */
export function cancellationNotice(
  startsAt: string,
  credits: number,
  now: Date = new Date(),
): string {
  if (credits <= 0) return "La disdetta non comporta addebiti.";

  return isFreeCancellation(startsAt, now)
    ? `Il credito torna disponibile: mancano più di ${CANCELLATION_HOURS} ore.`
    : `Meno di ${CANCELLATION_HOURS} ore all'appuntamento: il credito viene comunque addebitato.`;
}
