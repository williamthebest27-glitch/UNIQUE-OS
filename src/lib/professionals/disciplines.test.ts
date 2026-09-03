import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PILLAR_KEYS } from "../score/pillars.ts";
import { METRIC_DEFINITIONS } from "../score/metrics.ts";
import {
  DISCIPLINES,
  DISCIPLINE_LABELS,
  canApproveClinicalFlag,
  canWriteMetric,
  canWritePillar,
  pillarsFor,
} from "./disciplines.ts";

describe("discipline professionali", () => {
  it("ha un'etichetta per ogni disciplina", () => {
    for (const discipline of DISCIPLINES) {
      assert.ok(DISCIPLINE_LABELS[discipline], `manca l'etichetta di ${discipline}`);
    }
  });

  it("assegna a ogni disciplina solo pilastri esistenti", () => {
    for (const discipline of DISCIPLINES) {
      const scope = pillarsFor(discipline);
      if (scope === "all") continue;
      for (const pillar of scope) {
        assert.ok(
          (PILLAR_KEYS as readonly string[]).includes(pillar),
          `${discipline} punta al pilastro inesistente ${pillar}`,
        );
      }
    }
  });

  it("dà al medico competenza su tutti i pilastri", () => {
    for (const pillar of PILLAR_KEYS) {
      assert.ok(canWritePillar("physician", pillar));
    }
  });

  it("tiene il nutrizionista dentro il proprio ambito", () => {
    assert.ok(canWriteMetric("nutritionist", "diet_quality_score"));
    assert.ok(canWriteMetric("nutritionist", "hba1c"));
    // Un ECG non lo referta un nutrizionista.
    assert.equal(canWriteMetric("nutritionist", "ecg_status"), false);
    assert.equal(canWriteMetric("nutritionist", "who5_wellbeing"), false);
  });

  it("tiene lo psicologo dentro il proprio ambito", () => {
    assert.ok(canWriteMetric("psychologist", "who5_wellbeing"));
    assert.ok(canWriteMetric("psychologist", "sleep_hours_avg"));
    assert.equal(canWriteMetric("psychologist", "ldl"), false);
  });

  it("non concede nulla a una disciplina non dichiarata", () => {
    for (const metric of METRIC_DEFINITIONS) {
      assert.equal(
        canWriteMetric("other", metric.code),
        false,
        `"other" non dovrebbe poter scrivere ${metric.code}`,
      );
    }
  });

  it("rifiuta le metriche fuori catalogo, anche al medico", () => {
    assert.equal(canWriteMetric("physician", "colesterolo_totale"), false);
  });

  it("riserva al medico l'approvazione dei valori fuori soglia", () => {
    assert.ok(canApproveClinicalFlag("physician"));
    for (const discipline of DISCIPLINES) {
      if (discipline === "physician") continue;
      assert.equal(
        canApproveClinicalFlag(discipline),
        false,
        `${discipline} non deve poter approvare un valore fuori soglia`,
      );
    }
  });

  it("copre ogni pilastro con almeno una disciplina non medica", () => {
    // Se un pilastro fosse scrivibile solo dal medico, il lavoro di tutti
    // gli altri professionisti non entrerebbe mai nello Score.
    for (const pillar of PILLAR_KEYS) {
      const coperto = DISCIPLINES.some(
        (d) => d !== "physician" && d !== "other" && canWritePillar(d, pillar),
      );
      assert.ok(coperto, `nessuna disciplina non medica copre ${pillar}`);
    }
  });
});
