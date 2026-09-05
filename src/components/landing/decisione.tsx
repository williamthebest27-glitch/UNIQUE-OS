"use client";

import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { cx } from "@/components/ui/primitives";

/**
 * La prossima decisione.
 *
 * Un sistema che produce cento osservazioni non ha aiutato nessuno. Il
 * valore è tutto nell'ultimo passo — dire **cosa fare adesso** — e nel
 * modo in cui ci si arriva, che è la sola parte che un medico ha diritto
 * di verificare.
 *
 * Perciò la sezione non mostra un suggerimento: mostra la **catena** che
 * lo produce, con i fatti attaccati a ogni anello. È il modo in cui le
 * regole sono scritte davvero in `lib/nba/rules.ts` — «ogni suggerimento
 * porta con sé i fatti che lo hanno attivato: chi legge deve poter
 * verificare il perché senza fidarsi del cosa» — e una landing che
 * promette meno di quanto il codice già fa è una landing che sottovende.
 *
 * L'anello che conta di più è l'ultimo, ed è un limite, non una
 * capacità: la proposta si ferma prima del paziente.
 */

interface Anello {
  chiave: string;
  titolo: string;
  righe: string[];
  tono: "dato" | "mente" | "azione";
}

const CATENA: Anello[] = [
  {
    chiave: "DATO",
    titolo: "Il numero",
    righe: ["LDL 118 mg/dL", "apoB 96 mg/dL", "hs-CRP 0.7 mg/L", "rilevato il 28.08"],
    tono: "dato",
  },
  {
    chiave: "CONTESTO",
    titolo: "Tutto il resto che il sistema sa",
    righe: [
      "48 anni · familiarità cardiovascolare",
      "nessuna terapia ipolipemizzante",
      "aderenza al piano 86 %",
      "11 crediti disponibili · membership attiva",
    ],
    tono: "dato",
  },
  {
    chiave: "INTELLIGENZA",
    titolo: "La regola che si è attivata, e perché",
    righe: [
      "pilastro cardiovascolare sotto il potenziale",
      "unico marcatore fuori target da 2 cicli",
      "leva a impatto più alto del ciclo",
      "confidenza media · 3 fatti allegati",
    ],
    tono: "mente",
  },
  {
    chiave: "LA MOSSA SUCCESSIVA",
    titolo: "La proposta, al medico",
    righe: [
      "anticipare il pannello lipidico di 30 giorni",
      "consulto cardiologico entro il ciclo",
      "revisione del target nutrizionale",
      "→ in attesa di approvazione clinica",
    ],
    tono: "azione",
  },
];

export function NextBestAction() {
  const rif = useScena<HTMLElement>(({ gsap, radice }) => {
    const q = gsap.utils.selector(radice);

    /* ── La corrente attraversa la catena ───────────────────────── */
    /* Ogni anello si accende quando la corrente lo raggiunge. Lo stato
       di riposo è quello acceso: senza JavaScript la catena si legge
       intera, che è il punto della sezione. */
    const anelli = q<HTMLElement>("[data-anello]");
    anelli.forEach((anello, i) => {
      gsap.fromTo(
        anello,
        { opacity: 0.22, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "expo.out",
          scrollTrigger: { trigger: radice, start: `top ${66 - i * 6}%`, once: true },
        },
      );
    });

    /* ── I collegamenti si disegnano fra un anello e l'altro ────── */
    const fili = q<HTMLElement>("[data-corrente]");
    fili.forEach((filo, i) => {
      gsap.fromTo(
        filo,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.7,
          ease: "power2.inOut",
          scrollTrigger: { trigger: radice, start: `top ${62 - i * 6}%`, once: true },
        },
      );
    });

    /* ── La riga sul limite ─────────────────────────────────────── */
    gsap.from(q("[data-limite]"), {
      opacity: 0,
      y: 20,
      duration: 1,
      ease: "expo.out",
      scrollTrigger: { trigger: q("[data-limite]")[0], start: "top 88%", once: true },
    });
  });

  return (
    <section ref={rif} className="os-sezione">
      <div className="os-gabbia">
        <header className="os-testata">
          <Etichetta indice="04" tono="azione">
            La mossa successiva
          </Etichetta>
          <Titolo
            zoom
            testo={"La prossima decisione\nè tutto il prodotto."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[52ch]">
            Cento osservazioni non hanno aiutato nessuno. Unique OS arriva fino
            alla mossa successiva — e mostra ogni anello che ci ha portato, perché
            un medico deve poter verificare il perché senza fidarsi del cosa.
          </Entra>
        </header>

        {/* ── La catena ─────────────────────────────────────────── */}
        <ol className="mt-14 grid gap-0 sm:mt-20 lg:grid-cols-4">
          {CATENA.map((a, i) => (
            <li key={a.chiave} className="relative lg:pr-6">
              {/* Il collegamento verso l'anello successivo. */}
              {i < CATENA.length - 1 ? (
                <span
                  data-corrente=""
                  aria-hidden="true"
                  className={cx(
                    "absolute origin-left",
                    "left-[7px] top-[26px] h-10 w-px lg:left-auto lg:right-2 lg:top-[9px] lg:h-px lg:w-4",
                  )}
                  style={{
                    background:
                      i < 2 ? "var(--os-dato)" : i === 2 ? "var(--os-mente)" : "var(--os-azione)",
                    opacity: 0.6,
                    // In verticale la corrente scende, in orizzontale va
                    // a destra: la stessa animazione, due direzioni.
                    transformOrigin: "left center",
                  }}
                />
              ) : null}

              <div
                data-anello=""
                className={cx(
                  "relative pb-12 pl-9 lg:pb-0 lg:pl-0 lg:pt-8",
                  i === CATENA.length - 1 && "pb-0",
                )}
              >
                {/* Il nodo */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-[19px] h-[15px] w-[15px] rounded-full lg:left-0 lg:top-0"
                  style={{
                    background: "var(--os-vuoto)",
                    boxShadow: `inset 0 0 0 1.5px ${
                      a.tono === "azione"
                        ? "var(--os-azione)"
                        : a.tono === "mente"
                          ? "var(--os-mente)"
                          : "var(--os-dato)"
                    }`,
                  }}
                />

                <p
                  className={cx(
                    "os-mono",
                    a.tono === "dato" && "text-[color:var(--os-dato)]",
                    a.tono === "mente" && "text-[color:var(--os-mente)]",
                    a.tono === "azione" && "text-[color:var(--os-azione)]",
                  )}
                >
                  {a.chiave}
                </p>

                <h3 className="mt-3 max-w-[22ch] text-[16.5px] font-medium leading-snug text-[color:var(--os-piena)]">
                  {a.titolo}
                </h3>

                <ul className="mt-4 space-y-2">
                  {a.righe.map((riga) => (
                    <li
                      key={riga}
                      className="os-mono text-[10.5px] normal-case tracking-[0.06em] text-[color:var(--os-tenue)]"
                    >
                      {riga}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>

        {/* ── Il limite ─────────────────────────────────────────── */}
        <div
          data-limite=""
          className="os-lastra mt-14 grid gap-7 p-6 sm:mt-16 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
        >
          <div>
            <p className="os-mono text-[color:var(--os-azione)]">Dove il sistema si ferma</p>
            <p className="os-display mt-4 text-[clamp(1.4rem,3vw,2.15rem)]">
              La proposta arriva al medico.
              <br />
              Al paziente arriva la decisione.
            </p>
          </div>

          <div className="os-corpo space-y-4 text-[15px]">
            <p>
              Nessun suggerimento raggiunge una persona senza essere passato da una
              firma clinica. È un limite scritto nel prodotto, non una promessa
              commerciale: la revisione è un passaggio obbligato del flusso.
            </p>
            <p>
              E i suggerimenti clinici non competono mai in classifica con quelli
              commerciali. Sono due elenchi separati fino allo schermo — perché un
              consiglio che concorre con un&rsquo;offerta finisce, prima o poi, per
              essere scelto quando conviene invece che quando serve.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
