"use client";

import { Marchio } from "@/components/brand/marchio";
import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { PILLAR_KEYS, PILLAR_LABELS } from "@/lib/score/pillars";
import { cx } from "@/components/ui/primitives";

/**
 * L'interfaccia, dentro la storia.
 *
 * Non una sezione «Features» con sei schermate affiancate. Una sola
 * superficie, che all'inizio è lontana e inclinata — la si vede come si
 * vede un oggetto su un tavolo, di scorcio — e che scorrendo **si
 * raddrizza e viene avanti**, finché non la si guarda in faccia. Solo a
 * quel punto un modulo si apre e mostra la sequenza che l'intera pagina
 * ha raccontato: un dato, ciò che significa, cosa fare.
 *
 * La superficie è la Patient App vera: le stesse sezioni di
 * `lib/patient/sezioni.ts`, gli stessi sette pilastri di
 * `lib/score/pillars.ts`, lo stesso punteggio del paziente dimostrativo,
 * e — da quando la presentazione è bianca — anche lo stesso fondo. Sul
 * nero questo pannello era «la stessa struttura vestita per la scena»,
 * un compromesso onesto ma pur sempre un compromesso; qui non c'è più
 * niente da tradurre. Quello che si promette in copertina è ciò che si
 * trova dopo l'accesso, alla lettera.
 */

/* I sette pilastri con i valori del paziente dimostrativo: gli stessi
   che alimentano la Signature dietro l'hero. */
const PILASTRI = [82, 74, 71, 86, 76, 80, 69];

/* Le voci della colonna, dalle sezioni vere della Patient App. */
const VOCI = [
  "Home",
  "Longevity Score",
  "Il tuo percorso",
  "Il tuo piano",
  "Risultati",
  "Documenti",
  "Appuntamenti",
] as const;

export function ProductInterface() {
  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const q = gsap.utils.selector(radice);
    const pannello = q<HTMLElement>("[data-pannello]")[0];
    if (!pannello) return;

    /* ── La camera si avvicina ──────────────────────────────────── */
    /* Rotazione e scala insieme, con la prospettiva sul contenitore:
       è l'unico modo in cui la superficie *arriva* invece di ingrandirsi.
       Su macchine modeste la rotazione è più contenuta — un piano molto
       inclinato costringe il browser a rasterizzare una texture più
       grande dello schermo. */
    gsap.fromTo(
      pannello,
      {
        rotateX: ridotta ? 12 : 26,
        scale: ridotta ? 0.9 : 0.82,
        y: ridotta ? 30 : 70,
        opacity: 0.45,
      },
      {
        rotateX: 0,
        scale: 1,
        y: 0,
        opacity: 1,
        ease: "none",
        scrollTrigger: {
          trigger: radice,
          start: "top 82%",
          end: "center 54%",
          scrub: 0.8,
        },
      },
    );

    /* ── Il modulo si apre ──────────────────────────────────────── */
    const passi = q<HTMLElement>("[data-passo-modulo]");
    passi.forEach((passo, i) => {
      gsap.fromTo(
        passo,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "expo.out",
          scrollTrigger: { trigger: radice, start: `top ${46 - i * 6}%`, once: true },
        },
      );
    });

    /* ── I pilastri si riempiono ────────────────────────────────── */
    gsap.fromTo(
      q("[data-barra]"),
      { scaleX: 0 },
      {
        scaleX: 1,
        transformOrigin: "0% 50%",
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.06,
        scrollTrigger: { trigger: radice, start: "top 58%", once: true },
      },
    );
  });

  return (
    <section ref={rif} id="piattaforma" className="os-sezione">
      <div className="os-gabbia">
        <header className="os-testata">
          <Etichetta indice="08" tono="dato">
            La piattaforma
          </Etichetta>
          <Titolo
            zoom
            testo={"Tutto questo\nsta in una schermata."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[50ch]">
            Il paziente apre una pagina e vede a che punto è. Il medico ne apre
            un&rsquo;altra e vede la stessa persona, con ciò che gli compete. La
            direzione ne apre una terza e vede la clinica. Tre livelli, un solo
            sistema, nessun dato ricopiato a mano.
          </Entra>
        </header>

        {/* ── La superficie ────────────────────────────────────── */}
        <div
          className="mt-14 sm:mt-20"
          style={{ perspective: "1500px", perspectiveOrigin: "50% 0%" }}
        >
          <div
            data-pannello=""
            className="os-lastra overflow-hidden will-change-transform"
            style={{
              transformStyle: "preserve-3d",
              background:
                "linear-gradient(180deg, var(--os-pannello-alto), var(--os-pannello-basso))",
              boxShadow: "inset 0 0 0 1px var(--os-riga), var(--os-pannello-ombra)",
            }}
            aria-hidden="true"
          >
            {/* ── La testata ─────────────────────────────────── */}
            <div
              className="flex items-center gap-3 border-b px-4 py-3 sm:px-6"
              style={{ borderColor: "var(--os-riga)" }}
            >
              <Marchio className="h-5 w-auto" />
              <span className="os-mono text-[color:var(--os-media)]">Unique OS</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="os-vivo" />
                <span className="os-mono hidden text-[color:var(--os-appena)] sm:inline">
                  Paziente
                </span>
              </span>
            </div>

            <div className="grid sm:grid-cols-[168px_minmax(0,1fr)]">
              {/* ── La colonna ───────────────────────────────── */}
              <nav
                className="hidden flex-col gap-1 border-r p-4 sm:flex"
                style={{
                  borderColor: "var(--os-riga)",
                  background: "var(--os-pannello-basso)",
                }}
              >
                {VOCI.map((voce, i) => (
                  <span
                    key={voce}
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px]",
                      i === 1
                        ? "text-[color:var(--os-piena)]"
                        : "text-[color:var(--os-tenue)]",
                    )}
                    style={
                      i === 1
                        ? { background: "var(--os-velo-mente)" }
                        : undefined
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: i === 1 ? "var(--os-mente)" : "var(--os-appena)",
                      }}
                    />
                    <span className="truncate">{voce}</span>
                  </span>
                ))}
              </nav>

              {/* ── Il contenuto ─────────────────────────────── */}
              <div className="min-w-0 p-5 sm:p-7">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="os-mono text-[color:var(--os-appena)]">
                      Unique Longevity Score
                    </p>
                    <div className="mt-2 flex items-end gap-4">
                      <span className="os-cifra text-[clamp(3.4rem,11vw,5.6rem)] text-[color:var(--os-piena)]">
                        78
                      </span>
                      <span className="mb-2 flex flex-col gap-1.5">
                        <span
                          className="os-mono rounded-full px-2 py-1"
                          // Il verde chiaro serviva sul nero, dove quello
                          // pieno spariva. Sul bianco è l'opposto: torna il
                          // verde neutro dell'applicazione.
                          style={{
                            background: "var(--os-positivo-velo)",
                            color: "var(--os-positivo)",
                          }}
                        >
                          +4
                        </span>
                        <span className="os-mono text-[color:var(--os-appena)]">
                          28.08
                        </span>
                      </span>
                    </div>
                  </div>

                  <dl className="flex gap-7">
                    <div>
                      <dt className="os-mono text-[color:var(--os-appena)]">Età bio</dt>
                      <dd className="os-cifra mt-1.5 text-[1.6rem] text-[color:var(--os-piena)]">
                        39.4
                      </dd>
                    </div>
                    <div>
                      <dt className="os-mono text-[color:var(--os-appena)]">Copertura</dt>
                      <dd className="os-cifra mt-1.5 text-[1.6rem] text-[color:var(--os-piena)]">
                        86<span className="text-[0.9rem] opacity-50">%</span>
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* I sette pilastri */}
                <ul className="mt-7 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                  {PILLAR_KEYS.map((chiave, i) => (
                    <li key={chiave} className="flex items-center gap-3">
                      {/* La spaziatura monospaziata è larga: a 124 px
                          "Composizione corporea" si taglia a metà parola,
                          e un'etichetta troncata su un pannello che deve
                          sembrare vero si legge come un difetto. */}
                      <span className="os-mono w-[124px] shrink-0 truncate text-[9.5px] tracking-[0.1em] text-[color:var(--os-tenue)] sm:w-[150px]">
                        {PILLAR_LABELS[chiave]}
                      </span>
                      <span
                        className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full"
                        style={{ background: "var(--os-traccia-vuota)" }}
                      >
                        <span
                          data-barra=""
                          className="block h-full origin-left rounded-full"
                          style={{
                            width: `${PILASTRI[i]}%`,
                            background:
                              PILASTRI[i] >= 80
                                ? "var(--os-mente-chiara)"
                                : "var(--os-dato)",
                          }}
                        />
                      </span>
                      <span className="os-mono w-6 shrink-0 text-right text-[color:var(--os-media)]">
                        {PILASTRI[i]}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* ── Il modulo che si apre ──────────────────── */}
                <div
                  className="mt-7 border-t pt-6"
                  style={{ borderColor: "var(--os-riga)" }}
                >
                  <ol className="space-y-3.5">
                    <li data-passo-modulo="" className="flex items-baseline gap-3.5">
                      <span className="os-mono w-[62px] shrink-0 text-[color:var(--os-dato)]">
                        DATO
                      </span>
                      <span className="os-mono min-w-0 flex-1 truncate text-[color:var(--os-media)]">
                        LDL 118 mg/dL · sopra il target di 18
                      </span>
                    </li>

                    <li data-passo-modulo="" className="flex items-baseline gap-3.5">
                      <span className="os-mono w-[62px] shrink-0 text-[color:var(--os-mente)]">
                        LETTURA
                      </span>
                      <span className="min-w-0 flex-1 text-[13.5px] text-[color:var(--os-piena)]">
                        Unico marcatore fuori target da due cicli.
                      </span>
                    </li>

                    <li
                      data-passo-modulo=""
                      className="flex items-center gap-3.5 rounded-xl p-3.5"
                      style={{
                        background: "var(--os-oro-velo)",
                        boxShadow: "inset 0 0 0 1px var(--os-oro-bordo)",
                      }}
                    >
                      <span className="os-mono w-[62px] shrink-0 text-[color:var(--os-azione)]">
                        AZIONE
                      </span>
                      <span className="min-w-0 flex-1 text-[13.5px] text-[color:var(--os-piena)]">
                        Anticipare il pannello lipidico di 30 giorni
                      </span>
                      <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0">
                        <path
                          d="M1 5h11M8.5 1.5 12 5l-3.5 3.5"
                          fill="none"
                          stroke="var(--os-azione)"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── I tre livelli ────────────────────────────────────── */}
        <ul className="mt-14 grid gap-px sm:mt-16 lg:grid-cols-3" style={{ background: "var(--os-riga)" }}>
          {[
            {
              chiave: "Paziente",
              titolo: "Il tuo percorso, non il tuo referto",
              testo:
                "Punteggio, piano, prossimo passo, documenti, appuntamenti. Scritto per essere capito senza un medico accanto.",
            },
            {
              chiave: "Professionista",
              titolo: "Cinque minuti prima della visita",
              testo:
                "Cartella, timeline, copilota clinico, revisione dei referti. Tutto ciò che serve per entrare preparati, e niente altro.",
            },
            {
              chiave: "Direzione",
              titolo: "La clinica, in numeri",
              testo:
                "Economia, capacità, CRM, approvazioni, contenuti. Il livello che decide, con davanti i dati veri.",
            },
          ].map((l) => (
            <li key={l.chiave} className="p-6 sm:p-7" style={{ background: "var(--os-vuoto)" }}>
              <p className="os-mono text-[color:var(--os-dato)]">{l.chiave}</p>
              <h3 className="mt-3.5 text-[17px] font-medium leading-snug text-[color:var(--os-piena)]">
                {l.titolo}
              </h3>
              <p className="os-corpo mt-2.5 text-[14.5px] leading-relaxed">{l.testo}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
