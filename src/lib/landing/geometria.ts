/**
 * La geometria del sistema.
 *
 * Puro, senza DOM e senza `Math.random`: le stesse coordinate escono dal
 * server e dal browser, quindi React non trova un albero diverso da
 * quello che ha appena idratato. Un campo di punti generato a caso è il
 * modo più veloce per riempire la console di avvisi di idratazione e
 * far lampeggiare la scena al primo fotogramma.
 *
 * E ha un secondo effetto, meno ovvio e più importante: la costellazione
 * è **sempre la stessa**. Chi torna sulla pagina ritrova la figura che
 * ricordava, e una figura riconoscibile è un marchio; una diversa a ogni
 * caricamento è rumore.
 */

/** Generatore lineare congruenziale: deterministico, sufficiente, corto. */
export function daSeme(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Nodo {
  x: number;
  y: number;
  /** 0–1: quanto è vivo. Governa raggio e luminosità. */
  peso: number;
}

export interface Legame {
  a: number;
  b: number;
  /** 0–1: 1 = nodi vicinissimi. Governa l'opacità della linea. */
  forza: number;
}

/**
 * Un campo di punti di misura.
 *
 * I punti non sono sparsi a caso in un rettangolo: sono spinti verso i
 * bordi da una densità che si svuota al centro, perché al centro della
 * scena ci va il marchio e un titolo, e un campo uniforme li
 * annegherebbe. È una composizione, non una texture.
 */
export function campo({
  quantita,
  larghezza,
  altezza,
  seme = 7,
  vuotoAlCentro = 0.34,
}: {
  quantita: number;
  larghezza: number;
  altezza: number;
  seme?: number;
  /** Raggio del vuoto centrale, in frazione della semi-larghezza. */
  vuotoAlCentro?: number;
}): Nodo[] {
  const rnd = daSeme(seme);
  const nodi: Nodo[] = [];
  const cx = larghezza / 2;
  const cy = altezza / 2;

  // Un tetto ai tentativi: senza, un vuoto centrale troppo grande
  // manderebbe il ciclo all'infinito invece di dare meno punti.
  let tentativi = 0;
  while (nodi.length < quantita && tentativi < quantita * 40) {
    tentativi++;
    const x = rnd() * larghezza;
    const y = rnd() * altezza;

    // Distanza normalizzata dal centro, con l'altezza riportata alla
    // scala della larghezza: il vuoto è un'ellisse come la scena.
    const dx = (x - cx) / cx;
    const dy = (y - cy) / cy;
    const d = Math.sqrt(dx * dx + dy * dy * 0.62);

    if (d < vuotoAlCentro) continue;
    // Ai margini estremi si dirada: un campo che finisce di netto sul
    // bordo dello schermo si legge come un ritaglio.
    if (d > 1.05 && rnd() > 0.35) continue;

    nodi.push({ x, y, peso: 0.25 + rnd() * 0.75 });
  }

  return nodi;
}

/**
 * I legami fra punti abbastanza vicini.
 *
 * Il tetto per nodo non è un'ottimizzazione: senza, le zone dense
 * diventano una macchia piena e le rade restano nude, e il campo perde
 * proprio la qualità che lo rende leggibile come una rete.
 */
export function legami(
  nodi: Nodo[],
  distanzaMax: number,
  perNodo = 3,
): Legame[] {
  const out: Legame[] = [];
  const conteggio = new Array(nodi.length).fill(0);

  for (let i = 0; i < nodi.length; i++) {
    // I candidati si ordinano per distanza: si tengono i più vicini,
    // non i primi incontrati.
    const vicini: Array<{ j: number; d: number }> = [];
    for (let j = i + 1; j < nodi.length; j++) {
      const dx = nodi[i].x - nodi[j].x;
      const dy = nodi[i].y - nodi[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < distanzaMax) vicini.push({ j, d });
    }
    vicini.sort((a, b) => a.d - b.d);

    for (const { j, d } of vicini) {
      if (conteggio[i] >= perNodo || conteggio[j] >= perNodo) continue;
      conteggio[i]++;
      conteggio[j]++;
      out.push({ a: i, b: j, forza: 1 - d / distanzaMax });
    }
  }

  return out;
}

/**
 * Un arco morbido da un punto all'altro.
 *
 * La curvatura è perpendicolare alla congiungente e proporzionale alla
 * distanza: linee lunghe si incurvano di più, corte quasi per niente.
 * Un fascio di curve con la stessa curvatura assoluta sembra disegnato
 * da un compasso; questo sembra un campo.
 */
export function arco(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvatura = 0.18,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * curvatura;
  const cy = my + dx * curvatura;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
