import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTO_APPLY_MIN_CONFIDENCE,
  validateExtraction,
  type RawExtraction,
  type ValidationContext,
} from "./validation.ts";

const TODAY = "2026-09-03";

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    previousValues: {},
    documentDate: "2026-08-28",
    today: TODAY,
    ...overrides,
  };
}

function extraction(over: Partial<RawExtraction> = {}): RawExtraction {
  return {
    metric_code: "hba1c",
    label: "Emoglobina glicata",
    value: 5.2,
    category: null,
    unit: "%",
    measured_on: "2026-08-28",
    confidence: 0.95,
    source_excerpt: "Emoglobina glicata HbA1c 5,2 %",
    ...over,
  };
}

describe("validateExtraction", () => {
  it("applica da sola una lettura pulita con uno storico coerente", () => {
    const result = validateExtraction([extraction()], context({
      previousValues: { hba1c: 5.4 },
    }));

    assert.equal(result.proposals.length, 1);
    const [p] = result.proposals;
    assert.equal(p.status, "auto_applied");
    assert.deepEqual(p.reviewReasons, []);
    assert.equal(p.previousValue, 5.4);
    assert.equal(p.delta, -0.2);
  });

  it("manda in revisione il primo valore di un parametro", () => {
    const result = validateExtraction([extraction()], context());
    assert.equal(result.proposals[0].status, "needs_review");
    assert.deepEqual(result.proposals[0].reviewReasons, ["first_measurement"]);
    assert.equal(result.proposals[0].delta, null);
  });

  it("manda in revisione una lettura poco sicura", () => {
    const result = validateExtraction(
      [extraction({ confidence: AUTO_APPLY_MIN_CONFIDENCE - 0.05 })],
      context({ previousValues: { hba1c: 5.4 } }),
    );
    assert.ok(result.proposals[0].reviewReasons.includes("low_confidence"));
    assert.equal(result.proposals[0].status, "needs_review");
  });

  it("segnala l'unità di misura diversa da quella attesa", () => {
    const result = validateExtraction(
      [extraction({ metric_code: "glucose_fasting", value: 5.1, unit: "mmol/L" })],
      context({ previousValues: { glucose_fasting: 5.0 } }),
    );
    assert.ok(result.proposals[0].reviewReasons.includes("unit_mismatch"));
  });

  it("accetta la stessa unità scritta in modo diverso", () => {
    const result = validateExtraction(
      [extraction({ metric_code: "ldl", value: 118, unit: "MG / DL " })],
      context({ previousValues: { ldl: 122 } }),
    );
    assert.ok(!result.proposals[0].reviewReasons.includes("unit_mismatch"));
    assert.equal(result.proposals[0].status, "auto_applied");
  });

  it("scarta un valore fisiologicamente impossibile invece di metterlo in coda", () => {
    // 5,2 % letto come 52: errore di unità, non un paziente.
    const result = validateExtraction([extraction({ value: 52 })], context());
    assert.equal(result.proposals.length, 0);
    assert.deepEqual(result.discarded, [
      {
        metricCode: "hba1c",
        label: "Emoglobina glicata",
        reason: "implausible",
        sourceExcerpt: "Emoglobina glicata HbA1c 5,2 %",
      },
    ]);
  });

  it("scarta i codici fuori catalogo senza inventare accostamenti", () => {
    const result = validateExtraction(
      [extraction({ metric_code: "colesterolo_totale", value: 190 })],
      context(),
    );
    assert.equal(result.proposals.length, 0);
    assert.equal(result.discarded[0].reason, "unknown_metric");
  });

  it("segnala una variazione ampia rispetto alla misura precedente", () => {
    const result = validateExtraction(
      [extraction({ metric_code: "ldl", value: 118, unit: "mg/dL" })],
      context({ previousValues: { ldl: 180 } }),
    );
    assert.ok(result.proposals[0].reviewReasons.includes("large_change"));
  });

  it("segnala il valore che scavalca una soglia clinica", () => {
    const result = validateExtraction(
      [extraction({ value: 6.6 })],
      context({ previousValues: { hba1c: 6.4 } }),
    );
    // La variazione è piccola, ma 6,6 supera la soglia diagnostica.
    assert.ok(!result.proposals[0].reviewReasons.includes("large_change"));
    assert.ok(result.proposals[0].reviewReasons.includes("clinical_threshold"));
  });

  it("segnala anche il rientro sotto la soglia clinica", () => {
    const result = validateExtraction(
      [extraction({ metric_code: "ldl", value: 185, unit: "mg/dL" })],
      context({ previousValues: { ldl: 195 } }),
    );
    assert.ok(result.proposals[0].reviewReasons.includes("clinical_threshold"));
  });

  it("ripiega sulla data del documento quando la misura non ne ha una", () => {
    const result = validateExtraction(
      [extraction({ measured_on: null })],
      context({ previousValues: { hba1c: 5.4 } }),
    );
    assert.equal(result.proposals[0].measuredOn, "2026-08-28");
    assert.deepEqual(result.proposals[0].reviewReasons, []);
  });

  it("segnala quando non c'è alcuna data da usare", () => {
    const result = validateExtraction(
      [extraction({ measured_on: null })],
      context({ documentDate: null, previousValues: { hba1c: 5.4 } }),
    );
    assert.equal(result.proposals[0].measuredOn, TODAY);
    assert.ok(result.proposals[0].reviewReasons.includes("missing_date"));
  });

  it("segnala una data nel futuro", () => {
    const result = validateExtraction(
      [extraction({ measured_on: "2027-01-01" })],
      context({ previousValues: { hba1c: 5.4 } }),
    );
    assert.ok(result.proposals[0].reviewReasons.includes("date_out_of_range"));
  });

  it("valida le metriche categoriali sui valori ammessi", () => {
    const ok = validateExtraction(
      [extraction({ metric_code: "ecg_status", value: null, category: "normal", unit: null })],
      context(),
    );
    assert.equal(ok.proposals[0].status, "auto_applied");

    const ko = validateExtraction(
      [extraction({ metric_code: "ecg_status", value: null, category: "nella norma", unit: null })],
      context(),
    );
    assert.equal(ko.proposals.length, 0);
    assert.equal(ko.discarded[0].reason, "unknown_category");
  });

  it("scarta una metrica numerica senza valore", () => {
    const result = validateExtraction([extraction({ value: null })], context());
    assert.equal(result.discarded[0].reason, "no_value");
  });
});
