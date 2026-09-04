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
 * Il sipario ha cominciato ad alzarsi: da qui in poi la scena è a vista.
 *
 * Non è un comando ma un annuncio, e serve a chi deve *cominciare* lì.
 * L'avviso parte quando la salita comincia, non quando finisce: i sette
 * decimi di secondo del taglio scoprono la pagina dal basso, e una scena
 * che parte in quel momento si legge insieme al sipario invece che dopo.
 */
export const APERTO = "unique:sipario-aperto";

/** Oltre questo non si aspetta più: nessuna scena resta dietro un sipario rotto. */
const SCORTA = 5000;

/**
 * Esegue `fn` quando la scena è scoperta.
 *
 * Serve all'accensione dell'hero. Il sipario e l'hero raccontano la
 * stessa cosa — un sistema che si accende — e vanno letti come un gesto
 * solo: se l'accensione parte al montaggio, i suoi due secondi passano
 * interi dietro al marchio che si riempie, e chi arriva trova una scena
 * già finita e ferma. Che è esattamente l'impressione di un sito lento.
 *
 * Se il sipario non c'è — `prefers-reduced-motion`, oppure un ritorno
 * alla landing a guscio già caricato — non c'è niente da aspettare e
 * `fn` parte subito.
 *
 * **E parte comunque.** Un'animazione d'ingresso lascia il contenuto nel
 * suo stato iniziale finché non gira: se l'annuncio non arrivasse mai,
 * l'hero resterebbe invisibile. Perciò una scorta a tempo, e se allo
 * scadere la pagina è ancora nascosta — scheda in secondo piano, dove il
 * sipario stesso aspetta — si aspetta il ritorno di chi guarda invece di
 * bruciare la scena a sala vuota.
 *
 * Restituisce la funzione per smettere di aspettare.
 */
export function aSiparioAperto(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!document.querySelector(".avvio")) {
    fn();
    return () => {};
  }

  let fatto = false;
  let scorta = 0;

  const parti = () => {
    if (fatto) return;
    fatto = true;
    smetti();
    fn();
  };

  // Allo scadere della scorta, se non c'è nessuno a guardare si rimanda:
  // il sipario è fermo per lo stesso motivo, e ripartirà da capo.
  const allaScadenza = () => {
    if (!document.hidden) return parti();
    document.addEventListener("visibilitychange", allaScadenza, { once: true });
  };

  function smetti() {
    clearTimeout(scorta);
    window.removeEventListener(APERTO, parti);
    document.removeEventListener("visibilitychange", allaScadenza);
  }

  window.addEventListener(APERTO, parti, { once: true });
  scorta = window.setTimeout(allaScadenza, SCORTA);

  return smetti;
}

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
