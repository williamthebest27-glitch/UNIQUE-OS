import { getMetric } from "../score/metrics.ts";
import type { PillarKey } from "../score/pillars.ts";

/**
 * Discipline professionali e ciò su cui ciascuna può scrivere.
 *
 * Un nutrizionista fa parte del care team e vede tutto il paziente — la
 * storia clinica si legge intera o non si capisce — ma non scrive un
 * referto ECG. La separazione è fra **leggere** e **scrivere**: la prima
 * la governa la Row Level Security a livello di paziente, la seconda
 * queste regole.
 *
 * È una scelta deliberata tenerle qui e non nelle policy: dipendono dal
 * catalogo delle metriche, che vive nel codice ed è versionato con
 * l'algoritmo dello Score. Portarle nel database vorrebbe dire duplicare
 * il catalogo in una tabella e tenerlo allineato per sempre.
 *
 * L'unica regola che *è* nel database è quella che conta di più: approvare
 * un valore fuori soglia clinica richiede un medico
 * (`can_approve_clinical_flag()`).
 */

export const DISCIPLINES = [
  "physician",
  "nutritionist",
  "osteopath",
  "psychologist",
  "trainer",
  "nurse",
  "other",
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  physician: "Medico",
  nutritionist: "Nutrizionista",
  osteopath: "Osteopata",
  psychologist: "Psicologo",
  trainer: "Preparatore",
  nurse: "Infermiere",
  other: "Altro",
};

/** `"all"` per chi ha competenza clinica piena. */
const SCOPES: Record<Discipline, readonly PillarKey[] | "all"> = {
  physician: "all",
  nutritionist: ["nutrition", "metabolic_health", "body_composition"],
  osteopath: ["movement", "body_composition"],
  psychologist: ["mental_wellbeing", "lifestyle"],
  trainer: ["movement", "body_composition", "lifestyle"],
  nurse: ["cardiovascular", "metabolic_health", "body_composition"],
  // Finché una disciplina non è dichiarata, non scrive misure: il default
  // è restrittivo, così un dato di ruolo mancante non apre un varco.
  other: [],
};

export function pillarsFor(discipline: Discipline): readonly PillarKey[] | "all" {
  return SCOPES[discipline];
}

export function canWritePillar(discipline: Discipline, pillar: PillarKey): boolean {
  const scope = SCOPES[discipline];
  return scope === "all" || scope.includes(pillar);
}

/** Vero se questa disciplina può portare in cartella questa metrica. */
export function canWriteMetric(discipline: Discipline, metricCode: string): boolean {
  const metric = getMetric(metricCode);
  if (!metric) return false;
  return canWritePillar(discipline, metric.pillar);
}

/** Le discipline che possono decidere su un valore fuori soglia clinica. */
export function canApproveClinicalFlag(discipline: Discipline): boolean {
  return discipline === "physician";
}
