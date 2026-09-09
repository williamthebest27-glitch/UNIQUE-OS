/**
 * Chi guarda la landing con un dito.
 *
 * `capacita.ts` risponde a un'altra domanda — *quanta materia regge
 * questa macchina* — e la sua soglia di larghezza (900px) è tarata su
 * quello: sotto ci sono i telefoni, sopra c'è tutto il resto, shader
 * compreso. Per l'hero la domanda giusta è un'altra: **con che cosa si
 * scorre.** Un iPad Pro in orizzontale è largo 1366 e disegna benissimo
 * uno shader, ma la sua pagina la muove un pollice: là dove il dito
 * comanda, la scena deve stare incollata al dito, e una sezione fissata
 * mentre la barra degli indirizzi entra ed esce sobbalza esattamente
 * come su un telefono.
 *
 * Perciò due domande separate e due file separati. `capacita.ts` resta
 * intatto — lo leggono tutte le altre sezioni, e cambiarlo vorrebbe dire
 * cambiare la pagina intera. Qui si decide solo la regia dell'hero.
 *
 * **Il lato corto, non la larghezza.** Ruotare un tablet non lo
 * trasforma in una scrivania: se la soglia guardasse `innerWidth`, un
 * iPad Pro passando in orizzontale cambierebbe percorso d'animazione a
 * metà sessione. Il lato corto di un dispositivo non cambia mai, quindi
 * nemmeno la decisione.
 */

import { livello } from "@/lib/landing/capacita";

/** Come si racconta l'attraversamento: due tarature, una sola coreografia. */
export type Profilo = "telefono" | "tavoletta";

/** Oltre questo lato corto non è più una tavoletta ma uno schermo fermo. */
const LATO_CORTO = 1024;

/** Sotto questo lato corto si sta guardando un telefono. */
const TELEFONO = 768;

let deciso: boolean | null = null;

/**
 * Vero quando l'hero va governata dal dito invece che dalla rotellina.
 *
 * Deciso una volta sola: un dispositivo non mette su un mouse a metà
 * lettura, e un percorso d'animazione che cambia mentre si scorre è il
 * modo più sicuro di far saltare la scena.
 *
 * Ci rientrano anche le macchine modeste — quelle che `capacita.ts`
 * chiama «ridotta» — perché anche lì la scena non va fissata: è
 * esattamente il trattamento che ricevevano già.
 */
export function aTatto(): boolean {
  if (deciso !== null) return deciso;
  if (typeof window === "undefined") return false;

  const dito = matchMedia("(pointer: coarse)").matches;
  const corto = Math.min(innerWidth, innerHeight);

  deciso = (dito && corto <= LATO_CORTO) || livello() === "ridotta";
  return deciso;
}

/**
 * Telefono o tavoletta.
 *
 * Il lato corto anche qui, e per la stessa ragione di sopra: un telefono
 * coricato è largo novecento punti, e tarato come una tavoletta
 * cambierebbe ampiezza di movimento a metà lettura, solo perché è stato
 * girato. Il lato corto dice *che oggetto è*, e non cambia mai.
 *
 * La soglia è quella del brief — sotto i 768 c'è il telefono — e coincide
 * con dove passa il confine nella realtà: un iPad mini in verticale è
 * largo 744, ed è il più piccolo degli schermi che si tengono in due mani.
 */
export function profilo(): Profilo {
  if (typeof window === "undefined") return "telefono";
  return Math.min(innerWidth, innerHeight) < TELEFONO ? "telefono" : "tavoletta";
}
