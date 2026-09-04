"use client";

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion/engine";

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
 * **Si alza comunque, in tutti e tre i modi in cui potrebbe non farlo.**
 * Se il JavaScript non arriva, l'uscita parte da sola dopo 2,8 s per via
 * di un'animazione CSS. Se il motore c'è ma i fotogrammi non arrivano —
 * scheda in secondo piano: `requestAnimationFrame` si ferma — un timer
 * chiude lo stesso, e i timer girano anche da nascosti. E se la pagina
 * nasce in una scheda che nessuno sta guardando, il sipario non compare
 * affatto: sarebbe una presentazione a sala vuota, e chi torna
 * troverebbe l'applicazione ancora coperta.
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
  const [visibile, setVisibile] = useState(true);
  const [uscita, setUscita] = useState(false);
  const rif = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodo = rif.current;
    if (!nodo) return;

    // Chi ha chiesto meno movimento non lo vede; e nemmeno chi ha aperto
    // la pagina in una scheda in secondo piano, dove il sipario sarebbe
    // solo una coperta da togliere al ritorno.
    if (reducedMotion() || document.hidden) {
      setVisibile(false);
      return;
    }

    // Da qui in poi l'avanzamento lo scrive il motore: la scorta in CSS
    // servirebbe solo a litigare con lui.
    nodo.dataset.motore = "";

    const t0 = performance.now();
    let prontoDa = Infinity;
    let chiusuraDa = 0;
    let pAllaChiusura = 0;
    let raf = 0;
    let timer = 0;

    const caricato = Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      decodifica("/marchio-unique.png"),
    ]);

    Promise.race([caricato, attesa(LIMITE)]).then(() => {
      prontoDa = Math.max(performance.now(), t0 + DURATA_MINIMA);
    });

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
    const scorta = window.setTimeout(chiudi, SCORTA);

    return () => {
      finito = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(scorta);
    };
  }, []);

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
