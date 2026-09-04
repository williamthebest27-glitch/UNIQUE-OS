"use client";

import { useMemo } from "react";
import { Cifra, Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { daSeme } from "@/lib/landing/geometria";
import { cx } from "@/components/ui/primitives";

/**
 * Novanta giorni.
 *
 * Quattro riquadri con dentro «Giorno 30» sarebbero un calendario, e un
 * calendario dice che fra un appuntamento e l'altro non succede niente.
 * Qui la forma dice il contrario: **una curva unica che sale**, quattro
 * momenti che stanno *sopra* quella curva, e sotto novanta trattini —
 * uno per giorno — che si accendono mentre si scorre.
 *
 * I trattini sono l'argomento vero della sezione. La differenza fra una
 * visita e un percorso non è il numero di controlli: è che negli
 * ottantasei giorni in mezzo qualcuno stava ancora guardando.
 *
 * I quattro punteggi sono quelli veri dell'ultimo ciclo del paziente
 * dimostrativo — 74 → 78 — non una curva inventata che sale di venti
 * punti. Un guadagno di quattro punti in tre mesi è una cosa che si può
 * mostrare a un medico senza imbarazzo; venti no.
 */

interface Tappa {
  giorno: number;
  chiave: string;
  titolo: string;
  testo: string;
  punteggio: number;
}

const TAPPE: Tappa[] = [
  {
    giorno: 1,
    chiave: "Baseline",
    titolo: "Si misura tutto",
    testo:
      "Prelievo, composizione corporea, parametri cardiovascolari, questionari. Da qui in poi ogni numero avrà un prima con cui essere confrontato.",
    punteggio: 74,
  },
  {
    giorno: 30,
    chiave: "Adapt",
    titolo: "Il piano incontra la vita vera",
    testo:
      "Il primo mese non serve a migliorare: serve a scoprire cosa regge davvero fra lavoro, viaggi e famiglia. Il piano si corregge su quello, non sull'ideale.",
    punteggio: 75,
  },
  {
    giorno: 60,
    chiave: "Optimize",
    titolo: "Si spinge dove risponde",
    testo:
      "A due mesi i segnali dicono quale leva sta funzionando. L'intensità si sposta lì, e si toglie da dove non stava cambiando niente.",
    punteggio: 76,
  },
  {
    giorno: 90,
    chiave: "Reassess",
    titolo: "Gli stessi esami, un altro momento",
    testo:
      "Non un nuovo inizio: la seconda misura della stessa scala. Il ciclo successivo parte da qui, con quello che si è imparato.",
    punteggio: 78,
  },
];

const GIORNI = 90;
const L = 1200;
const A = 300;

/** La curva del punteggio, in coordinate del riquadro. */
function curva(): { d: string; punti: Array<{ x: number; y: number }> } {
  const min = 72.5;
  const max = 79;
  const punti = TAPPE.map((t) => ({
    x: ((t.giorno - 1) / (GIORNI - 1)) * L,
    y: A - ((t.punteggio - min) / (max - min)) * A,
  }));

  // Una spline di Catmull-Rom convertita in cubiche: la curva passa
  // esattamente per i quattro punti misurati invece di avvicinarcisi.
  // Un progresso clinico disegnato con una curva che *approssima* i dati
  // è un grafico che mente di un pixel, e qui non serve.
  let d = `M${punti[0].x.toFixed(1)},${punti[0].y.toFixed(1)}`;
  for (let i = 0; i < punti.length - 1; i++) {
    const p0 = punti[i - 1] ?? punti[i];
    const p1 = punti[i];
    const p2 = punti[i + 1];
    const p3 = punti[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return { d, punti };
}

export function JourneyTimeline() {
  const { d, punti } = useMemo(curva, []);

  /* L'attività giornaliera: alta nei giorni di intervento, mai zero. È
     deterministica, quindi la stessa figura dal server e dal browser. */
  const giorni = useMemo(() => {
    const rnd = daSeme(90210);
    return Array.from({ length: GIORNI }, (_, i) => {
      const tappa = TAPPE.some((t) => Math.abs(t.giorno - (i + 1)) < 1.5);
      return { alto: tappa, peso: tappa ? 1 : 0.3 + rnd() * 0.55 };
    });
  }, []);

  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const q = gsap.utils.selector(radice);

    /* ── La curva si disegna scorrendo ──────────────────────────── */
    gsap.fromTo(
      q("[data-curva]"),
      { strokeDasharray: 1, strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: radice,
          start: "top 72%",
          end: "center 42%",
          scrub: 0.7,
        },
      },
    );

    /* L'area sotto la curva segue il tracciato con un ritardo: la linea
       arriva prima, il riempimento la insegue. */
    gsap.fromTo(
      q("[data-area]"),
      { opacity: 0 },
      {
        opacity: 1,
        ease: "none",
        scrollTrigger: {
          trigger: radice,
          start: "top 62%",
          end: "center 44%",
          scrub: 1,
        },
      },
    );

    /* ── I novanta giorni si accendono ──────────────────────────── */
    gsap.fromTo(
      q("[data-giorno]"),
      { opacity: 0.08, scaleY: 0.25 },
      {
        opacity: 1,
        scaleY: 1,
        transformOrigin: "50% 100%",
        ease: "none",
        stagger: { each: 0.006 },
        scrollTrigger: {
          trigger: radice,
          start: "top 70%",
          end: "center 44%",
          scrub: 0.5,
        },
      },
    );

    /* ── Le tappe arrivano quando la curva le raggiunge ─────────── */
    const tappe = q<HTMLElement>("[data-tappa]");
    tappe.forEach((tappa, i) => {
      gsap.from(tappa, {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: "expo.out",
        scrollTrigger: { trigger: radice, start: `top ${58 - i * 5}%`, once: true },
      });
    });

    gsap.from(q("[data-nodo-tappa]"), {
      scale: 0,
      transformOrigin: "50% 50%",
      duration: 0.7,
      ease: "back.out(2)",
      stagger: 0.16,
      scrollTrigger: { trigger: radice, start: "top 58%", once: true },
    });
  });

  return (
    <section ref={rif} id="percorso" className="os-sezione">
      <div className="os-gabbia">
        <header className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Etichetta indice="06" tono="azione">
              90-day cycle
            </Etichetta>
            <Titolo
              testo={"Not a visit.\nA cycle that\nnever closes."}
              className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
            />
          </div>

          <Entra tag="p" className="os-corpo max-w-[42ch] lg:pb-3">
            Quattro momenti che si vedono, ottantasei giorni che non si vedono e
            contano di più. Il punteggio non salta: sale di quattro punti in tre
            mesi, ed è esattamente quello che un percorso serio può promettere.
          </Entra>
        </header>
      </div>

      {/* ── Il grafico ───────────────────────────────────────────── */}
      <div className="os-gabbia mt-14 sm:mt-20">
        <figure>
          <figcaption className="os-mono flex items-center justify-between text-[color:var(--os-appena)]">
            <span>Unique Longevity Score</span>
            <span>Giorno 01 → 90</span>
          </figcaption>

          <div className="relative mt-5">
            <svg
              viewBox={`0 0 ${L} ${A}`}
              preserveAspectRatio="none"
              className="h-[180px] w-full sm:h-[260px] lg:h-[300px]"
              role="img"
              aria-label="Il punteggio sale da 74 a 78 nell'arco di novanta giorni."
            >
              <defs>
                <linearGradient id="os-percorso-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--os-mente)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--os-mente)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="os-percorso-linea" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--os-dato)" />
                  <stop offset="62%" stopColor="var(--os-mente)" />
                  <stop offset="100%" stopColor="var(--os-azione)" />
                </linearGradient>
              </defs>

              <path
                data-area=""
                d={`${d} L${L},${A} L0,${A} Z`}
                fill="url(#os-percorso-area)"
              />
              <path
                data-curva=""
                d={d}
                pathLength={1}
                fill="none"
                stroke="url(#os-percorso-linea)"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* I nodi delle tappe, in HTML: restano circolari a qualunque
                proporzione, mentre dentro un viewBox stirato sarebbero
                ellissi. */}
            {punti.map((p, i) => (
              <span
                key={TAPPE[i].giorno}
                data-nodo-tappa=""
                aria-hidden="true"
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(p.x / L) * 100}%`,
                  top: `${(p.y / A) * 100}%`,
                  background: "var(--os-vuoto)",
                  boxShadow: `inset 0 0 0 2px ${
                    i === TAPPE.length - 1 ? "var(--os-azione)" : "var(--os-mente)"
                  }, 0 0 18px 2px var(--os-luce-nodo)`,
                }}
              />
            ))}
          </div>

          {/* ── I novanta giorni ─────────────────────────────────── */}
          <div className="mt-4 flex h-8 items-end gap-[1px] sm:gap-[2px]">
            {giorni.map((g, i) => (
              <span
                key={i}
                data-giorno=""
                aria-hidden="true"
                className="min-w-0 flex-1 rounded-[1px]"
                style={{
                  height: `${(g.alto ? 1 : g.peso * 0.62) * 100}%`,
                  background: g.alto ? "var(--os-azione)" : "var(--os-dato)",
                  opacity: g.alto ? 0.95 : 0.34,
                }}
              />
            ))}
          </div>

          <p className="os-mono mt-3 text-[color:var(--os-appena)]">
            Attività registrata · 90 giorni su 90
          </p>
        </figure>
      </div>

      {/* ── Le quattro tappe ─────────────────────────────────────── */}
      <div className="os-gabbia mt-14 sm:mt-16">
        <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {TAPPE.map((t, i) => (
            <li
              key={t.giorno}
              data-tappa=""
              className="border-t pt-6"
              style={{
                borderColor:
                  i === TAPPE.length - 1 ? "var(--os-azione)" : "var(--os-riga-viva)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="os-mono text-[color:var(--os-appena)]">
                  Day {String(t.giorno).padStart(2, "0")}
                </p>
                <p
                  className={cx(
                    "os-cifra text-[1.9rem]",
                    i === TAPPE.length - 1
                      ? "text-[color:var(--os-azione)]"
                      : "text-[color:var(--os-piena)]",
                  )}
                >
                  <Cifra a={t.punteggio} da={t.punteggio - 4} />
                </p>
              </div>

              <p
                className={cx(
                  "os-mono mt-4",
                  i === TAPPE.length - 1
                    ? "text-[color:var(--os-azione)]"
                    : "text-[color:var(--os-mente)]",
                )}
              >
                {t.chiave}
              </p>

              <h3 className="mt-2.5 text-[17px] font-medium leading-snug text-[color:var(--os-piena)]">
                {t.titolo}
              </h3>

              <p className="os-corpo mt-3 text-[14.5px] leading-relaxed">{t.testo}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
