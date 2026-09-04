/**
 * Quanto sistema può reggere questo dispositivo.
 *
 * La landing racconta la stessa storia ovunque, ma non con la stessa
 * quantità di materia. Un iPhone di tre anni non deve disegnare uno
 * shader a schermo intero mentre scorre una sezione fissata: si vedrebbe
 * la storia a scatti, che è peggio che vederla ferma.
 *
 * Tre livelli, decisi una volta sola all'avvio:
 *
 * - **piena** — desktop con puntatore fine e abbastanza muscoli: WebGL,
 *   pin e scrub, tutte le particelle.
 * - **ridotta** — telefoni e macchine modeste: niente WebGL, niente pin
 *   costosi, meno nodi. La narrativa resta intera, la scenografia si
 *   asciuga.
 * - **ferma** — `prefers-reduced-motion`, oppure nessun JavaScript
 *   utile: tutto è già al suo stato finale. Non è un ripiego, è una
 *   versione: la pagina resta impaginata e leggibile, senza movimento.
 *
 * Il livello non cambia mai dopo il primo fotogramma. Un sito che
 * declassa a metà scroll è un sito che sfarfalla.
 */

export type Livello = "piena" | "ridotta" | "ferma";

interface Navigatore extends Navigator {
  deviceMemory?: number;
}

let deciso: Livello | null = null;

/** Il livello di questo dispositivo. Calcolato una volta, poi ricordato. */
export function livello(): Livello {
  if (deciso) return deciso;
  if (typeof window === "undefined") return "ferma";

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    deciso = "ferma";
    return deciso;
  }

  const nav = navigator as Navigatore;
  const grossolano = matchMedia("(pointer: coarse)").matches;
  const stretto = matchMedia("(max-width: 900px)").matches;
  const memoria = nav.deviceMemory ?? 8;
  const cuori = nav.hardwareConcurrency ?? 8;

  // Il dito da solo non declassa — un iPad Pro disegna più di un portatile
  // d'ufficio — ma dito *e* schermo stretto insieme sì: è un telefono.
  //
  // Le soglie sono volutamente basse. Quattro processori sono la
  // dotazione di mezzo parco portatili in circolazione, e togliere loro
  // lo shader per prudenza significa che quasi nessuno lo vedrebbe mai:
  // qui si declassa chi è davvero al limite (due processori, o due giga
  // dichiarati), non chi è semplicemente non nuovissimo. `deviceMemory`
  // esiste solo su Chromium e si ferma a 8; altrove resta indefinito e
  // non deve pesare sulla decisione.
  const modesto = memoria <= 2 || cuori <= 2;

  deciso = (grossolano && stretto) || modesto ? "ridotta" : "piena";
  return deciso;
}

/** Vero quando il movimento va disegnato: pin, scrub, particelle. */
export function inMovimento(): boolean {
  return livello() !== "ferma";
}

/** Vero solo dove uno shader a schermo intero non costa la fluidità. */
export function conWebGL(): boolean {
  return livello() === "piena";
}

/*
 * Nessuna funzione qui dentro può essere chiamata mentre si compone il
 * markup.
 *
 * Tutte leggono `matchMedia` e `navigator`, che sul server non esistono:
 * lì rispondono "ferma", nel browser rispondono la verità, e un albero
 * costruito su due risposte diverse è un errore di idratazione — React
 * butta via l'intera pagina appena arrivata e la rifà da capo.
 *
 * Vanno chiamate dentro un effetto (`useScena` lo è) o dopo il
 * montaggio. Ciò che cambia il *conteggio* degli elementi disegnati non
 * può quindi dipendere dal dispositivo: i campi di punti hanno una
 * quantità fissa, e a variare col livello è ciò che li anima — che è poi
 * la parte che costa davvero.
 */
