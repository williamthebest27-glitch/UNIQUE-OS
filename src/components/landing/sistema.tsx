"use client";

import { Marchio } from "@/components/brand/marchio";
import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { cx } from "@/components/ui/primitives";

/**
 * Il sistema: dove il corpo diventa direzione.
 *
 * Niente griglia di card. Una griglia dice "ecco otto cose che facciamo";
 * qui bisogna dire **una** cosa: che otto flussi separati, che oggi vivono
 * in otto posti diversi — un referto in una cartella, il sonno in un
 * orologio, l'anamnesi su un foglio — convergono in un punto solo e ne
 * escono come una direzione.
 *
 * Perciò la forma è una convergenza, e lo scorrimento è ciò che la
 * compie: le linee si disegnano mentre si scende, gli impulsi partono
 * dalle sorgenti e arrivano al centro, il marchio si accende quando è
 * arrivato tutto. Chi scorre *fa succedere* la cosa che il titolo dice.
 *
 * **Due composizioni, non una adattata.** Su schermo largo la
 * convergenza è radiale, perché c'è spazio attorno al centro. Su
 * telefono quello spazio non esiste, e una radiale ristretta diventa un
 * groviglio: lì le sorgenti scendono lungo una spina dorsale e il centro
 * sta in fondo, dove la lettura arriva naturalmente. Il disegno è
 * decorativo per chi legge con lo schermo — l'elenco vero è in chiaro,
 * appena sotto.
 */

interface Sorgente {
  nome: string;
  /** Che cosa porta davvero dentro il sistema. */
  nota: string;
  x: number;
  y: number;
  lato: "sx" | "dx";
}

/*
 * Le otto sorgenti, disposte a mano.
 *
 * Una distribuzione calcolata — otto punti a 45 gradi l'uno dall'altro —
 * sembrerebbe un orologio, e un orologio non è un organismo. Queste sono
 * spostate a occhio finché la figura non si è messa a respirare.
 *
 * I limiti non sono estetici ma aritmetici: l'etichetta è larga
 * `L_ETICHETTA` più il pallino, e si estende *verso l'esterno* dal suo
 * ancoraggio. Perché non esca dalla gabbia a nessuna larghezza, le
 * sorgenti di sinistra stanno oltre il 17% e quelle di destra sotto
 * l'84%. Alla soglia in cui la radiale compare (1280 px) il margine
 * disponibile è di circa 194 px contro 186 richiesti: stretto, e
 * verificato.
 */
const SORGENTI: Sorgente[] = [
  { nome: "Biomarkers", nota: "84 valori ematici", x: 22, y: 11, lato: "sx" },
  { nome: "Recovery", nota: "HRV · riposo · carico", x: 17, y: 39, lato: "sx" },
  { nome: "Clinical data", nota: "anamnesi · visite · referti", x: 23, y: 67, lato: "sx" },
  { nome: "Diagnostics", nota: "ECG · spirometria · sforzo", x: 35, y: 91, lato: "sx" },
  { nome: "Lifestyle", nota: "sonno · stress · abitudini", x: 73, y: 9, lato: "dx" },
  { nome: "Performance", nota: "VO₂max · forza · soglia", x: 84, y: 34, lato: "dx" },
  { nome: "Nutrition", nota: "apporto · aderenza", x: 79, y: 63, lato: "dx" },
  { nome: "Assessments", nota: "questionari validati", x: 67, y: 90, lato: "dx" },
];

const CX = 50;
const CY = 51;

/** L'arco da una sorgente al centro, in coordinate percentuali. */
function tracciato(s: Sorgente): string {
  const mx = (s.x + CX) / 2;
  const my = (s.y + CY) / 2;
  // La curvatura è perpendicolare alla congiungente: otto archi che
  // entrano nello stesso punto da direzioni diverse, senza sovrapporsi.
  const dx = CX - s.x;
  const dy = CY - s.y;
  const k = 0.14;
  return `M${s.x},${s.y} Q${(mx - dy * k).toFixed(2)},${(my + dx * k).toFixed(2)} ${CX},${CY}`;
}

export function SystemVisualization() {
  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const q = gsap.utils.selector(radice);

    /* ── Le linee si disegnano scorrendo ──────────────────────────
       Ogni tracciato dichiara `pathLength={1}`: da lì in poi trattino e
       scarto si misurano in frazioni del percorso, non in unità del
       riquadro. È l'unico modo perché il conto torni anche quando il
       riquadro è deformato — con `vector-effect: non-scaling-stroke` il
       browser calcola i trattini in pixel di schermo, e un tratteggio
       pensato in coordinate SVG diventa una fila di puntini. */
    gsap.fromTo(
      q("[data-linea]"),
      { strokeDasharray: 1, strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: radice,
          start: "top 68%",
          end: "center 46%",
          scrub: 0.8,
        },
      },
    );

    /* ── Gli impulsi corrono verso il centro ──────────────────────
       Un trattino corto — otto centesimi del percorso — che scorre su
       uno scarto lungo quanto tutto il resto: nessun plugin di percorso,
       nessun calcolo a ogni fotogramma. Il browser interpola un numero
       solo e la GPU fa il resto. */
    const impulsi = q<SVGPathElement>("[data-impulso]");
    impulsi.forEach((impulso, i) => {
      gsap.set(impulso, { strokeDasharray: "0.08 1" });
      gsap.fromTo(
        impulso,
        { strokeDashoffset: 1.08 },
        {
          strokeDashoffset: 0,
          duration: 2.4,
          ease: "power1.in",
          repeat: -1,
          // Sfasati: otto impulsi che partono insieme sono un lampeggio.
          delay: i * 0.42,
          repeatDelay: 1.1,
          scrollTrigger: { trigger: radice, start: "top 75%" },
        },
      );
    });

    /* ── Le sorgenti arrivano una alla volta ────────────────────── */
    gsap.from(q("[data-sorgente]"), {
      opacity: 0,
      y: 14,
      duration: 0.9,
      ease: "expo.out",
      stagger: 0.07,
      scrollTrigger: { trigger: radice, start: "top 72%", once: true },
    });

    /* ── Il centro si accende quando è arrivato tutto ───────────── */
    gsap.fromTo(
      q("[data-centro]"),
      { scale: 0.86, opacity: 0.25 },
      {
        scale: 1,
        opacity: 1,
        ease: "expo.out",
        scrollTrigger: {
          trigger: radice,
          start: "top 52%",
          end: "center 44%",
          scrub: 1,
        },
      },
    );

    gsap.fromTo(
      q("[data-aureola]"),
      { scale: 0.6, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        ease: "none",
        scrollTrigger: {
          trigger: radice,
          start: "top 56%",
          end: "center 42%",
          scrub: 1,
        },
      },
    );
  });

  return (
    <section ref={rif} id="sistema" className="os-sezione">
      <div className="os-gabbia">
        {/* Titolo e chiosa su due colonne, non uno sotto l'altro: la
            frase di destra commenta il titolo, e a fine riga si legge
            come tale. Sotto i 1024 px tornano in colonna, dove l'ordine
            di lettura fa già lo stesso lavoro.

            Prima la chiosa era in posizione assoluta agganciata al bordo
            della sezione: finiva sotto la barra di navigazione, che è
            fissa e sta più in alto di qualunque "top: 0" di sezione. */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <header>
            <Etichetta indice="01" tono="dato">
              The system
            </Etichetta>
            <Titolo
              testo={"Your body\ngenerates data.\nUnique OS turns it\ninto direction."}
              className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
            />
          </header>

          <Entra tag="p" className="os-corpo max-w-[46ch] lg:pt-4">
            Ogni esame, ogni notte di sonno, ogni visita produce un segnale.
            Separati non dicono niente. Unique OS li tiene nello stesso posto,
            nello stesso istante, sulla stessa persona — ed è lì che smettono di
            essere numeri e diventano una decisione.
          </Entra>
        </div>
      </div>

      {/* ── La scena ─────────────────────────────────────────────── */}
      <div className="os-gabbia mt-16 sm:mt-20">
        <Radiale />
        <Spina />

        {/* L'elenco vero, per chi legge con lo schermo: il disegno qui
            sopra è una composizione, non un contenuto. */}
        <ul className="sr-only">
          {SORGENTI.map((s) => (
            <li key={s.nome}>
              {s.nome} — {s.nota}
            </li>
          ))}
          <li>Tutte convergono in Unique OS.</li>
        </ul>
      </div>
    </section>
  );
}

/* ── Il centro ────────────────────────────────────────────────────── */

function Centro({ compatto = false }: { compatto?: boolean }) {
  return (
    <div
      className={cx(
        "relative flex flex-col items-center",
        compatto ? "gap-2.5" : "gap-3",
      )}
    >
      <div
        data-aureola=""
        aria-hidden="true"
        className={cx(
          "os-alone absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          compatto ? "h-40 w-40" : "h-64 w-64",
        )}
        style={{
          background:
            "radial-gradient(closest-side, rgb(255 111 133 / 0.42), rgb(255 111 133 / 0.06) 60%, transparent)",
        }}
      />

      <div data-centro="" className="relative flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "absolute rounded-full",
            compatto ? "-inset-6" : "-inset-9",
          )}
          style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.10)" }}
        />
        <Marchio className={compatto ? "h-11 w-auto" : "h-14 w-auto"} />
        <p className="os-mono text-[color:var(--os-piena)]">Unique OS</p>
      </div>
    </div>
  );
}

/* ── Convergenza radiale, su schermo largo ────────────────────────── */

function Radiale() {
  return (
    <div
      className="relative hidden aspect-[1440/840] w-full xl:block"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <g fill="none" strokeLinecap="round">
          {SORGENTI.map((s) => (
            <path
              key={s.nome}
              data-linea=""
              d={tracciato(s)}
              pathLength={1}
              stroke="var(--color-unique-300)"
              strokeWidth="1"
              strokeOpacity="0.24"
              // Senza, il tratto si stirerebbe insieme al viewBox e le
              // linee orizzontali sarebbero più spesse delle verticali.
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {SORGENTI.map((s) => (
            <path
              key={`p-${s.nome}`}
              data-impulso=""
              d={tracciato(s)}
              pathLength={1}
              stroke="var(--os-mente)"
              strokeWidth="1.6"
              strokeOpacity="0.85"
              vectorEffect="non-scaling-stroke"
              // A riposo l'impulso non esiste: è l'unico elemento della
              // pagina che senza movimento non ha niente da dire, e una
              // linea piena rosa sopra quella di base sarebbe rumore.
              strokeDasharray="0 1"
            />
          ))}
        </g>
      </svg>

      {SORGENTI.map((s) => (
        <div
          key={s.nome}
          data-sorgente=""
          className={cx(
            "absolute flex -translate-y-1/2 items-center gap-3",
            // Il pallino resta esattamente sull'ancoraggio da cui parte
            // la linea; l'etichetta cresce verso l'esterno.
            s.lato === "sx" ? "-translate-x-full flex-row-reverse" : "translate-x-0",
          )}
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--os-dato)" }}
          />
          <span
            className={cx(
              "w-[168px] shrink-0",
              s.lato === "sx" ? "text-right" : "text-left",
            )}
          >
            <span className="block text-[15px] font-medium leading-tight text-[color:var(--os-piena)]">
              {s.nome}
            </span>
            <span className="os-mono mt-1.5 block text-[color:var(--os-appena)]">
              {s.nota}
            </span>
          </span>
        </div>
      ))}

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${CX}%`, top: `${CY}%` }}
      >
        <Centro />
      </div>
    </div>
  );
}

/* ── La spina dorsale, su telefono ────────────────────────────────── */

/**
 * Le stesse otto sorgenti, ma lette scendendo.
 *
 * Su uno schermo di 375 pixel la radiale diventerebbe un groviglio di
 * archi lungo trenta pixel. Qui le sorgenti entrano alternate su una
 * linea verticale che scende verso il marchio: la convergenza resta —
 * è la stessa idea — ma detta nella direzione in cui il pollice si
 * muove già.
 */
function Spina() {
  return (
    <div className="relative xl:hidden" aria-hidden="true">
      {/* La spina: parte trasparente in alto — il sistema non comincia
          da nessuna parte — e arriva calda in basso, dove c'è il centro. */}
      <div
        className="absolute bottom-14 left-1/2 top-1 w-px -translate-x-1/2"
        style={{
          background:
            "linear-gradient(180deg, transparent, var(--color-unique-500) 14%, var(--os-mente) 94%)",
          opacity: 0.45,
        }}
      />

      <ul className="relative space-y-6 sm:space-y-7">
        {SORGENTI.map((s, i) => {
          const sinistra = i % 2 === 0;
          return (
            <li
              key={s.nome}
              data-sorgente=""
              className={cx(
                "relative flex items-center",
                sinistra ? "justify-start pr-[54%]" : "justify-end pl-[54%]",
              )}
            >
              {/* Il ramo che entra nella spina: dice che la sorgente
                  *confluisce*, invece di stare in un elenco accanto. */}
              <span
                className={cx(
                  "absolute top-1/2 h-px",
                  sinistra ? "left-[46%] right-1/2" : "left-1/2 right-[46%]",
                )}
                style={{
                  background:
                    "linear-gradient(90deg, var(--color-unique-500), transparent)",
                  opacity: 0.5,
                  transform: sinistra ? "scaleX(-1)" : undefined,
                }}
              />
              <span className={sinistra ? "text-left" : "text-right"}>
                <span className="block text-[15px] font-medium leading-tight text-[color:var(--os-piena)]">
                  {s.nome}
                </span>
                <span className="os-mono mt-1.5 block text-[color:var(--os-appena)]">
                  {s.nota}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="relative mt-12 flex justify-center">
        <Centro compatto />
      </div>
    </div>
  );
}
