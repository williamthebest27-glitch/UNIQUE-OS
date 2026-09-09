/**
 * L'attraversamento dell'hero, su telefono e tavoletta.
 *
 * La stessa scena del desktop — la camera che entra nel sistema, il
 * campo che si apre, il marchio che supera l'obiettivo, il corpo
 * consumato dal basso e dal cuore, il buio che chiude — raccontata da un
 * meccanismo diverso.
 *
 * **Una sola verità: la posizione dello scorrimento.** Non c'è uno stato
 * da tenere allineato, non c'è una testina che insegue un bersaglio, non
 * c'è uno `scrub` che arriva con qualche decimo di ritardo. C'è una
 * funzione pura:
 *
 *     progresso = (scrollY − cima) / corsa        ∈ [0, 1]
 *     fotogramma = f(progresso)
 *
 * e a ogni tick si disegna `f` del progresso di *adesso*. Da qui vengono
 * tutte le proprietà che servono: nessun ritardo rispetto al dito,
 * perché il fotogramma è calcolato sulla posizione vera; nessuna
 * desincronizzazione, perché gli elementi non sono animazioni che
 * corrono ciascuna per conto suo ma undici letture dello stesso numero;
 * nessun salto tornando indietro, perché `f` è la stessa funzione in
 * salita e in discesa; nessuno stato da corrompere se un dito sfiora lo
 * schermo mentre la scena si sta ancora accendendo.
 *
 * **Perché non ScrollTrigger qui.** Sul desktop lo `scrub` è giusto: la
 * rotellina è a scatti e Lenis addolcisce sia la pagina sia la scena,
 * quindi i due ritardi coincidono e il movimento prende peso. Sotto il
 * dito la pagina si muove uno-a-uno e la scena no: lo stesso mezzo
 * secondo d'inerzia che sul desktop è eleganza, sul telefono è la scena
 * che arranca dietro al pollice. E uno `scrub` è uno *stato* — ha dei
 * valori di partenza registrati una volta sola, e registrarli
 * nell'istante sbagliato lascia la pagina rotta finché non si ricarica —
 * mentre `f` non ha nulla da registrare.
 *
 * **I numeri non sono nuovi.** Sono quelli della timeline che c'era: ogni
 * intervallo qui sotto è la posizione e la durata della battuta
 * corrispondente, divise per la durata totale della coreografia. La
 * scena disegnata è la stessa, fotogramma per fotogramma — solo che ora
 * la disegna un'interpolazione invece di una testina.
 */

import gsap from "gsap";
import type { Profilo } from "@/lib/landing/tatto";

/**
 * La durata della coreografia originale, in secondi di timeline.
 *
 * La battuta più lunga finisce a 1.05 — il corpo che si avvicina, e il
 * buio che si chiude sopra di lui — ed è quella che dà la scala a tutte
 * le altre. Dividere per lei porta le posizioni della timeline in
 * frazioni di scorrimento.
 */
const DURATA = 1.05;

/** Da secondo di timeline a frazione di scorrimento. */
const f = (secondo: number) => secondo / DURATA;

/** `power1.in`: parte piano e accelera. La curva delle due gomme bianche. */
const entrata = (x: number) => x * x;

interface Moto {
  da: number;
  a: number;
  curva?: (x: number) => number;
  /** Spostamento in pixel, tarato sul profilo. */
  y?: number;
  /** Spostamento in frazione del proprio riquadro: non si misura nulla. */
  yPct?: number;
  scalaDa?: number;
  scalaA?: number;
}

interface Velo {
  da: number;
  a: number;
  dalla: number;
  alla: number;
}

interface Voce {
  /** Il nome dell'attributo `data-…` che marca l'elemento nell'hero. */
  chiave: string;
  moto?: Moto;
  velo?: Velo;
}

/*
 * Lo spartito.
 *
 * Un elemento, una voce: il moto e il velo hanno intervalli propri
 * perché nella coreografia originale non coincidevano — il corpo si
 * avvicina per tutta la scena ma si spegne solo nell'ultimo terzo — e
 * due voci sullo stesso elemento finirebbero per scriversi addosso.
 */
const SPARTITO: readonly Voce[] = [
  // La camera entra: il campo si apre verso di noi e passa oltre.
  {
    chiave: "rete",
    moto: { da: 0, a: f(0.5), y: -40, scalaDa: 1, scalaA: 1.55 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },

  // Il marchio cresce fino a superare l'obiettivo e si dissolve
  // nell'istante in cui lo attraversiamo.
  {
    chiave: "marchio",
    moto: { da: 0, a: f(0.5), y: -30, scalaDa: 1, scalaA: 3.4 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },
  {
    chiave: "parola-os",
    moto: { da: 0, a: f(0.5), y: -30 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },

  // Il titolo si ritira verso l'alto e si stringe: non sparisce,
  // arretra — è quello che fa un oggetto quando lo si oltrepassa.
  {
    chiave: "titolo",
    moto: { da: f(0.05), a: f(0.55), yPct: -42, scalaDa: 1, scalaA: 0.82 },
    velo: { da: f(0.05), a: f(0.55), dalla: 1, alla: 0 },
  },
  {
    chiave: "sotto",
    moto: { da: 0, a: f(0.5), y: -70 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },
  {
    chiave: "comandi",
    moto: { da: 0, a: f(0.5), y: -50 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },
  {
    chiave: "stato",
    moto: { da: 0, a: f(0.5), y: 40 },
    velo: { da: 0, a: f(0.5), dalla: 1, alla: 0 },
  },

  /* La figura si avvicina più piano di tutto il resto: è il corpo che si
     attraversa per ultimo, e per un istante resta solo. Non svanisce:
     viene consumato — il piano di luce gli toglie le gambe, poi il cuore
     lo apre dall'interno — e quel che resta si spegne un attimo prima
     che il bianco chiuda la scena. */
  {
    chiave: "figura",
    moto: { da: 0, a: 1, yPct: -6, scalaDa: 1, scalaA: 1.22 },
    velo: { da: f(0.62), a: f(0.95), dalla: 1, alla: 0 },
  },
  {
    chiave: "suolo",
    moto: { da: 0, a: f(0.62), curva: entrata, yPct: -82 },
  },
  {
    chiave: "cuore",
    moto: { da: f(0.22), a: f(0.94), curva: entrata, scalaDa: 0, scalaA: 4.2 },
  },

  // Il vuoto si chiude sopra la scena: è la porta fra l'accensione e la
  // prima sezione, e le dà un bordo netto invece di una sfumatura.
  {
    chiave: "buio",
    velo: { da: f(0.55), a: 1, dalla: 0, alla: 1 },
  },
];

/**
 * Le due tarature.
 *
 * Una tavoletta non è un telefono ingrandito: gli stessi settanta pixel
 * di spostamento che su uno schermo da 812 punti sono un gesto, su uno
 * da 1180 sono un tremolio, e la stessa crescita del marchio che su un
 * telefono riempie lo schermo su un iPad si ferma a metà strada. Le
 * distanze e l'ampiezza delle scale crescono; gli intervalli, le curve e
 * l'ordine delle battute no — l'identità visiva è quella.
 *
 * `telefono` vale esattamente 1 su entrambe le voci: sul telefono la
 * scena resta quella di prima, numero per numero.
 */
const PROFILI: Record<Profilo, { distanza: number; guadagno: number }> = {
  telefono: { distanza: 1, guadagno: 1 },
  tavoletta: { distanza: 1.3, guadagno: 1.25 },
};

/** Quanto di un intervallo è stato percorso, con la sua curva. */
function tratto(p: number, da: number, a: number, curva?: (x: number) => number) {
  const x = Math.min(1, Math.max(0, (p - da) / (a - da)));
  return curva ? curva(x) : x;
}

interface Attore {
  nodo: HTMLElement;
  voce: Voce;
  /** L'ultimo valore scritto: riscriverlo uguale è lavoro buttato. */
  moto: string;
  velo: string;
}

export interface Compositore {
  /** Disegna il fotogramma che corrisponde a questo progresso. */
  disegna(p: number): void;
  /** Toglie di mano ogni proprietà scritta: l'elemento torna al CSS. */
  libera(): void;
}

/**
 * Prepara il disegno del fotogramma per una radice e un profilo.
 *
 * Gli elementi si cercano una volta sola, alla costruzione: una
 * `querySelector` per fotogramma sarebbe una lettura del DOM sessanta
 * volte al secondo per undici elementi che nell'albero non si spostano
 * mai.
 */
export function compositore(radice: HTMLElement, prof: Profilo): Compositore {
  const { distanza, guadagno } = PROFILI[prof];

  const attori: Attore[] = [];
  for (const voce of SPARTITO) {
    const nodo = radice.querySelector<HTMLElement>(`[data-${voce.chiave}]`);
    if (nodo) attori.push({ nodo, voce, moto: "", velo: "" });
  }

  return {
    disegna(p) {
      for (const attore of attori) {
        const { moto, velo } = attore.voce;

        if (moto) {
          const x = tratto(p, moto.da, moto.a, moto.curva);

          /* Sempre `translate3d`, anche a zero: l'elemento nasce già sul
             suo piano di composizione invece di esserci promosso al primo
             pixel di scorrimento, che è l'istante in cui promuoverlo
             costa un fotogramma. */
          let testo =
            moto.yPct !== undefined
              ? `translate3d(0,${(moto.yPct * x).toFixed(3)}%,0)`
              : `translate3d(0,${((moto.y ?? 0) * distanza * x).toFixed(2)}px,0)`;

          if (moto.scalaA !== undefined) {
            const partenza = moto.scalaDa ?? 1;
            const arrivo = partenza + (moto.scalaA - partenza) * guadagno;
            testo += ` scale(${(partenza + (arrivo - partenza) * x).toFixed(4)})`;
          }

          if (testo !== attore.moto) {
            attore.nodo.style.transform = testo;
            attore.moto = testo;
          }
        }

        if (velo) {
          const x = tratto(p, velo.da, velo.a);
          const testo = (velo.dalla + (velo.alla - velo.dalla) * x).toFixed(3);
          if (testo !== attore.velo) {
            attore.nodo.style.opacity = testo;
            attore.velo = testo;
          }
        }
      }
    },

    libera() {
      for (const attore of attori) {
        if (attore.voce.moto) attore.nodo.style.transform = "";
        if (attore.voce.velo) attore.nodo.style.opacity = "";
        attore.moto = "";
        attore.velo = "";
      }
    },
  };
}

export interface Sorgente {
  /** Rimisura la scena. Si chiama quando cambia davvero la pagina. */
  rimisura(): void;
  spegni(): void;
}

/**
 * La sorgente del progresso.
 *
 * Un solo aggancio al ciclo che già gira — quello di GSAP, a cui è
 * appeso anche Lenis — invece di un `requestAnimationFrame` in proprio:
 * un secondo ciclo vorrebbe dire due letture della posizione nello
 * stesso fotogramma, e due momenti diversi in cui scrivere sul DOM.
 *
 * Nessun ascoltatore di `scroll`. Un evento di scorrimento su iOS non
 * arriva a ogni fotogramma — durante l'inerzia arriva quando capita — e
 * una scena appesa a lui si muove a scatti mentre la pagina scorre
 * liscia. La posizione si legge dove serve leggerla: all'inizio del
 * fotogramma che la userà, prima di qualunque scrittura.
 *
 * **La misura non si rifà mentre si scorre.** Su telefono la barra degli
 * indirizzi entra ed esce e il browser annuncia un `resize` a ogni
 * cambio: rimisurare lì vorrebbe dire spostare la fine della scena sotto
 * al dito. Quel `resize` cambia solo l'altezza, quindi si rimisura solo
 * quando cambia la larghezza — cioè quando si ruota il dispositivo, che
 * è l'unico caso in cui la pagina è davvero un'altra. La cima e la corsa
 * vengono dal riquadro dell'hero, alto `100svh`, che con la barra non si
 * muove.
 */
export function sorgente(
  radice: HTMLElement,
  ascolta: (progresso: number, scarto: number) => void,
): Sorgente {
  let cima = 0;
  let corsa = 1;
  let larghezza = innerWidth;
  let viva = true;

  const misura = () => {
    if (!viva) return;
    cima = radice.getBoundingClientRect().top + scrollY;
    corsa = Math.max(1, radice.offsetHeight);
  };

  const passo = () => {
    const scarto = scrollY - cima;
    ascolta(Math.min(1, Math.max(0, scarto / corsa)), scarto);
  };

  const suResize = () => {
    if (innerWidth === larghezza) return;
    larghezza = innerWidth;
    misura();
  };

  misura();
  gsap.ticker.add(passo);
  addEventListener("resize", suResize, { passive: true });
  // Il ritorno da una pagina in cache riporta la posizione ma non ha
  // rimontato niente: la misura va confermata prima del primo tick.
  addEventListener("pageshow", misura);
  addEventListener("load", misura);
  // Il carattere definitivo può impaginare il titolo su una riga in meno.
  void document.fonts?.ready.then(misura);

  return {
    rimisura: misura,
    spegni() {
      viva = false;
      gsap.ticker.remove(passo);
      removeEventListener("resize", suResize);
      removeEventListener("pageshow", misura);
      removeEventListener("load", misura);
    },
  };
}
