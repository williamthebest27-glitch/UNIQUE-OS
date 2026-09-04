/**
 * Come si cerca dentro Unique.
 *
 * Una ricerca clinica ha due proprietà che una ricerca qualunque non ha,
 * e sono entrambe conseguenze del fatto che chi la usa ha una persona
 * davanti:
 *
 *   **Deve perdonare.** «rossi» trova Rossi, «Rossi Mario» trova Mario
 *   Rossi, «nicolo` » trova Nicolò. Chi scrive lo fa mentre parla con
 *   qualcuno, spesso con una mano sola, e un risultato mancato per un
 *   accento è un risultato mancato.
 *
 *   **Non deve indovinare.** Nessuna tolleranza agli errori di
 *   battitura, nessun «forse intendevi». Su un elenco di pazienti, una
 *   corrispondenza approssimata è il modo con cui si apre la cartella
 *   sbagliata — e la cartella sbagliata, in clinica, non è un fastidio.
 *
 * Fra le due la seconda vince sempre: si cerca per sottostringa, su
 * testo normalizzato, e basta.
 *
 * Funzioni pure e senza import, come i motori di calcolo: si provano
 * sotto `node --test` e si discutono guardando il codice.
 */

/**
 * Minuscolo, senza accenti, spazi normali.
 *
 * `NFD` scompone «ò» in «o» più il segno, e la classe unicode dei segni
 * diacritici lo toglie. È il modo di far combaciare «Nicolò» e «Nicolo»
 * senza tenere una tabella di sostituzioni che dimenticherà sempre una
 * lettera.
 */
export function normalizza(testo: string): string {
  return testo
    .normalize("NFD")
    // L'intervallo dei segni diacritici combinanti, U+0300–U+036F. Sono
    // caratteri senza larghezza: in questo file la classe sembra vuota,
    // e non lo è. Il test sugli accenti è ciò che se ne accorgerebbe.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * I termini di una ricerca.
 *
 * Ogni parola è un vincolo separato, e devono valere tutte: «mario
 * rossi» non deve trovare Mario Bianchi. Che l'ordine non conti è
 * invece voluto — «rossi mario» è la stessa persona, e in una clinica
 * si scrive in entrambi i modi.
 */
export function termini(query: string): string[] {
  return normalizza(query).split(" ").filter((t) => t.length > 0);
}

/** Sotto questa lunghezza non si cerca: due lettere trovano tutto. */
export const LUNGHEZZA_MINIMA = 2;

/**
 * Quanto un testo corrisponde. Zero significa: non è un risultato.
 *
 * Il punteggio serve a ordinare, non a decidere. Decide la presenza di
 * **tutti** i termini; il valore dice soltanto quanto la corrispondenza
 * è vicina all'inizio di una parola, perché è lì che di solito si
 * comincia a digitare un cognome.
 */
export function punteggio(testo: string | null | undefined, cercati: readonly string[]): number {
  if (!testo || cercati.length === 0) return 0;

  const base = normalizza(testo);
  const parole = base.split(" ");
  let totale = 0;

  for (const termine of cercati) {
    if (!base.includes(termine)) return 0;

    // Inizio di una parola vale più di una corrispondenza in mezzo:
    // «ros» deve mettere Rossi sopra Ambrosini.
    if (parole.some((p) => p === termine)) totale += 10;
    else if (parole.some((p) => p.startsWith(termine))) totale += 6;
    else totale += 2;
  }

  // Un testo corto che contiene i termini è più pertinente di uno lungo
  // che li contiene sparsi: «Rossi» batte «Referto di Mario Rossi del…».
  return totale + Math.max(0, 6 - Math.floor(base.length / 24));
}

/**
 * Il punteggio migliore fra più campi.
 *
 * Un paziente si trova dal nome, dal codice o dall'email; il campo che
 * ha prodotto la corrispondenza non interessa a chi cerca, ed è per
 * questo che se ne tiene solo il migliore invece di sommarli — sommarli
 * premierebbe chi ha più campi compilati, che non è pertinenza.
 */
export function punteggioSuCampi(
  campi: readonly (string | null | undefined)[],
  cercati: readonly string[],
): number {
  let migliore = 0;
  for (const campo of campi) {
    const p = punteggio(campo, cercati);
    if (p > migliore) migliore = p;
  }
  return migliore;
}

export interface ConPunteggio<T> {
  voce: T;
  punti: number;
}

/**
 * Ordina per punteggio e taglia.
 *
 * A parità di punteggio l'ordine di partenza è conservato: chi chiama
 * arriva quasi sempre con righe già ordinate per data, e a parità di
 * pertinenza il più recente è la risposta giusta.
 */
export function migliori<T>(voci: readonly ConPunteggio<T>[], quanti: number): T[] {
  return voci
    .filter((v) => v.punti > 0)
    .map((v, indice) => ({ ...v, indice }))
    .sort((a, b) => b.punti - a.punti || a.indice - b.indice)
    .slice(0, quanti)
    .map((v) => v.voce);
}

/**
 * Se valga la pena cercare.
 *
 * Una lettera sola produce l'elenco intero riordinato a caso, che è
 * peggio di nessun risultato: dà l'impressione di aver cercato.
 */
export function ricercaUtile(query: string): boolean {
  return normalizza(query).length >= LUNGHEZZA_MINIMA;
}
