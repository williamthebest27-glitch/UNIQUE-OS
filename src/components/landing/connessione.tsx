"use client";

import { Marchio } from "@/components/brand/marchio";
import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { cx } from "@/components/ui/primitives";

/**
 * Quattro cose che oggi non si parlano.
 *
 * La persona ha i suoi referti in una cartella di posta. La clinica ha
 * la sua agenda. I dati stanno in cinque gestionali diversi. E
 * l'intelligenza, quando c'è, gira su un foglio di calcolo di qualcuno.
 * Il prodotto non è nessuna delle quattro: **è il fatto che stiano nello
 * stesso posto.**
 *
 * Perciò questa sezione è l'unica in cui gli elementi si muovono
 * davvero. Arrivano da fuori campo, ciascuno per conto suo, e solo
 * quando sono tutti arrivati compaiono le linee che li tengono insieme —
 * in quest'ordine, perché è l'ordine dell'argomento: prima si è
 * separati, poi ci si connette. Il marchio al centro si accende per
 * ultimo: non è ciò che li attira, è ciò che risulta.
 *
 * Le linee si disegnano fra posizioni **finali**, mai fra posizioni in
 * movimento: un capo che insegue un blocco che sta ancora viaggiando è
 * il modo più semplice per ottenere una geometria che sbava di qualche
 * pixel a ogni fotogramma.
 */

interface Vertice {
  chiave: string;
  titolo: string;
  testo: string;
  /** Posizione finale, in percentuale del palco. */
  x: number;
  y: number;
  /** Da dove arriva, in pixel. */
  dx: number;
  dy: number;
}

const VERTICI: Vertice[] = [
  {
    chiave: "PERSONA",
    titolo: "La persona",
    testo:
      "Proprietaria dei propri dati. Vede un percorso, non un referto da interpretare da sola.",
    x: 23,
    y: 21,
    dx: -420,
    dy: -240,
  },
  {
    chiave: "CLINICA",
    titolo: "La clinica",
    testo:
      "Medici, nutrizionisti, trainer. Una sola cartella, e a ciascuno ciò che gli compete.",
    x: 77,
    y: 21,
    dx: 420,
    dy: -240,
  },
  {
    chiave: "DATI",
    titolo: "I dati",
    testo:
      "Referti, esami, misure, questionari, dispositivi. In un posto solo, su server europei.",
    x: 22,
    y: 78,
    dx: -420,
    dy: 240,
  },
  {
    chiave: "INTELLIGENZA",
    titolo: "L'intelligenza",
    testo:
      "Legge tutto insieme, propone, allega i fatti — e si ferma prima della decisione.",
    x: 78,
    y: 78,
    dx: 420,
    dy: 240,
  },
];

const CX = 50;
const CY = 50;

/*
 * Il segmento non tocca né l'etichetta né il nucleo.
 *
 * Una linea tirata dal punto (x, y) fino al centro attraverserebbe il
 * paragrafo del vertice — l'etichetta è centrata su quel punto, non
 * appesa lì accanto — e una riga di testo con una linea che ci passa
 * dentro si legge come cancellata. Il collegamento parte quindi dopo
 * l'etichetta e si ferma prima del nucleo: due stacchi che si leggono
 * come respiro, non come un errore di aggancio.
 */
const DA_VERTICE = 0.38;
const A_CENTRO = 0.8;

function lungoAsse(v: Vertice, t: number): { x: number; y: number } {
  return { x: v.x + (CX - v.x) * t, y: v.y + (CY - v.y) * t };
}

export function PatientClinicConnection() {
  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const q = gsap.utils.selector(radice);
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      const palco = q<HTMLElement>("[data-palco]")[0];
      if (!palco) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: palco,
          start: "top top",
          end: "+=115%",
          scrub: ridotta ? 0.4 : 0.8,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
        defaults: { ease: "none" },
      });

      /* ── Prima si arriva ────────────────────────────────────── */
      for (const v of VERTICI) {
        const nodo = q<HTMLElement>(`[data-vertice="${v.chiave}"]`)[0];
        if (!nodo) continue;
        tl.fromTo(
          nodo,
          { x: v.dx, y: v.dy, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.5 },
          0,
        );
      }

      /* ── Poi ci si connette ───────────────────────────────────
         Le radiali non si disegnano con un tratteggio ma *crescendo*:
         GSAP porta il capo libero dal centro fino al vertice. Su un
         riquadro la cui proporzione cambia con la finestra è l'unico
         modo esatto — un tratteggio andrebbe misurato in un sistema di
         coordinate deformato — ed è anche la cosa giusta da vedere: è il
         centro che allunga un braccio, non una linea che si scopre. */
      for (const v of VERTICI) {
        const filo = q<SVGLineElement>(`[data-radiale="${v.chiave}"]`)[0];
        if (!filo) continue;
        const dentro = lungoAsse(v, A_CENTRO);
        const fuori = lungoAsse(v, DA_VERTICE);
        tl.fromTo(
          filo,
          { attr: { x2: dentro.x, y2: dentro.y } },
          { attr: { x2: fuori.x, y2: fuori.y }, duration: 0.3 },
          0.45,
        );
      }

      /* ── E solo alla fine c'è un centro ─────────────────────── */
      tl.fromTo(
        q("[data-centro]"),
        { scale: 0.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25 },
        0.7,
      ).fromTo(
        q("[data-aureola]"),
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3 },
        0.7,
      );
    });

    /* Sotto i 1024 px la stessa cosa, senza pin e senza viaggi: i
       quattro blocchi arrivano scorrendo, uno dopo l'altro. */
    mm.add("(max-width: 1023px)", () => {
      gsap.from(q("[data-vertice]"), {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "expo.out",
        stagger: 0.12,
        scrollTrigger: { trigger: radice, start: "top 68%", once: true },
      });
      gsap.from(q("[data-centro]"), {
        opacity: 0,
        scale: 0.85,
        duration: 1,
        ease: "expo.out",
        scrollTrigger: { trigger: q("[data-centro]")[0], start: "top 85%", once: true },
      });
    });

    /* Il palco fissato esiste solo da 1024 in su. Sul telefono le
       stesse quattro voci sono una griglia, e senza una scena loro
       restano immobili mentre tutto il resto della pagina si muove:
       arrivano in fila, e il nucleo dopo di loro. I selettori passano
       dal contenitore stretto perché `data-vertice` esiste due volte
       nel markup — una per il palco, una per la griglia. */
    mm.add("(max-width: 1023px)", () => {
      const stretto = q<HTMLElement>("[data-stretto]")[0];
      if (!stretto) return;

      gsap.from(q("[data-stretto] li"), {
        y: 22,
        opacity: 0,
        duration: 0.75,
        ease: "expo.out",
        stagger: 0.07,
        scrollTrigger: { trigger: stretto, start: "top 82%", once: true },
      });

      gsap.from(q("[data-nucleo-stretto]"), {
        scale: 0.86,
        opacity: 0,
        duration: 1,
        ease: "expo.out",
        scrollTrigger: { trigger: stretto, start: "top 55%", once: true },
      });
    });

    return () => mm.revert();
  });

  return (
    <section ref={rif} className="os-sezione">
      <div className="os-gabbia">
        <header className="os-testata">
          <Etichetta indice="07" tono="mente">
            Un sistema, quattro parti
          </Etichetta>
          <Titolo
            zoom
            testo={"Il prodotto non è\nnessuno dei quattro.\nÈ il punto in cui si incontrano."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[52ch]">
            Oggi i referti stanno in una cartella di posta, l&rsquo;agenda in un
            gestionale, il piano in un PDF e il ragionamento nella testa di chi
            c&rsquo;era. Unique OS non aggiunge un quinto posto: è il primo in cui
            i quattro coincidono.
          </Entra>
        </header>
      </div>

      {/* ── Il palco, su schermo largo ───────────────────────────── */}
      <div
        data-palco=""
        className="relative mt-10 hidden h-[100svh] items-center overflow-hidden lg:flex"
      >
        <div className="os-gabbia relative h-[76vh] w-full">
          {/* Le linee, fra posizioni finali */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            <g fill="none" strokeLinecap="round">
              {VERTICI.map((v) => {
                const dentro = lungoAsse(v, A_CENTRO);
                const fuori = lungoAsse(v, DA_VERTICE);
                return (
                  <line
                    key={v.chiave}
                    data-radiale={v.chiave}
                    x1={dentro.x}
                    y1={dentro.y}
                    x2={fuori.x}
                    y2={fuori.y}
                    stroke="var(--os-dato)"
                    strokeWidth="1"
                    strokeOpacity="0.45"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          </svg>

          {VERTICI.map((v) => (
            <article
              key={v.chiave}
              data-vertice={v.chiave}
              className="absolute w-[240px] -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ left: `${v.x}%`, top: `${v.y}%` }}
            >
              <span
                aria-hidden="true"
                className="mx-auto mb-4 block h-2 w-2 rounded-full"
                style={{
                  background: "var(--os-vuoto)",
                  boxShadow: "inset 0 0 0 1.5px var(--os-dato), 0 0 16px 1px var(--os-luce-dato)",
                }}
              />
              <p className="os-mono text-[color:var(--os-dato)]">{v.chiave}</p>
              <h3 className="mt-2.5 text-[17px] font-medium text-[color:var(--os-piena)]">
                {v.titolo}
              </h3>
              <p className="os-corpo mt-2 text-[14px] leading-relaxed">{v.testo}</p>
            </article>
          ))}

          <Nucleo />
        </div>
      </div>

      {/* ── La colonna, su schermo stretto ───────────────────────── */}
      <div data-stretto="" className="os-gabbia mt-12 lg:hidden">
        <ul className="grid gap-px sm:grid-cols-2" style={{ background: "var(--os-riga)" }}>
          {VERTICI.map((v) => (
            <li
              key={v.chiave}
              data-vertice={v.chiave}
              className="p-6"
              style={{ background: "var(--os-vuoto)" }}
            >
              <p className="os-mono text-[color:var(--os-dato)]">{v.chiave}</p>
              <h3 className="mt-3 text-[17px] font-medium text-[color:var(--os-piena)]">
                {v.titolo}
              </h3>
              <p className="os-corpo mt-2 text-[14.5px] leading-relaxed">{v.testo}</p>
            </li>
          ))}
        </ul>

        <div data-nucleo-stretto="" className="relative mt-12 flex justify-center">
          <Nucleo compatto />
        </div>
      </div>
    </section>
  );
}

/* ── Il centro ────────────────────────────────────────────────────── */

function Nucleo({ compatto = false }: { compatto?: boolean }) {
  return (
    <div
      className={cx(
        compatto
          ? "relative"
          : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
      )}
    >
      <div
        data-aureola=""
        aria-hidden="true"
        className={cx(
          "os-alone left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          compatto ? "h-44 w-44" : "h-72 w-72",
        )}
        style={{
          background:
            "radial-gradient(closest-side, var(--os-alone-mente-forte), var(--os-alone-dato) 58%, transparent)",
        }}
      />

      <div
        data-centro=""
        className="relative flex flex-col items-center gap-3 px-8 py-7"
        style={{
          borderRadius: "999px",
          background: "var(--os-vuoto)",
          boxShadow:
            "inset 0 0 0 1px var(--os-riga-viva), 0 18px 44px -24px rgb(20 19 19 / 0.30)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <Marchio className={compatto ? "h-10 w-auto" : "h-12 w-auto"} />
        <p className="os-mono text-[color:var(--os-piena)]">Unique OS</p>
      </div>
    </div>
  );
}
