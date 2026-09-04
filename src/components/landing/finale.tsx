"use client";

import { useMemo } from "react";
import { Marchio } from "@/components/brand/marchio";
import { Comando, Freccia, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { campo, legami, arco } from "@/lib/landing/geometria";

/**
 * La porta.
 *
 * La pagina si chiude come si è aperta: lo stesso campo di punti, lo
 * stesso marchio, lo stesso vuoto. Ma all'inizio il sistema si accendeva
 * e non si sapeva cosa fosse; qui si sa, e la sola cosa rimasta da fare
 * è entrarci. È un ritorno, non una ripetizione — ed è il motivo per cui
 * la costellazione è generata con un seme diverso: la stessa figura
 * sarebbe sembrata un errore di copia.
 *
 * Due comandi e basta. Il primo porta dove la sessione dice di portare —
 * al proprio livello se si è già dentro, all'accesso se no. Il secondo
 * porta alla stessa porta, dal lato di chi non ha ancora un account.
 * Nessuno dei due inventa un indirizzo: le destinazioni arrivano dal
 * routing vero, deciso una volta sola in `app/page.tsx`.
 */

const LARGHEZZA = 1440;
const ALTEZZA = 720;

export function FinalCTA({
  entra,
  registrati,
  etichettaEntra,
  autenticato,
}: {
  entra: string;
  registrati: string;
  etichettaEntra: string;
  autenticato: boolean;
}) {
  const nodi = useMemo(
    () =>
      campo({
        quantita: 38,
        larghezza: LARGHEZZA,
        altezza: ALTEZZA,
        seme: 31415926,
        vuotoAlCentro: 0.42,
      }),
    [],
  );

  const rete = useMemo(() => legami(nodi, 250, 2), [nodi]);

  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const q = gsap.utils.selector(radice);

    gsap.from(q("[data-nodo]"), {
      opacity: 0,
      scale: 0,
      transformOrigin: "50% 50%",
      duration: 0.8,
      ease: "expo.out",
      stagger: { each: 0.012, from: "edges" },
      scrollTrigger: { trigger: radice, start: "top 78%", once: true },
    });

    gsap.from(q("[data-legame]"), {
      opacity: 0,
      duration: 1.2,
      stagger: 0.01,
      scrollTrigger: { trigger: radice, start: "top 70%", once: true },
    });

    /* Il campo si stringe attorno al marchio mentre la sezione arriva:
       è il gesto inverso di quello dell'hero, dove si apriva. */
    gsap.fromTo(
      q("[data-rete]"),
      { scale: 1.18 },
      {
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger: radice, start: "top bottom", end: "bottom bottom", scrub: 1 },
      },
    );

    gsap.from(q("[data-marchio]"), {
      opacity: 0,
      scale: 0.8,
      duration: 1.4,
      ease: "expo.out",
      scrollTrigger: { trigger: radice, start: "top 72%", once: true },
    });

    gsap.from(q("[data-comandi] > *"), {
      opacity: 0,
      y: 22,
      duration: 1,
      ease: "expo.out",
      stagger: 0.1,
      scrollTrigger: { trigger: radice, start: "top 52%", once: true },
    });
  });

  return (
    <section
      ref={rif}
      className="relative isolate flex min-h-[92svh] flex-col items-center justify-center overflow-hidden px-5 py-28 text-center"
    >
      {/* ── Il campo, di ritorno ─────────────────────────────────── */}
      <div
        data-rete=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <svg
          viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
        >
          <g stroke="var(--os-dato)" fill="none" strokeWidth="0.7">
            {rete.map((l, i) => (
              <path
                key={i}
                data-legame=""
                d={arco(nodi[l.a].x, nodi[l.a].y, nodi[l.b].x, nodi[l.b].y, 0.12)}
                opacity={(0.07 + l.forza * 0.20).toFixed(3)}
              />
            ))}
          </g>
          <g>
            {nodi.map((n, i) => (
              <circle
                key={i}
                data-nodo=""
                cx={n.x}
                cy={n.y}
                r={(0.9 + n.peso * 1.6).toFixed(2)}
                fill="var(--os-dato)"
                opacity={(0.24 + n.peso * 0.40).toFixed(2)}
              />
            ))}
          </g>
        </svg>
      </div>

      <div
        aria-hidden="true"
        className="os-alone -z-10 left-1/2 top-1/2 h-[42vh] w-[72vw] max-w-[820px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, var(--os-alone-mente), var(--os-alone-dato) 58%, transparent)",
        }}
      />

      <div data-marchio="">
        <Marchio className="h-14 w-auto sm:h-16" />
      </div>

      <Titolo
        tag="h2"
        testo={"You've seen the system.\nNow use it."}
        className="mt-9 text-[clamp(2.4rem,7.4vw,5.6rem)]"
      />

      <p className="os-corpo mx-auto mt-7 max-w-[46ch] text-balance">
        {autenticato
          ? "La tua sessione è aperta: da qui si torna al tuo livello di Unique OS."
          : "L’accesso a Unique OS è riservato ai pazienti e ai professionisti di Unique Longevity Clinic. Se la clinica ti ha già registrato, la porta è aperta."}
      </p>

      <div
        data-comandi=""
        className="mt-10 flex w-full max-w-[420px] flex-col items-center gap-3 sm:w-auto sm:max-w-none sm:flex-row"
      >
        <Comando href={entra} variante="pieno" className="group/os w-full sm:w-auto">
          {etichettaEntra}
          <Freccia />
        </Comando>

        {!autenticato ? (
          <Comando href={registrati} variante="vuoto" className="w-full sm:w-auto">
            Attiva il tuo accesso
          </Comando>
        ) : null}
      </div>

      <p className="os-mono mt-10 flex items-center gap-2.5 text-[color:var(--os-appena)]">
        <span className="os-vivo" aria-hidden="true" />
        Dati sanitari · server nell&rsquo;Unione Europea
      </p>
    </section>
  );
}
