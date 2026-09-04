import { normalize } from "../score/engine.ts";
import { getMetric, type MetricDefinition } from "../score/metrics.ts";
import { PILLAR_KEYS, PILLAR_LABELS, type PillarKey } from "../score/pillars.ts";
import type { PuntoSerie } from "./andamento.ts";

/**
 * I risultati del paziente: valori, intervalli, andamento.
 *
 * Una regola sola governa questo file, e vale la pena scriverla per
 * esteso: **qui non si formula nessun giudizio clinico.**
 *
 * Dire che un valore sta fuori dall'intervallo di riferimento *del
 * laboratorio che lo ha misurato* è riportare un fatto stampato sul
 * referto. Dire cosa quel fatto significhi per quella persona è
 * medicina, e la fa un medico. La differenza fra le due frasi è tutta la
 * distanza fra un'app che informa e una che diagnostica.
 *
 * Che una variazione sia un miglioramento lo decide la curva della
 * metrica, non il segno: la glicata che scende migliora il punteggio, la
 * massa muscolare che scende lo peggiora, e una glicemia può peggiorare
 * scendendo troppo. Confrontiamo i valori normalizzati — la stessa
 * aritmetica che alimenta lo Score — così la regola vale per tutte le
 * metriche senza elenchi di eccezioni.
 */

export type StatoRiferimento = "sotto" | "dentro" | "sopra" | "senza_riferimento";

export interface Lettura {
  metricCode: string;
  label: string;
  unit: string | null;
  value: number | null;
  category: string | null;
  refLow: number | null;
  refHigh: number | null;
  measuredOn: string;
}

export interface RigaRisultato {
  code: string;
  label: string;
  unit: string | null;
  /** Il valore più recente. */
  valore: number | null;
  /** Per le metriche categoriali: la voce scelta, non un numero. */
  categoria: string | null;
  misuratoIl: string;
  precedente: { valore: number; misuratoIl: string } | null;
  delta: number | null;
  /**
   * Se la variazione è un miglioramento secondo la curva della metrica.
   * Null quando non si muove, o quando non c'è nulla con cui confrontare.
   */
  miglioramento: boolean | null;
  stato: StatoRiferimento;
  riferimento: { basso: number | null; alto: number | null };
  /** Tutta la storia del parametro, per il grafico. */
  storico: PuntoSerie[];
}

export interface GruppoRisultati {
  pilastro: PillarKey | "altro";
  etichetta: string;
  righe: RigaRisultato[];
}

/** Dove cade il valore rispetto all'intervallo che il referto dichiara. */
export function statoRiferimento(
  valore: number | null,
  basso: number | null,
  alto: number | null,
): StatoRiferimento {
  if (valore === null || (basso === null && alto === null)) return "senza_riferimento";
  if (basso !== null && valore < basso) return "sotto";
  if (alto !== null && valore > alto) return "sopra";
  return "dentro";
}

/**
 * Un miglioramento, secondo la curva della metrica.
 *
 * Senza catalogo o senza curva non si esprime un giudizio: null, che si
 * legge "non lo sappiamo" e non "non è cambiato".
 */
export function eUnMiglioramento(
  metrica: MetricDefinition | undefined,
  precedente: number,
  ultimo: number,
): boolean | null {
  if (!metrica?.anchors) return null;
  const differenza = normalize(metrica, ultimo) - normalize(metrica, precedente);
  if (differenza === 0) return null;
  return differenza > 0;
}

const ETICHETTA_GRUPPO: Record<PillarKey | "altro", string> = {
  ...PILLAR_LABELS,
  altro: "Altri parametri",
};

/**
 * Da un elenco di misure alle righe da mostrare, raggruppate per pilastro.
 *
 * Le misure arrivano in qualunque ordine e con ripetizioni nel tempo:
 * qui diventano un parametro per riga, con l'ultimo valore, il
 * precedente e tutta la storia.
 */
export function componiRisultati(letture: readonly Lettura[]): GruppoRisultati[] {
  const perCodice = new Map<string, Lettura[]>();
  for (const l of letture) {
    perCodice.set(l.metricCode, [...(perCodice.get(l.metricCode) ?? []), l]);
  }

  const righePerPilastro = new Map<PillarKey | "altro", RigaRisultato[]>();

  for (const [code, serie] of perCodice) {
    serie.sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    const ultimo = serie[serie.length - 1];
    const metrica = getMetric(code);

    // Il precedente è l'ultima misura *numerica* diversa da quella in
    // cima: una riga senza valore non è un confronto.
    const numerici = serie.filter((s) => s.value !== null);
    const precedenteRiga =
      numerici.length >= 2 && ultimo.value !== null ? numerici[numerici.length - 2] : null;

    const delta =
      precedenteRiga && ultimo.value !== null ? ultimo.value - Number(precedenteRiga.value) : null;

    const riga: RigaRisultato = {
      code,
      label: ultimo.label || metrica?.label || code,
      unit: ultimo.unit ?? metrica?.unit ?? null,
      valore: ultimo.value,
      categoria: ultimo.category,
      misuratoIl: ultimo.measuredOn,
      precedente: precedenteRiga
        ? { valore: Number(precedenteRiga.value), misuratoIl: precedenteRiga.measuredOn }
        : null,
      delta,
      miglioramento:
        precedenteRiga && ultimo.value !== null
          ? eUnMiglioramento(metrica, Number(precedenteRiga.value), ultimo.value)
          : null,
      stato: statoRiferimento(ultimo.value, ultimo.refLow, ultimo.refHigh),
      riferimento: { basso: ultimo.refLow, alto: ultimo.refHigh },
      storico: numerici.map((s) => ({ data: s.measuredOn, valore: Number(s.value) })),
    };

    const gruppo: PillarKey | "altro" = metrica?.pillar ?? "altro";
    righePerPilastro.set(gruppo, [...(righePerPilastro.get(gruppo) ?? []), riga]);
  }

  const ordine: (PillarKey | "altro")[] = [...PILLAR_KEYS, "altro"];

  return ordine.flatMap((pilastro) => {
    const righe = righePerPilastro.get(pilastro);
    if (!righe || righe.length === 0) return [];
    righe.sort((a, b) => a.label.localeCompare(b.label, "it"));
    return [{ pilastro, etichetta: ETICHETTA_GRUPPO[pilastro], righe }];
  });
}

/** Quanti parametri stanno fuori dall'intervallo del referto. Un conteggio, non un verdetto. */
export function fuoriIntervallo(gruppi: readonly GruppoRisultati[]): number {
  return gruppi
    .flatMap((g) => g.righe)
    .filter((r) => r.stato === "sotto" || r.stato === "sopra").length;
}
