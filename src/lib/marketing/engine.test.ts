import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  campagneFuoriMedia,
  metricheCampagna,
  migliorQualita,
  ricorrenzeVincenti,
  totaliMarketing,
  valutaContenuti,
  type AnagraficaCampagna,
  type AttribuzioneCampagna,
  type ContenutoGrezzo,
  type SpesaCampagna,
} from "./engine.ts";

function anagrafica(over: Partial<AnagraficaCampagna> = {}): AnagraficaCampagna {
  return {
    id: "c1",
    name: "Longevity Agosto",
    channel: "meta",
    status: "active",
    objective: "lead",
    serviceName: "Unique Longevity Score",
    ...over,
  };
}

function spesa(over: Partial<SpesaCampagna> = {}): SpesaCampagna {
  return {
    campaignId: "c1",
    spendCents: 120_000,
    impressions: 80_000,
    clicks: 1_600,
    platformLeads: 40,
    ...over,
  };
}

function attribuzione(over: Partial<AttribuzioneCampagna> = {}): AttribuzioneCampagna {
  return {
    campaignId: "c1",
    leads: 40,
    qualified: 25,
    booked: 15,
    patients: 10,
    members: 4,
    revenueCents: 480_000,
    ...over,
  };
}

describe("metriche di una campagna", () => {
  it("calcola costo per lead, costo per paziente e ritorno", () => {
    const m = metricheCampagna(anagrafica(), spesa(), attribuzione());

    assert.equal(m.cplCents, 3_000); // 1.200 € / 40
    assert.equal(m.cacCents, 12_000); // 1.200 € / 10
    assert.equal(m.cpMembershipCents, 30_000);
    assert.equal(m.roas, 4);
    assert.equal(m.conversione, 0.25);
    assert.equal(m.tassoMembership, 0.4);
    assert.equal(m.ctr, 0.02);
  });

  it("senza lead il costo per lead non esiste — e non è zero", () => {
    const m = metricheCampagna(anagrafica(), spesa(), attribuzione({ leads: 0, patients: 0 }));
    assert.equal(m.cplCents, null);
    assert.equal(m.cacCents, null);
  });

  it("senza spesa non c'è ritorno da calcolare", () => {
    const m = metricheCampagna(anagrafica(), spesa({ spendCents: 0 }), attribuzione());
    assert.equal(m.roas, null);
    assert.equal(m.cplCents, 0);
  });

  it("una campagna senza dati non rompe niente", () => {
    const m = metricheCampagna(anagrafica(), undefined, undefined);
    assert.equal(m.spendCents, 0);
    assert.equal(m.leads, 0);
    assert.equal(m.cplCents, null);
    assert.equal(m.roas, null);
  });

  it("segnala quando la piattaforma dichiara più lead di quelli arrivati", () => {
    const m = metricheCampagna(
      anagrafica(),
      spesa({ platformLeads: 52 }),
      attribuzione({ leads: 40 }),
    );
    assert.equal(m.scartoTracciamento, 12);
  });
});

describe("totali del periodo", () => {
  it("pesa le campagne per quanto hanno speso, non le tratta alla pari", () => {
    const grande = metricheCampagna(
      anagrafica({ id: "grande" }),
      spesa({ spendCents: 500_000 }),
      attribuzione({ leads: 100, patients: 20, revenueCents: 1_000_000 }),
    );
    const piccola = metricheCampagna(
      anagrafica({ id: "piccola" }),
      spesa({ spendCents: 5_000 }),
      attribuzione({ leads: 1, patients: 0, revenueCents: 0 }),
    );

    const t = totaliMarketing([grande, piccola]);

    // Media pesata: 505.000 / 101 = 5.000. La media aritmetica dei due CPL
    // sarebbe 4.900 — e darebbe alla campagna da 50 € lo stesso peso.
    assert.equal(t.cplCents, 5_000);
    assert.equal(t.leads, 101);
    assert.equal(t.patients, 20);
  });

  it("un elenco vuoto non produce divisioni per zero", () => {
    const t = totaliMarketing([]);
    assert.equal(t.cplCents, null);
    assert.equal(t.roas, null);
    assert.equal(t.spendCents, 0);
  });
});

describe("campagne fuori media", () => {
  const nella = metricheCampagna(
    anagrafica({ id: "a", name: "Sempre attiva" }),
    spesa({ spendCents: 100_000 }),
    attribuzione({ leads: 50 }),
  ); // CPL 2.000

  const cara = metricheCampagna(
    anagrafica({ id: "b", name: "Longevity Agosto" }),
    spesa({ spendCents: 100_000 }),
    attribuzione({ leads: 25 }),
  ); // CPL 4.000

  it("trova quella che costa di più e dice di quanto", () => {
    const fuori = campagneFuoriMedia([nella, cara], { soglia: 0.25, leadMinimi: 5 });
    assert.equal(fuori.length, 1);
    assert.equal(fuori[0].name, "Longevity Agosto");
    // Media pesata: 200.000 / 75 = 2.666,67. 4.000 è +50%.
    assert.ok(Math.abs(fuori[0].scarto - 0.5) < 0.001);
  });

  it("tace quando i lead sono troppo pochi per dire qualcosa", () => {
    const rumore = metricheCampagna(
      anagrafica({ id: "c", name: "Test" }),
      spesa({ spendCents: 90_000 }),
      attribuzione({ leads: 3 }),
    );
    const fuori = campagneFuoriMedia([nella, rumore], { leadMinimi: 5 });
    assert.deepEqual(fuori, []);
  });

  it("con una campagna sola non c'è una media da cui scostarsi", () => {
    assert.deepEqual(campagneFuoriMedia([cara]), []);
  });
});

describe("quale campagna porta i pazienti migliori", () => {
  it("ordina per valore generato per paziente, non per numero di lead", () => {
    const tanti = metricheCampagna(
      anagrafica({ id: "tanti", name: "Traffico a poco prezzo" }),
      spesa(),
      attribuzione({ leads: 200, patients: 20, members: 1, revenueCents: 400_000 }),
    ); // 20.000 per paziente

    const pochi = metricheCampagna(
      anagrafica({ id: "pochi", name: "Longevity Score" }),
      spesa(),
      attribuzione({ leads: 20, patients: 8, members: 6, revenueCents: 960_000 }),
    ); // 120.000 per paziente

    const classifica = migliorQualita([tanti, pochi]);
    assert.equal(classifica[0].name, "Longevity Score");
  });

  it("scarta chi non ha ancora portato abbastanza pazienti", () => {
    const acerba = metricheCampagna(
      anagrafica({ id: "acerba" }),
      spesa(),
      attribuzione({ patients: 1, revenueCents: 900_000 }),
    );
    assert.deepEqual(migliorQualita([acerba], 3), []);
  });
});

describe("contenuti", () => {
  const base: ContenutoGrezzo = {
    id: "p1",
    title: "Cosa misura il Longevity Score",
    format: "reel",
    channel: "organic",
    hook: "Il tuo medico ti ha mai misurato questo?",
    angle: "autorità",
    topic: "score",
    publishedOn: "2026-07-10",
    views: 10_000,
    reach: 10_000,
    likes: 300,
    comments: 40,
    saves: 120,
    shares: 40,
    leadsAttributed: 12,
  };

  it("premia chi porta persone, non solo chi piace", () => {
    const piacevole: ContenutoGrezzo = {
      ...base,
      id: "p2",
      title: "Dietro le quinte",
      angle: "curiosità",
      likes: 900,
      comments: 60,
      saves: 40,
      shares: 20,
      leadsAttributed: 0,
    };

    const [primo] = valutaContenuti([piacevole, base]);
    assert.equal(primo.id, "p1");
  });

  it("calcola coinvolgimento e lead ogni mille visualizzazioni", () => {
    const [valutato] = valutaContenuti([base]);
    assert.equal(valutato.engagement, 0.05);
    assert.equal(valutato.leadPerMille, 1.2);
  });

  it("un contenuto senza copertura non produce divisioni per zero", () => {
    const [valutato] = valutaContenuti([{ ...base, views: 0, reach: 0 }]);
    assert.equal(valutato.engagement, null);
    assert.equal(valutato.leadPerMille, null);
    assert.equal(valutato.punteggio, 0);
  });

  it("dice cosa hanno in comune quelli che hanno funzionato", () => {
    const valutati = valutaContenuti([
      base,
      { ...base, id: "p2", angle: "autorità", format: "reel", leadsAttributed: 20 },
      { ...base, id: "p3", angle: "dolore", format: "carosello", leadsAttributed: 6 },
    ]);

    const { angoli, formati } = ricorrenzeVincenti(valutati, 3);
    assert.deepEqual(angoli[0], ["autorità", 2]);
    assert.deepEqual(formati[0], ["reel", 2]);
  });
});
