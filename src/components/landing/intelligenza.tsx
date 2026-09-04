"use client";

import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";
import { cx } from "@/components/ui/primitives";

/**
 * Da dato a decisione.
 *
 * È il passaggio su cui si regge tutta la promessa del prodotto, quindi
 * non poteva essere raccontato con tre riquadri e due frecce. Qui **lo
 * si guarda succedere**.
 *
 * Il meccanismo è una sola idea, eseguita con precisione: le stesse otto
 * righe esistono in due versioni sovrapposte, allineate al pixel — sopra
 * il dato grezzo, sotto ciò che il dato *significa* — e una linea di
 * trasformazione scende attraverso la pila mentre si scorre. Sopra la
 * linea è ancora numero, sotto è già lettura. Non è una dissolvenza fra
 * due schermate: è la stessa riga che cambia natura, e si può fermare la
 * linea a metà e vedere le due cose convivere.
 *
 * Poi le otto letture convergono in una sola: l'azione. Una, non un
 * elenco — perché il valore di un sistema del genere non è produrre
 * cento osservazioni, è dire quale sia la prossima mossa.
 *
 * Il colore porta il significato, e non cambia mai in tutta la pagina:
 * **il dato è freddo, l'intelligenza è calda, l'esito è oro.**
 */

interface Riga {
  codice: string;
  fonte: string;
  /** Il dato grezzo, come esce dallo strumento. */
  dato: string;
  /** Ciò che quel dato dice, una volta letto insieme agli altri. */
  lettura: string;
}

/* I valori sono quelli del paziente dimostrativo del progetto: lo stesso
   referto che si ritrova entrando. Un dato inventato qui si vedrebbe
   subito, perché è l'unica cosa che il lettore sa già leggere. */
const RIGHE: Riga[] = [
  {
    codice: "LAB",
    fonte: "Labs",
    dato: "HbA1c 5.1 %   ·   LDL 118 mg/dL   ·   hs-CRP 0.7",
    lettura: "Metabolismo stabile. Il colesterolo è la leva rimasta.",
  },
  {
    codice: "SLP",
    fonte: "Sleep",
    dato: "7h 12m   ·   efficienza 84 %   ·   profondo 14 %",
    lettura: "Dorme abbastanza. La fase profonda è corta.",
  },
  {
    codice: "MOV",
    fonte: "Movement",
    dato: "9 240 passi/d   ·   3 sessioni   ·   142 min",
    lettura: "Il volume c'è. L'intensità resta sotto soglia.",
  },
  {
    codice: "NUT",
    fonte: "Nutrition",
    dato: "1 980 kcal   ·   proteine 1.4 g/kg   ·   fibra 26 g",
    lettura: "Apporto proteico in target, aderenza alta.",
  },
  {
    codice: "BOD",
    fonte: "Body",
    dato: "massa magra 58.2 kg   ·   grasso 18.4 %",
    lettura: "Composizione in miglioramento da due rilevazioni.",
  },
  {
    codice: "REC",
    fonte: "Recovery",
    dato: "HRV 62 ms   ·   riposo 54 bpm   ·   carico 0.9",
    lettura: "Recupero pieno: c'è margine per caricare.",
  },
  {
    codice: "ASM",
    fonte: "Assessment",
    dato: "PSS-10  14   ·   PSQI  6   ·   IPAQ  moderato",
    lettura: "Lo stress percepito è in calo da 90 giorni.",
  },
  {
    codice: "CLN",
    fonte: "Clinical",
    dato: "3 referti   ·   2 visite   ·   1 revisione medica",
    lettura: "Quadro clinico coerente, nulla in sospeso.",
  },
];

const STADI = [
  { chiave: "DATA", nota: "ciò che è stato misurato" },
  { chiave: "INSIGHT", nota: "ciò che significa" },
  { chiave: "ACTION", nota: "ciò che va fatto" },
] as const;

export function DataIntelligence() {
  const rif = useScena<HTMLElement>(({ gsap, radice, ridotta }) => {
    const q = gsap.utils.selector(radice);
    const palco = q("[data-palco]")[0];
    if (!palco) return;

    /* ── La linea di trasformazione ─────────────────────────────── */
    /* Un solo numero governa tutto: `--t`, da 0 a 1. Da lì scendono il
       ritaglio dei due strati, la posizione della linea e quale stadio
       è acceso. Tre cose che raccontano lo stesso passaggio non possono
       andare fuori sincrono se leggono lo stesso numero. */
    const stato = { t: 0 };

    const applica = () => {
      const p = stato.t;
      palco.style.setProperty("--t", p.toFixed(4));
      // Gli stadi si accendono a soglie, non in proporzione: "INSIGHT"
      // deve essere acceso per tutto il tempo in cui la linea lavora.
      const stadio = p < 0.06 ? 0 : p < 0.94 ? 1 : 2;
      for (const [i, nodo] of q("[data-stadio]").entries()) {
        nodo.toggleAttribute("data-acceso", i === stadio);
      }
    };

    applica();

    gsap.to(stato, {
      t: 1,
      ease: "none",
      onUpdate: applica,
      scrollTrigger: {
        /* Il grilletto è il palco, non la sezione. Fissare un elemento
           usando come riferimento un antenato che comincia seicento
           pixel più in alto lo inchioda dove si trova in quell'istante —
           cioè in fondo allo schermo — e la trasformazione si guarda di
           sbieco. Con `center center` il palco si ferma dove si stava già
           guardando, al centro, e da lì la linea scende. */
        trigger: palco,
        // Su telefono la sezione non si fissa: i browser mobili cambiano
        // l'altezza del viewport mentre la barra degli indirizzi entra
        // ed esce, e ciò che è fissato in quel momento sobbalza. La
        // trasformazione avviene lo stesso, mentre la sezione passa.
        start: ridotta ? "top 76%" : "center center",
        end: ridotta ? "bottom 58%" : "+=120%",
        scrub: 0.6,
        pin: !ridotta ? palco : false,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    /* ── L'azione emerge quando il palco si sgancia ───────────────
       Sta fuori dal palco di proposito: dentro, il blocco fissato
       diventerebbe più alto dello schermo — e un pin più alto del
       viewport taglia via la sua stessa fine. Fuori, arriva dopo, che è
       anche l'ordine giusto del racconto: prima la trasformazione si
       compie, poi si legge cosa ne è uscito. */
    gsap.from(q("[data-azione]"), {
      opacity: 0,
      y: 26,
      duration: 1,
      ease: "expo.out",
      scrollTrigger: { trigger: q("[data-azione]")[0], start: "top 88%", once: true },
    });
  });

  return (
    <section ref={rif} id="intelligenza" className="os-sezione">
      <div className="os-gabbia">
        <header>
          <Etichetta indice="02" tono="mente">
            Data · Intelligence · Action
          </Etichetta>
          <Titolo
            testo={"Eight streams enter.\nOne decision leaves."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />
          <Entra tag="p" className="os-corpo mt-7 max-w-[50ch]">
            Un referto non è una diagnosi e un orologio non è un piano. Il valore
            non sta nel misurare di più: sta nel leggere tutto insieme, sulla
            stessa persona, nello stesso momento — e nel dire cosa fare adesso.
          </Entra>
        </header>
      </div>

      {/* ── Il palco ─────────────────────────────────────────────── */}
      {/*
        Il valore di riposo di `--t` è 0.5, non 0.

        Senza JavaScript — o con movimento ridotto, dove la scena non
        viene mai costruita — la linea resta a metà: sopra si legge il
        dato grezzo, sotto la lettura, e la sezione racconta comunque
        il passaggio, ferma. A zero si sarebbe vista solo la colonna di
        numeri, e la metà migliore della sezione sarebbe sparita proprio
        per chi ha chiesto meno movimento.
      */}
      <div
        data-palco=""
        className="relative mt-14 flex flex-col justify-center py-4 sm:mt-20"
        style={{ ["--t" as string]: "0.5" }}
      >
        <div className="os-gabbia">
          {/* I tre stadi */}
          <ol className="flex flex-wrap items-baseline gap-x-8 gap-y-3 sm:gap-x-14">
            {STADI.map(({ chiave, nota }, i) => (
              <li
                key={chiave}
                data-stadio=""
                // Senza JavaScript resta acceso lo stadio di mezzo, in
                // accordo con la linea ferma a metà.
                data-acceso={i === 1 ? "" : undefined}
                className="flex items-baseline gap-3 opacity-30 transition-opacity duration-700 data-[acceso]:opacity-100"
              >
                <span className="os-mono text-[color:var(--os-segno)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span
                    className={cx(
                      "os-mono block text-[13px] tracking-[0.2em]",
                      i === 0 && "text-[color:var(--os-dato)]",
                      i === 1 && "text-[color:var(--os-mente)]",
                      i === 2 && "text-[color:var(--os-azione)]",
                    )}
                  >
                    {chiave}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-[color:var(--os-tenue)]">
                    {nota}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {/* ── I due strati ───────────────────────────────────────
              Stessa griglia, stessa altezza di riga, stesse posizioni:
              è l'allineamento al pixel che rende la trasformazione
              credibile. Se le due pile scivolassero anche di due pixel,
              si vedrebbero due liste invece di una che cambia. */}
          <div className="relative mt-9 sm:mt-12" style={{ perspective: "1200px" }}>
            {/* Sotto: la lettura, che si scopre dall'alto */}
            <Pila
              righe={RIGHE}
              modo="lettura"
              style={{ clipPath: "inset(0 0 calc((1 - var(--t)) * 100%) 0)" }}
            />

            {/* Sopra: il dato grezzo, che si ritira davanti alla linea */}
            <Pila
              righe={RIGHE}
              modo="dato"
              className="absolute inset-0"
              style={{ clipPath: "inset(calc(var(--t) * 100%) 0 0 0)" }}
            />

            {/* La linea che trasforma.
                Il contenitore prende tutta l'altezza della pila, non solo
                il bordo superiore: uno `translateY` in percentuale si
                misura sull'altezza dell'elemento che trasla, e su un
                contenitore alto un pixel `100%` è un pixel. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{ transform: "translateY(calc(var(--t) * 100%))" }}
            >
              {/* Sul nero la linea era una luce, e sotto le serviva un
                  secondo tratto sfocato per farla sbocciare. Sul bianco
                  quel tratto è solo una sbavatura: qui la linea è un
                  segno, e per essere un segno deve avere spessore, non
                  bagliore. */}
              <div
                className="h-[1.5px] w-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--os-mente-chiara) 8%, var(--os-mente-chiara) 92%, transparent)",
                  boxShadow: "var(--os-luce-linea)",
                }}
              />
            </div>
          </div>

        </div>
      </div>

      {/* ── L'azione ─────────────────────────────────────────────── */}
      <div className="os-gabbia">
          <div data-azione="" className="mt-14 sm:mt-20">
            <div
              className="os-lastra relative overflow-hidden p-5 sm:p-7"
              style={{
                background:
                  "linear-gradient(120deg, var(--os-oro-velo), var(--os-oro-velo-tenue) 62%)",
                boxShadow: "inset 0 0 0 1px var(--os-oro-bordo)",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="os-mono text-[color:var(--os-azione)]">Next best action</p>
                <span
                  aria-hidden="true"
                  className="hidden h-px flex-1 sm:block"
                  style={{ background: "var(--os-oro-bordo)" }}
                />
                <p className="os-mono text-[color:var(--os-appena)]">
                  Cardiovascular · priorità 01
                </p>
              </div>

              <p className="os-display mt-4 max-w-[22ch] text-[clamp(1.5rem,3.4vw,2.5rem)] text-[color:var(--os-piena)]">
                Portare l&rsquo;LDL sotto 100 entro il prossimo pannello.
              </p>

              <p className="os-corpo mt-3.5 max-w-[54ch] text-[15px]">
                Otto flussi, trentacinque segnali, una sola mossa. È la leva più
                pesante rimasta: da sola vale più delle altre sette osservazioni
                di questo ciclo messe insieme.
              </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Una pila di righe ────────────────────────────────────────────── */

/**
 * Le stesse otto righe, in una delle due nature.
 *
 * L'altezza di riga è fissa e dichiarata una volta (`--riga`): è ciò che
 * tiene i due strati allineati anche quando il testo dentro ha lunghezze
 * diverse. Il codice a sinistra non cambia mai — è l'ancora che dice al
 * lettore che sta guardando la stessa riga di prima.
 */
function Pila({
  righe,
  modo,
  className,
  style,
}: {
  righe: Riga[];
  modo: "dato" | "lettura";
  className?: string;
  style?: React.CSSProperties;
}) {
  const dato = modo === "dato";

  return (
    <ul
      className={cx(
        "w-full",
        // L'altezza di riga è più generosa su schermo stretto perché lì
        // il testo va a capo: a una riga sola, «Il colesterolo è la leva
        // rimasta» si tagliava a «la le…», e una sezione che promette di
        // trasformare i numeri in frasi non può poi troncare le frasi.
        "[--riga:68px] sm:[--riga:60px] lg:[--riga:64px]",
        className,
      )}
      // Lo strato sopra ripete il contenuto di quello sotto: per chi
      // legge con lo schermo sarebbe la stessa lista letta due volte.
      aria-hidden={dato ? "true" : undefined}
      style={style}
    >
      {righe.map((r) => (
        <li
          key={r.codice}
          className="flex h-[var(--riga)] items-center gap-3 border-b sm:gap-5"
          style={{ borderColor: "var(--os-riga)" }}
        >
          <span
            className={cx(
              "os-mono w-[34px] shrink-0 sm:w-[42px]",
              dato ? "text-[color:var(--os-dato-cupo)]" : "text-[color:var(--os-mente)]",
            )}
          >
            {r.codice}
          </span>

          <span
            className={cx(
              "os-mono hidden w-[104px] shrink-0 md:block",
              dato ? "text-[color:var(--os-appena)]" : "text-[color:var(--os-appena)]",
            )}
          >
            {r.fonte}
          </span>

          {dato ? (
            <span className="os-mono line-clamp-2 min-w-0 flex-1 text-[color:var(--os-dato)]">
              {r.dato}
            </span>
          ) : (
            <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug text-[color:var(--os-piena)] sm:text-[15.5px]">
              {r.lettura}
            </span>
          )}

          <span
            aria-hidden="true"
            className={cx(
              "ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
              dato ? "opacity-45" : "opacity-100",
            )}
            style={{ background: dato ? "var(--os-dato)" : "var(--os-mente)" }}
          />
        </li>
      ))}
    </ul>
  );
}
