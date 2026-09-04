"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";
import { inMovimento } from "@/lib/landing/capacita";
import { useScena } from "@/lib/landing/scena";

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
 */
export function Titolo({
  testo,
  className,
  tag: Tag = "h2",
  ritardo = 0,
}: {
  testo: string;
  className?: string;
  tag?: "h1" | "h2" | "h3" | "p";
  ritardo?: number;
}) {
  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const parole = radice.querySelectorAll<HTMLElement>("[data-parola]");
    if (parole.length === 0) return;

    gsap.from(parole, {
      yPercent: 118,
      opacity: 0,
      // Una rotazione minima sull'asse X dà alla parola un peso che la
      // sola traslazione non ha: sale, non scivola.
      rotateX: -32,
      duration: 1.15,
      ease: "expo.out",
      stagger: 0.055,
      delay: ritardo,
      scrollTrigger: {
        trigger: radice,
        start: "top 86%",
        once: true,
      },
    });
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
