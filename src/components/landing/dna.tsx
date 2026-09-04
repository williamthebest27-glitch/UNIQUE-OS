"use client";

import { useRef } from "react";
import { Etichetta } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";

/**
 * Il film, mosso dallo scorrimento.
 *
 * Otto secondi che dicono senza parole la stessa cosa della sezione
 * sopra: l'elica si legge, si disfa nei suoi dati, e i dati si
 * ricompongono in un referto con un punteggio dentro. Sta subito dopo
 * «The system» perché ne è la dimostrazione — prima si afferma che il
 * corpo produce dati e che il sistema li trasforma in direzione, poi lo
 * si guarda succedere.
 *
 * **Non si riproduce: si scorre.** La pagina si ferma, il film avanza di
 * pari passo con la rotellina, e quando arriva in fondo la pagina
 * riprende a scendere. È anche il motivo per cui adesso parte sempre:
 * non dipende più da `play()`, e quindi non dipende più dal permesso che
 * il browser dà o nega all'avvio automatico — che è la ragione per cui
 * prima restava fermo sul primo fotogramma. Qui non c'è nessun avvio da
 * concedere, solo un fotogramma scelto da quanto si è scorso.
 *
 * **Il file è codificato per essere scrubbato.** Un MP4 normale porta un
 * fotogramma chiave ogni due secondi, e per mostrare l'istante 3,4 il
 * browser deve decodificare tutto quello che sta in mezzo: sotto il dito
 * si impunta. Questo ne ha uno ogni sei fotogrammi, un quarto di
 * secondo, così ogni salto è corto. È il vero motivo per cui pesa un po'
 * più di un filmato che si guarda e basta.
 *
 * **Senza movimento resta un video normale.** Con `prefers-reduced-motion`
 * la scena non viene costruita: niente pagina che si ferma, niente
 * fotogrammi legati al dito. Restano la posa e un comando per guardarlo
 * — la stessa cosa, senza muovere nulla che non sia stato chiesto.
 */

/** Un salto più corto di mezzo fotogramma è lavoro buttato. */
const SOGLIA = 1 / 48;

export function DnaFilm() {
  const video = useRef<HTMLVideoElement>(null);

  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const palco = radice.querySelector<HTMLElement>("[data-palco]");
    const nastro = radice.querySelector<HTMLElement>("[data-nastro]");
    const nodo = video.current;
    if (!palco || !nodo) return;

    /* Da qui il film lo muove lo scorrimento, e il comando di
       riproduzione non ha più niente da fare: lo toglie il CSS. */
    radice.dataset.scorre = "";

    /* Servono i dati, non i soli metadati: un fotogramma si mostra solo
       se è stato scaricato. Il caricamento parte qui e non nel markup,
       così chi ha meno movimento non se lo trova addosso comunque. */
    nodo.preload = "auto";
    nodo.muted = true;
    nodo.load();

    let durata = 0;
    let ultimo = -1;
    const misura = () => {
      durata = Number.isFinite(nodo.duration) ? nodo.duration : 0;
    };
    nodo.addEventListener("loadedmetadata", misura);
    if (nodo.readyState >= 1) misura();

    const stato = { t: 0 };

    const scena = gsap.to(stato, {
      t: 1,
      ease: "none",
      scrollTrigger: {
        trigger: palco,
        start: "top top",
        /* Quanta rotellina vale il film. Due schermate e mezza danno agli
           otto secondi un passo leggibile; sul telefono si accorcia, o
           per arrivare in fondo servirebbe un pollice paziente. */
        end: () => `+=${Math.round(innerHeight * (ridotta ? 1.5 : 2.4))}`,
        pin: true,
        anticipatePin: 1,
        /* Lo scrub smorza: il fotogramma insegue il dito invece di
           incollarcisi, e uno strappo non diventa una raffica di salti. */
        scrub: ridotta ? 0.4 : 0.7,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        if (nastro) nastro.style.transform = `scaleX(${stato.t})`;
        if (!durata || nodo.readyState < 2) return;

        /* L'ultimo istante non si tocca: un `currentTime` esattamente
           pari alla durata manda il filmato in `ended`, e il fotogramma
           sparisce proprio mentre lo si sta guardando. */
        const istante = stato.t * (durata - 0.05);
        if (Math.abs(istante - ultimo) < SOGLIA) return;
        ultimo = istante;
        nodo.currentTime = istante;
      },
    });

    return () => {
      nodo.removeEventListener("loadedmetadata", misura);
      scena.scrollTrigger?.kill();
      scena.kill();
    };
  });

  /** Il ripiego: senza scena, il film si guarda come un film. */
  const guarda = () => {
    const nodo = video.current;
    if (!nodo) return;
    nodo.muted = true;
    if (nodo.paused) void nodo.play().catch(() => undefined);
    else nodo.pause();
  };

  return (
    <section ref={rif} id="dna" className="os-film">
      <div data-palco="" className="os-film-palco">
        <video
          ref={video}
          className="os-film-video"
          src="/dna-unique-scrub.mp4"
          poster="/dna-unique.jpg"
          preload="none"
          muted
          playsInline
          width={1280}
          height={720}
          aria-label="Il sistema in otto secondi: l'elica del DNA si legge, si disfa nei suoi dati e si ricompone in un referto con un punteggio di longevità."
        />

        {/* Il velo tiene leggibile la scritta sopra un filmato che cambia
            luminosità di continuo. */}
        <div className="os-film-velo" aria-hidden="true" />

        <div className="os-film-testo">
          <Etichetta tono="dato">The film</Etichetta>
          <h2 className="os-film-titolo">Intelligence in your DNA.</h2>
          <p className="os-film-riga">
            Scorri: il filmato avanza con te. Dal dato grezzo alla decisione,
            negli stessi otto secondi che al sistema servono per arrivarci.
          </p>

          <button type="button" onClick={guarda} className="os-film-avvia">
            Guarda il filmato
          </button>
        </div>

        {/* Il nastro dice a che punto è il film, e quindi quanto manca
            prima che la pagina riprenda a scendere. */}
        <div className="os-film-nastro" aria-hidden="true">
          <span data-nastro="" />
        </div>
      </div>
    </section>
  );
}
