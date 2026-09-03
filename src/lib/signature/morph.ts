/**
 * L'orologio della morfosi.
 *
 * Puro, senza DOM: figura e contatore lo leggono entrambi, così arrivano
 * insieme — e qui si può provare senza un browser.
 *
 * Una breve attesa prima di partire, poi due secondi con una curva che
 * arriva piano: il paziente deve vedere com'era, poi vederlo cambiare.
 */

export const MORPH_HOLD_MS = 700;
export const MORPH_DURATION_MS = 2200;

/** Uscita esponenziale: parte decisa, arriva piano. */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** 0→1 dal momento di partenza, con attesa iniziale. */
export function morphProgress(startedAt: number, now: number): number {
  const t = (now - startedAt - MORPH_HOLD_MS) / MORPH_DURATION_MS;
  return easeOutExpo(Math.min(1, Math.max(0, t)));
}
