import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PILLAR_KEYS, PILLAR_WEIGHTS } from "./pillars.ts";
import { METRIC_DEFINITIONS, getMetric } from "./metrics.ts";
import {
  MIN_OVERALL_COVERAGE,
  computeScore,
  diffScores,
  normalize,
  selectLatest,
  type MeasurementInput,
} from "./engine.ts";

const TODAY = "2026-09-03";

function m(code: string, value: number, measuredOn = TODAY): MeasurementInput {
  return { code, value, measuredOn };
}

/** Ogni metrica del catalogo, al valore che le vale 100. */
function perfectMeasurements(measuredOn = TODAY): MeasurementInput[] {
  return METRIC_DEFINITIONS.map((metric) => {
    if (metric.categories) {
      const best = Object.entries(metric.categories).sort((a, b) => b[1] - a[1])[0][0];
      return { code: metric.code, category: best, measuredOn };
    }
    const best = [...(metric.anchors ?? [])].sort((a, b) => b[1] - a[1])[0];
    return { code: metric.code, value: best[0], measuredOn };
  });
}

describe("catalogo delle metriche", () => {
  it("non ha codici duplicati", () => {
    const codes = METRIC_DEFINITIONS.map((d) => d.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("assegna a ogni metrica un pilastro conosciuto", () => {
    for (const metric of METRIC_DEFINITIONS) {
      assert.ok(
        (PILLAR_KEYS as readonly string[]).includes(metric.pillar),
        `${metric.code} punta a un pilastro inesistente: ${metric.pillar}`,
      );
    }
  });

  it("copre tutti e sette i pilastri", () => {
    for (const key of PILLAR_KEYS) {
      const found = METRIC_DEFINITIONS.some((d) => d.pillar === key);
      assert.ok(found, `nessuna metrica per il pilastro ${key}`);
    }
  });

  it("ha ancore ordinate per valore crescente e punteggi entro 0–100", () => {
    for (const metric of METRIC_DEFINITIONS) {
      if (!metric.anchors) continue;
      for (let i = 1; i < metric.anchors.length; i++) {
        assert.ok(
          metric.anchors[i][0] > metric.anchors[i - 1][0],
          `${metric.code}: ancore non ordinate`,
        );
      }
      for (const [, score] of metric.anchors) {
        assert.ok(score >= 0 && score <= 100, `${metric.code}: punteggio fuori scala`);
      }
    }
  });

  it("tiene ogni ancora dentro l’intervallo plausibile", () => {
    for (const metric of METRIC_DEFINITIONS) {
      if (!metric.anchors) continue;
      const [min, max] = metric.plausible;
      for (const [value] of metric.anchors) {
        assert.ok(
          value >= min && value <= max,
          `${metric.code}: ancora ${value} fuori dall’intervallo plausibile`,
        );
      }
    }
  });

  it("somma a 1 i pesi delle metriche dentro ogni pilastro", () => {
    for (const key of PILLAR_KEYS) {
      const total = METRIC_DEFINITIONS.filter((d) => d.pillar === key).reduce(
        (sum, d) => sum + d.weight,
        0,
      );
      assert.ok(Math.abs(total - 1) < 1e-9, `${key}: i pesi sommano a ${total}`);
    }
  });

  it("somma a 1 i pesi dei pilastri", () => {
    const total = Object.values(PILLAR_WEIGHTS).reduce((sum, w) => sum + w, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `i pesi dei pilastri sommano a ${total}`);
  });
});

describe("normalize", () => {
  it("interpola linearmente fra due ancore", () => {
    const hba1c = getMetric("hba1c")!;
    // Fra (5.6, 75) e (6.0, 50): a metà strada, 62,5.
    assert.equal(normalize(hba1c, 5.8), 62.5);
  });

  it("non estrapola oltre gli estremi", () => {
    const hba1c = getMetric("hba1c")!;
    assert.equal(normalize(hba1c, 2), 90);
    assert.equal(normalize(hba1c, 25), 0);
  });

  it("gestisce le metriche a campana", () => {
    const glucose = getMetric("glucose_fasting")!;
    // 82 mg/dL sta nell’intervallo ottimale; 55 e 180 sono i due estremi.
    assert.equal(normalize(glucose, 82), 100);
    assert.ok(normalize(glucose, 55) < 50);
    assert.ok(normalize(glucose, 180) < 20);
  });
});

describe("selectLatest", () => {
  it("tiene solo la misurazione più recente per metrica", () => {
    const latest = selectLatest([
      m("hba1c", 5.9, "2025-01-10"),
      m("hba1c", 5.2, "2026-08-28"),
      m("ldl", 142, "2025-01-10"),
    ]);
    assert.equal(latest.length, 2);
    assert.equal(latest.find((x) => x.code === "hba1c")?.value, 5.2);
  });
});

describe("computeScore", () => {
  it("dà 100 quando ogni metrica è al suo valore ottimale", () => {
    const result = computeScore(perfectMeasurements(), { asOf: TODAY });
    assert.equal(result.score, 100);
    assert.equal(result.coverage, 1);
    for (const pillar of result.pillars) {
      assert.equal(pillar.score, 100, `${pillar.key} non è a 100`);
    }
  });

  it("riproduce l’esempio della visione: 82 · 74 · 71 · 86 · 76 · 80 · 69 → 78", () => {
    const pillarScores = {
      metabolic_health: 82,
      cardiovascular: 74,
      body_composition: 71,
      movement: 86,
      nutrition: 76,
      mental_wellbeing: 80,
      lifestyle: 69,
    } as const;

    const overall = PILLAR_KEYS.reduce(
      (sum, key) => sum + pillarScores[key] * PILLAR_WEIGHTS[key],
      0,
    );
    assert.equal(Math.round(overall), 78);
  });

  it("lascia il pilastro non calcolabile sotto la copertura minima", () => {
    // Solo l’ECG (peso 0,08 su 1) nel pilastro cardiovascolare.
    const result = computeScore([{ code: "ecg_status", category: "normal", measuredOn: TODAY }], {
      asOf: TODAY,
    });
    const cardio = result.pillars.find((p) => p.key === "cardiovascular")!;
    assert.equal(cardio.score, null);
    assert.ok(cardio.coverage < 0.4);
  });

  it("non pubblica un punteggio complessivo con troppi pochi dati", () => {
    const result = computeScore([m("hba1c", 5.2), m("glucose_fasting", 88)], { asOf: TODAY });
    assert.equal(result.score, null);
    assert.ok(result.coverage < MIN_OVERALL_COVERAGE);
  });

  it("scarta le misure troppo vecchie invece di spacciarle per attuali", () => {
    const result = computeScore(perfectMeasurements("2020-01-01"), { asOf: TODAY });
    assert.equal(result.score, null);
    assert.ok(result.discarded.every((d) => d.reason === "stale"));
    assert.equal(result.discarded.length, METRIC_DEFINITIONS.length);
  });

  it("scarta i valori fisiologicamente impossibili", () => {
    // 5,2 % letto come 52: un errore di unità, non un paziente.
    const result = computeScore([m("hba1c", 52)], { asOf: TODAY });
    assert.deepEqual(result.discarded, [{ code: "hba1c", reason: "implausible" }]);
  });

  it("ignora i codici che non esistono nel catalogo", () => {
    const result = computeScore([m("colesterolo_totale", 190)], { asOf: TODAY });
    assert.deepEqual(result.discarded, [
      { code: "colesterolo_totale", reason: "unknown_metric" },
    ]);
  });

  it("elenca le metriche mancanti partendo dalla più pesante", () => {
    const result = computeScore([m("hba1c", 5.2)], { asOf: TODAY });
    const metabolic = result.pillars.find((p) => p.key === "metabolic_health")!;
    assert.equal(metabolic.missing[0].code, "glucose_fasting");
    assert.ok(metabolic.missing.every((x, i, all) => i === 0 || all[i - 1].weight >= x.weight));
  });

  it("riporta la data della misurazione più recente usata", () => {
    const result = computeScore(
      [m("hba1c", 5.2, "2026-05-01"), m("glucose_fasting", 88, "2026-08-28")],
      { asOf: TODAY },
    );
    assert.equal(result.measuredOn, "2026-08-28");
  });
});

describe("diffScores", () => {
  it("calcola la variazione complessiva e per pilastro", () => {
    const before = computeScore(perfectMeasurements(), { asOf: TODAY });
    const worse = perfectMeasurements().map((x) =>
      x.code === "hba1c" ? { ...x, value: 6.0 } : x,
    );
    const after = computeScore(worse, { asOf: TODAY });

    const diff = diffScores(after, before);
    assert.ok(diff.overall !== null && diff.overall < 0);
    assert.ok((diff.byPillar.metabolic_health ?? 0) < 0);
    assert.equal(diff.byPillar.lifestyle, 0);
  });

  it("non inventa variazioni quando manca il confronto", () => {
    const current = computeScore(perfectMeasurements(), { asOf: TODAY });
    assert.deepEqual(diffScores(current, null), { overall: null, byPillar: {} });
  });
});
