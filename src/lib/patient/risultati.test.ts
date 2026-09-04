import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMetric } from "../score/metrics.ts";
import {
  componiRisultati,
  eUnMiglioramento,
  fuoriIntervallo,
  statoRiferimento,
  type Lettura,
} from "./risultati.ts";

function lettura(patch: Partial<Lettura> & Pick<Lettura, "metricCode" | "measuredOn">): Lettura {
  return {
    label: "",
    unit: null,
    value: null,
    category: null,
    refLow: null,
    refHigh: null,
    ...patch,
  };
}

describe("l'intervallo del referto", () => {
  it("dice dove cade il valore, non cosa significa", () => {
    assert.equal(statoRiferimento(5, 4, 6), "dentro");
    assert.equal(statoRiferimento(3, 4, 6), "sotto");
    assert.equal(statoRiferimento(7, 4, 6), "sopra");
  });

  it("senza intervallo non si pronuncia", () => {
    assert.equal(statoRiferimento(5, null, null), "senza_riferimento");
    assert.equal(statoRiferimento(null, 4, 6), "senza_riferimento");
  });

  it("un intervallo aperto da un lato funziona lo stesso", () => {
    assert.equal(statoRiferimento(200, null, 190), "sopra");
    assert.equal(statoRiferimento(30, 40, null), "sotto");
    assert.equal(statoRiferimento(50, 40, null), "dentro");
  });
});

describe("cosa è un miglioramento", () => {
  it("la glicata che scende migliora", () => {
    const hba1c = getMetric("hba1c");
    assert.ok(hba1c, "la metrica hba1c deve esistere nel catalogo");
    assert.equal(eUnMiglioramento(hba1c, 5.9, 5.3), true);
    assert.equal(eUnMiglioramento(hba1c, 5.3, 5.9), false);
  });

  it("senza curva non si esprime un giudizio", () => {
    assert.equal(eUnMiglioramento(undefined, 10, 12), null);
  });

  it("un valore identico non è né meglio né peggio", () => {
    const hba1c = getMetric("hba1c");
    assert.equal(eUnMiglioramento(hba1c, 5.5, 5.5), null);
  });
});

describe("comporre i risultati", () => {
  const LETTURE: Lettura[] = [
    lettura({ metricCode: "hba1c", label: "Emoglobina glicata", unit: "%", value: 5.9, measuredOn: "2026-01-10", refLow: 4, refHigh: 5.6 }),
    lettura({ metricCode: "hba1c", label: "Emoglobina glicata", unit: "%", value: 5.3, measuredOn: "2026-06-10", refLow: 4, refHigh: 5.6 }),
    lettura({ metricCode: "ldl", label: "Colesterolo LDL", unit: "mg/dL", value: 150, measuredOn: "2026-06-10", refHigh: 115 }),
    lettura({ metricCode: "parametro_ignoto", label: "Qualcosa di raro", unit: "U/L", value: 12, measuredOn: "2026-06-10" }),
  ];

  it("una riga per parametro, con l'ultimo valore in cima", () => {
    const gruppi = componiRisultati(LETTURE);
    const righe = gruppi.flatMap((g) => g.righe);
    assert.equal(righe.length, 3);

    const glicata = righe.find((r) => r.code === "hba1c");
    assert.equal(glicata?.valore, 5.3);
    assert.equal(glicata?.misuratoIl, "2026-06-10");
  });

  it("il confronto guarda la misura precedente, e sa se è un miglioramento", () => {
    const glicata = componiRisultati(LETTURE).flatMap((g) => g.righe).find((r) => r.code === "hba1c");
    assert.deepEqual(glicata?.precedente, { valore: 5.9, misuratoIl: "2026-01-10" });
    assert.ok(glicata?.delta !== null && glicata!.delta! < 0);
    assert.equal(glicata?.miglioramento, true);
  });

  it("con una misura sola non c'è confronto e non si finge che ci sia", () => {
    const ldl = componiRisultati(LETTURE).flatMap((g) => g.righe).find((r) => r.code === "ldl");
    assert.equal(ldl?.precedente, null);
    assert.equal(ldl?.delta, null);
    assert.equal(ldl?.miglioramento, null);
  });

  it("i parametri fuori catalogo non spariscono: finiscono in «Altri parametri»", () => {
    const gruppi = componiRisultati(LETTURE);
    const altro = gruppi.find((g) => g.pilastro === "altro");
    assert.equal(altro?.righe.length, 1);
    assert.equal(altro?.righe[0].code, "parametro_ignoto");
  });

  it("i gruppi seguono l'ordine dei pilastri, sempre lo stesso", () => {
    const gruppi = componiRisultati(LETTURE);
    assert.equal(gruppi[gruppi.length - 1].pilastro, "altro");
    assert.ok(gruppi.length >= 2);
  });

  it("lo storico serve al grafico ed è in ordine cronologico", () => {
    const glicata = componiRisultati(LETTURE).flatMap((g) => g.righe).find((r) => r.code === "hba1c");
    assert.deepEqual(glicata?.storico, [
      { data: "2026-01-10", valore: 5.9 },
      { data: "2026-06-10", valore: 5.3 },
    ]);
  });

  it("conta quanti valori stanno fuori intervallo: un conteggio, non un verdetto", () => {
    // LDL 150 con soglia 115 è fuori; la glicata a 5,3 è dentro.
    assert.equal(fuoriIntervallo(componiRisultati(LETTURE)), 1);
  });

  it("una metrica categoriale porta la voce, non un numero", () => {
    const gruppi = componiRisultati([
      lettura({ metricCode: "smoking_status", label: "Abitudine al fumo", category: "never", measuredOn: "2026-06-10" }),
    ]);
    const riga = gruppi.flatMap((g) => g.righe)[0];
    assert.equal(riga.valore, null);
    assert.equal(riga.categoria, "never");
    assert.deepEqual(riga.storico, []);
  });

  it("nessuna lettura, nessun gruppo", () => {
    assert.deepEqual(componiRisultati([]), []);
  });
});
