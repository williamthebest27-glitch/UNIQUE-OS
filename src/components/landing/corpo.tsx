"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * Il corpo.
 *
 * Una sola immagine ferma dietro l'hero: una persona disegnata da
 * decine di migliaia di punti, con i segnali rossi appesi lungo la rete
 * e la luce del cuore in mezzo al petto.
 *
 * **Perché un'immagine e non più la figura calcolata.** Prima qui c'era
 * un corpo costruito a mano — uno scheletro di diciassette ossa e
 * quattordicimila punti appesi addosso, ridisegnati a ogni fotogramma —
 * e respirava davvero. Ma quattordicimila rettangoli sessanta volte al
 * secondo, dietro a una sezione fissata che sta già facendo scorrere uno
 * shader a schermo intero, sono il primo posto in cui una landing perde
 * la fluidità: e una scena che scatta si legge come un sito lento, non
 * come un corpo vivo. L'immagine racconta la stessa cosa — anzi, con un
 * dettaglio anatomico che nessuna nuvola di punti generata dà — e non
 * costa un fotogramma. Il movimento resta dove serve: nell'alone che le
 * respira dietro e nello scorrimento che la attraversa.
 *
 * **Il bianco del file deve sparire.** L'immagine ha un fondo bianco
 * pieno: messa così com'è sopra al campo coprirebbe l'alone che si muove
 * dietro, e al centro della scena resterebbe un rettangolo opaco.
 * `mix-blend-mode: multiply` fa esattamente ciò che serve — il bianco
 * moltiplicato per quello che sta sotto non lo cambia, l'inchiostro dei
 * punti sì — e il corpo diventa una macchia sulla carta, con la luce del
 * sistema che continua a passargli attraverso. È lo stesso trattamento
 * del campo, per la stessa ragione.
 *
 * **La dissolvenza si fa con la luce, non con una maschera.** Scorrendo
 * il corpo non svanisce: viene *consumato*. Prima un piano di luce sale
 * da terra e gli toglie le gambe, poi il cuore si apre e lo mangia
 * dall'interno verso fuori. Le due gomme sono due gradienti bianchi
 * dentro allo stesso gruppo che poi si moltiplica: dove sono bianche il
 * corpo sparisce e il fondo resta intatto, perché bianco per qualcosa fa
 * quel qualcosa. Muoverle costa due `transform` — nessuna maschera da
 * ridisegnare a ogni fotogramma proprio mentre la sezione è fissata, che
 * è il modo più sicuro di rimettere la jank da cui siamo appena usciti.
 *
 * Le due gomme, a riposo, sono invisibili: il piano sta tutto sotto al
 * riquadro e il cuore è a scala zero. È la regola della landing —
 * **lo stato di riposo è quello finale** — e vale anche qui: senza GSAP,
 * con `prefers-reduced-motion` o con la rete che cade, resta un corpo
 * intero e fermo, che è una versione della scena e non un guasto.
 */

/** Le proporzioni del file: servono a riservare lo spazio esatto. */
const LARGHEZZA = 1024;
const ALTEZZA = 1536;

/*
 * Dove sta il cuore dentro l'immagine.
 *
 * Misurato sul file, non a occhio: è il centro da cui si apre la
 * dissolvenza, e sbagliarlo di qualche punto vuol dire un corpo che si
 * apre da una spalla invece che dal petto.
 */
const CUORE_X = "55%";
const CUORE_Y = "25%";

/*
 * Il velo: il corpo si dissolve verso il basso invece di finire con un
 * taglio netto, e si alleggerisce dove passano il sottotitolo e i
 * comandi. In una gara fra una figura e una frase deve vincere la frase.
 */
const VELO =
  "linear-gradient(180deg, transparent 0%, #000 5%, #000 52%, rgb(0 0 0 / 0.5) 74%, rgb(0 0 0 / 0.26) 90%, transparent 100%)";

/*
 * Il cuore che si apre.
 *
 * Tre gradienti sovrapposti e sfalsati, non un cerchio solo: un cerchio
 * che cresce si riconosce come un cerchio, e la luce che apre un corpo
 * non ha un raggio. Restano un unico riempimento — è una sola pittura,
 * scalata da una `transform`.
 */
const CUORE = [
  "radial-gradient(closest-side at 50% 50%, #fff 26%, rgb(255 255 255 / 0.92) 46%, rgb(255 255 255 / 0.4) 72%, transparent 92%)",
  "radial-gradient(closest-side at 63% 37%, #fff 14%, rgb(255 255 255 / 0.35) 48%, transparent 74%)",
  "radial-gradient(closest-side at 36% 62%, #fff 12%, rgb(255 255 255 / 0.3) 44%, transparent 70%)",
].join(", ");

/* Il piano di luce che sale da terra: opaco alla base, sfumato in cima,
   così il bordo che avanza sul corpo è una linea d'orizzonte e non un
   taglio. */
const SUOLO =
  "linear-gradient(to top, #fff 0%, #fff 58%, rgb(255 255 255 / 0.62) 80%, transparent 100%)";

export function CorpoDiPunti({ className }: { className?: string }) {
  const rif = useRef<HTMLImageElement>(null);
  const [arrivato, setArrivato] = useState(false);

  /*
   * Un'immagine già in cache è `complete` prima ancora che React attacchi
   * `onLoad`, e quell'evento non arriva più: senza questo controllo il
   * corpo resterebbe invisibile proprio alle visite successive alla
   * prima, che sono quelle che devono sembrare istantanee.
   */
  useEffect(() => {
    if (rif.current?.complete) setArrivato(true);
  }, []);

  return (
    <div
      data-figura=""
      aria-hidden="true"
      className={cx("flex items-center justify-center", className)}
      /*
       * Il `multiply` sta *qui*, sull'elemento che lo scorrimento anima, e
       * non su un figlio: un'opacità inferiore a uno su un antenato
       * isolerebbe il gruppo, e il corpo smetterebbe di moltiplicarsi sulla
       * carta e tornerebbe a coprire l'alone con un rettangolo bianco
       * proprio mentre si dissolve.
       */
      style={{ mixBlendMode: "multiply" }}
    >
      <div className="relative h-full aspect-[1024/1536]">
        <img
          ref={rif}
          src="/corpo-punti.webp"
          alt=""
          width={LARGHEZZA}
          height={ALTEZZA}
          decoding="async"
          fetchPriority="high"
          onLoad={() => setArrivato(true)}
          className="h-full w-full"
          style={{
            /* Non un lampo: il corpo si posa. La transizione sta
               sull'immagine e non sul gruppo, così non litiga con
               l'opacità che lo scorrimento scrive più tardi. */
            opacity: arrivato ? 1 : 0,
            transition: "opacity 1.2s var(--ease-out-expo)",
            maskImage: VELO,
            WebkitMaskImage: VELO,
          }}
        />

        {/* Il piano di luce, fermo appena sotto ai piedi finché non si
            scorre. */}
        <div
          data-suolo=""
          className="absolute inset-x-[-25%] top-full h-[130%]"
          style={{ background: SUOLO }}
        />

        {/* Il cuore. Il riquadro esterno lo centra sul petto e non viene
            mai toccato; a crescere è solo la luce dentro, così la
            `transform` di GSAP non si mangia il centraggio. */}
        <div
          className="absolute aspect-square w-[60%] -translate-x-1/2 -translate-y-1/2"
          style={{ left: CUORE_X, top: CUORE_Y }}
        >
          <div
            data-cuore=""
            className="h-full w-full"
            style={{ background: CUORE, transform: "scale(0)" }}
          />
        </div>
      </div>
    </div>
  );
}
