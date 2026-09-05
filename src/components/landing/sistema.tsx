"use client";

import { useRef } from "react";
import { Entra, Etichetta, Titolo } from "@/components/landing/primitive";
import { useScena } from "@/lib/landing/scena";

/**
 * Il sistema: dove il corpo diventa direzione.
 *
 * Niente griglia di card. Una griglia dice "ecco otto cose che
 * facciamo"; qui bisogna dire **una** cosa: che flussi separati, che
 * oggi vivono in posti diversi — un referto in una cartella, il sonno in
 * un orologio, l'anamnesi su un foglio — convergono su una persona sola
 * e ne escono come una direzione.
 *
 * **La forma è un corpo che si riempie di dati, e lo scorrimento è ciò
 * che lo riempie.** A sinistra il filmato: una figura che comincia
 * intera e si scopre punto per punto, fino ai valori appesi addosso. A
 * destra le battute, che entrano ed escono di pari passo. Chi scorre non
 * guarda succedere la cosa: la fa succedere.
 *
 * **Il filmato non si riproduce: si scorre.** La pagina si ferma, il
 * fotogramma lo sceglie la rotellina, e quando si arriva in fondo la
 * pagina riprende a scendere. È anche il motivo per cui parte sempre:
 * non dipende da `play()`, quindi non dipende dal permesso che il
 * browser dà o nega all'avvio automatico.
 *
 * **Il file è codificato per essere scrubbato.** Un MP4 normale porta un
 * fotogramma chiave ogni due secondi, e per mostrare l'istante 3,4 il
 * browser deve decodificare tutto quel che sta in mezzo: sotto il dito
 * si impunta. Questo ne ha uno ogni sei fotogrammi — un quarto di
 * secondo — così ogni salto è corto. È il vero motivo per cui pesa tre
 * megabyte invece di uno.
 *
 * **Senza movimento resta un filmato normale.** Con
 * `prefers-reduced-motion` la scena non viene costruita: le quattro
 * battute stanno una sotto l'altra e si leggono tutte, il filmato mostra
 * la posa e un comando per guardarlo. Non è un ripiego, è una versione.
 */

/** Un salto più corto di mezzo fotogramma è lavoro buttato. */
const SOGLIA = 1 / 48;

/**
 * Le battute, nell'ordine in cui il filmato le incontra.
 *
 * Sono l'inventario vero di ciò che entra — undici sorgenti,
 * trentacinque segnali, gli stessi numeri che la riga di stato
 * dell'hero dichiara. Un elenco inventato qui si riconoscerebbe subito,
 * perché è l'unica parte della pagina che un medico sa già leggere.
 */
const PASSI = [
  {
    chiave: "Sangue e strumenti",
    titolo: "Ottantaquattro valori,\ne l'apparecchio che li conferma.",
    testo:
      "Ematochimica, ECG, spirometria, test da sforzo. È il fondo su cui tutto il resto viene letto: senza, ogni altro segnale resta un'impressione.",
  },
  {
    chiave: "Fra una visita e l'altra",
    titolo: "Il corpo non smette di parlare\nquando esci dallo studio.",
    testo:
      "HRV, riposo, carico, sonno, passi, sessioni, apporto, aderenza. È il novantanove per cento del tempo, ed è la parte che nessuna visita vede.",
  },
  {
    chiave: "Quello che nessun sensore misura",
    titolo: "Anamnesi, referti,\nquestionari validati.",
    testo:
      "La storia clinica e ciò che una persona riferisce di sé. Un dato senza contesto si legge male — e qualche volta si legge al contrario.",
  },
  {
    chiave: "Un posto solo",
    titolo: "Undici sorgenti.\nTrentacinque segnali.\nUna persona sola.",
    testo:
      "Non un archivio in più: il primo in cui i flussi coincidono, nello stesso istante e sulla stessa scheda. Da lì in poi si può ragionare.",
  },
] as const;

export function SystemVisualization() {
  const video = useRef<HTMLVideoElement>(null);

  const rif = useScena<HTMLElement>(({ gsap, ScrollTrigger, radice, ridotta }) => {
    const palco = radice.querySelector<HTMLElement>("[data-palco]");
    const passi = Array.from(radice.querySelectorAll<HTMLElement>("[data-passo]"));
    const nodo = video.current;
    if (!palco || !nodo || passi.length === 0) return;

    /* Da qui in poi la scena c'è: il CSS impila le battute e toglie il
       comando di riproduzione, che non ha più niente da fare. */
    radice.dataset.scorre = "";

    nodo.muted = true;

    /* Servono i dati, non i soli metadati: un fotogramma si mostra solo
       se è stato scaricato. Il caricamento parte da qui e non dal
       markup, così chi ha meno movimento non se lo trova addosso
       comunque. */
    const carica = () => {
      nodo.preload = "auto";
      nodo.load();
    };

    /* Sul telefono non si scarica subito. Sono quasi tre megabyte — il
       filmato è codificato fitto apposta, per poterlo scorrere — e
       chiederli al montaggio significa metterli in fila con i caratteri
       e con l'idratazione, sulla rete di un telefono, nei secondi in cui
       si guardano le prime due schermate. Arriva comunque in tempo: la
       richiesta parte mezza schermata prima che il palco entri in campo. */
    const anticipo = ridotta
      ? ScrollTrigger.create({
          trigger: palco,
          start: "top bottom+=50%",
          once: true,
          onEnter: carica,
        })
      : null;
    if (!anticipo) carica();

    let durata = 0;
    let ultimo = -1;
    const misura = () => {
      durata = Number.isFinite(nodo.duration) ? nodo.duration : 0;
    };
    nodo.addEventListener("loadedmetadata", misura);
    if (nodo.readyState >= 1) misura();

    const quante = passi.length;
    const stato = { t: 0 };

    const chiudi = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    /**
     * Scopre la battuta di turno.
     *
     * Ognuna ha la sua fetta di scorrimento: entra nel primo quinto
     * della propria fetta, resta, esce nell'ultimo. L'ultima non esce —
     * resta in campo finché la sezione non si sblocca, o si finirebbe
     * di scorrere su una colonna vuota.
     */
    function battute(t: number) {
      for (let i = 0; i < quante; i++) {
        const dentro = t * quante - i;
        /* La prima non entra: c'è già quando la sezione si blocca.
           Altrimenti si arriva sul palco e la colonna di destra è vuota
           finché non si riprende a scorrere. */
        const su = i === 0 ? 1 : chiudi(dentro / 0.2);
        const giu = i === quante - 1 ? 1 : chiudi((1 - dentro) / 0.2);
        const p = passi[i];
        p.style.opacity = String(Math.min(su, giu));
        /* Entrando sale da sotto, uscendo continua a salire: la battuta
           attraversa il campo, non fa avanti e indietro. */
        p.style.transform = `translateY(${(1 - su) * 30 - (1 - giu) * 30}px)`;
      }
    }

    battute(0);

    const scena = gsap.to(stato, {
      t: 1,
      ease: "none",
      scrollTrigger: {
        trigger: palco,
        start: "top top",
        /* Quanta rotellina vale la scena. Tre schermate danno a dieci
           secondi di filmato e a quattro battute un passo leggibile;
           sul telefono si accorcia, o per arrivare in fondo servirebbe
           un pollice paziente. */
        end: () => `+=${Math.round(innerHeight * (ridotta ? 2.2 : 3.2))}`,
        pin: true,
        anticipatePin: 1,
        /* Lo scrub smorza: il fotogramma insegue il dito invece di
           incollarcisi, e uno strappo non diventa una raffica di salti. */
        scrub: ridotta ? 0.4 : 0.7,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        battute(stato.t);
        if (!durata || nodo.readyState < 2) return;

        /* L'ultimo istante non si tocca: un `currentTime` esattamente
           pari alla durata manda il filmato in `ended`, e il fotogramma
           sparisce proprio mentre lo si sta guardando. */
        const istante = stato.t * (durata - 0.05);
        if (Math.abs(istante - ultimo) < SOGLIA) return;
        ultimo = istante;
        nodo.currentTime = istante;
      },
    });

    return () => {
      nodo.removeEventListener("loadedmetadata", misura);
      anticipo?.kill();
      scena.scrollTrigger?.kill();
      scena.kill();
      /* Opacità e trasformazioni le ha scritte questa funzione, non
         GSAP: il revert del contesto non le conosce e vanno tolte a
         mano, o la sezione resta con tre battute invisibili. */
      for (const p of passi) {
        p.style.opacity = "";
        p.style.transform = "";
      }
      delete radice.dataset.scorre;
    };
  });

  /** Il ripiego: senza scena, il filmato si guarda come un filmato. */
  const guarda = () => {
    const nodo = video.current;
    if (!nodo) return;
    nodo.muted = true;
    if (nodo.paused) void nodo.play().catch(() => undefined);
    else nodo.pause();
  };

  return (
    <section ref={rif} id="sistema" className="os-sezione">
      <div className="os-gabbia">
        {/* Titolo e chiosa stavano su due colonne, la frase di destra a
            commento del titolo. Adesso la testata prende l'asse della
            pagina come tutte le altre e la chiosa va sotto: stessa
            lettura, una colonna sola.

            Se qualcuno tornasse alle due colonne, la trappola è questa:
            la chiosa era in posizione assoluta agganciata al bordo della
            sezione e finiva sotto la barra di navigazione, che è fissa e
            sta più in alto di qualunque "top: 0" di sezione. */}
        <header className="os-testata">
          <Etichetta indice="01" tono="dato">
            Il sistema
          </Etichetta>
          <Titolo
            zoom
            testo={"Il tuo corpo\ngenera dati.\nUnique OS li trasforma\nin una direzione."}
            className="mt-7 text-[clamp(2.05rem,5.4vw,4.4rem)]"
          />

          <Entra tag="p" className="os-corpo mt-7 max-w-[46ch]">
            Ogni esame, ogni notte di sonno, ogni visita produce un segnale.
            Separati non dicono niente. Unique OS li tiene nello stesso posto,
            nello stesso istante, sulla stessa persona — ed è lì che smettono di
            essere numeri e diventano una decisione.
          </Entra>
        </header>
      </div>

      {/* ── La scena ─────────────────────────────────────────────── */}
      <div
        data-palco=""
        className="os-gabbia mt-14 flex min-h-[100svh] items-center sm:mt-16"
      >
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-16">
          {/* ── Il corpo ─────────────────────────────────────── */}
          <figure className="mx-auto w-full max-w-[380px] lg:max-w-none">
            <video
              ref={video}
              className="os-lettura-video mx-auto h-auto max-h-[42svh] w-full lg:max-h-[78svh]"
              src="/corpo-dati-scrub.mp4"
              poster="/corpo-dati.jpg"
              preload="none"
              muted
              playsInline
              width={864}
              height={1296}
              aria-label="Una figura umana fatta di punti si scopre a poco a poco, ruota, e si riempie dei valori misurati: colesterolo, emoglobina, pressione, frequenza cardiaca, glucosio, vitamina D."
            />

            <figcaption className="mt-5 text-center lg:hidden">
              <button type="button" onClick={guarda} className="os-lettura-avvia os-btn os-btn-vuoto">
                Guarda il filmato
              </button>
            </figcaption>
          </figure>

          {/* ── Le battute ───────────────────────────────────── */}
          <ol className="os-lettura-passi">
            {PASSI.map((p) => (
              <li key={p.chiave} data-passo="">
                <p className="os-mono text-[color:var(--os-dato)]">{p.chiave}</p>
                <p className="os-display mt-4 whitespace-pre-line text-[clamp(1.5rem,2.9vw,2.3rem)]">
                  {p.titolo}
                </p>
                <p className="os-corpo mt-4 max-w-[40ch]">{p.testo}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
