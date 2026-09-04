import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  conflitti,
  descriviConflitti,
  fineDa,
  orarioAmmesso,
  type AppuntamentoInAgenda,
} from "./agenda.ts";

const AGENDA: AppuntamentoInAgenda[] = [
  {
    id: "a1",
    professionalId: "rossi",
    roomId: "stanza-1",
    startsAt: "2026-09-10T08:00:00.000Z",
    endsAt: "2026-09-10T09:00:00.000Z",
    status: "confirmed",
    etichetta: "Consulenza longevity con Mario Bianchi",
  },
  {
    id: "a2",
    professionalId: "verdi",
    roomId: "stanza-2",
    startsAt: "2026-09-10T08:30:00.000Z",
    endsAt: "2026-09-10T09:30:00.000Z",
    status: "scheduled",
    etichetta: "Osteopatia con Lucia Neri",
  },
  {
    id: "a3",
    professionalId: "rossi",
    roomId: "stanza-1",
    startsAt: "2026-09-10T10:00:00.000Z",
    endsAt: "2026-09-10T11:00:00.000Z",
    status: "cancelled",
    etichetta: "Disdetta",
  },
];

describe("sovrapposizioni in agenda", () => {
  it("lo stesso professionista non può essere in due posti", () => {
    const c = conflitti(
      { id: null, professionalId: "rossi", roomId: "stanza-3", startsAt: "2026-09-10T08:30:00.000Z", endsAt: "2026-09-10T09:30:00.000Z" },
      AGENDA,
    );
    assert.equal(c.length, 1);
    assert.equal(c[0].tipo, "professionista");
    assert.equal(c[0].con.id, "a1");
  });

  it("la stessa stanza non ospita due visite", () => {
    const c = conflitti(
      { id: null, professionalId: "gialli", roomId: "stanza-2", startsAt: "2026-09-10T09:00:00.000Z", endsAt: "2026-09-10T10:00:00.000Z" },
      AGENDA,
    );
    assert.equal(c.length, 1);
    assert.equal(c[0].tipo, "stanza");
  });

  it("una disdetta libera il posto", () => {
    const c = conflitti(
      { id: null, professionalId: "rossi", roomId: "stanza-1", startsAt: "2026-09-10T10:00:00.000Z", endsAt: "2026-09-10T11:00:00.000Z" },
      AGENDA,
    );
    assert.deepEqual(c, []);
  });

  it("chi finisce esattamente quando l'altro comincia non si sovrappone", () => {
    const c = conflitti(
      { id: null, professionalId: "rossi", roomId: "stanza-1", startsAt: "2026-09-10T09:00:00.000Z", endsAt: "2026-09-10T10:00:00.000Z" },
      AGENDA,
    );
    assert.deepEqual(c, []);
  });

  it("uno spostamento non si sovrappone a se stesso", () => {
    // a1 spostato di mezz'ora: tocca il vecchio a1, che è lui.
    const c = conflitti(
      { id: "a1", professionalId: "rossi", roomId: "stanza-1", startsAt: "2026-09-10T08:30:00.000Z", endsAt: "2026-09-10T09:30:00.000Z" },
      AGENDA,
    );
    assert.deepEqual(c, []);
  });

  it("la frase per il banco dice con chi", () => {
    const c = conflitti(
      { id: null, professionalId: "rossi", roomId: null, startsAt: "2026-09-10T08:30:00.000Z", endsAt: "2026-09-10T09:30:00.000Z" },
      AGENDA,
    );
    assert.match(descriviConflitti(c) ?? "", /già impegnato in quell'orario: Consulenza longevity con Mario Bianchi/);
    assert.equal(descriviConflitti([]), null);
  });
});

describe("orari", () => {
  it("la fine si calcola dalla durata", () => {
    assert.equal(fineDa("2026-09-10T08:00:00.000Z", 45), "2026-09-10T08:45:00.000Z");
  });

  it("nel passato no", () => {
    assert.match(orarioAmmesso("2026-09-01T08:00:00.000Z", "2026-09-10T08:00:00.000Z") ?? "", /passato/);
    assert.equal(orarioAmmesso("2026-09-11T08:00:00.000Z", "2026-09-10T08:00:00.000Z"), null);
  });

  it("un orario illeggibile si rifiuta", () => {
    assert.match(orarioAmmesso("ieri alle nove", "2026-09-10T08:00:00.000Z") ?? "", /leggibile/);
  });
});
