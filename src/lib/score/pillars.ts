/**
 * I sette pilastri dell’Unique Longevity Score.
 *
 * Questo file non importa nulla, di proposito: il motore di calcolo deve
 * poter girare sotto `node --test` senza il resolver di Next.
 *
 * Le etichette sono in italiano: le legge un paziente italiano, in una
 * clinica italiana, e nessuna di esse è un nome registrato. Resta in
 * inglese solo ciò che è marchio — "Unique OS", "Unique Longevity
 * Clinic", "Unique Longevity Score" — perché quello è un nome, non una
 * parola.
 *
 * Le chiavi (`PILLAR_KEYS`) restano invariate: sono l'identità del
 * pilastro nel database e nelle API, e tradurle vorrebbe dire migrare
 * dati per un motivo estetico.
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
  metabolic_health: "Salute metabolica",
  cardiovascular: "Cardiovascolare",
  body_composition: "Composizione corporea",
  movement: "Movimento",
  nutrition: "Nutrizione",
  mental_wellbeing: "Benessere mentale",
  lifestyle: "Stile di vita",
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
