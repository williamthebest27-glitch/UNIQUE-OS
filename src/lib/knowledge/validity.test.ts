import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REVISIONE_GIORNI,
  anomalieCatena,
  daRiconfermare,
  etaGiorni,
  provenienza,
  versioneAllaData,
  versioneValida,
  type VersioneDatata,
} from "./validity.ts";

const OGGI = "2026-09-04";

/** La storia del listino: 129 € fino a marzo, 149 € da marzo. */
const LISTINO: VersioneDatata[] = [
  { version: 1, status: "superseded", validFrom: "2025-10-01", validTo: "2026-03-14" },
  { version: 2, status: "active", validFrom: "2026-03-15", validTo: null },
];

describe("quale versione è vera oggi", () => {
  it("prende quella attiva e in corso di validità", () => {
    assert.equal(versioneValida(LISTINO, OGGI)?.version, 2);
  });

  it("non risponde con una versione superata", () => {
    const solo129: VersioneDatata[] = [LISTINO[0]];
    assert.equal(versioneValida(solo129, OGGI), null);
  });

  it("non risponde con una bozza", () => {
    const bozza: VersioneDatata[] = [
      { version: 3, status: "draft", validFrom: "2026-01-01", validTo: null },
    ];
    assert.equal(versioneValida(bozza, OGGI), null);
  });

  it("non risponde con una versione che entra in vigore domani", () => {
    const futura: VersioneDatata[] = [
      { version: 3, status: "active", validFrom: "2026-09-05", validTo: null },
    ];
    assert.equal(versioneValida(futura, OGGI), null);
  });

  it("se due si sovrappongono vince la più recente", () => {
    const doppie: VersioneDatata[] = [
      { version: 2, status: "active", validFrom: "2026-03-15", validTo: null },
      { version: 3, status: "active", validFrom: "2026-08-01", validTo: null },
    ];
    assert.equal(versioneValida(doppie, OGGI)?.version, 3);
  });
});

describe("quanto costava prima", () => {
  it("restituisce la versione in vigore a una data passata", () => {
    assert.equal(versioneAllaData(LISTINO, "2026-01-10")?.version, 1);
  });

  it("al confine, l'ultimo giorno di validità è ancora suo", () => {
    assert.equal(versioneAllaData(LISTINO, "2026-03-14")?.version, 1);
    assert.equal(versioneAllaData(LISTINO, "2026-03-15")?.version, 2);
  });

  it("prima della prima versione non c'era niente da dire", () => {
    assert.equal(versioneAllaData(LISTINO, "2025-01-01"), null);
  });
});

describe("difetti della catena", () => {
  it("una catena continua non ha anomalie", () => {
    assert.deepEqual(anomalieCatena(LISTINO), []);
  });

  it("vede il giorno in cui il sistema non sapeva rispondere", () => {
    const conBuco: VersioneDatata[] = [
      { version: 1, status: "superseded", validFrom: "2025-10-01", validTo: "2026-03-14" },
      { version: 2, status: "active", validFrom: "2026-04-01", validTo: null },
    ];
    const anomalie = anomalieCatena(conBuco);
    assert.equal(anomalie.length, 1);
    assert.equal(anomalie[0].tipo, "buco");
    assert.deepEqual(anomalie[0].versioni, [1, 2]);
  });

  it("vede i giorni in cui avrebbe risposto in due modi", () => {
    const sovrapposte: VersioneDatata[] = [
      { version: 1, status: "superseded", validFrom: "2025-10-01", validTo: "2026-04-30" },
      { version: 2, status: "active", validFrom: "2026-03-15", validTo: null },
    ];
    const anomalie = anomalieCatena(sovrapposte);
    assert.equal(anomalie.length, 1);
    assert.equal(anomalie[0].tipo, "sovrapposizione");
  });

  it("una versione aperta seguita da un'altra è una sovrapposizione", () => {
    const aperte: VersioneDatata[] = [
      { version: 1, status: "superseded", validFrom: "2025-10-01", validTo: null },
      { version: 2, status: "active", validFrom: "2026-03-15", validTo: null },
    ];
    assert.equal(anomalieCatena(aperte)[0]?.tipo, "sovrapposizione");
  });

  it("le bozze non entrano nella catena", () => {
    const conBozza: VersioneDatata[] = [
      ...LISTINO,
      { version: 3, status: "draft", validFrom: "2027-01-01", validTo: null },
    ];
    assert.deepEqual(anomalieCatena(conBozza), []);
  });
});

describe("informazioni invecchiate", () => {
  it("conta i giorni dall'entrata in vigore", () => {
    assert.equal(etaGiorni(LISTINO[1], OGGI), 173);
  });

  it("un listino di sei mesi va riconfermato", () => {
    const vecchio: VersioneDatata = {
      version: 1,
      status: "active",
      validFrom: "2026-01-01",
      validTo: null,
    };
    assert.equal(daRiconfermare(vecchio, "listino", OGGI), true);
    // Lo stesso testo, se fosse brand, non sarebbe ancora scaduto.
    assert.equal(daRiconfermare(vecchio, "brand", OGGI), false);
  });

  it("la provenienza dice sempre da quando vale", () => {
    assert.match(provenienza(LISTINO[1], "listino", OGGI), /versione 2, in vigore dal 2026-03-15/);
  });

  it("e avvisa quando nessuno la riconferma da troppo", () => {
    const vecchio: VersioneDatata = {
      version: 1,
      status: "active",
      validFrom: "2025-01-01",
      validTo: null,
    };
    assert.match(provenienza(vecchio, "listino", OGGI), /non riconfermata da \d+ giorni/);
  });

  it("ogni tipo ha una soglia di riconferma", () => {
    for (const [kind, giorni] of Object.entries(REVISIONE_GIORNI)) {
      assert.ok(giorni > 0, `${kind} senza soglia`);
    }
  });
});
