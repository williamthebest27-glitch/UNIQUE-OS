"use client";

/**
 * I comandi del sipario d'avvio.
 *
 * Stanno fuori da `avvio.tsx` per una ragione pratica: un modulo che
 * esporta un componente e insieme delle funzioni normali costringe Fast
 * Refresh a ricaricare l'intera pagina a ogni modifica. Separarli tiene
 * corto il ciclo di sviluppo, e dà al sipario una superficie di comando
 * che si legge da sola.
 *
 * Il tramite è un evento sul `window`, non un contesto React: il sipario
 * è montato una volta sola nel guscio, e chi lo chiama sta a pagine di
 * distanza nell'albero. Un contesto avrebbe voluto un provider attorno a
 * tutto per due funzioni che non hanno stato.
 */

/** Il sipario cala: si sta entrando nell'applicazione. */
export const CALA = "unique:sipario-cala";
/** E si rialza subito, quando si scopre che non si entra affatto. */
export const ALZA = "unique:sipario-alza";

/**
 * Cala il sipario a pagina viva.
 *
 * Serve sulla soglia: «Entra» sulla pagina d'accesso, e «Salva e entra»
 * quando la password si sceglie la prima volta. Da lì la destinazione
 * arriva da una navigazione del router — il guscio non si ricarica, e il
 * sipario uscito dall'HTML di partenza è stato smontato da un pezzo.
 * Chiamarlo lo rimette in scena: il marchio si riempie mentre il server
 * risponde, e quando la pagina nuova è al suo posto il sipario si alza su
 * quella. L'attesa dell'accesso smette di essere un pulsante spento.
 *
 * Con `prefers-reduced-motion` non fa nulla, come al primo avvio.
 */
export function calaSipario() {
  window.dispatchEvent(new Event(CALA));
}

/**
 * Rialza subito il sipario appena calato.
 *
 * L'accesso può non riuscire, e allora la pagina non cambia. Tenere il
 * marchio a riempirsi per un secondo e mezzo prima di scoprire «password
 * errata» sarebbe una cortesia bugiarda: chi ha calato il sipario lo
 * rialza appena sa che la soglia non si apre.
 */
export function alzaSipario() {
  window.dispatchEvent(new Event(ALZA));
}
