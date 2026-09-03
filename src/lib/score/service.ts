import type { SupabaseClient } from "@supabase/supabase-js";
import { computeScore, type MeasurementInput, type ScoreResult } from "@/lib/score/engine";

/**
 * Ponte fra il motore di calcolo e il database.
 *
 * Il motore resta puro; qui si legge, si scrive e si versiona. La regola
 * che conta: un punteggio non viene mai inserito, viene sempre calcolato
 * dalle misure. Se domani cambia la formula, si ricalcola tutto lo storico
 * senza toccare un dato clinico.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

interface MeasurementRow {
  metric_code: string;
  value: number | null;
  category: string | null;
  measured_on: string;
}

export async function loadMeasurements(
  supabase: Client,
  patientId: string,
): Promise<MeasurementInput[]> {
  const { data } = await supabase
    .from("measurements")
    .select("metric_code, value, category, measured_on")
    .eq("patient_id", patientId)
    .order("measured_on", { ascending: true });

  return ((data ?? []) as MeasurementRow[]).map((row) => ({
    code: row.metric_code,
    value: row.value === null ? null : Number(row.value),
    category: row.category,
    measuredOn: row.measured_on,
  }));
}

/** Ultimo valore numerico noto per metrica: serve a validare le novità. */
export async function loadLatestValues(
  supabase: Client,
  patientId: string,
): Promise<Record<string, number | undefined>> {
  const measurements = await loadMeasurements(supabase, patientId);
  const latest: Record<string, { value: number; measuredOn: string }> = {};

  for (const m of measurements) {
    if (m.value === null || m.value === undefined) continue;
    const current = latest[m.code];
    if (!current || m.measuredOn > current.measuredOn) {
      latest[m.code] = { value: m.value, measuredOn: m.measuredOn };
    }
  }

  return Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v.value]));
}

export interface StoredScore {
  result: ScoreResult;
  /** Null quando i dati non bastano: in quel caso non si scrive nulla. */
  scoreId: string | null;
}

/**
 * Ricalcola il punteggio dalle misure e lo salva.
 *
 * La riga è unica per (paziente, data): rieseguire il calcolo lo stesso
 * giorno aggiorna la riga invece di crearne una seconda, così un secondo
 * referto caricato nel pomeriggio non produce due punteggi diversi per la
 * stessa giornata.
 */
export async function recomputeAndStoreScore(
  supabase: Client,
  patientId: string,
): Promise<StoredScore> {
  const measurements = await loadMeasurements(supabase, patientId);
  const result = computeScore(measurements);

  if (result.score === null) {
    return { result, scoreId: null };
  }

  const measuredOn = result.measuredOn ?? new Date().toISOString().slice(0, 10);

  const { data: previous } = await supabase
    .from("longevity_scores")
    .select("score")
    .eq("patient_id", patientId)
    .lt("measured_on", measuredOn)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousScore = (previous as { score: number } | null)?.score ?? null;
  const previousValue = previousScore === null ? null : Number(previousScore);

  const trend =
    previousValue === null
      ? null
      : result.score > previousValue
        ? "up"
        : result.score < previousValue
          ? "down"
          : "stable";

  const { data: saved, error } = await supabase
    .from("longevity_scores")
    .upsert(
      {
        patient_id: patientId,
        measured_on: measuredOn,
        score: result.score,
        previous_score: previousValue,
        trend,
        coverage: result.coverage,
        computed_by: result.version,
      },
      { onConflict: "patient_id,measured_on" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Salvataggio del punteggio fallito: ${error.message}`);

  const scoreId = (saved as { id: string }).id;

  // I pilastri si riscrivono per intero: sono il dettaglio di questo
  // calcolo, non uno storico a sé.
  await supabase.from("score_pillars").delete().eq("score_id", scoreId);

  const previousPillars = await loadPreviousPillars(supabase, patientId, measuredOn);

  await supabase.from("score_pillars").insert(
    result.pillars.map((pillar) => ({
      score_id: scoreId,
      key: pillar.key,
      label: pillar.label,
      value: pillar.score,
      coverage: pillar.coverage,
      delta:
        pillar.score !== null && previousPillars[pillar.key] !== undefined
          ? Number((pillar.score - previousPillars[pillar.key]!).toFixed(1))
          : null,
    })),
  );

  return { result, scoreId };
}

async function loadPreviousPillars(
  supabase: Client,
  patientId: string,
  beforeDate: string,
): Promise<Record<string, number | undefined>> {
  // Non basta il punteggio precedente: serve il più recente che abbia il
  // dettaglio dei pilastri. Una riga di solo totale — importata da uno
  // storico, o seminata — azzererebbe altrimenti tutte le variazioni.
  const { data } = await supabase
    .from("longevity_scores")
    .select("id, measured_on, score_pillars(key, value)")
    .eq("patient_id", patientId)
    .lt("measured_on", beforeDate)
    .order("measured_on", { ascending: false })
    .limit(6);

  const rows = (data ?? []) as { score_pillars: { key: string; value: number | null }[] }[];
  const withPillars = rows.find((row) =>
    row.score_pillars.some((p) => p.value !== null),
  );
  if (!withPillars) return {};

  return Object.fromEntries(
    withPillars.score_pillars
      .filter((p) => p.value !== null)
      .map((p) => [p.key, Number(p.value)]),
  );
}
