import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  annualFromWeekly,
  bottleneck,
  consumptionModel,
  growthHeadroom,
  monthsToSaturation,
  occupancyByProfessional,
  projectDemand,
  toMinutes,
  weeklyProfessionalMinutes,
  weeklyRoomMinutes,
  type DeliveredVisit,
  type OpeningHour,
  type Room,
  type Schedule,
} from "./engine.ts";

const STANZE: Room[] = [
  { id: "r1", name: "Ambulatorio 1", isActive: true },
  { id: "r2", name: "Ambulatorio 2", isActive: true },
  { id: "r3", name: "Ambulatorio 3", isActive: false },
];

// Lunedì-venerdì 8–19 (11 h), sabato 9–13 (4 h).
const ORARI: OpeningHour[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opensAt: "08:00",
    closesAt: "19:00",
    roomId: null,
  })),
  { weekday: 6, opensAt: "09:00", closesAt: "13:00", roomId: null },
];

function visita(over: Partial<DeliveredVisit> = {}): DeliveredVisit {
  return {
    professionalId: "pro-1",
    discipline: "nutritionist",
    startsAt: "2026-03-02T09:00:00Z",
    endsAt: "2026-03-02T10:00:00Z",
    ...over,
  };
}

describe("capacità teorica", () => {
  it("converte gli orari in minuti", () => {
    assert.equal(toMinutes("08:30"), 510);
    assert.equal(toMinutes("00:00"), 0);
  });

  it("moltiplica gli orari di clinica per gli ambulatori attivi", () => {
    // (5 × 11 h + 4 h) × 2 stanze attive = 59 h × 2 = 118 h.
    assert.equal(weeklyRoomMinutes(STANZE, ORARI), 118 * 60);
  });

  it("ignora gli ambulatori non attivi", () => {
    const soloUno = weeklyRoomMinutes([STANZE[0], STANZE[2]], ORARI);
    assert.equal(soloUno, 59 * 60);
  });

  it("non produce capacità senza ambulatori", () => {
    assert.equal(weeklyRoomMinutes([], ORARI), 0);
  });

  it("somma gli orari di ciascun professionista", () => {
    const turni: Schedule[] = [
      { professionalId: "pro-1", weekday: 1, startsAt: "09:00", endsAt: "13:00" },
      { professionalId: "pro-1", weekday: 3, startsAt: "14:00", endsAt: "18:00" },
      { professionalId: "pro-2", weekday: 2, startsAt: "09:00", endsAt: "12:00" },
    ];
    const per = weeklyProfessionalMinutes(turni);
    assert.equal(per.get("pro-1"), 480);
    assert.equal(per.get("pro-2"), 180);
  });
});

describe("saturazione e collo di bottiglia", () => {
  const turni: Schedule[] = [
    { professionalId: "pro-1", weekday: 1, startsAt: "09:00", endsAt: "13:00" }, // 4 h
    { professionalId: "pro-2", weekday: 1, startsAt: "09:00", endsAt: "17:00" }, // 8 h
  ];

  it("calcola quanto è pieno ciascuno", () => {
    const visite = [
      ...Array.from({ length: 3 }, (_, i) =>
        visita({ professionalId: "pro-1", startsAt: `2026-03-0${i + 2}T09:00:00Z`, endsAt: `2026-03-0${i + 2}T10:00:00Z` }),
      ),
      visita({ professionalId: "pro-2" }),
    ];

    const u = occupancyByProfessional(visite, turni, 1);
    const uno = u.find((x) => x.professionalId === "pro-1")!;
    const due = u.find((x) => x.professionalId === "pro-2")!;

    assert.equal(uno.minutiErogati, 180);
    assert.equal(uno.minutiDisponibili, 240);
    assert.equal(uno.saturazione, 0.75);
    assert.equal(due.saturazione, 60 / 480);
  });

  it("indica chi è più vicino a saturare", () => {
    const visite = Array.from({ length: 3 }, (_, i) =>
      visita({ professionalId: "pro-1", startsAt: `2026-03-0${i + 2}T09:00:00Z`, endsAt: `2026-03-0${i + 2}T10:00:00Z` }),
    );
    const collo = bottleneck(occupancyByProfessional(visite, turni, 1));
    assert.equal(collo?.professionalId, "pro-1");
  });

  it("non chiama collo di bottiglia chi non ha orari configurati", () => {
    // Di pro-9 non sappiamo la capacità: ignoranza, non diagnosi.
    const visite = [visita({ professionalId: "pro-9" })];
    const collo = bottleneck(occupancyByProfessional(visite, [], 1));
    assert.equal(collo, null);
  });

  it("segnala la saturazione oltre il 100% invece di troncarla", () => {
    const visite = Array.from({ length: 6 }, (_, i) =>
      visita({ professionalId: "pro-1", startsAt: `2026-03-0${i + 2}T09:00:00Z`, endsAt: `2026-03-0${i + 2}T10:00:00Z` }),
    );
    const u = occupancyByProfessional(visite, turni, 1);
    assert.ok(u[0].saturazione > 1);
  });
});

describe("modello di consumo", () => {
  const visite: DeliveredVisit[] = [
    visita({ discipline: "nutritionist", startsAt: "2026-01-05T09:00:00Z", endsAt: "2026-01-05T10:00:00Z" }),
    visita({ discipline: "nutritionist", startsAt: "2026-01-06T09:00:00Z", endsAt: "2026-01-06T10:00:00Z" }),
    visita({ discipline: "physician", startsAt: "2026-01-07T09:00:00Z", endsAt: "2026-01-07T11:00:00Z" }),
  ];

  it("annualizza il consumo per membro", () => {
    // 2 membri, 365 giorni osservati: nessuna annualizzazione da fare.
    const m = consumptionModel(visite, 2, 365);
    const nutri = m.find((x) => x.discipline === "nutritionist")!;
    assert.equal(nutri.minutiPerMembroAnno, 60); // 120 min / 2 membri
  });

  it("scala un periodo breve su base annua", () => {
    const m = consumptionModel(visite, 1, 30);
    const nutri = m.find((x) => x.discipline === "nutritionist")!;
    assert.ok(Math.abs(nutri.minutiPerMembroAnno - 120 * (365 / 30)) < 0.001);
  });

  it("non inventa un modello senza membri o senza periodo", () => {
    assert.deepEqual(consumptionModel(visite, 0, 365), []);
    assert.deepEqual(consumptionModel(visite, 10, 0), []);
  });

  it("proietta la domanda su un numero di membri", () => {
    const m = consumptionModel(visite, 2, 365);
    const domanda = projectDemand(1000, m);
    const nutri = domanda.find((d) => d.discipline === "nutritionist")!;
    assert.equal(nutri.oreAnno, 1000); // 60 min × 1000 / 60
  });
});

describe("margine di crescita", () => {
  const modello = [
    { discipline: "nutritionist", minutiPerMembroAnno: 60 },
    { discipline: "physician", minutiPerMembroAnno: 120 },
  ];

  it("è vincolato dalla disciplina che satura per prima", () => {
    const capacita = new Map([
      ["nutritionist", 60 * 1000], // basta per 1000 membri
      ["physician", 120 * 300], //  basta per 300
    ]);

    const margine = growthHeadroom(250, modello, capacita);
    assert.equal(margine.vincolo, "physician");
    assert.equal(margine.membriAggiuntivi, 50);
  });

  it("non promette crescita quando si è già oltre", () => {
    const capacita = new Map([["physician", 120 * 100]]);
    const margine = growthHeadroom(250, modello, capacita);
    assert.equal(margine.membriAggiuntivi, 0);
    assert.equal(margine.vincolo, "physician");
  });

  it("non risponde senza un modello", () => {
    assert.deepEqual(growthHeadroom(100, [], new Map()), {
      membriAggiuntivi: 0,
      vincolo: null,
    });
  });

  it("calcola i mesi che mancano alla saturazione", () => {
    // Capacità per 300 membri, ne abbiamo 250, ne arrivano 10 al mese.
    assert.equal(monthsToSaturation(250, 10, "physician", modello, 120 * 300), 5);
  });

  it("dice zero se siamo già saturi, non 'mai'", () => {
    assert.equal(monthsToSaturation(400, 10, "physician", modello, 120 * 300), 0);
  });

  it("non prevede saturazione senza crescita", () => {
    assert.equal(monthsToSaturation(250, 0, "physician", modello, 120 * 300), null);
  });

  it("non prevede nulla per una disciplina fuori modello", () => {
    assert.equal(monthsToSaturation(250, 10, "osteopath", modello, 10_000), null);
  });

  it("annualizza escludendo le settimane di chiusura", () => {
    assert.equal(annualFromWeekly(600), 600 * 48);
    assert.equal(annualFromWeekly(600, 52), 600 * 52);
  });
});
