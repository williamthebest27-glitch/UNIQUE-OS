"use client";

import { useEffect, useRef, useState } from "react";
import { Entra, Etichetta, Lettura, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { livello } from "@/lib/landing/capacita";

/**
 * Il film.
 *
 * Otto secondi che rifanno da capo la strada delle otto sezioni sopra:
 * l'elica si legge, si disfa in particelle, e le particelle si
 * ricompongono in un referto con un numero dentro. È la stessa frase che
 * la pagina ha appena finito di argomentare, detta un'ultima volta senza
 * parole — e per questo sta **dopo** l'argomento e prima della porta.
 * Metterlo in cima avrebbe raccontato il finale alla prima riga.
 *
 * **La pagina resta bianca, il film è l'unica cosa scura.** La landing è
 * passata dal nero al bianco per una ragione, e una banda nera qui
 * l'avrebbe rimessa in discussione per un effetto. Il contrasto ce l'ha
 * già il filmato: un rettangolo profondo su un foglio chiaro, con un
 * alone freddo che gli impedisce di sembrare un buco.
 *
 * **Non scarica niente finché non serve.** `preload="none"` e una posa
 * al posto del primo fotogramma: il file parte quando la sezione si
 * avvicina, e si ferma appena esce di campo — su un telefono in
 * roaming la differenza è tutta la sezione. E sotto i 768 pixel il
 * browser prende un taglio da 1,4 MB invece che da 3,2.
 *
 * **Si può fermare.** Un filmato che si muove da solo per più di cinque
 * secondi deve avere un comando per stare zitto — è una regola
 * d'accessibilità, non una gentilezza — e chi ha chiesto meno movimento
 * riceve la posa ferma, con il comando per farlo partire se lo vuole.
 */

/**
 * Le sorgenti, nell'ordine in cui il browser le prova: prende la prima
 * che sa leggere e la cui `media` è vera.
 *
 * Sotto i 768 pixel c'è solo l'MP4 a 720p — 1,4 MB contro i 3,2 del
 * taglio grande. Il WebM del taglio piccolo non c'è apposta: a quella
 * risoluzione VP9 usciva più pesante di H.264, e una sorgente che pesa
 * di più non è un'alternativa, è un peggioramento servito per primo.
 * Sul taglio grande il rapporto si ribalta e il WebM torna davanti.
 *
 * Il filmato non ha traccia audio: non c'è niente da silenziare.
 */
const SORGENTI = [
  { src: "/dna-unique-720.mp4", type: "video/mp4", media: "(max-width: 768px)" },
  { src: "/dna-unique.webm", type: "video/webm" },
  { src: "/dna-unique.mp4", type: "video/mp4" },
];

export function DnaFilm() {
  const video = useRef<HTMLVideoElement>(null);
  /** Lo stato segue l'elemento, non il contrario: così non mente mai. */
  const [inPausa, setInPausa] = useState(false);
  /** Una pausa chiesta a mano non deve essere annullata dallo scroll. */
  const scelto = useRef<"parte" | "ferma" | null>(null);

  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const q = gsap.utils.selector(radice);

    gsap.from(q("[data-lastra]"), {
      y: ridotta ? 24 : 60,
      scale: ridotta ? 1 : 0.968,
      opacity: 0,
      duration: ridotta ? 0.85 : 1.3,
      ease: "expo.out",
      scrollTrigger: { trigger: radice, start: "top 82%", once: true },
    });

    // L'alone è scenografia: dove la materia costa, non si disegna.
    if (ridotta) return;

    gsap.from(q("[data-alone]"), {
      opacity: 0,
      scale: 0.82,
      duration: 1.7,
      ease: "expo.out",
      scrollTrigger: { trigger: radice, start: "top 82%", once: true },
    });
  });

  useEffect(() => {
    const nodo = video.current;
    if (!nodo) return;

    // Il livello si legge dopo il montaggio: leggerlo mentre si compone
    // il markup darebbe al server e al browser due alberi diversi.
    if (livello() === "ferma") {
      scelto.current = "ferma";
      setInPausa(true);
      return;
    }

    const osservatore = new IntersectionObserver(
      ([voce]) => {
        if (!voce) return;
        if (voce.isIntersecting) {
          if (scelto.current === "ferma") return;
          // Un rifiuto del browser — risparmio energia, dati ridotti —
          // non è un guasto: resta la posa, e il comando per insistere.
          void nodo.play().catch(() => setInPausa(true));
        } else {
          nodo.pause();
        }
      },
      // Un margine largo: il file comincia ad arrivare prima che la
      // sezione sia in campo, e quando ci arriva sta già andando.
      { rootMargin: "300px 0px", threshold: 0.01 },
    );

    osservatore.observe(nodo);
    return () => osservatore.disconnect();
  }, []);

  const commuta = () => {
    const nodo = video.current;
    if (!nodo) return;
    if (nodo.paused) {
      scelto.current = "parte";
      void nodo.play().catch(() => undefined);
    } else {
      scelto.current = "ferma";
      nodo.pause();
    }
  };

  return (
    <section ref={rif} id="dna" className="os-sezione">
      <div className="os-gabbia">
        <header>
          <Etichetta indice="09" tono="dato">
            The film
          </Etichetta>
          <Titolo
            testo={"Intelligence\nin your DNA."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[52ch]">
            Tutto quello che hai letto fin qui, in otto secondi. L&rsquo;elica
            viene letta, si disfa nei suoi dati, e i dati si rimettono insieme
            in una cosa sola: cosa fare adesso. È lo stesso percorso delle
            sezioni qui sopra — dal dato grezzo alla decisione — con la
            differenza che qui non serve leggerlo.
          </Entra>
        </header>

        {/* ── Il film ──────────────────────────────────────────── */}
        <figure className="os-film mt-14 sm:mt-20">
          {/* Un alone freddo dietro la lastra: senza, il rettangolo scuro
              sembra un buco ritagliato nel foglio. */}
          <div data-alone="" className="os-film-alone" aria-hidden="true" />

          <div data-lastra="" className="os-film-lastra">
            <video
              ref={video}
              className="os-film-video"
              poster="/dna-unique.jpg"
              preload="none"
              muted
              loop
              playsInline
              width={1920}
              height={1080}
              onPlay={() => setInPausa(false)}
              onPause={() => setInPausa(true)}
              aria-label="Il sistema in otto secondi: l'elica del DNA si legge, si disfa nei suoi dati e si ricompone in un referto con un punteggio di longevità."
            >
              {SORGENTI.map((s) => (
                <source key={s.src} src={s.src} type={s.type} media={s.media} />
              ))}
            </video>

            {/* Il nome accessibile cambia con lo stato: è il modo giusto
                di dire a chi non vede il segno che cosa fa il comando ora.
                Su telefono la parola sparisce e resta il segno — il nome
                però no, e viene dall'`aria-label`. */}
            <button
              type="button"
              onClick={commuta}
              className="os-film-comando"
              aria-label={inPausa ? "Riprendi il filmato" : "Ferma il filmato"}
            >
              <span aria-hidden="true">{inPausa ? <Play /> : <Pausa />}</span>
              <span aria-hidden="true" className="os-film-parola">
                {inPausa ? "Riprendi" : "Ferma"}
              </span>
            </button>
          </div>

          <figcaption className="os-film-didascalia">
            <Lettura chiave="00:00" valore="L'elica" tono="dato" />
            <Lettura chiave="00:04" valore="I dati" tono="mente" />
            <Lettura chiave="00:08" valore="La decisione" tono="azione" />
            <span className="os-mono text-[color:var(--os-appena)]">
              Senza audio
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ── I due segni del comando ──────────────────────────────────────── */

function Pausa() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
      <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
      <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
    </svg>
  );
}

function Play() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
      <path d="M3.2 1.7v8.6a.5.5 0 0 0 .77.42l6.3-4.3a.5.5 0 0 0 0-.84L3.97 1.28a.5.5 0 0 0-.77.42Z" />
    </svg>
  );
}
