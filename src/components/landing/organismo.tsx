"use client";

import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { cx } from "@/components/ui/primitives";

/**
 * Il sistema vivo.
 *
 * Un software si compra una volta. Un sistema vivo gira, e ogni giro
 * riparte da dove è arrivato il precedente. È l'unica cosa che questa
 * sezione deve far capire, e per farlo lo scorrimento diventa
 * **orizzontale**: si va avanti lungo il ciclo, e alla fine il ciclo non
 * finisce — ricomincia, con un valore diverso da quello di partenza.
 *
 * È l'unico punto della pagina in cui il binario orizzontale è
 * giustificato, e il criterio è quello di `docs/design.md`: si usa quando
 * i contenuti vanno **confrontati in sequenza**, non per far muovere
 * qualcosa. Sette stadi in colonna sarebbero un elenco puntato; sette
 * stadi che scorrono di lato sono un percorso che si compie.
 *
 * Su telefono il binario orizzontale non c'è: un pin che intercetta il
 * gesto laterale mentre il pollice vorrebbe scorrere in verticale è il
 * modo più veloce per far sembrare rotta una pagina. Lì gli stessi sette
 * stadi scendono, uniti da una linea continua che non si interrompe mai:
 * la stessa cosa, detta nella direzione giusta.
 */

interface Stadio {
  chiave: string;
  titolo: string;
  testo: string;
  /** Cosa produce davvero questo stadio dentro Unique OS. */
  esito: string;
}

const STADI: Stadio[] = [
  {
    chiave: "Baseline",
    titolo: "Tutto quello che sei,\nmisurato una volta.",
    testo:
      "Ematochimica, composizione corporea, ECG, spirometria, test da sforzo, anamnesi, questionari validati. Non uno screening: un punto di partenza da cui si può misurare un cambiamento.",
    esito: "Unique Longevity Score · 7 pilastri",
  },
  {
    chiave: "Assessment",
    titolo: "Legge un medico,\nnon un algoritmo.",
    testo:
      "Il sistema prepara, ordina, evidenzia ciò che non torna. La lettura resta clinica, e resta firmata. Nessuna proposta arriva al paziente senza essere passata da qui.",
    esito: "Revisione clinica · firma del professionista",
  },
  {
    chiave: "Strategy",
    titolo: "Un piano in cui ogni riga\nha un perché.",
    testo:
      "Ogni intervento è appeso al segnale che l'ha motivato. Chi lo legge — il paziente, il nutrizionista, il medico dell'anno prossimo — può risalire al dato senza fidarsi sulla parola.",
    esito: "Percorso personale · obiettivi misurabili",
  },
  {
    chiave: "Intervention",
    titolo: "Nutrizione, movimento,\nrecupero, integrazione.",
    testo:
      "Il piano diventa settimane. Ogni professionista lavora nella stessa cartella e vede cosa hanno fatto gli altri: è la differenza fra un percorso e quattro consulenze scollegate.",
    esito: "Team clinico · un'unica cartella",
  },
  {
    chiave: "Monitoring",
    titolo: "Ogni giorno,\nnon ogni sei mesi.",
    testo:
      "Aderenza, sonno, carico, recupero. Il sistema non aspetta la prossima visita per accorgersi che qualcosa si è fermato: se ne accorge quando succede, e lo dice.",
    esito: "Segnali continui · avvisi al team",
  },
  {
    chiave: "Reassessment",
    titolo: "Gli stessi esami,\nla stessa scala.",
    testo:
      "Rimisurare con un metodo diverso non è rimisurare. Le curve di normalizzazione e la versione del calcolo restano registrate: un cambio di formula non può mai passare per un miglioramento.",
    esito: "Nuovo Score · confronto con la baseline",
  },
  {
    chiave: "Evolution",
    titolo: "Il piano cambia\nperché sei cambiato tu.",
    testo:
      "E il ciclo riparte — da dove è arrivato, non da capo. È questo che rende Unique OS un sistema operativo e non un referto: non conserva il tuo passato, lo usa.",
    esito: "Il ciclo riparte, con un altro punto di partenza",
  },
];

export function LivingSystem() {
  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const q = gsap.utils.selector(radice);

    /* Il binario esiste solo sopra i 1024 px — sotto, il markup che lo
       compone non è nemmeno in pagina. La condizione va quindi legata
       alla *stessa* soglia del layout, non al livello del dispositivo:
       un portatile modesto largo 1440 px vede il binario, e se la scena
       si costruisse solo al livello pieno resterebbe fermo a metà. */
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      const palco = q<HTMLElement>("[data-palco]")[0];
      const binario = q<HTMLElement>("[data-binario]")[0];
      if (!palco || !binario) return;

      /* La corsa si ricalcola a ogni `refresh`: la larghezza del binario
         dipende dal carattere, e un valore congelato al primo montaggio
         manderebbe l'ultima scheda mezza fuori schermo appena Fraunces
         finisce di caricare. */
      const corsa = () => Math.max(0, binario.scrollWidth - palco.clientWidth);

      gsap.to(binario, {
        x: () => -corsa(),
        ease: "none",
        scrollTrigger: {
          trigger: palco,
          start: "top top",
          // La lunghezza dello scorrimento verticale è la corsa
          // orizzontale: un pixel di rotellina, un pixel di binario.
          end: () => `+=${corsa()}`,
          scrub: ridotta ? 0.35 : 0.7,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      gsap.to(q("[data-arco]"), {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          trigger: palco,
          start: "top top",
          end: () => `+=${corsa()}`,
          scrub: ridotta ? 0.35 : 0.7,
          invalidateOnRefresh: true,
        },
      });
    });

    /* Sotto i 1024 px il binario non è in pagina, e senza questo la
       sezione sul telefono resterebbe l'unica ferma di tutta la
       landing. La colonna che lo sostituisce arriva una tappa alla
       volta e il filo si tira scorrendo: è la stessa lettura del
       binario, girata in verticale, e costa due trasformazioni. */
    mm.add("(max-width: 1023px)", () => {
      const colonna = q<HTMLElement>("[data-colonna]")[0];
      if (!colonna) return;

      gsap.from(q("[data-colonna] li"), {
        y: 26,
        opacity: 0,
        duration: 0.8,
        ease: "expo.out",
        stagger: 0.085,
        scrollTrigger: { trigger: colonna, start: "top 80%", once: true },
      });

      gsap.from(q("[data-filo]"), {
        scaleY: 0,
        transformOrigin: "50% 0%",
        ease: "none",
        scrollTrigger: {
          trigger: colonna,
          start: "top 78%",
          end: "bottom 72%",
          scrub: 0.4,
        },
      });
    });

    return () => mm.revert();
  });

  return (
    <section ref={rif} className="os-sezione pb-0">
      <div className="os-gabbia">
        <header>
          <Etichetta indice="05" tono="dato">
            Living system
          </Etichetta>
          <Titolo
            testo={"Your biology changes.\nYour system should too."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[50ch]">
            La medicina preventiva non è un esame fatto bene: è un ciclo che non
            si interrompe. Unique OS lo tiene aperto — e ogni giro riparte da
            dove è arrivato quello prima.
          </Entra>
        </header>
      </div>

      {/* ── Il binario, su schermo largo ─────────────────────────── */}
      <div
        data-palco=""
        className="relative mt-16 hidden h-[100svh] flex-col justify-center gap-12 overflow-hidden lg:flex"
      >
        <ol
          data-binario=""
          className="relative flex items-center gap-6 will-change-transform"
          style={{ paddingInline: "clamp(20px, 5.5vw, 88px)" }}
        >
          {STADI.map((s, i) => (
            <li key={s.chiave} className="w-[min(78vw,440px)] shrink-0">
              <Scheda stadio={s} indice={i} ultimo={i === STADI.length - 1} />
            </li>
          ))}

          {/* La chiusura del ciclo: non un punto finale, un ritorno. */}
          <li className="flex w-[min(70vw,340px)] shrink-0 items-center gap-4 pr-[clamp(20px,5.5vw,88px)]">
            <svg viewBox="0 0 60 40" className="h-10 w-14 shrink-0" aria-hidden="true">
              <path
                d="M2 20h40M42 20a10 10 0 1 0-10 10"
                fill="none"
                stroke="var(--os-azione)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.75"
              />
            </svg>
            <p className="os-corpo max-w-[24ch] text-[15px]">
              E poi di nuovo <span className="text-[color:var(--os-piena)]">Assessment</span>,
              con un corpo che nel frattempo è cambiato.
            </p>
          </li>
        </ol>

        {/* La barra del ciclo, sotto al binario e non dietro.
            Attraversava le schede a metà altezza: le lastre sono
            traslucide di proposito, e una linea che passa sotto di esse
            si legge come una cancellatura sul testo. */}
        <div className="os-gabbia">
          <div className="relative h-px w-full" style={{ background: "var(--os-riga)" }}>
            <div
              data-arco=""
              className="absolute inset-0 origin-left"
              style={{
                transform: "scaleX(0)",
                background:
                  "linear-gradient(90deg, var(--color-unique-500), var(--os-mente) 72%, var(--os-azione))",
              }}
            />
          </div>

          <div className="mt-3.5 flex items-center justify-between">
            <p className="os-mono text-[color:var(--os-appena)]">01 · Baseline</p>
            <p className="os-mono text-[color:var(--os-appena)]">
              Il ciclo non si chiude
            </p>
            <p className="os-mono text-[color:var(--os-azione)]">07 · Evolution</p>
          </div>
        </div>
      </div>

      {/* ── La colonna, su schermo stretto ───────────────────────── */}
      <div data-colonna="" className="os-gabbia relative mt-14 lg:hidden">
        {/* La linea sta fuori dalla lista: un `<div>` figlio di `<ol>`
            non è markup valido, e qui non porta contenuto. */}
        <div
          data-filo=""
          aria-hidden="true"
          className="absolute bottom-20 left-[calc(clamp(20px,5.5vw,88px)+7px)] top-3 w-px"
          style={{
            background:
              "linear-gradient(180deg, var(--color-unique-500), var(--os-mente) 68%, var(--os-azione))",
            opacity: 0.55,
          }}
        />
        <ol className="relative">
          {STADI.map((s, i) => (
            <li key={s.chiave} className="relative pb-11 pl-9">
              <span
                aria-hidden="true"
                className="absolute left-0 top-2 h-[15px] w-[15px] rounded-full"
                style={{
                  background: "var(--os-vuoto)",
                  boxShadow: `inset 0 0 0 1.5px ${
                    i === STADI.length - 1 ? "var(--os-azione)" : "var(--os-dato)"
                  }`,
                }}
              />
              <Scheda stadio={s} indice={i} ultimo={i === STADI.length - 1} compatta />
            </li>
          ))}
          <li className="relative pl-9">
            <p className="os-corpo text-[15px]">
              E poi di nuovo{" "}
              <span className="text-[color:var(--os-piena)]">Assessment</span>, con un
              corpo che nel frattempo è cambiato.
            </p>
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ── Una scheda del ciclo ─────────────────────────────────────────── */

function Scheda({
  stadio,
  indice,
  ultimo,
  compatta = false,
}: {
  stadio: Stadio;
  indice: number;
  ultimo: boolean;
  compatta?: boolean;
}) {
  return (
    <article className={compatta ? undefined : "os-lastra p-7"}>
      <div className="flex items-baseline gap-3">
        <span className="os-mono text-[color:var(--os-segno)]">
          {String(indice + 1).padStart(2, "0")}
        </span>
        <span
          className={cx(
            "os-mono",
            ultimo ? "text-[color:var(--os-azione)]" : "text-[color:var(--os-dato)]",
          )}
        >
          {stadio.chiave}
        </span>
      </div>

      <h3
        className={cx(
          "os-display mt-4 whitespace-pre-line",
          compatta ? "text-[clamp(1.3rem,5.6vw,1.75rem)]" : "text-[1.9rem]",
        )}
      >
        {stadio.titolo}
      </h3>

      <p className="os-corpo mt-3.5 text-[14.5px] leading-relaxed">{stadio.testo}</p>

      <p
        className="os-mono mt-5 border-t pt-4 text-[color:var(--os-tenue)]"
        style={{ borderColor: "var(--os-riga)" }}
      >
        {stadio.esito}
      </p>
    </article>
  );
}
