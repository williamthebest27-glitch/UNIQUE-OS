"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { reducedMotion } from "@/lib/motion/engine";
import { ALZA, CALA, calaSipario } from "./sipario";

/**
 * Il sipario d'avvio.
 *
 * Il marchio al centro, una barra che si riempie sotto, e il livello che
 * sale dentro la U con la cresta di un'onda: il logo non aspetta, si
 * riempie. È la stessa informazione della barra, detta due volte — una
 * per chi guarda il marchio, una per chi guarda quanto manca.
 *
 * **Sta nell'HTML di partenza, non appare dopo l'idratazione.** Un
 * sipario montato da JavaScript arriva quando la pagina è già a schermo:
 * si vedrebbe il contenuto, poi il sipario che lo copre, poi il sipario
 * che si alza. Qui il markup esce dal server, e il client si limita a
 * governare l'avanzamento e a togliere il nodo alla fine.
 *
 * **Si alza comunque, in tutti i modi in cui potrebbe non farlo.** Se il
 * JavaScript non arriva, l'uscita parte da sola dopo 2,8 s per via di
 * un'animazione CSS. Se il motore c'è ma i fotogrammi non arrivano —
 * scheda in secondo piano: `requestAnimationFrame` si ferma — un timer
 * chiude lo stesso, e i timer girano anche da nascosti.
 *
 * **Se la pagina nasce nascosta la presentazione si rimanda, non si
 * butta.** Il primo avvio del sito è proprio il caso in cui questo
 * capita: si scrive l'indirizzo, il browser pre-renderizza la pagina in
 * un documento nascosto, e al primo Invio la porta a schermo già
 * idratata — l'effetto è lo stesso di una scheda aperta in secondo piano
 * o ripristinata all'avvio del browser. Smontare il sipario lì
 * significherebbe non mostrarlo mai proprio la prima volta. Qui il
 * motore aspetta il `visibilitychange` e parte da capo quando c'è
 * qualcuno che guarda; la scorta in CSS viene disinnescata subito, così
 * il sipario non si alza a sala vuota.
 *
 * Con `prefers-reduced-motion` non compare: lo nasconde il CSS al primo
 * fotogramma, e l'effetto qui sotto lo smonta.
 */

/** Quanto resta a schermo come minimo: sotto, il sipario è un lampo. */
const DURATA_MINIMA = 1500;
/** Oltre questo non si aspetta più nulla: un CDN lento non intrappola nessuno. */
const LIMITE = 2600;
/** La salita del sipario, allineata a `avvio-sipario` nel CSS. */
const USCITA = 720;
/** Dal novanta per cento al pieno, quando tutto è davvero pronto. */
const CHIUSURA = 300;
/** Oltre questo si chiude comunque, fotogrammi o non fotogrammi. */
const SCORTA = LIMITE + CHIUSURA + 300;
/**
 * Quanto si aspetta prima di calare il sipario su richiesta.
 *
 * Una password rifiutata torna anche in due decimi di secondo. Calare il
 * sipario appena si preme «Entra» darebbe, in quel caso, un lampo bianco
 * al posto di un messaggio. Si concede questo margine: se la risposta è
 * «no» il sipario non si vede affatto, e se è «sì» — o se il server ci
 * mette il tempo che di solito ci mette — cala in tempo per coprire
 * l'attesa vera.
 */
const GRAZIA = 200;

function attesa(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

/** Il marchio decodificato, non solo scaricato: altrimenti l'onda parte su un vuoto. */
function decodifica(src: string): Promise<unknown> {
  const img = new window.Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}

export function Avvio() {
  const percorso = usePathname();
  const [visibile, setVisibile] = useState(true);
  const [uscita, setUscita] = useState(false);
  /** Cambia a ogni replica: rimonta il motore e lo fa ripartire da zero. */
  const [giro, setGiro] = useState(0);
  const rif = useRef<HTMLDivElement>(null);
  /** L'uscita immediata del giro in corso, per chi la chiede da fuori. */
  const uscitaSubito = useRef(() => {});

  useEffect(() => {
    const nodo = rif.current;
    if (!nodo) return;

    // Chi ha chiesto meno movimento non lo vede.
    if (reducedMotion()) {
      setVisibile(false);
      return;
    }

    // Da qui in poi l'avanzamento lo scrive il motore: la scorta in CSS
    // servirebbe solo a litigare con lui. Va tolta subito, anche quando
    // la partenza è rimandata — altrimenti il sipario si alzerebbe da
    // solo mentre nessuno guarda, e chi arriva troverebbe la festa già
    // finita.
    nodo.dataset.motore = "";

    let raf = 0;
    let timer = 0;
    let scorta = 0;
    let finito = false;

    const chiudi = () => {
      if (finito) return;
      finito = true;
      cancelAnimationFrame(raf);
      // La barra arriva in fondo comunque: una barra che sparisce a metà
      // dice che qualcosa è andato storto, anche quando non è vero.
      nodo.style.setProperty("--p", "1");
      setUscita(true);
      timer = window.setTimeout(() => setVisibile(false), USCITA);
    };

    // Chi cala il sipario sulla soglia deve poterlo rialzare prima del
    // tempo: l'accesso può anche non riuscire.
    uscitaSubito.current = chiudi;

    const avvia = () => {
      const t0 = performance.now();
      let prontoDa = Infinity;
      let chiusuraDa = 0;
      let pAllaChiusura = 0;

      const caricato = Promise.all([
        document.fonts?.ready ?? Promise.resolve(),
        decodifica("/marchio-unique.png"),
      ]);

      Promise.race([caricato, attesa(LIMITE)]).then(() => {
        prontoDa = Math.max(performance.now(), t0 + DURATA_MINIMA);
      });

      const passo = (ora: number) => {
        // Finché non si è pronti la barra si avvicina al novanta per cento
        // senza arrivarci: è l'unica promessa che il codice può mantenere
        // quando non sa ancora quanto manca.
        const base = 0.9 * (1 - Math.exp(-(ora - t0) / 620));
        let p = base;

        if (ora >= prontoDa) {
          if (!chiusuraDa) {
            chiusuraDa = ora;
            pAllaChiusura = base;
          }
          const q = Math.min(1, (ora - chiusuraDa) / CHIUSURA);
          p = pAllaChiusura + (1 - pAllaChiusura) * q;
        }

        nodo.style.setProperty("--p", p.toFixed(4));

        if (p >= 1) {
          chiudi();
          return;
        }
        raf = requestAnimationFrame(passo);
      };

      raf = requestAnimationFrame(passo);
      scorta = window.setTimeout(chiudi, SCORTA);
    };

    const alRitorno = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", alRitorno);

      // Il dondolio e l'arrivo del testo sono animazioni CSS: nascoste o
      // no, il tempo per loro è passato lo stesso, e la scena
      // comparirebbe a metà. Si riavvolgono. Se il browser non sa
      // riavvolgerle, pazienza — il motore parte comunque.
      nodo.getAnimations?.({ subtree: true }).forEach((animazione) => {
        animazione.cancel();
        animazione.play();
      });

      avvia();
    };

    if (document.hidden) {
      document.addEventListener("visibilitychange", alRitorno);
    } else {
      avvia();
    }

    return () => {
      finito = true;
      document.removeEventListener("visibilitychange", alRitorno);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(scorta);
    };
  }, [giro]);

  // Il sipario a richiesta, per chi sta sulla soglia. Cambiare `giro`
  // rimonta il motore qui sopra: stessa scena, stesso conto alla
  // rovescia, e nessun percorso separato da tenere allineato.
  useEffect(() => {
    let attesa = 0;

    const cala = () => {
      if (reducedMotion()) return;
      clearTimeout(attesa);
      attesa = window.setTimeout(() => {
        setUscita(false);
        setVisibile(true);
        setGiro((n) => n + 1);
      }, GRAZIA);
    };

    // Chi si è pentito in tempo non lo fa nemmeno comparire; agli altri
    // resta l'uscita anticipata del giro in corso.
    const alza = () => {
      clearTimeout(attesa);
      uscitaSubito.current();
    };

    window.addEventListener(CALA, cala);
    window.addEventListener(ALZA, alza);
    return () => {
      clearTimeout(attesa);
      window.removeEventListener(CALA, cala);
      window.removeEventListener(ALZA, alza);
    };
  }, []);

  /*
   * Uscire dalla landing è entrare nel prodotto, e si entra col sipario.
   *
   * Un ascoltatore solo, qui, invece di una prop su ogni comando: i
   * richiami all'accesso sulla pagina pubblica sono otto fra la barra,
   * le sezioni e il piede — «Accedi», «Registrati», «Entra in Unique
   * OS», «Attiva il tuo accesso» — e il nono, quello che qualcuno
   * aggiungerà il mese prossimo, si dimenticherebbe di calarlo.
   *
   * Il criterio è grezzo apposta: dalla landing, qualunque collegamento
   * interno che porti altrove. Le ancore alle sezioni restano su «/» e
   * non contano; ciò che esce da «/» è il prodotto, e non c'è altro
   * posto dove andare.
   */
  useEffect(() => {
    if (percorso !== "/") return;

    const alClic = (ev: MouseEvent) => {
      // Un clic col tasto centrale, o con un modificatore, apre altrove:
      // questa pagina non si muove e il sipario non c'entra.
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      const ancora = (ev.target as Element | null)?.closest?.("a");
      if (!(ancora instanceof HTMLAnchorElement)) return;
      if (ancora.target && ancora.target !== "_self") return;
      if (ancora.hasAttribute("download")) return;

      const destinazione = new URL(ancora.href, location.href);
      if (destinazione.origin !== location.origin) return;
      if (destinazione.pathname === "/") return;

      calaSipario();
    };

    document.addEventListener("click", alClic);
    return () => document.removeEventListener("click", alClic);
  }, [percorso]);

  if (!visibile) return null;

  return (
    <div
      ref={rif}
      className="avvio"
      data-uscita={uscita ? "" : undefined}
      aria-hidden="true"
    >
      <div className="avvio-scena">
        <OndaMarchio />

        <img
          className="avvio-testo"
          src="/testo-unique.png"
          alt=""
          width={974}
          height={286}
          decoding="async"
        />

        <div className="avvio-barra">
          <span />
        </div>
      </div>
    </div>
  );
}

/**
 * Il marchio che si riempie.
 *
 * Due copie della stessa immagine: sotto quella spenta, sopra quella
 * piena ritagliata da una maschera. Nella maschera vivono due onde di
 * velocità diversa — la loro unione fa una cresta che non si ripete a
 * occhio — dentro un gruppo che sale con l'avanzamento.
 *
 * Il tracciato è largo il doppio del riquadro e scorre di esattamente
 * metà: l'anello si chiude senza salto.
 */
function OndaMarchio() {
  const onda =
    "M0 0 q55.125 -26 110.25 0 t110.25 0 t110.25 0 t110.25 0 t110.25 0 t110.25 0 t110.25 0 t110.25 0 V620 H0 Z";

  return (
    <svg className="avvio-marchio" viewBox="0 0 441 494" role="img" aria-label="Unique OS">
      <defs>
        <mask id="avvio-livello" maskUnits="userSpaceOnUse" x="0" y="0" width="441" height="494">
          <g className="avvio-livello">
            <g className="avvio-onda avvio-onda-a">
              <path d={onda} fill="#fff" />
            </g>
            <g className="avvio-onda avvio-onda-b">
              <path d={onda} fill="#fff" />
            </g>
          </g>
        </mask>
      </defs>

      <image className="avvio-spento" href="/marchio-unique.png" width="441" height="494" />
      <image href="/marchio-unique.png" width="441" height="494" mask="url(#avvio-livello)" />
    </svg>
  );
}
