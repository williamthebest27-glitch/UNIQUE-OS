/**
 * I sette pilastri dell’Unique Longevity Score.
 *
 * Questo file non importa nulla, di proposito: il motore di calcolo deve
 * poter girare sotto `node --test` senza il resolver di Next.
 *
 * Le etichette restano in inglese perché sono nomi di prodotto, come
 * "Unique Longevity Score": il paziente italiano e il materiale
 * commerciale devono leggere le stesse parole.
 */
export const PILLAR_KEYS = [
  "metabolic_health",
  "cardiovascular",
  "body_composition",
  "movement",
  "nutrition",
  "mental_wellbeing",
  "lifestyle",
] as const;

export type PillarKey = (typeof PILLAR_KEYS)[number];

export const PILLAR_LABELS: Record<PillarKey, string> = {
  metabolic_health: "Metabolic Health",
  cardiovascular: "Cardiovascular",
  body_composition: "Body Composition",
  movement: "Movement",
  nutrition: "Nutrition",
  mental_wellbeing: "Mental Wellbeing",
  lifestyle: "Lifestyle",
};

/**
 * Peso di ciascun pilastro nel punteggio complessivo.
 *
 * ⚠️ Valori provvisori, da confermare dal team medico: è probabile che
 * debbano variare per età e sesso. Riproducono l’esempio della visione
 * (82 · 74 · 71 · 86 · 76 · 80 · 69 → 78), che serve da ancora di
 * regressione finché non arrivano i pesi definitivi.
 */
export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  metabolic_health: 0.2,
  cardiovascular: 0.18,
  movement: 0.17,
  body_composition: 0.13,
  nutrition: 0.12,
  mental_wellbeing: 0.12,
  lifestyle: 0.08,
};
