import { getMetric } from "../score/metrics.ts";

/**
 * Regole di validazione fra l'estrazione dell'AI e il database.
 *
 * L'AI propone, queste regole decidono cosa può entrare da solo e cosa
 * deve passare da un professionista. Sono codice deterministico e
 * testabile di proposito: un medico deve poter leggere la regola per cui
 * un valore è finito in revisione, non fidarsi di un giudizio opaco.
 */

/** Sopra questa confidenza, e con tutto il resto in ordine, si applica da solo. */
export const AUTO_APPLY_MIN_CONFIDENCE = 0.85;

/** Variazione relativa oltre la quale un valore va comunque guardato. */
export const LARGE_CHANGE_RATIO = 0.3;

/** Una misura più vecchia di così è quasi sempre una data letta male. */
export const MAX_DOCUMENT_AGE_DAYS = 3650;

export type ReviewReason =
  | "low_confidence"
  | "unit_mismatch"
  | "clinical_threshold"
  | "large_change"
  | "missing_date"
  | "date_out_of_range"
  | "first_measurement";

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  low_confidence: "Lettura incerta",
  unit_mismatch: "Unità di misura diversa da quella attesa",
  clinical_threshold: "Valore oltre la soglia clinica",
  large_change: "Variazione ampia rispetto alla misura precedente",
  missing_date: "Data non rilevata sul documento",
  date_out_of_range: "Data incoerente",
  first_measurement: "Primo valore per questo parametro",
};

export type DiscardReason =
  | "unknown_metric"
  | "implausible"
  | "no_value"
  | "unknown_category";

export const DISCARD_REASON_LABELS: Record<DiscardReason, string> = {
  unknown_metric: "Parametro fuori dal catalogo",
  implausible: "Valore fisiologicamente impossibile",
  no_value: "Nessun valore leggibile",
  unknown_category: "Valore categoriale non riconosciuto",
};

export interface RawExtraction {
  metric_code: string;
  label: string;
  value: number | null;
  category: string | null;
  unit: string | null;
  measured_on: string | null;
  confidence: number;
  source_excerpt: string;
}

export interface ValidatedProposal {
  metricCode: string;
  label: string;
  value: number | null;
  category: string | null;
  unit: string | null;
  measuredOn: string;
  confidence: number;
  sourceExcerpt: string;
  previousValue: number | null;
  delta: number | null;
  status: "auto_applied" | "needs_review";
  reviewReasons: ReviewReason[];
}

export interface Discarded {
  metricCode: string;
  label: string;
  reason: DiscardReason;
  sourceExcerpt: string;
}

export interface ValidationResult {
  proposals: ValidatedProposal[];
  discarded: Discarded[];
}

export interface ValidationContext {
  /** Ultimo valore noto per metrica, per calcolare la variazione. */
  previousValues: Record<string, number | undefined>;
  /** Data del documento, usata quando la singola misura non ne ha una. */
  documentDate: string | null;
  /** Oggi, iniettabile per rendere i test deterministici. */
  today: string;
}

/** "mg/dl", "MG/DL " e "mg / dL" sono la stessa unità. */
function normalizeUnit(unit: string | null): string {
  return (unit ?? "").toLowerCase().replace(/[\s.]/g, "");
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateExtraction(
  raw: RawExtraction[],
  context: ValidationContext,
): ValidationResult {
  const proposals: ValidatedProposal[] = [];
  const discarded: Discarded[] = [];

  for (const item of raw) {
    const metric = getMetric(item.metric_code);

    if (!metric) {
      discarded.push({
        metricCode: item.metric_code,
        label: item.label,
        reason: "unknown_metric",
        sourceExcerpt: item.source_excerpt,
      });
      continue;
    }

    const reasons: ReviewReason[] = [];

    // ── Data ──────────────────────────────────────────────────────
    let measuredOn = item.measured_on ?? context.documentDate;
    if (!measuredOn || !ISO_DATE.test(measuredOn)) {
      // Senza data non si può collocare la misura nel tempo. Usiamo oggi,
      // ma è un ripiego e va segnalato a chi rivede.
      measuredOn = context.today;
      reasons.push("missing_date");
    } else {
      const age = daysBetween(measuredOn, context.today);
      if (Number.isNaN(age) || age < 0 || age > MAX_DOCUMENT_AGE_DAYS) {
        reasons.push("date_out_of_range");
      }
    }

    // ── Valore ────────────────────────────────────────────────────
    if (metric.categories) {
      const category = item.category ?? "";
      if (!(category in metric.categories)) {
        discarded.push({
          metricCode: metric.code,
          label: metric.label,
          reason: "unknown_category",
          sourceExcerpt: item.source_excerpt,
        });
        continue;
      }
      if (item.confidence < AUTO_APPLY_MIN_CONFIDENCE) reasons.push("low_confidence");

      proposals.push({
        metricCode: metric.code,
        label: metric.label,
        value: null,
        category,
        unit: null,
        measuredOn,
        confidence: item.confidence,
        sourceExcerpt: item.source_excerpt,
        previousValue: null,
        delta: null,
        status: reasons.length === 0 ? "auto_applied" : "needs_review",
        reviewReasons: reasons,
      });
      continue;
    }

    const value = item.value;
    if (value === null || !Number.isFinite(value)) {
      discarded.push({
        metricCode: metric.code,
        label: metric.label,
        reason: "no_value",
        sourceExcerpt: item.source_excerpt,
      });
      continue;
    }

    // ── Unità ─────────────────────────────────────────────────────
    // Va controllata prima della plausibilità: gli intervalli sono espressi
    // nell'unità attesa, e una glicemia di 5,1 mmol/L sembrerebbe assurda
    // letta come mg/dL. Scartarla sarebbe perdere in silenzio un dato buono.
    const expected = normalizeUnit(metric.unit);
    const found = normalizeUnit(item.unit);
    const unitMismatch = expected !== "" && found !== "" && expected !== found;
    if (unitMismatch) reasons.push("unit_mismatch");

    // Fuori dall'intervallo fisiologico non è un paziente grave: è quasi
    // sempre un errore di lettura. Non entra, nemmeno in revisione — ma solo
    // se l'unità è quella giusta, altrimenti il confronto non ha senso.
    const [min, max] = metric.plausible;
    if (!unitMismatch && (value < min || value > max)) {
      discarded.push({
        metricCode: metric.code,
        label: metric.label,
        reason: "implausible",
        sourceExcerpt: item.source_excerpt,
      });
      continue;
    }

    // ── Confidenza ────────────────────────────────────────────────
    if (item.confidence < AUTO_APPLY_MIN_CONFIDENCE) reasons.push("low_confidence");

    // ── Rilevanza clinica ─────────────────────────────────────────
    // Le soglie sono nell'unità attesa: con un'unità diversa direbbero
    // il falso, quindi si tacciono e decide chi rivede.
    if (!unitMismatch && metric.clinicalAlert?.(value)) reasons.push("clinical_threshold");

    // ── Confronto con lo storico ──────────────────────────────────
    const previous = context.previousValues[metric.code];
    let delta: number | null = null;

    if (unitMismatch) {
      // Confrontare numeri in unità diverse produrrebbe variazioni inventate.
    } else if (previous === undefined) {
      // Il primo valore non ha termine di paragone: nessuna regola può
      // dire se è verosimile per questo paziente.
      reasons.push("first_measurement");
    } else {
      delta = Number((value - previous).toFixed(4));
      const base = Math.abs(previous);
      if (base > 0 && Math.abs(delta) / base > LARGE_CHANGE_RATIO) {
        reasons.push("large_change");
      }
      // Anche un salto contenuto conta, se scavalca una soglia clinica.
      const wasAlerting = metric.clinicalAlert?.(previous) ?? false;
      const isAlerting = metric.clinicalAlert?.(value) ?? false;
      if (wasAlerting !== isAlerting && !reasons.includes("clinical_threshold")) {
        reasons.push("clinical_threshold");
      }
    }

    proposals.push({
      metricCode: metric.code,
      label: metric.label,
      value,
      category: null,
      unit: item.unit,
      measuredOn,
      confidence: item.confidence,
      sourceExcerpt: item.source_excerpt,
      previousValue: previous ?? null,
      delta,
      status: reasons.length === 0 ? "auto_applied" : "needs_review",
      reviewReasons: reasons,
    });
  }

  return { proposals, discarded };
}
