"use client";

import { useEffect, useRef } from "react";
import { livello } from "@/lib/landing/capacita";

/**
 * La figura.
 *
 * Un corpo umano fatto di punti, dietro il titolo dell'hero, che non sta
 * mai fermo: respira, sposta il peso da una gamba all'altra, muove
 * appena le braccia, la testa, il busto. Non è un fondale — è **la
 * persona**, e tutto il resto della scena le gira attorno: la rete di
 * misura, i numeri appesi ai fili, il marchio.
 *
 * **Perché uno scheletro e non una sagoma ritagliata.** Campionare i
 * punti da un'immagine darebbe una figura ferma, e per muoverla
 * servirebbero più immagini e un'interpolazione fra pixel che non sa
 * cosa sia un gomito: le braccia si allungherebbero invece di ruotare.
 * Qui ogni punto è appeso a un osso — conosce l'osso, la propria
 * posizione lungo di esso e l'angolo attorno ad esso — e muovere la
 * figura vuol dire muovere una dozzina di angoli. Il corpo si deforma da
 * solo, e si deforma come un corpo.
 *
 * **La terza dimensione c'è, anche se il piano è due.** Ogni punto sta
 * su una circonferenza attorno al proprio osso: la componente
 * orizzontale lo sposta sullo schermo, quella che punta verso
 * l'obiettivo non si vede ma decide quanto il punto è chiaro e quanto è
 * grande. È ciò che fa leggere un volume invece di una silhouette
 * riempita di coriandoli.
 *
 * **Il costo è tenuto basso da tre scelte.** L'opacità di ogni punto è
 * decisa una volta sola al montaggio, così i punti si possono
 * raggruppare per colore e trasparenza e disegnare in diciotto
 * riempimenti invece di tremila; la dissolvenza verso il basso la fa una
 * maschera CSS, che è gratis; e il numero di punti scende dove il
 * dispositivo è modesto. Con `prefers-reduced-motion` si disegna un
 * fotogramma solo e si spegne il ciclo: la figura resta, il movimento
 * no.
 */

/* ── Proporzioni ──────────────────────────────────────────────────
   In unità di figura: 0 è la sommità del capo, 1 la pianta del piede,
   e l'asse x è centrato sullo zero. Sono le proporzioni canoniche a
   otto teste — la testa è un ottavo dell'altezza — perché un corpo
   sbagliato di proporzioni si riconosce prima ancora di essere letto. */

const BACINO_Y = 0.48;
const SPINA = 0.23; // bacino → petto
const COLLO = 0.065; // petto → base del collo
const CRANIO = 0.12; // base del collo → centro della testa
const SPALLA_MEZZA = 0.095;
const ANCA_MEZZA = 0.06;
const BRACCIO = 0.185;
const AVAMBRACCIO = 0.175;
const MANO = 0.075;
const COSCIA = 0.25;
const GAMBA = 0.225;
const PIEDE = 0.062;

/**
 * Quanto la figura può essere larga rispetto alla propria altezza.
 *
 * Su schermo largo non morde mai: un corpo alto quanto l'hero resta
 * comodo dentro 1440 px. Morde sul telefono, dove un corpo a piena
 * altezza sarebbe largo nove decimi dello schermo e la pagina
 * diventerebbe un fondale con sopra del testo, invece del contrario. Lì
 * la figura si accorcia finché non sta in poco più di due terzi.
 */
const RAPPORTO = 0.58;

type P = readonly [number, number];

/** Da un punto, `len` unità nella direzione `ang` (0 = verso l'alto). */
function versa(o: P, len: number, ang: number): P {
  return [o[0] + Math.sin(ang) * len, o[1] - Math.cos(ang) * len];
}

interface Osso {
  a: P;
  b: P;
  r0: number;
  r1: number;
  /** Quanto volume vale, per spartire i punti in proporzione. */
  peso: number;
  /**
   * Chiude l'osso alle due estremità come un ovale, invece che di netto.
   *
   * Serve al cranio, che non è un tubo segato: senza, la testa esce con
   * la calotta piatta. E serve che il cranio sia un osso *con una
   * lunghezza* — un osso che parte e arriva nello stesso punto non ha
   * una perpendicolare, e tutti i suoi punti finiscono allineati su una
   * riga orizzontale invece che attorno a un volume. Era esattamente
   * quello che succedeva alla testa: una trattino di puntini sopra le
   * spalle.
   */
  ovale?: boolean;
}

/**
 * Lo scheletro all'istante `t`, in secondi.
 *
 * Nessun ciclo di camminata: una persona in piedi che *vive*. I periodi
 * dei seni sono numeri primi fra loro apposta — 0.9, 0.28, 0.23, 0.19 —
 * così le battute non ricadono mai insieme e il movimento non si
 * riconosce come un anello che si ripete.
 */
function scheletro(t: number): Osso[] {
  const respiro = Math.sin(t * 0.9);
  const peso = Math.sin(t * 0.28);
  const busto = Math.sin(t * 0.23 + 1.1) * 0.05 + peso * 0.02;
  const testaAng = Math.sin(t * 0.19 + 2.2) * 0.1;

  // Il peso si sposta da una gamba all'altra: il bacino trasla e si
  // inclina, e il busto compensa nella direzione opposta. È il gesto che
  // fa la differenza fra una persona ferma e un manichino.
  const bacino: P = [peso * 0.014, BACINO_Y + respiro * 0.004 + Math.abs(peso) * 0.004];
  const inclinaBacino = peso * 0.05;

  const petto = versa(bacino, SPINA, busto);
  const collo = versa(petto, COLLO, busto * 0.7);

  // Le spalle stanno perpendicolari alla spina, e salgono con il respiro.
  const perp = busto + Math.PI / 2;
  const spallaLarga = SPALLA_MEZZA * (1 + respiro * 0.018);
  const spallaSx = versa(collo, spallaLarga, perp + Math.PI);
  const spallaDx = versa(collo, spallaLarga, perp);

  const perpAnca = inclinaBacino + Math.PI / 2;
  const ancaSx = versa(bacino, ANCA_MEZZA, perpAnca + Math.PI);
  const ancaDx = versa(bacino, ANCA_MEZZA, perpAnca);

  // Le braccia pendono appena aperte e oscillano con periodi diversi:
  // due braccia che si muovono all'unisono sono due braccia finte.
  const braccioSxAng = Math.PI - 0.37 + Math.sin(t * 0.31) * 0.055 + peso * 0.03;
  const braccioDxAng = Math.PI + 0.37 + Math.sin(t * 0.27 + 2.4) * 0.055 + peso * 0.03;
  const gomitoSx = versa(spallaSx, BRACCIO, braccioSxAng);
  const gomitoDx = versa(spallaDx, BRACCIO, braccioDxAng);
  const polsoSx = versa(gomitoSx, AVAMBRACCIO, braccioSxAng + 0.1 + Math.sin(t * 0.37) * 0.05);
  const polsoDx = versa(gomitoDx, AVAMBRACCIO, braccioDxAng - 0.1 + Math.sin(t * 0.33 + 1.6) * 0.05);
  const manoSx = versa(polsoSx, MANO, braccioSxAng + 0.12);
  const manoDx = versa(polsoDx, MANO, braccioDxAng - 0.12);

  // La gamba che porta il peso resta dritta, l'altra si flette appena.
  const flexSx = Math.max(0, peso) * 0.07;
  const flexDx = Math.max(0, -peso) * 0.07;
  const ginocchioSx = versa(ancaSx, COSCIA, Math.PI + 0.035 - flexSx);
  const ginocchioDx = versa(ancaDx, COSCIA, Math.PI - 0.035 + flexDx);
  const cavigliaSx = versa(ginocchioSx, GAMBA, Math.PI + 0.01 + flexSx);
  const cavigliaDx = versa(ginocchioDx, GAMBA, Math.PI - 0.01 - flexDx);
  const puntaSx = versa(cavigliaSx, PIEDE, Math.PI - 1.15);
  const puntaDx = versa(cavigliaDx, PIEDE, Math.PI + 1.15);

  const torace = 0.108 * (1 + respiro * 0.035);

  /* La vita.
   *
   * Il busto era un osso solo dal collo al bacino, cioè quasi un
   * cilindro — e un cilindro largo quanto le spalle si mangia le
   * braccia: il braccio cadeva dentro il raggio del torace e spariva.
   * Due ossa con una strozzatura in mezzo danno la clessidra che un
   * corpo ha davvero, e le braccia tornano a staccarsi dal tronco. */
  const vita = versa(bacino, SPINA * 0.56, busto);

  /* Il capo va dalla calotta al mento: un osso con una direzione, non
     un punto solo. `ovale` gli arrotonda le due estremità. */
  const angTesta = busto * 0.4 + testaAng;
  const calotta = versa(collo, CRANIO + 0.055, angTesta);
  const mento = versa(collo, CRANIO - 0.055, angTesta);

  return [
    { a: calotta, b: mento, r0: 0.047, r1: 0.047, peso: 2.4, ovale: true },
    { a: collo, b: versa(collo, COLLO * 0.6, busto * 0.7 + Math.PI), r0: 0.03, r1: 0.032, peso: 0.35 },
    { a: spallaSx, b: spallaDx, r0: 0.048, r1: 0.048, peso: 1.2 },
    { a: collo, b: vita, r0: torace, r1: 0.071, peso: 2.9 },
    { a: vita, b: bacino, r0: 0.071, r1: 0.094, peso: 1.9 },
    // Le braccia devono *vedersi*: pesano più di un tronco che si vede
    // da sé anche con la metà dei punti.
    { a: spallaSx, b: gomitoSx, r0: 0.037, r1: 0.03, peso: 1.5 },
    { a: spallaDx, b: gomitoDx, r0: 0.037, r1: 0.03, peso: 1.5 },
    { a: gomitoSx, b: polsoSx, r0: 0.03, r1: 0.023, peso: 1.15 },
    { a: gomitoDx, b: polsoDx, r0: 0.03, r1: 0.023, peso: 1.15 },
    { a: polsoSx, b: manoSx, r0: 0.025, r1: 0.018, peso: 0.55, ovale: true },
    { a: polsoDx, b: manoDx, r0: 0.025, r1: 0.018, peso: 0.55, ovale: true },
    { a: ancaSx, b: ginocchioSx, r0: 0.058, r1: 0.042, peso: 1.8 },
    { a: ancaDx, b: ginocchioDx, r0: 0.058, r1: 0.042, peso: 1.8 },
    { a: ginocchioSx, b: cavigliaSx, r0: 0.04, r1: 0.024, peso: 1.15 },
    { a: ginocchioDx, b: cavigliaDx, r0: 0.04, r1: 0.024, peso: 1.15 },
    { a: cavigliaSx, b: puntaSx, r0: 0.024, r1: 0.016, peso: 0.25 },
    { a: cavigliaDx, b: puntaDx, r0: 0.024, r1: 0.016, peso: 0.25 },
  ];
}

/* ── I punti ──────────────────────────────────────────────────────
   Ogni punto conosce l'osso a cui è appeso e non cambia mai idea: è
   ciò che permette al corpo di deformarsi invece di ridisegnarsi. */

interface Punto {
  osso: number;
  /** Dove sta lungo l'osso, da 0 a 1. */
  lungo: number;
  /** L'angolo attorno all'osso: il coseno si vede, il seno è profondità. */
  giro: number;
  /** Quanto è lontano dall'asse, in frazione del raggio. */
  raggio: number;
  fase: number;
  vel: number;
  deriva: number;
  dim: number;
}

/** I tre inchiostri della scena: la carta, il marchio, il segno vivo. */
const COLORI = [
  [20, 19, 19],
  [207, 42, 66],
  [51, 116, 130],
] as const;

/** Sei gradini di trasparenza: bastano all'occhio, e sono sei riempimenti. */
const GRADINI = 6;

interface Gruppo {
  colore: string;
  punti: Punto[];
  buf: Float32Array;
}

function costruisci(quanti: number, ossa: Osso[]): Gruppo[] {
  const totale = ossa.reduce((s, o) => s + o.peso, 0);
  const gruppi: Gruppo[] = [];

  const grezzi: Punto[][] = [];
  for (let c = 0; c < COLORI.length; c++) {
    for (let g = 0; g < GRADINI; g++) grezzi.push([]);
  }

  let seme = 20260905;
  /** Un rumore ripetibile: la stessa figura a ogni visita, e in SSR nessuna. */
  const rnd = () => {
    seme = (seme * 1664525 + 1013904223) >>> 0;
    return seme / 4294967296;
  };

  for (let i = 0; i < quanti; i++) {
    // L'osso si sorteggia in proporzione al volume: le gambe pesano più
    // delle mani, e devono ricevere più punti.
    let q = rnd() * totale;
    let osso = 0;
    while (osso < ossa.length - 1 && (q -= ossa[osso].peso) > 0) osso++;

    // Verso la superficie, non verso l'asse: un corpo pieno di punti è
    // una macchia, un corpo con i punti sulla pelle è un volume.
    const raggio = 0.52 + 0.48 * Math.pow(rnd(), 0.4);
    const giro = rnd() * Math.PI * 2;

    // Un punto su dodici è polvere: si stacca dal corpo e vaga. Sono
    // quelli che fanno sembrare la figura in dissoluzione invece che
    // ritagliata con le forbici.
    const polvere = rnd() < 0.085;

    const dado = rnd();
    const colore = dado < 0.055 ? 1 : dado < 0.1 ? 2 : 0;

    // La profondità decide la trasparenza, e non cambia mai: il seno
    // dell'angolo attorno all'osso è fisso quanto l'angolo.
    const fronte = (Math.sin(giro) + 1) / 2;
    const forza = (0.34 + 0.66 * fronte) * (polvere ? 0.55 : 1) * (0.7 + rnd() * 0.3);
    const gradino = Math.min(GRADINI - 1, Math.floor(forza * GRADINI));

    grezzi[colore * GRADINI + gradino].push({
      osso,
      lungo: rnd(),
      giro,
      raggio,
      fase: rnd() * Math.PI * 2,
      vel: 0.35 + rnd() * 0.9,
      deriva: polvere ? 0.012 + rnd() * 0.045 : 0.0016 + rnd() * 0.004,
      dim: (colore === 0 ? 0.95 : 1.15) * (0.7 + fronte * 0.6),
    });
  }

  for (let c = 0; c < COLORI.length; c++) {
    for (let g = 0; g < GRADINI; g++) {
      const punti = grezzi[c * GRADINI + g];
      if (punti.length === 0) continue;
      const [r, v, b] = COLORI[c];
      // Il gradino sta al centro della sua fascia, e il rosso e il
      // petrolio pesano più dell'inchiostro: sono accenti, devono vedersi.
      const alfa = (((g + 0.5) / GRADINI) * (c === 0 ? 0.72 : 0.9)).toFixed(3);
      gruppi.push({
        colore: `rgba(${r},${v},${b},${alfa})`,
        punti,
        buf: new Float32Array(punti.length * 3),
      });
    }
  }

  return gruppi;
}

export function FiguraUmana({ className }: { className?: string }) {
  const rif = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = rif.current;
    if (!tela) return;
    const ctx = tela.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Il livello si legge qui e non in fase di render: `matchMedia` sul
    // server non esiste, e due alberi diversi sono un errore di idratazione.
    const liv = livello();
    const ferma = liv === "ferma";
    const gruppi = costruisci(liv === "piena" ? 14000 : 7000, scheletro(0));

    let larghezza = 0;
    let altezza = 0;
    let dpr = 1;

    function misura() {
      const r = tela!.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      // Oltre il doppio non si guadagna nulla di visibile e si perde
      // metà del budget di riempimento su uno schermo Retina.
      dpr = Math.min(devicePixelRatio || 1, 2);
      larghezza = r.width;
      altezza = r.height;
      tela!.width = Math.round(larghezza * dpr);
      tela!.height = Math.round(altezza * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function disegna(t: number) {
      if (larghezza < 1) return;

      const ossa = scheletro(t);

      /* La figura sta in piedi nel riquadro: alta quasi quanto l'hero, e
         stretta al punto da non uscire di lato su uno schermo basso.

         Il capo parte sotto il 7% dell'altezza e non più a filo: la
         maschera dissolve la prima fascia della tela, e una testa
         piazzata lì dentro si spegne proprio dove dovrebbe essere più
         riconoscibile. I piedi, al contrario, possono uscire dal fondo —
         là sotto la dissolvenza è voluta. */
      const h = Math.min(altezza * 1.0, larghezza / RAPPORTO);
      const cx = larghezza / 2;
      const cy = altezza * 0.075;

      ctx!.clearRect(0, 0, larghezza, altezza);

      for (const g of gruppi) {
        const { punti, buf } = g;
        let n = 0;

        for (let i = 0; i < punti.length; i++) {
          const p = punti[i];
          const o = ossa[p.osso];
          const ax = o.a[0];
          const ay = o.a[1];
          const bx = o.b[0];
          const by = o.b[1];

          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);

          // La perpendicolare all'osso porta il punto sullo schermo; se
          // l'osso è una sfera — testa, mano — non c'è direzione e vale
          // l'orizzontale.
          const nx = len > 1e-6 ? -dy / len : 1;
          const ny = len > 1e-6 ? dx / len : 0;

          // Sugli ossa ovali il raggio si chiude alle estremità: è la
          // differenza fra un cranio e un tubo tagliato con la sega.
          const mezzo = 2 * p.lungo - 1;
          const profilo = o.ovale ? Math.sqrt(Math.max(0, 1 - mezzo * mezzo)) : 1;
          const R = (o.r0 + (o.r1 - o.r0) * p.lungo) * p.raggio * profilo;
          const cos = Math.cos(p.giro);

          const fx =
            ax + dx * p.lungo + nx * R * cos + Math.sin(t * p.vel + p.fase) * p.deriva;
          const fy =
            ay + dy * p.lungo + ny * R * cos + Math.cos(t * p.vel * 0.83 + p.fase * 1.7) * p.deriva;

          buf[n++] = cx + fx * h;
          buf[n++] = cy + fy * h;
          buf[n++] = Math.max(0.85, p.dim * h * 0.0024);
        }

        // Un percorso solo per gruppo, un riempimento solo: è la
        // differenza fra diciotto chiamate e tremila.
        ctx!.fillStyle = g.colore;
        ctx!.beginPath();
        for (let i = 0; i < n; i += 3) {
          const s = buf[i + 2];
          ctx!.rect(buf[i], buf[i + 1], s, s);
        }
        ctx!.fill();
      }
    }

    misura();
    disegna(0);

    const osservatore = new ResizeObserver(() => {
      misura();
      if (ferma) disegna(0);
    });
    osservatore.observe(tela);

    let anello = 0;
    if (!ferma) {
      const inizio = performance.now();
      const passo = (ora: number) => {
        disegna((ora - inizio) / 1000);
        anello = requestAnimationFrame(passo);
      };
      anello = requestAnimationFrame(passo);
    }

    return () => {
      cancelAnimationFrame(anello);
      osservatore.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={rif}
      aria-hidden="true"
      className={className}
      style={{
        // Il corpo si dissolve verso il basso invece di finire con un
        // taglio netto, e si alleggerisce sotto ai comandi, dove il
        // testo deve restare la cosa più leggibile della pagina.
        maskImage:
          "linear-gradient(180deg, transparent 0%, #000 4%, #000 56%, rgb(0 0 0 / 0.5) 76%, rgb(0 0 0 / 0.28) 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(180deg, transparent 0%, #000 4%, #000 56%, rgb(0 0 0 / 0.5) 76%, rgb(0 0 0 / 0.28) 90%, transparent 100%)",
      }}
    />
  );
}
