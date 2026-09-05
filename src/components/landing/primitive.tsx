"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { aSiparioAperto } from "@/components/brand/sipario";
import { cx } from "@/components/ui/primitives";
import { inMovimento } from "@/lib/landing/capacita";
import { RITMO_TELEFONO, useScena } from "@/lib/landing/scena";

/**
 * Il vocabolario della landing.
 *
 * Cinque pezzi, e tutta la pagina è scritta con questi: la
 * micro-etichetta numerata, il titolo che si alza da dietro una
 * maschera, il numero che conta, il comando magnetico, la riga di
 * lettura del sistema.
 *
 * Una regola sola, e vale per tutti: **lo stato di riposo è quello
 * finale.** Ogni componente qui dentro esce dal server già visibile e
 * già impaginato. L'animazione è qualcosa che GSAP toglie e rimette,
 * non qualcosa senza cui il contenuto non esiste.
 */

/* ── La micro-etichetta ───────────────────────────────────────────── */

/**
 * Il numero di sezione e il suo nome, nella lingua della macchina.
 *
 * Dà alla pagina la scala di un indice: chi scorre sa sempre a che
 * punto del sistema si trova, senza una barra che glielo ricordi.
 */
export function Etichetta({
  indice,
  children,
  tono = "dato",
  className,
}: {
  indice?: string;
  children: ReactNode;
  tono?: "dato" | "mente" | "azione" | "muto";
  className?: string;
}) {
  const colore = {
    dato: "text-[color:var(--os-dato)]",
    mente: "text-[color:var(--os-mente)]",
    azione: "text-[color:var(--os-azione)]",
    muto: "text-[color:var(--os-tenue)]",
  }[tono];

  return (
    <p className={cx("os-mono flex items-center gap-3", className)}>
      {indice ? (
        <>
          <span className="text-[color:var(--os-segno)]">{indice}</span>
          <span aria-hidden="true" className="h-px w-6 bg-[color:var(--os-riga-viva)]" />
        </>
      ) : null}
      <span className={colore}>{children}</span>
    </p>
  );
}

/* ── Il titolo ────────────────────────────────────────────────────── */

/**
 * Il titolo che si alza parola per parola da dietro una maschera.
 *
 * Le parole restano parole: ogni `<span>` porta il suo spazio *fuori*
 * dalla maschera, o il collasso del bianco le incollerebbe. Il testo
 * intero resta nel flusso, quindi si seleziona, si cerca e si legge da
 * uno screen reader come una frase sola.
 *
 * Con `\n` nel testo si forza un a capo: nei titoli di questa pagina la
 * rottura di riga è parte della composizione, non un caso.
 *
 * Un titolo che nasce già in campo — ce n'è uno solo, quello dell'hero —
 * ha un trigger che scatta prima ancora che si sia scorso, e sul telefono
 * lo scatto cade sotto al sipario d'avvio. `attendiSipario` gli dice di
 * aspettare la scena scoperta, come fa l'accensione attorno a lui.
 *
 * Con `zoom` il titolo prende anche la spinta di camera: entra a tre
 * quarti della sua misura e ci arriva mentre la pagina scorre. È legata
 * allo scorrimento e non a un tempo, quindi la governa il dito — chi si
 * ferma, la ferma; chi torna su, la riavvolge.
 */
export function Titolo({
  testo,
  className,
  tag: Tag = "h2",
  ritardo = 0,
  attendiSipario = false,
  zoom = false,
}: {
  testo: string;
  className?: string;
  tag?: "h1" | "h2" | "h3" | "p";
  ritardo?: number;
  /** Solo per il titolo dell'hero: sale quando il sipario si alza. */
  attendiSipario?: boolean;
  /** Il titolo entra piccolo e cresce mentre la pagina prosegue. */
  zoom?: boolean;
}) {
  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    /* La spinta di camera.
     *
     * Il titolo entra a tre quarti e arriva a grandezza naturale quando
     * è circa a metà schermo. `scrub` lo lega alla posizione della
     * pagina invece che a un tempo: non è un'animazione che parte, è il
     * titolo che sta in un posto diverso a seconda di dove sei.
     *
     * Il fondo scala è 1 e non oltre, ed è una misura di sicurezza
     * prima che una scelta: un titolo che cresce sopra la propria
     * misura esce dalla gabbia, e sul telefono la gabbia lascia venti
     * pixel per lato. Il ritardo di 0.6 sullo scrub è quel tanto di
     * inerzia che toglie lo scatto alla rotellina senza far sembrare
     * che il titolo insegua la pagina.
     *
     * Le parole hanno la loro salita, e le due cose non si pestano i
     * piedi: quella muove i figli, questa muove il blocco. */
    if (zoom) {
      gsap.fromTo(
        radice,
        { scale: 0.72 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: radice,
            start: "top 92%",
            end: "top 42%",
            scrub: 0.6,
          },
        },
      );
    }

    const parole = radice.querySelectorAll<HTMLElement>("[data-parola]");
    if (parole.length === 0) return;

    // Su schermo largo il titolo dell'hero sale come sempre: lì il
    // desktop resta esattamente com'era.
    const aspetta = attendiSipario && ridotta;

    const salita = gsap.from(parole, {
      yPercent: 118,
      opacity: 0,
      // Una rotazione minima sull'asse X dà alla parola un peso che la
      // sola traslazione non ha: sale, non scivola.
      rotateX: -32,
      duration: 1.15,
      ease: "expo.out",
      stagger: 0.055,
      delay: aspetta ? 0 : ritardo,
      paused: aspetta,
      // Chi aspetta il sipario è già in campo: un trigger di scorrimento
      // scatterebbe subito, e il `play` lo rimetterebbe in corsa da capo.
      scrollTrigger: aspetta
        ? undefined
        : {
            trigger: radice,
            start: "top 86%",
            once: true,
          },
    });

    if (!aspetta) return;

    // Sotto al sipario il titolo è già giù, e lo si disegna adesso:
    // aspettare il primo tick vorrebbe dire rischiare di mostrarlo su,
    // farlo sparire e riportarlo su un istante dopo.
    salita.pause(0);

    // Il titolo è una battuta dell'accensione che gli sta attorno, e
    // quella sul telefono va più svelta: al passo di prima resterebbe
    // indietro da sola, sopra una scena già montata.
    salita.timeScale(RITMO_TELEFONO);

    /* Il ritardo non è un'attesa ma una posizione nella coreografia — il
       titolo sale dopo il marchio — e va conservato. Un `play()` nudo lo
       brucerebbe: la partenza nel tempo globale è passata da un pezzo, e
       il titolo salirebbe insieme al marchio invece che dietro di lui.
       Accorciato nella stessa proporzione di tutto il resto, resta la
       stessa posizione nella coreografia.

       Il rinvio nasce fuori dal contesto GSAP — la richiamata arriva
       dopo — quindi il revert non lo conosce e va spento a mano. */
    let rinvio: ReturnType<typeof gsap.delayedCall> | null = null;
    const smetti = aSiparioAperto(() => {
      rinvio = gsap.delayedCall(ritardo / RITMO_TELEFONO, () => salita.play());
    });

    /* E come l'accensione attorno — vedi `landing/hero.tsx` — chi scorre
       prima che il titolo sia salito ha detto che vuole andare avanti: le
       parole si mettono su di colpo invece di arrivare dentro una scena
       che sta già uscendo di campo, cioè invisibili. */
    const alPrimoScorrimento = () => {
      if (scrollY < 3) return;
      smettiScorrimento();
      rinvio?.kill();
      salita.progress(1);
    };

    function smettiScorrimento() {
      removeEventListener("scroll", alPrimoScorrimento);
    }

    addEventListener("scroll", alPrimoScorrimento, { passive: true });

    return () => {
      smetti();
      smettiScorrimento();
      rinvio?.kill();
    };
  });

  const righe = testo.split("\n");

  return (
    <Tag
      ref={rif as never}
      className={cx("os-display", className)}
      style={{ perspective: "700px" }}
    >
      {righe.map((riga, r) => (
        <span key={r} className="block">
          {riga.split(" ").map((parola, i) => (
            <span key={`${parola}-${i}`}>
              <span
                className="inline-block overflow-hidden align-bottom"
                style={{
                  paddingBlock: "0.12em 0.2em",
                  marginBlock: "-0.12em -0.2em",
                }}
              >
                <span
                  data-parola=""
                  className="inline-block"
                  style={{ transformOrigin: "50% 100%" }}
                >
                  {parola}
                </span>
              </span>
              {i < riga.split(" ").length - 1 ? " " : null}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

/* ── L'ingresso quieto ────────────────────────────────────────────── */

/**
 * Sale e appare quando entra nel viewport.
 *
 * Serve al testo di servizio — un paragrafo, una riga di comandi —
 * dove la maschera parola per parola sarebbe una mossa di troppo.
 */
export function Entra({
  children,
  className,
  ritardo = 0,
  da = 22,
  tag: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  ritardo?: number;
  da?: number;
  tag?: "div" | "p" | "li" | "section" | "figure";
}) {
  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    gsap.from(radice, {
      y: da,
      opacity: 0,
      duration: 1,
      ease: "expo.out",
      delay: ritardo,
      scrollTrigger: { trigger: radice, start: "top 90%", once: true },
    });
  });

  return (
    <Tag ref={rif as never} className={className}>
      {children}
    </Tag>
  );
}

/* ── Il numero che conta ──────────────────────────────────────────── */

/**
 * Conta fino al valore quando entra in campo.
 *
 * Il valore finale è già nel markup del server: senza JavaScript, o con
 * movimento ridotto, il numero giusto c'è comunque. Il conteggio è una
 * cosa che si aggiunge, non una da cui dipende la lettura.
 */
export function Cifra({
  a,
  da = 0,
  decimali = 0,
  suffisso,
  className,
}: {
  a: number;
  da?: number;
  decimali?: number;
  suffisso?: string;
  className?: string;
}) {
  const [valore, setValore] = useState(a);

  const rif = useScena<HTMLSpanElement>(({ gsap, radice }) => {
    const stato = { v: da };
    gsap.to(stato, {
      v: a,
      duration: 1.9,
      ease: "expo.out",
      onUpdate: () => setValore(stato.v),
      scrollTrigger: { trigger: radice, start: "top 92%", once: true },
    });
  });

  return (
    <span ref={rif} className={className}>
      {valore.toFixed(decimali)}
      {suffisso ? <span className="opacity-60">{suffisso}</span> : null}
    </span>
  );
}

/* ── Il comando ───────────────────────────────────────────────────── */

/**
 * Il pulsante che insegue il puntatore.
 *
 * Lo scostamento è una frazione della distanza dal centro, calcolata su
 * un'area più larga del pulsante stesso: l'attrazione comincia *prima*
 * di arrivarci, ed è quello che la fa sentire. Il testo dentro si muove
 * un po' di più della pastiglia, così l'oggetto ha due strati e sembra
 * profondo invece che scivoloso.
 *
 * Su touch non succede nulla: non c'è un puntatore da inseguire, e
 * `--mx`/`--my` restano a zero.
 */
export function Magnete({
  children,
  className,
  forza = 0.32,
  raggio = 90,
}: {
  children: ReactNode;
  className?: string;
  forza?: number;
  raggio?: number;
}) {
  const rif = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nodo = rif.current;
    if (!nodo || !inMovimento()) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    let mx = 0;
    let my = 0;
    let bx = 0;
    let by = 0;

    const passo = () => {
      // Un lerp verso il bersaglio: il pulsante *raggiunge* il puntatore,
      // non ci si teletrasporta.
      mx += (bx - mx) * 0.16;
      my += (by - my) * 0.16;
      nodo.style.setProperty("--mx", mx.toFixed(2));
      nodo.style.setProperty("--my", my.toFixed(2));
      if (Math.abs(bx - mx) > 0.05 || Math.abs(by - my) > 0.05) {
        raf = requestAnimationFrame(passo);
      } else {
        raf = 0;
      }
    };

    const sveglia = () => {
      if (!raf) raf = requestAnimationFrame(passo);
    };

    const muovi = (e: PointerEvent) => {
      const r = nodo.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      if (
        Math.abs(dx) > r.width / 2 + raggio ||
        Math.abs(dy) > r.height / 2 + raggio
      ) {
        bx = 0;
        by = 0;
      } else {
        bx = dx * forza;
        by = dy * forza;
      }
      sveglia();
    };

    const lascia = () => {
      bx = 0;
      by = 0;
      sveglia();
    };

    addEventListener("pointermove", muovi, { passive: true });
    addEventListener("pointerdown", lascia, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", muovi);
      removeEventListener("pointerdown", lascia);
    };
  }, [forza, raggio]);

  return (
    <span ref={rif} className={cx("os-magnete inline-flex", className)}>
      {children}
    </span>
  );
}

/**
 * I due comandi della pagina, sempre gli stessi.
 *
 * `href` arriva da chi chiama e viene dal routing vero: le destinazioni
 * si decidono in `landing.tsx`, da `homePathForRole`, non qui.
 */
export function Comando({
  href,
  children,
  variante = "pieno",
  className,
  magnetico = true,
}: {
  href: string;
  children: ReactNode;
  variante?: "pieno" | "vuoto";
  className?: string;
  magnetico?: boolean;
}) {
  const bottone = (
    <Link
      href={href}
      className={cx(
        "os-btn",
        variante === "pieno" ? "os-btn-pieno" : "os-btn-vuoto",
        className,
      )}
    >
      {children}
    </Link>
  );

  return magnetico ? <Magnete>{bottone}</Magnete> : bottone;
}

/**
 * La freccia dei comandi: si sposta all'hover del pulsante che la
 * contiene, non della freccia stessa.
 */
export function Freccia({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 10"
      aria-hidden="true"
      className={cx(
        "h-2.5 w-3.5 shrink-0 transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)]",
        "group-hover/os:translate-x-1",
        className,
      )}
    >
      <path
        d="M1 5h11M8.5 1.5 12 5l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── La riga di lettura ───────────────────────────────────────────── */

/**
 * Una coppia etichetta/valore, come la leggerebbe un terminale.
 *
 * È il mattone di ogni sezione in cui il sistema "dice" qualcosa di sé:
 * la barra dell'hero, il motore, il pannello dell'interfaccia.
 */
export function Lettura({
  chiave,
  valore,
  tono = "dato",
  className,
}: {
  chiave: string;
  valore: ReactNode;
  tono?: "dato" | "mente" | "azione" | "muto";
  className?: string;
}) {
  const colore = {
    dato: "text-[color:var(--os-dato)]",
    mente: "text-[color:var(--os-mente)]",
    azione: "text-[color:var(--os-azione)]",
    muto: "text-[color:var(--os-media)]",
  }[tono];

  return (
    <div className={cx("os-mono flex items-baseline gap-2.5", className)}>
      <span className="text-[color:var(--os-appena)]">{chiave}</span>
      <span className={colore}>{valore}</span>
    </div>
  );
}
