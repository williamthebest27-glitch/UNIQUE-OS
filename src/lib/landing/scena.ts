"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { inMovimento, livello } from "@/lib/landing/capacita";

/**
 * La regia dello scorrimento.
 *
 * Un solo posto in cui GSAP viene registrato, un solo posto in cui lo
 * scorrimento viene addolcito, un solo modo di scrivere una scena.
 *
 * **Perché Lenis e non il motore di casa.** `src/lib/motion/engine.ts`
 * addolcisce lo scroll scrivendo `window.scrollTo` a ogni fotogramma.
 * ScrollTrigger legge la stessa posizione e, quando fissa una sezione,
 * cambia l'altezza del documento sotto ai piedi del motore: i due si
 * rincorrono e il pin trema. Lenis nasce per stare sotto ScrollTrigger —
 * gli passa l'aggiornamento a ogni tick del ticker di GSAP — quindi
 * sulla landing la rotellina la governa lui e il motore di casa resta
 * acceso solo per ciò che sa fare meglio: il ciclo rAF a cui è appesa la
 * Signature e la velocità pubblicata in `--velN`.
 *
 * **Lo stato di riposo è quello finale.** Nessuna sezione parte
 * nascosta dal CSS: se GSAP non arrivasse — rete che cade, browser
 * antico, `prefers-reduced-motion` — la pagina resta impaginata,
 * leggibile e completa. Gli stati iniziali li scrive GSAP, che per
 * definizione c'è solo quando può anche toglierli.
 */

let registrato = false;

function registra() {
  if (registrato || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  // Una pausa lunga — scheda in secondo piano, un garbage collect — non
  // deve far saltare in avanti le scene fissate.
  gsap.ticker.lagSmoothing(0);
  registrato = true;
}

/** In SSR `useLayoutEffect` avverte; qui l'effetto è sempre del browser. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface Regia {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  /** La radice della scena: ogni selettore va cercato qui dentro. */
  radice: HTMLElement;
  /** Vero su telefoni e macchine modeste: meno materia, stessa storia. */
  ridotta: boolean;
}

/**
 * Costruisce una scena legata a un elemento.
 *
 * Il costruttore riceve la regia e può usare selettori relativi: il
 * `gsap.context` li risolve dentro la radice, e allo smontaggio riporta
 * tutto com'era — animazioni, trigger e proprietà scritte inline.
 *
 * Il costruttore può restituire una funzione di pulizia — serve a chi
 * crea un `gsap.matchMedia()`, che ha un ciclo di vita suo — e il
 * contesto la chiama al revert.
 *
 * Con reduced motion il costruttore non viene mai chiamato: non c'è
 * nulla da annullare, perché non è stato scritto nulla.
 */
export function useScena<T extends HTMLElement = HTMLDivElement>(
  costruisci: (regia: Regia) => void | (() => void),
): RefObject<T | null> {
  const rif = useRef<T>(null);
  const fn = useRef(costruisci);
  fn.current = costruisci;

  useIsomorphicLayoutEffect(() => {
    const radice = rif.current;
    if (!radice || !inMovimento()) return;

    registra();

    // La freccia *restituisce* il risultato del costruttore: è così che
    // una pulizia dichiarata dalla scena arriva fino al revert.
    const ctx = gsap.context(
      () => fn.current({ gsap, ScrollTrigger, radice, ridotta: livello() === "ridotta" }),
      radice,
    );

    return () => ctx.revert();
  }, []);

  return rif;
}

/**
 * Accende lo scorrimento morbido per il tempo in cui la landing è a
 * schermo, e lo spegne uscendo: le altre sezioni dell'applicazione hanno
 * il loro motore, e due non possono convivere.
 *
 * Restituisce la funzione per portarsi a un'ancora, che deve passare da
 * Lenis: un `scrollIntoView` nativo mentre Lenis è acceso finisce in una
 * corsa contro se stesso.
 */
export interface Scorrimento {
  vai: (bersaglio: string | number) => void;
  /** Blocca la pagina sotto un pannello aperto. */
  ferma: () => void;
  riparti: () => void;
  spegni: () => void;
}

export function avviaScorrimento(): Scorrimento {
  if (typeof window === "undefined" || !inMovimento()) {
    // Senza Lenis il blocco lo fa il documento: è l'unico caso in cui
    // `overflow: hidden` sulla radice non ha effetti collaterali, perché
    // non c'è nessuna sezione fissata da rompere.
    return {
      vai: (bersaglio) => {
        if (typeof window === "undefined") return;
        const nodo =
          typeof bersaglio === "string" ? document.querySelector(bersaglio) : null;
        if (nodo) nodo.scrollIntoView({ behavior: "auto", block: "start" });
        else if (typeof bersaglio === "number") scrollTo(0, bersaglio);
      },
      ferma: () => {
        document.documentElement.style.overflow = "hidden";
      },
      riparti: () => {
        document.documentElement.style.overflow = "";
      },
      spegni: () => {
        document.documentElement.style.overflow = "";
      },
    };
  }

  registra();

  let vivo = true;
  let fermo = false;
  let lenis: {
    raf(t: number): void;
    destroy(): void;
    scrollTo(t: unknown, o?: unknown): void;
    start(): void;
    stop(): void;
  } | null = null;
  const inCoda: Array<string | number> = [];

  const tick = (time: number) => lenis?.raf(time * 1000);

  // Il modulo arriva dopo il primo fotogramma: la pagina si vede subito,
  // e lo scorrimento diventa morbido un istante dopo. Nessuno se ne
  // accorge, e il caricamento iniziale resta leggero.
  void import("lenis").then(({ default: Lenis }) => {
    if (!vivo) return;

    const l = new Lenis({
      duration: 1.05,
      // Uscita esponenziale: parte decisa, arriva piano. La stessa curva
      // di `--ease-out-expo`, così il movimento della pagina e quello
      // degli elementi hanno lo stesso carattere.
      easing: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      // Sul dito l'inerzia del sistema è già migliore di qualunque
      // emulazione, e toglierla è il modo più veloce per far sembrare
      // rotto un telefono.
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    l.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);

    lenis = l as unknown as typeof lenis;
    // Se il pannello si è aperto mentre il modulo arrivava, la pagina
    // deve nascere già ferma: altrimenti si scorre dietro il menu.
    if (fermo) l.stop();
    for (const b of inCoda) l.scrollTo(b as never, { offset: 0 });
    inCoda.length = 0;
  });

  return {
    vai(bersaglio) {
      if (lenis) lenis.scrollTo(bersaglio, { offset: 0 });
      else inCoda.push(bersaglio);
    },
    ferma() {
      fermo = true;
      lenis?.stop();
    },
    riparti() {
      fermo = false;
      lenis?.start();
    },
    spegni() {
      vivo = false;
      gsap.ticker.remove(tick);
      lenis?.destroy();
      lenis = null;
    },
  };
}

/**
 * Rimisura le scene quando cambia ciò da cui dipendono le misure.
 *
 * I caratteri sono il caso classico: un titolo impaginato con il
 * carattere di ripiego è alto una riga in meno di quello definitivo, e
 * ogni sezione fissata sotto di esso partirebbe qualche centinaio di
 * pixel più in su. Si rimisura quando i font sono pronti, quando le
 * immagini finiscono, e quando la finestra cambia larghezza davvero —
 * non alla comparsa della barra degli indirizzi su iOS, che cambia solo
 * l'altezza e rimisurerebbe a ogni scroll.
 */
export function rimisura(): () => void {
  if (typeof window === "undefined" || !inMovimento()) return () => {};

  registra();

  const aggiorna = () => ScrollTrigger.refresh();

  let larghezza = innerWidth;
  const suResize = () => {
    if (Math.abs(innerWidth - larghezza) < 2) return;
    larghezza = innerWidth;
    aggiorna();
  };

  void document.fonts?.ready.then(aggiorna);
  addEventListener("load", aggiorna);
  addEventListener("resize", suResize);

  return () => {
    removeEventListener("load", aggiorna);
    removeEventListener("resize", suResize);
  };
}
