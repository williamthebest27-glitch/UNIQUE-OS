import { PILLAR_KEYS, PILLAR_LABELS, PILLAR_WEIGHTS, type PillarKey } from "./pillars.ts";
import { METRIC_DEFINITIONS, getMetric, type MetricDefinition } from "./metrics.ts";

/**
 * Motore di calcolo dell’Unique Longevity Score.
 *
 * Funzioni pure: stessi dati in ingresso, stesso punteggio in uscita.
 * Nessuna chiamata al database, nessuna chiamata all’AI. È la proprietà
 * che rende il punteggio verificabile — e che permette di ricalcolare
 * tutto lo storico quando la formula cambia.
 */

/**
 * Versione dell’algoritmo, salvata su ogni punteggio in `computed_by`.
 * Serve a distinguere un miglioramento del paziente da un cambio di
 * formula: senza, la differenza è impossibile da ricostruire a posteriori.
 */
export const SCORE_ALGORITHM_VERSION = "uls-v2";

export { PILLAR_WEIGHTS };

/** Sotto questa copertura il pilastro resta "non calcolabile". */
export const MIN_PILLAR_COVERAGE = 0.4;

/** Sotto questa copertura complessiva non pubblichiamo un punteggio. */
export const MIN_OVERALL_COVERAGE = 0.5;

/** Oltre questa età, una misura non descrive più il presente. */
export const DEFAULT_MAX_AGE_DAYS = 540;

export interface MeasurementInput {
  code: string;
  /** Valore numerico, per le metriche con curva. */
  value?: number | null;
  /** Valore categoriale, per ECG, fumo e simili. */
  category?: string | null;
  /** Data della misurazione, formato ISO (YYYY-MM-DD). */
  measuredOn: string;
}

export interface MetricContribution {
  code: string;
  label: string;
  unit: string;
  pillar: PillarKey;
  /** Valore così com’è stato misurato. */
  rawValue: number | string;
  /** Valore normalizzato 0–100. */
  score: number;
  weight: number;
  measuredOn: string;
}

export interface PillarResult {
  key: PillarKey;
  label: string;
  /** Null quando i dati disponibili non bastano a esprimere un giudizio. */
  score: number | null;
  /** Quota di peso delle metriche effettivamente disponibili, 0–1. */
  coverage: number;
  contributions: MetricContribution[];
  /** Metriche mancanti, ordinate per peso: sono le prossime da raccogliere. */
  missing: { code: string; label: string; weight: number }[];
}

export interface ScoreResult {
  version: string;
  score: number | null;
  /** Quota dei dati previsti effettivamente disponibili, 0–1. */
  coverage: number;
  pillars: PillarResult[];
  /** Data della misurazione più recente fra quelle usate. */
  measuredOn: string | null;
  /** Metriche scartate perché troppo vecchie o non plausibili. */
  discarded: { code: string; reason: "stale" | "implausible" | "unknown_metric" }[];
}

/* ── Normalizzazione ──────────────────────────────────────────────── */

/**
 * Interpolazione lineare fra le ancore della curva. Oltre gli estremi
 * si tiene il valore dell’ancora: non si estrapola, perché fuori dal
 * campo osservato la curva non significa più nulla.
 */
export function normalize(metric: MetricDefinition, value: number): number {
  const anchors = metric.anchors;
  if (!anchors || anchors.length === 0) return 0;

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = x1 === x0 ? 0 : (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

export function isPlausible(metric: MetricDefinition, value: number): boolean {
  const [min, max] = metric.plausible;
  return Number.isFinite(value) && value >= min && value <= max;
}

/* ── Selezione delle misure ───────────────────────────────────────── */

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/** Per ogni metrica tiene solo la misurazione più recente. */
export function selectLatest(measurements: MeasurementInput[]): MeasurementInput[] {
  const latest = new Map<string, MeasurementInput>();
  for (const m of measurements) {
    const current = latest.get(m.code);
    if (!current || m.measuredOn > current.measuredOn) latest.set(m.code, m);
  }
  return [...latest.values()];
}

/* ── Calcolo ──────────────────────────────────────────────────────── */

export interface ComputeOptions {
  /** Data di riferimento per l’invecchiamento delle misure. */
  asOf?: string;
  maxAgeDays?: number;
}

export function computeScore(
  measurements: MeasurementInput[],
  options: ComputeOptions = {},
): ScoreResult {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  const discarded: ScoreResult["discarded"] = [];
  const usable = new Map<string, { metric: MetricDefinition; score: number; raw: number | string; measuredOn: string }>();

  for (const m of selectLatest(measurements)) {
    const metric = getMetric(m.code);
    if (!metric) {
      discarded.push({ code: m.code, reason: "unknown_metric" });
      continue;
    }

    if (daysBetween(m.measuredOn, asOf) > maxAgeDays) {
      discarded.push({ code: m.code, reason: "stale" });
      continue;
    }

    if (metric.categories) {
      const key = m.category ?? "";
      const score = metric.categories[key];
      if (score === undefined) {
        discarded.push({ code: m.code, reason: "implausible" });
        continue;
      }
      usable.set(m.code, { metric, score, raw: key, measuredOn: m.measuredOn });
      continue;
    }

    const value = m.value;
    if (value === null || value === undefined || !isPlausible(metric, value)) {
      discarded.push({ code: m.code, reason: "implausible" });
      continue;
    }
    usable.set(m.code, {
      metric,
      score: normalize(metric, value),
      raw: value,
      measuredOn: m.measuredOn,
    });
  }

  const pillars: PillarResult[] = PILLAR_KEYS.map((key) => {
    const definitions = METRIC_DEFINITIONS.filter((d) => d.pillar === key);
    const totalWeight = definitions.reduce((sum, d) => sum + d.weight, 0);

    const contributions: MetricContribution[] = [];
    const missing: PillarResult["missing"] = [];
    let weighted = 0;
    let presentWeight = 0;

    for (const definition of definitions) {
      const hit = usable.get(definition.code);
      if (!hit) {
        missing.push({ code: definition.code, label: definition.label, weight: definition.weight });
        continue;
      }
      weighted += hit.score * definition.weight;
      presentWeight += definition.weight;
      contributions.push({
        code: definition.code,
        label: definition.label,
        unit: definition.unit,
        pillar: key,
        rawValue: hit.raw,
        score: round1(hit.score),
        weight: definition.weight,
        measuredOn: hit.measuredOn,
      });
    }

    const coverage = totalWeight === 0 ? 0 : presentWeight / totalWeight;
    // Con troppi pochi dati un punteggio sarebbe un’illusione di precisione.
    const score = coverage >= MIN_PILLAR_COVERAGE ? round1(weighted / presentWeight) : null;

    missing.sort((a, b) => b.weight - a.weight);

    return { key, label: PILLAR_LABELS[key], score, coverage: round2(coverage), contributions, missing };
  });

  let overallWeighted = 0;
  let scoredWeight = 0;
  // La copertura dice quanti dei dati previsti esistono davvero, non
  // quanti pilastri sono calcolabili: un pilastro con metà dei parametri
  // conta per metà, altrimenti un punteggio parziale sembrerebbe completo.
  let dataCoverage = 0;

  for (const pillar of pillars) {
    dataCoverage += pillar.coverage * PILLAR_WEIGHTS[pillar.key];
    if (pillar.score === null) continue;
    overallWeighted += pillar.score * PILLAR_WEIGHTS[pillar.key];
    scoredWeight += PILLAR_WEIGHTS[pillar.key];
  }

  const coverage = round2(dataCoverage);
  const score =
    scoredWeight >= MIN_OVERALL_COVERAGE ? round1(overallWeighted / scoredWeight) : null;

  const dates = [...usable.values()].map((u) => u.measuredOn).sort();
  const measuredOn = dates.length > 0 ? dates[dates.length - 1] : null;

  return {
    version: SCORE_ALGORITHM_VERSION,
    score,
    coverage: round2(coverage),
    pillars,
    measuredOn,
    discarded,
  };
}

/** Variazione fra due calcoli, pilastro per pilastro. */
export function diffScores(
  current: ScoreResult,
  previous: ScoreResult | null,
): { overall: number | null; byPillar: Partial<Record<PillarKey, number>> } {
  if (!previous) return { overall: null, byPillar: {} };

  const byPillar: Partial<Record<PillarKey, number>> = {};
  for (const pillar of current.pillars) {
    const before = previous.pillars.find((p) => p.key === pillar.key);
    if (pillar.score !== null && before?.score != null) {
      byPillar[pillar.key] = round1(pillar.score - before.score);
    }
  }

  const overall =
    current.score !== null && previous.score !== null
      ? round1(current.score - previous.score)
      : null;

  return { overall, byPillar };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
