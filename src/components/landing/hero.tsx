"use client";

import { useMemo } from "react";
import { Marchio } from "@/components/brand/marchio";
import { aSiparioAperto } from "@/components/brand/sipario";
import { CampoVivo } from "@/components/landing/campo";
import { CorpoDiPunti } from "@/components/landing/corpo";
import { Comando, Freccia, Titolo } from "@/components/landing/primitive";
import { useRegia } from "@/components/landing/regia";
import { compositore, sorgente } from "@/lib/landing/attraversamento";
import { arco, campo, legami } from "@/lib/landing/geometria";
import { RITMO_TELEFONO, useScena } from "@/lib/landing/scena";
import { aTatto, profilo } from "@/lib/landing/tatto";
import { cx } from "@/components/ui/primitives";

/**
 * L'hero: l'accensione.
 *
 * Non è una schermata con un titolo e un pulsante. È **un sistema che si
 * accende**, e succede in quest'ordine, una volta sola, in poco più di
 * due secondi:
 *
 *   il vuoto  →  una linea di scansione attraversa lo schermo  →  i punti
 *   di misura si accendono dietro di lei  →  la rete si disegna  →  il
 *   marchio compare al centro  →  UNIQUE OS  →  il titolo sale parola per
 *   parola  →  la riga di stato dice che il sistema è in linea.
 *
 * La figura, dietro, non ha una battuta: non entra in scena perché c'era
 * già. Il sistema si accende attorno a una persona, e questo è tutto il
 * racconto della pagina detto in due secondi.
 *
 * Poi si scorre, e la scena non svanisce: **la si attraversa**. Il campo
 * si apre, il marchio cresce e passa oltre l'obiettivo, il titolo si
 * ritira verso l'alto. Non è una dissolvenza, è una camera che entra nel
 * sistema — ed è il motivo per cui con la rotellina la sezione è fissata:
 * senza il pin, lo scorrimento porterebbe *via* dalla scena invece che
 * *dentro*.
 *
 * **Sotto il dito la stessa scena ha un altro meccanismo.** Non perché
 * debba essere più povera — le battute, gli intervalli e le curve sono
 * gli stessi, uno per uno — ma perché lì il pin sobbalza (la barra degli
 * indirizzi cambia l'altezza del viewport mentre si scorre) e lo `scrub`
 * si sente: quel mezzo secondo d'inerzia che sulla rotellina dà peso,
 * sotto un pollice è la scena che arranca. Al loro posto una funzione
 * pura della posizione di scorrimento — `lib/landing/attraversamento.ts`
 * — che non ha stato da tenere allineato e quindi non può restare
 * indietro. Le due strade si scelgono una volta sola, in `aTatto()`, e
 * non si incontrano mai.
 *
 * **L'accensione comincia a sipario alzato.** Sulla landing il sipario
 * d'avvio c'è — è il primo indirizzo che si scrive, e per quasi tutti è
 * l'unica pagina dove il marchio si presenta — e dura fra i due e i tre
 * secondi. L'accensione ne dura poco più di due: partendo al montaggio
 * passerebbe intera lì sotto, e il sipario si alzerebbe su una scena già
 * finita e ferma. Sul telefono, dove dietro non c'è la Signature a
 * tenere viva la figura, è tutta l'impressione che si porta a casa: un
 * sito lento. Perciò qui si aspetta l'annuncio del sipario — vedi
 * `brand/sipario.ts` — e le due cose si leggono come un gesto solo.
 */

/* I numeri della riga di stato sono quelli veri del prodotto: sette
   pilastri (`score/pillars.ts`), trentacinque metriche e undici sorgenti
   (`score/metrics.ts`), novanta giorni di ciclo. Un contatore inventato
   si riconosce sempre, e toglie credibilità a tutto il resto. */
const STATO = [
  { chiave: "PILASTRI", valore: "07" },
  { chiave: "SEGNALI", valore: "35" },
  { chiave: "SORGENTI", valore: "11" },
  { chiave: "CICLO", valore: "90g" },
] as const;

/* Le misure che compaiono accanto ad alcuni nodi: valori reali di un
   referto, non numeri decorativi. */
const MISURE = [
  { testo: "VO₂max 44.2" },
  { testo: "HbA1c 5.1" },
  { testo: "HRV 62ms" },
  { testo: "LDL 118" },
  { testo: "SONNO 7h12" },
  { testo: "hs-CRP 0.7" },
] as const;

const LARGHEZZA = 1440;
const ALTEZZA = 860;

/*
 * Sotto questi pixel non si sta scorrendo.
 *
 * Il rimbalzo elastico di iOS manda `scrollY` a uno o due da solo, e un
 * dito appoggiato sullo schermo mentre la scena si accende non è una
 * richiesta di andare avanti. Sopra la soglia sì, e allora l'accensione
 * si chiude di colpo e la scena passa al dito.
 */
const SOGLIA = 6;

export function HeroSystem({
  entra,
  scopri,
  etichettaEntra,
}: {
  entra: string;
  scopri: string;
  etichettaEntra: string;
}) {
  const { vai } = useRegia();

  /* Il conteggio è fisso, e deve esserlo: è markup, e il markup del
     server e quello del browser devono coincidere. A variare col
     dispositivo è l'animazione dei nodi — che è la parte cara — non la
     loro esistenza: cinquanta cerchi fermi non li sente nessun telefono. */
  const nodi = useMemo(
    () =>
      campo({
        quantita: 50,
        larghezza: LARGHEZZA,
        altezza: ALTEZZA,
        seme: 20260904,
        vuotoAlCentro: 0.33,
      }),
    [],
  );

  const rete = useMemo(() => legami(nodi, 230, 3), [nodi]);

  const rif = useScena<HTMLDivElement>(({ gsap, radice }) => {
    /* Con che cosa si scorre, non quanto è largo lo schermo: vedi
       `lib/landing/tatto.ts`. Da qui in giù ci sono due strade, e non si
       incontrano mai — la rotellina tiene esattamente la scena che aveva,
       il dito ne prende una costruita per lui. */
    const tatto = aTatto();
    const q = gsap.utils.selector(radice);

    /* ── L'attraversamento, con la rotellina ────────────────────── */
    /*
     * La sezione si fissa, la scena si scorre con lo `scrub`, e il
     * ritardo dello scrub coincide con quello che Lenis dà già alla
     * pagina — è da lì che il movimento prende peso. Sotto il dito quello
     * stesso ritardo diventa una scena che arranca, ed è il motivo per
     * cui più sotto c'è un'altra strada.
     *
     * **Si costruisce prima dell'accensione, e non è un dettaglio
     * d'ordine.**
     *
     * Uno `scrub` non ha valori di partenza propri: se li legge dal DOM
     * la prima volta che disegna, e da lì in poi quelli restano — a ogni
     * rimisura ScrollTrigger fa `revert()` e li riscrive uguali, quindi
     * una lettura sbagliata non si corregge più da sola.
     *
     * Costruito *dopo* l'accensione, leggeva il marchio a opacità zero,
     * il sottotitolo venti pixel più in basso e il campo spento: è lì che
     * l'accensione tiene i suoi elementi mentre aspetta di partire.
     * Quello diventava lo stato di riposo della scena, e tornando in cima
     * dopo aver scorso — o dopo una rimisura qualsiasi, che arriva da
     * sola quando i caratteri sono pronti — marchio, sottotitolo e i due
     * comandi della pagina sparivano per sempre.
     *
     * Qui sopra il DOM è ancora quello che ha mandato il server: lo stato
     * di riposo, che su questa pagina è anche lo stato finale. È l'unico
     * istante in cui la lettura è quella giusta, e una lettura giusta
     * resta giusta — il `revert` di ogni rimisura la riscrive uguale. */
    if (!tatto) {
      const uscita = gsap.timeline({
        scrollTrigger: {
          trigger: radice,
          start: "top top",
          end: "+=105%",
          scrub: 0.7,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
        defaults: { ease: "none" },
      });

      uscita
        // La camera entra: il campo si apre verso di noi e passa oltre.
        .to(q("[data-rete]"), { scale: 1.55, opacity: 0, y: -40 }, 0)
        .to(q("[data-campo]"), { scale: 1.3, opacity: 0 }, 0)
        /* La figura si avvicina più piano di tutto il resto: è il corpo
           che si attraversa per ultimo, e per un istante resta solo.

           E non svanisce: viene *consumato*. Il piano di luce sale da
           terra e gli toglie le gambe, poi il cuore si apre e lo mangia
           dall'interno verso fuori; quel che resta si spegne un attimo
           prima che il bianco chiuda la scena, così l'ultima cosa che si
           attraversa è il petto. Sono due trasformazioni e un'opacità —
           niente maschere da ridisegnare mentre la sezione è fissata. */
        .to(q("[data-figura]"), { scale: 1.22, yPercent: -6, duration: 1.05 }, 0)
        .to(
          q("[data-suolo]"),
          { yPercent: -82, duration: 0.62, ease: "power1.in" },
          0,
        )
        .fromTo(
          q("[data-cuore]"),
          { scale: 0 },
          { scale: 4.2, duration: 0.72, ease: "power1.in" },
          0.22,
        )
        .to(q("[data-figura]"), { opacity: 0, duration: 0.33 }, 0.62)
        // Il marchio cresce fino a superare l'obiettivo, e si dissolve
        // nell'istante in cui lo attraversiamo.
        .to(q("[data-marchio]"), { scale: 3.4, opacity: 0, y: -30 }, 0)
        .to(q("[data-parola-os]"), { opacity: 0, y: -30 }, 0)
        // Il titolo si ritira verso l'alto e si stringe: non sparisce,
        // arretra — è quello che fa un oggetto quando lo si oltrepassa.
        .to(q("[data-titolo]"), { y: "-42%", scale: 0.82, opacity: 0 }, 0.05)
        .to(q("[data-sotto]"), { y: -70, opacity: 0 }, 0)
        .to(q("[data-comandi]"), { y: -50, opacity: 0 }, 0)
        .to(q("[data-stato]"), { y: 40, opacity: 0 }, 0)
        // Il vuoto si chiude sopra la scena: è la porta fra l'accensione
        // e la prima sezione, e le dà un bordo netto invece di una
        // sfumatura.
        .fromTo(q("[data-buio]"), { opacity: 0 }, { opacity: 1 }, 0.55);

      /* E la lettura si prende **adesso**, sincrona.
       *
       * Creare il trigger non basta: ScrollTrigger rimanda la prima
       * misura al tick successivo, e per allora l'accensione qui sotto
       * ha già spento il marchio e abbassato il sottotitolo. Sarebbero
       * quelli i valori registrati, e da lì in poi resterebbero: il
       * `revert` di ogni rimisura li riscrive uguali, quindi una lettura
       * sbagliata non si corregge più da sola.
       *
       * Un `refresh()` esplicito la prende in questa riga, mentre il DOM
       * è ancora quello che ha mandato il server — lo stato di riposo,
       * che su questa pagina è anche lo stato finale. Da qui in avanti
       * ogni rimisura riparte da una lettura giusta e resta giusta. */
      uscita.scrollTrigger?.refresh();
    }

    /* ── L'accensione ───────────────────────────────────────────── */
    const avvio = gsap.timeline({
      defaults: { ease: "expo.out" },
      // Un respiro prima di cominciare: la pagina si posa, poi si accende.
      delay: 0.15,
    });

    avvio
      .fromTo(
        q("[data-scansione]"),
        { scaleX: 0, transformOrigin: "0% 50%", opacity: 1 },
        { scaleX: 1, duration: 1.05, ease: "power2.inOut" },
        0,
      )
      .to(q("[data-scansione]"), { opacity: 0, duration: 0.5 }, 0.85)

      // I punti si accendono dietro alla linea, da sinistra a destra:
      // è la scansione che li trova, non un ingresso a caso.
      .from(
        q("[data-nodo]"),
        {
          opacity: 0,
          scale: 0,
          transformOrigin: "50% 50%",
          duration: 0.7,
          stagger: { each: 0.012, from: "start" },
        },
        0.25,
      )

      .from(
        q("[data-legame]"),
        { opacity: 0, duration: 1.1, stagger: 0.006 },
        0.75,
      )

      .from(q("[data-misura]"), { opacity: 0, x: -8, duration: 0.8, stagger: 0.07 }, 1.05)

      // Il marchio arriva quando il campo esiste già: è il sistema che
      // prende forma attorno a un centro, non un logo con dei puntini.
      .from(
        q("[data-marchio]"),
        { opacity: 0, scale: 0.72, filter: "blur(14px)", duration: 1.4 },
        0.7,
      )
      .from(q("[data-parola-os] > span"), {
        yPercent: 110,
        opacity: 0,
        duration: 0.9,
        stagger: 0.04,
      }, 1.05)

      .from(q("[data-sotto]"), { opacity: 0, y: 20, duration: 1.1 }, 2.15)
      .from(q("[data-comandi]"), { opacity: 0, y: 20, duration: 1.1 }, 2.3)
      .from(
        q("[data-stato] > *"),
        { opacity: 0, y: 12, duration: 0.9, stagger: 0.08 },
        2.4,
      );

    /* Il campo vivo entra solo dove esiste: sul dito lo shader non si
       accende — vedi `landing/campo.tsx` — e animare l'opacità di un
       riquadro vuoto per due secondi e mezzo è lavoro che non si vede. */
    if (!tatto) {
      avvio.from(
        q("[data-campo]"),
        { opacity: 0, duration: 2.4, ease: "power1.inOut" },
        0.9,
      );
    }

    /* Sul dito il titolo è una battuta di questa timeline e non una scena
       per conto suo.

       Sono le stesse parole con lo stesso ritardo — 1.35, la posizione che
       `Titolo` riceve come proprietà — ma dette da qui: due timeline
       appese entrambe al sipario, ciascuna con il suo `timeScale` e il suo
       ascoltatore di scorrimento, sono due pipeline che raccontano una
       cosa sola e possono sfasarsi fra loro. Su schermo largo il titolo
       resta padrone di sé: là la salita è legata allo scorrimento, non
       all'accensione. Vedi `landing/primitive.tsx`. */
    if (tatto) {
      avvio.from(
        q("[data-parola]"),
        {
          yPercent: 118,
          opacity: 0,
          // Una rotazione minima sull'asse X dà alla parola un peso che
          // la sola traslazione non ha: sale, non scivola.
          rotateX: -32,
          duration: 1.15,
          stagger: 0.055,
        },
        1.35,
      );
    }

    /* Con la rotellina la scena è finita: l'attraversamento è già in
       piedi, costruito qui sopra a scena ferma. */
    if (!tatto) return;

    /* ── L'attraversamento, con il dito ─────────────────────────── */
    /*
     * Stessa scena, meccanismo diverso: il fotogramma è una funzione
     * della posizione di scorrimento, ricalcolata a ogni tick sulla
     * posizione di *adesso*. Le battute, gli intervalli e le curve sono
     * gli stessi numeri di sopra — vedi `lib/landing/attraversamento.ts`,
     * dove sono scritti uno per uno — ma non c'è più una testina da
     * tenere allineata a un bersaglio, e quindi non c'è niente che possa
     * restare indietro rispetto al dito o perdere il passo con il resto.
     *
     * Qui la sezione non si fissa, e non è un ripiego: i browser mobili
     * cambiano l'altezza del viewport mentre la barra degli indirizzi
     * entra ed esce, e una sezione fissata in quel momento sobbalza.
     * L'attraversamento dura esattamente un'altezza di hero, così l'ultimo
     * fotogramma — il buio pieno — cade sul pixel in cui la sezione esce
     * di campo e comincia quella dopo.
     */

    /* Il riquadro del campo è vuoto: quel che gli resta addosso è un
       `filter`, un `mix-blend-mode` e una maschera, cioè tre strati di
       composizione che il browser deve tenere in conto a ogni fotogramma
       per non disegnare niente. Sparisce. */
    gsap.set(q("[data-campo]"), { display: "none" });

    /* `pause(0)` e non `paused: true` alla costruzione: il fotogramma
       iniziale va disegnato *adesso*, sincrono. Affidarlo
       all'`immediateRender` delle `from` significa dipendere da quando
       arriva il primo tick — e se il primo tick arriva tardi, alzando il
       sipario si vedrebbe la scena già montata sbiancare di colpo e
       riaccendersi. Sotto al sipario dev'essere già al buio. */
    avvio.pause(0);

    /* Il sipario dura da solo quasi tre secondi, e l'accensione comincia
       dopo di lui: al passo del desktop finirebbe verso il sesto, cioè
       molto dopo il momento in cui chi tiene un telefono in mano decide
       che il sito è fermo. Stesse battute, stessi rapporti, detti più
       svelti. */
    avvio.timeScale(RITMO_TELEFONO);

    const scena = compositore(radice, profilo());

    let attraversando = false;
    let ultimo = -1;
    let inMoto = false;
    let smettiSipario: () => void = () => {};

    /*
     * Il passaggio di consegne, e succede una volta sola.
     *
     * Le due scene scrivono sulle stesse proprietà degli stessi elementi
     * — il marchio, il sottotitolo, i comandi, il titolo — una animandoli
     * in ingresso, l'altra portandoli via con lo scorrimento. Non devono
     * mai toccarli nello stesso fotogramma: l'accensione si chiude
     * *prima*, e da lì in poi la scena ha un padrone solo.
     */
    const consegna = () => {
      if (attraversando) return;
      attraversando = true;
      smettiSipario();
      avvio.progress(1).kill();

      /* Due residui dell'accensione che a scena finita si pagherebbero a
         ogni fotogramma: il `filter` del marchio — che a `blur(0px)` non
         si vede, ma un passaggio di filtro lo pretende lo stesso — e le
         trasformazioni inline rimaste addosso ai punti, ai legami e alle
         misure, che sono centocinquanta e se le porta dietro l'SVG
         mentre viene scalato. */
      gsap.set(q("[data-marchio]"), { clearProps: "filter" });
      gsap.set(
        q(
          "[data-nodo],[data-legame],[data-misura],[data-parola-os] > span,[data-stato] > *",
        ),
        { clearProps: "all" },
      );
    };

    /*
     * Il fotogramma.
     *
     * Tre uscite anticipate prima di toccare il DOM: chi non ha ancora
     * scorso davvero, chi è fermo nello stesso punto del tick precedente,
     * e — dentro al compositore — ogni singola proprietà il cui valore
     * non è cambiato. Fermi sulla pagina si scrive zero.
     */
    function fotogramma(p: number, scarto: number) {
      if (!attraversando) {
        if (scarto <= SOGLIA) return;
        // Chi scorre ha detto che vuole andare avanti: meglio una battuta
        // saltata che due scene che si contendono lo stesso elemento.
        consegna();
      }

      if (p === ultimo) return;
      ultimo = p;

      /* `will-change` solo mentre si attraversa. Prometterlo sempre
         vorrebbe dire tenere undici piani di composizione in memoria per
         tutta la vita della pagina, che su un telefono è il modo più
         elegante di perdere la fluidità che si sta cercando. */
      const acceso = p > 0 && p < 1;
      if (acceso !== inMoto) {
        inMoto = acceso;
        radice.classList.toggle("os-hero-viva", acceso);
      }

      scena.disegna(p);
    }

    avvio.eventCallback("onComplete", consegna);
    smettiSipario = aSiparioAperto(() => avvio.play());

    const vista = sorgente(radice, fotogramma);

    /* Nato fuori dal `gsap.context` — il ticker, l'ascoltatore di resize
       e le proprietà scritte a mano non passano da lui — quindi muore
       qui, per intero. */
    return () => {
      smettiSipario();
      vista.spegni();
      avvio.kill();
      scena.libera();
      radice.classList.remove("os-hero-viva");
    };
  });

  return (
    <section
      ref={rif}
      id="hero"
      className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden"
      style={{ background: "var(--os-vuoto)" }}
    >
      {/* ── Il campo vivo: la Signature, quasi al nero ───────────── */}
      {/* La Signature sta *dietro* la scena, non dentro: raccolta attorno
          al marchio e già spenta dove comincia il titolo. A opacità piena
          e a tutto schermo è una bella figura che però compete con la
          tipografia, e in una gara fra uno shader e una frase deve
          vincere la frase.

          **Sul bianco lo shader va rovesciato.** Disegna un fondo quasi
          nero con dentro una luce: messo su carta sarebbe un rettangolo
          scuro. `invert(1)` porta il fondo a bianco e la luce a un
          petrolio-salvia — gli stessi colori della U — e `multiply` fa
          sparire il bianco lasciando solo la tinta: il risultato è una
          macchia d'inchiostro sulla carta, non una finestra sul nero. È
          la stessa figura, letta in negativo. */}
      <div
        data-campo=""
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.28]"
        style={{
          filter: "invert(1)",
          mixBlendMode: "multiply",
          maskImage:
            "radial-gradient(62% 46% at 50% 30%, #000 4%, rgb(0 0 0 / 0.42) 44%, transparent 74%)",
          WebkitMaskImage:
            "radial-gradient(62% 46% at 50% 30%, #000 4%, rgb(0 0 0 / 0.42) 44%, transparent 74%)",
        }}
      >
        <CampoVivo className="h-full w-full" />
      </div>

      {/* ── Il corpo ─────────────────────────────────────────────── */}
      {/* La persona, fatta di punti, dietro tutto il resto. Sta *sopra*
          il campo — e continua a lasciarlo respirare, perché il bianco
          dell'immagine si moltiplica sulla carta invece di coprirla — e
          *sotto* la rete di misura: i fili e i numeri le si agganciano
          addosso, che è esattamente il racconto — un corpo che genera
          dati.

          Non entra nell'accensione. Tutto il resto della scena nasce dal
          vuoto e si accende in ordine; lui c'è dal primo fotogramma. Il
          sistema si accende attorno a una persona che c'era già. */}
      <CorpoDiPunti className="pointer-events-none absolute inset-0 -z-[6]" />

      <div className="os-reticolo -z-10" aria-hidden="true" />

      {/* La sola luce della scena, sotto il marchio. */}
      <div
        aria-hidden="true"
        className="os-alone -z-10 left-1/2 top-1/2 h-[46vh] w-[70vw] max-w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, var(--os-alone-mente-forte), var(--os-alone-dato) 55%, transparent)",
        }}
      />

      {/* ── La rete di misura ────────────────────────────────────── */}
      <Costellazione nodi={nodi} rete={rete} />

      {/* ── Il contenuto ─────────────────────────────────────────── */}
      <div className="os-gabbia relative z-10 flex flex-col items-center pb-24 pt-32 text-center sm:pb-28">
        <div data-marchio="" className="flex flex-col items-center">
          <Marchio className="h-[68px] w-auto sm:h-[92px]" />
        </div>

        <p
          data-parola-os=""
          className="os-mono mt-5 flex gap-[0.32em] overflow-hidden text-[color:var(--os-media)]"
          aria-label="Unique OS"
        >
          {"UNIQUE OS".split("").map((c, i) => (
            <span key={i} aria-hidden="true" className="inline-block">
              {c === " " ? " " : c}
            </span>
          ))}
        </p>

        <div data-titolo="" className="mt-8 sm:mt-10">
          <Titolo
            tag="h1"
            testo={"L'intelligenza\ndietro la tua longevità."}
            ritardo={1.35}
            attendiSipario
            className="text-[clamp(2.55rem,8.6vw,7.2rem)]"
          />
        </div>

        <p
          data-sotto=""
          className="os-corpo mx-auto mt-7 max-w-[54ch] text-balance sm:mt-8"
        >
          Un unico sistema vivo che tiene insieme la tua biologia, i tuoi dati e
          ogni decisione che darà forma ai prossimi dieci anni.
        </p>

        <div
          data-comandi=""
          className="mt-9 flex w-full flex-col items-center gap-3 sm:mt-10 sm:w-auto sm:flex-row"
        >
          <Comando href={entra} variante="pieno" className="group/os w-full sm:w-auto">
            {etichettaEntra}
            <Freccia />
          </Comando>

          <a
            href={scopri}
            onClick={(e) => {
              e.preventDefault();
              vai(scopri);
            }}
            className="os-btn os-btn-vuoto w-full sm:w-auto"
          >
            Attraversa il sistema
          </a>
        </div>
      </div>

      {/* ── La riga di stato ─────────────────────────────────────── */}
      <div
        data-stato=""
        className="os-gabbia absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 pb-[max(20px,env(safe-area-inset-bottom))] sm:justify-between"
      >
        <p className="os-mono flex items-center gap-2.5 text-[color:var(--os-tenue)]">
          <span className="os-vivo" aria-hidden="true" />
          Sistema in linea
        </p>

        <dl className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
          {STATO.map(({ chiave, valore }) => (
            <div key={chiave} className="os-mono flex items-baseline gap-2">
              <dt className="text-[color:var(--os-appena)]">{chiave}</dt>
              <dd className="text-[color:var(--os-dato)]">{valore}</dd>
            </div>
          ))}
        </dl>

        <p className="os-mono hidden text-[color:var(--os-appena)] lg:block">
          Unique Longevity Clinic
        </p>
      </div>

      {/* Il buio che chiude la scena all'uscita. */}
      <div
        data-buio=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 opacity-0"
        style={{ background: "var(--os-vuoto)" }}
      />
    </section>
  );
}

/* ── La costellazione ─────────────────────────────────────────────── */

/**
 * I punti di misura e i loro legami.
 *
 * Un solo SVG, `preserveAspectRatio="xMidYMid slice"`: si comporta come
 * una fotografia di fondo, riempie sempre la scena e non si deforma su
 * un telefono stretto. Le coordinate sono fisse — arrivano da
 * `lib/landing/geometria.ts`, deterministiche — quindi il server e il
 * browser disegnano la stessa figura e React non ha nulla da riparare.
 */
function Costellazione({
  nodi,
  rete,
}: {
  nodi: ReturnType<typeof campo>;
  rete: ReturnType<typeof legami>;
}) {
  /*
   * Le etichette si appoggiano solo ai nodi che stanno nei margini.
   *
   * La colonna centrale — dove vivono marchio, titolo, sottotitolo e
   * comandi — è esclusa esplicitamente: una misura scritta sopra il
   * titolo non è profondità, è una cosa che il lettore deve scavalcare.
   * Il rettangolo qui sotto è più largo del testo di proposito, perché il
   * titolo cresce con la finestra.
   */
  const etichettati = useMemo(() => {
    const nelTesto = (x: number, y: number) =>
      x > 250 && x < LARGHEZZA - 250 && y > 130 && y < ALTEZZA - 90;

    const candidati = nodi
      .map((n, i) => ({ n, i }))
      .filter(
        ({ n }) =>
          n.x > 70 &&
          // A destra serve spazio per il trattino e per il testo, che
          // crescono verso l'esterno: senza questo margine l'etichetta
          // finirebbe oltre il bordo del riquadro.
          n.x < LARGHEZZA - 230 &&
          n.y > 70 &&
          n.y < ALTEZZA - 70 &&
          !nelTesto(n.x, n.y),
      )
      .sort((a, b) => b.n.peso - a.n.peso)
      .slice(0, MISURE.length);
    return candidati.map((c, k) => ({ ...c, misura: MISURE[k] }));
  }, [nodi]);

  return (
    <div
      data-rete=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-[5] overflow-hidden"
    >
      <svg
        viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <radialGradient id="os-nodo-luce">
            <stop offset="0%" stopColor="var(--os-mente-chiara)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--os-mente)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g stroke="var(--os-dato)" fill="none" strokeWidth="0.7">
          {rete.map((l, i) => (
            <path
              key={i}
              data-legame=""
              d={arco(nodi[l.a].x, nodi[l.a].y, nodi[l.b].x, nodi[l.b].y, 0.1)}
              opacity={(0.08 + l.forza * 0.22).toFixed(3)}
            />
          ))}
        </g>

        <g>
          {nodi.map((n, i) => (
            <circle
              key={i}
              data-nodo=""
              cx={n.x}
              cy={n.y}
              r={(0.9 + n.peso * 1.7).toFixed(2)}
              fill="var(--os-dato)"
              opacity={(0.18 + n.peso * 0.34).toFixed(2)}
            />
          ))}
        </g>

        {/* I nodi che portano una misura sono i soli caldi: è
            l'intelligenza che si posa su un dato e lo illumina. */}
        <g>
          {etichettati.map(({ n, i, misura }) => (
            <g key={i} data-misura="">
              <circle cx={n.x} cy={n.y} r="9" fill="url(#os-nodo-luce)" opacity="0.55" />
              <circle cx={n.x} cy={n.y} r="2.1" fill="var(--os-mente)" />
              <line
                x1={n.x + 7}
                y1={n.y}
                x2={n.x + 20}
                y2={n.y}
                stroke="var(--os-mente)"
                strokeWidth="0.7"
                opacity="0.4"
              />
              <text
                x={n.x + 26}
                y={n.y + 3.5}
                className="os-mono"
                fill="var(--os-mente)"
                opacity="0.85"
                style={{ fontSize: "10.5px", letterSpacing: "0.14em" }}
              >
                {misura.testo}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* La linea che attraversa lo schermo all'accensione. */}
      <div
        data-scansione=""
        className={cx(
          "absolute left-0 top-1/2 h-px w-full -translate-y-1/2",
          "bg-[linear-gradient(90deg,transparent,var(--os-mente)_35%,var(--os-mente-chiara)_50%,var(--os-mente)_65%,transparent)]",
        )}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
