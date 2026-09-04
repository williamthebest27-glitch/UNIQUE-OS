"use client";

import { useMemo } from "react";
import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { daSeme } from "@/lib/landing/geometria";
import { PILLAR_KEYS, PILLAR_LABELS } from "@/lib/score/pillars";
import { cx } from "@/components/ui/primitives";

/**
 * Il motore.
 *
 * "AI-powered" scritto dentro un riquadro non è un'informazione: è una
 * parola che ormai chiunque può stampare. Qui invece si mostra il
 * **gesto** che il motore compie, e che è uno solo — trovare la riga che
 * conta in una matrice in cui tutte le righe sembrano uguali.
 *
 * La matrice è vera: sette pilastri (`lib/score/pillars.ts`) per sedici
 * rilevazioni. Scorrendo, prima esiste solo la griglia; poi alcune celle
 * si accendono — non a caso: sono quelle che appartengono allo stesso
 * andamento; poi una linea le unisce, e il pattern che era invisibile
 * diventa una frase.
 *
 * Non è una dashboard, ed è di proposito: una dashboard mostra tutto,
 * un motore mostra la cosa che ha trovato. Il prodotto vero sta dietro
 * l'accesso, e questa sezione ne è il meccanismo, non lo screenshot.
 */

/* I passi del motore, che si accendono lungo la sezione. */
const PASSI = [
  { chiave: "OBSERVE", testo: "Trentacinque segnali, per ogni persona, a ogni ciclo." },
  { chiave: "CORRELATE", testo: "Non uno alla volta: tutti insieme, sulla stessa storia." },
  { chiave: "DETECT", testo: "L'andamento che nessuna singola misura mostrava." },
  { chiave: "PROPOSE", testo: "Un'ipotesi, con i fatti che l'hanno attivata allegati." },
  { chiave: "DEFER", testo: "La decisione resta al medico. Sempre." },
] as const;

const COLONNE = 16;

/** Le celle che compongono il pattern: una diagonale che sale, non una macchia. */
const PATTERN: Array<[riga: number, colonna: number]> = [
  [1, 4],
  [1, 7],
  [3, 9],
  [1, 11],
  [3, 13],
  [1, 14],
];

export function IntelligenceEngine() {
  /* I valori della matrice sono deterministici: la stessa griglia dal
     server e dal browser, e la stessa a ogni visita. Una matrice che
     cambia a ogni caricamento è rumore, non un dato. */
  const celle = useMemo(() => {
    const rnd = daSeme(48271);
    return PILLAR_KEYS.map(() =>
      Array.from({ length: COLONNE }, () => 0.18 + rnd() * 0.72),
    );
  }, []);

  const inPattern = useMemo(() => {
    const s = new Set<string>();
    for (const [r, c] of PATTERN) s.add(`${r}:${c}`);
    return s;
  }, []);

  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const q = gsap.utils.selector(radice);

    /* ── La griglia si popola ───────────────────────────────────── */
    gsap.from(q("[data-cella]"), {
      opacity: 0,
      scale: 0.4,
      transformOrigin: "50% 50%",
      duration: 0.5,
      ease: "power2.out",
      // Dall'angolo in alto a sinistra, come si legge: la matrice si
      // riempie invece di comparire.
      stagger: { each: 0.004, from: "start" },
      scrollTrigger: { trigger: radice, start: "top 74%", once: true },
    });

    /* ── Il pattern si accende ──────────────────────────────────── */
    /* `fromTo`, non `to`: lo stato di riposo delle celle accese è quello
       *finale*, così senza JavaScript il pattern si vede comunque — è
       il contenuto della sezione, non la sua animazione. */
    gsap.fromTo(
      q("[data-acceso-cella]"),
      { opacity: 0.32, scale: 1 },
      {
        opacity: 1,
        scale: 1.32,
        transformOrigin: "50% 50%",
        duration: 0.7,
        ease: "expo.out",
        stagger: 0.11,
        scrollTrigger: { trigger: radice, start: "top 46%", once: true },
      },
    );

    /* ── La linea che unisce ciò che era slegato ────────────────── */
    gsap.fromTo(
      q("[data-filo]"),
      { strokeDasharray: 1, strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        duration: 1.5,
        ease: "power2.inOut",
        scrollTrigger: { trigger: radice, start: "top 40%", once: true },
      },
    );

    /* ── I passi si accendono uno dopo l'altro ──────────────────── */
    const passi = q<HTMLElement>("[data-passo]");
    passi.forEach((passo, i) => {
      gsap.fromTo(
        passo,
        { opacity: 0.24 },
        {
          opacity: 1,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: radice, start: `top ${72 - i * 7}%`, once: true },
        },
      );
    });

    /* ── La frase che il pattern è diventato ────────────────────── */
    gsap.from(q("[data-esito]"), {
      opacity: 0,
      y: 18,
      duration: 1,
      ease: "expo.out",
      scrollTrigger: { trigger: radice, start: "top 30%", once: true },
    });
  });

  return (
    <section ref={rif} className="os-sezione">
      <div className="os-gabbia">
        <header>
          <Etichetta indice="03" tono="mente">
            Personal intelligence
          </Etichetta>
          <Titolo
            testo={"It doesn't read your numbers.\nIt reads the line\nbetween them."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
        </header>

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] lg:gap-16">
          {/* ── I passi ────────────────────────────────────────── */}
          <div>
            <Entra tag="p" className="os-corpo max-w-[46ch]">
              Un valore fuori scala lo vede chiunque. Quello che sfugge è la
              coincidenza fra tre valori ancora dentro la norma, letti su sei mesi,
              che insieme raccontano una direzione. È l&rsquo;unica cosa che questo
              motore fa — e non la decide al posto di nessuno.
            </Entra>

            <ol className="mt-10 space-y-0">
              {PASSI.map((p, i) => (
                <li
                  key={p.chiave}
                  data-passo=""
                  className="flex gap-4 border-t py-5"
                  style={{ borderColor: "var(--os-riga)" }}
                >
                  <span className="os-mono w-6 shrink-0 pt-0.5 text-[color:var(--os-appena)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span
                      className={cx(
                        "os-mono block",
                        i === PASSI.length - 1
                          ? "text-[color:var(--os-azione)]"
                          : "text-[color:var(--os-mente)]",
                      )}
                    >
                      {p.chiave}
                    </span>
                    <span className="mt-1.5 block text-[14.5px] leading-relaxed text-[color:var(--os-media)]">
                      {p.testo}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* ── La matrice ─────────────────────────────────────── */}
          <figure className="min-w-0">
            <figcaption className="os-mono flex items-center justify-between gap-4 text-[color:var(--os-appena)]">
              <span>Pillars × rilevazioni</span>
              <span className="hidden sm:inline">16 cicli · 24 mesi</span>
            </figcaption>

            <div className="relative mt-4">
              {/* La griglia. Le etichette dei pilastri restano leggibili
                  anche quando la matrice si stringe: sono il solo modo
                  di sapere *di che cosa* si sta guardando l'andamento. */}
              <div className="grid gap-y-1.5">
                {PILLAR_KEYS.map((chiave, r) => (
                  <div key={chiave} className="flex items-center gap-2 sm:gap-3">
                    <span className="os-mono w-[68px] shrink-0 truncate text-[9.5px] tracking-[0.1em] text-[color:var(--os-appena)] sm:w-[104px] sm:text-[10px]">
                      {PILLAR_LABELS[chiave]}
                    </span>
                    <div className="flex min-w-0 flex-1 gap-[3px] sm:gap-[5px]">
                      {celle[r].map((v, c) => {
                        const acceso = inPattern.has(`${r}:${c}`);
                        return (
                          <span
                            key={c}
                            data-cella=""
                            data-acceso-cella={acceso ? "" : undefined}
                            className="h-3 min-w-0 flex-1 rounded-[2px] sm:h-4"
                            style={{
                              background: acceso ? "var(--os-mente)" : "var(--os-dato)",
                              opacity: acceso ? 1 : v * 0.4,
                              transform: acceso ? "scale(1.32)" : undefined,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Il filo che unisce le celle accese. Il tracciato è in
                  percentuale sul riquadro della griglia: si adatta a
                  qualunque larghezza senza ricalcoli. */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <path
                  data-filo=""
                  d={filoDelPattern()}
                  pathLength={1}
                  fill="none"
                  stroke="var(--os-mente-chiara)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            <div
              data-esito=""
              className="mt-7 border-l-2 pl-5"
              style={{ borderColor: "var(--os-mente)" }}
            >
              <p className="os-mono text-[color:var(--os-mente)]">Pattern rilevato</p>
              <p className="os-corpo mt-2.5 max-w-[46ch] text-[15.5px] text-[color:var(--os-piena)]">
                Il recupero cala nelle stesse settimane in cui sale il carico
                metabolico. Nessuno dei due valori è fuori norma. Insieme, da tre
                cicli, vanno nella stessa direzione.
              </p>
              <p className="os-mono mt-3.5 text-[color:var(--os-appena)]">
                Confidenza media · proposto al medico, non al paziente
              </p>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

/**
 * Il tracciato che unisce le celle del pattern.
 *
 * Le coordinate sono in percentuale della griglia: la colonna al centro
 * della sua cella, la riga al centro della sua. Il riquadro della
 * matrice ha sette righe, e le etichette occupano la parte sinistra —
 * per questo la x parte da uno scarto invece che da zero.
 */
function filoDelPattern(): string {
  /* Le etichette occupano circa il 22% della larghezza su schermo
     stretto e il 26% su largo. Il valore intermedio tiene il filo dentro
     le celle a entrambe le misure senza due tracciati diversi. */
  const scarto = 24;
  const utile = 100 - scarto;

  const punti = PATTERN.map(([r, c]) => {
    const x = scarto + ((c + 0.5) / COLONNE) * utile;
    const y = ((r + 0.5) / PILLAR_KEYS.length) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // Una spezzata, non una curva: il motore ha trovato una relazione fra
  // punti precisi, e una curva morbida suggerirebbe un'interpolazione
  // che non è stata fatta.
  return `M${punti.join(" L")}`;
}
