/**
 * Le serie nel tempo, per i grafici dei progressi.
 *
 * Un grafico è una promessa: che quello che sale sia migliorato. Qui la
 * promessa si mantiene in due modi.
 *
 * **La scala.** Non parte da zero, ma dai dati: fra 74 e 78 punti ci sono
 * quattro punti di percorso, e su un asse 0–100 sarebbero una linea
 * piatta. Un margine attorno ai valori li rende visibili senza esagerarli.
 *
 * **La direzione.** Che una variazione sia un miglioramento non lo decide
 * il segno: la glicata che scende è una notizia buona, la massa muscolare
 * che scende no. Chi costruisce la serie dichiara il verso una volta, e
 * qui non si indovina mai.
 */

export interface PuntoSerie {
  /** Data in ISO, giorno o istante. */
  data: string;
  valore: number;
}

export interface Serie {
  id: string;
  etichetta: string;
  unita: string | null;
  punti: PuntoSerie[];
  /** true quando salire è meglio; false quando è meglio scendere. */
  salireEMeglio: boolean;
  /** Estremi di riferimento, quando la metrica ne ha. */
  riferimento?: { basso: number | null; alto: number | null };
}

export const FINESTRE = [
  { id: "30g", etichetta: "30 giorni", giorni: 30 },
  { id: "90g", etichetta: "90 giorni", giorni: 90 },
  { id: "6m", etichetta: "6 mesi", giorni: 182 },
  { id: "1a", etichetta: "1 anno", giorni: 365 },
  { id: "tutto", etichetta: "Sempre", giorni: null },
] as const;

export type FinestraId = (typeof FINESTRE)[number]["id"];

export function finestraDa(id: string): (typeof FINESTRE)[number] {
  return FINESTRE.find((f) => f.id === id) ?? FINESTRE[1];
}

/** I punti che cadono nella finestra, in ordine cronologico. */
export function inFinestra(punti: readonly PuntoSerie[], finestra: FinestraId, oggi: string): PuntoSerie[] {
  const ordinati = [...punti].sort((a, b) => a.data.localeCompare(b.data));
  const giorni = finestraDa(finestra).giorni;
  if (giorni === null) return ordinati;

  const limite = new Date(Date.parse(`${oggi.slice(0, 10)}T00:00:00Z`) - giorni * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return ordinati.filter((p) => p.data.slice(0, 10) >= limite);
}

export interface Variazione {
  primo: number;
  ultimo: number;
  /** Differenza grezza, nell'unità della metrica. */
  delta: number;
  /** Variazione in percentuale sul primo valore. Null se il primo è zero. */
  deltaPct: number | null;
  /** Se la variazione è un miglioramento. Null quando non si muove. */
  miglioramento: boolean | null;
}

export function variazione(punti: readonly PuntoSerie[], salireEMeglio: boolean): Variazione | null {
  if (punti.length < 2) return null;

  const primo = punti[0].valore;
  const ultimo = punti[punti.length - 1].valore;
  const delta = ultimo - primo;

  return {
    primo,
    ultimo,
    delta,
    deltaPct: primo === 0 ? null : (delta / Math.abs(primo)) * 100,
    miglioramento: delta === 0 ? null : delta > 0 === salireEMeglio,
  };
}

export interface Geometria {
  /** Il tracciato della linea, in coordinate del viewBox. */
  linea: string;
  /** Lo stesso tracciato chiuso in basso, per il riempimento. */
  area: string;
  punti: { x: number; y: number; punto: PuntoSerie }[];
  min: number;
  max: number;
}

/**
 * Da valori a coordinate.
 *
 * Sta qui e non nel componente perché è aritmetica, e l'aritmetica si
 * verifica con un test invece che guardando lo schermo. Il componente
 * disegna e basta.
 */
export function geometria(
  punti: readonly PuntoSerie[],
  larghezza: number,
  altezza: number,
  margine = 6,
): Geometria | null {
  if (punti.length === 0) return null;

  const valori = punti.map((p) => p.valore);
  const grezzoMin = Math.min(...valori);
  const grezzoMax = Math.max(...valori);

  // Con un valore solo, o tutti uguali, la linea sta al centro: una
  // divisione per zero disegnerebbe un grafico e non un dato.
  const ampiezza = grezzoMax - grezzoMin;
  const respiro = ampiezza === 0 ? Math.max(1, Math.abs(grezzoMax) * 0.1) : ampiezza * 0.15;
  const min = grezzoMin - respiro;
  const max = grezzoMax + respiro;

  const alto = margine;
  const basso = altezza - margine;

  const coord = punti.map((punto, i) => ({
    x: punti.length === 1 ? larghezza / 2 : (i / (punti.length - 1)) * larghezza,
    y: basso - ((punto.valore - min) / (max - min)) * (basso - alto),
    punto,
  }));

  const linea = coord
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const area = `${linea} L${larghezza.toFixed(1)},${altezza} L0,${altezza} Z`;

  return { linea, area, punti: coord, min, max };
}
