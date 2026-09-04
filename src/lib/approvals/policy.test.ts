import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AZIONI,
  ETICHETTE_CLASSE,
  calcolaScadenza,
  definizione,
  puoDecidere,
  puoEseguire,
  richiedeApprovazione,
  scaduta,
} from "./policy.ts";

const ADESSO = new Date("2026-09-04T09:00:00Z");

describe("catalogo delle azioni", () => {
  it("ogni azione dichiara chi la autorizza e cosa tocca", () => {
    for (const [nome, def] of Object.entries(AZIONI)) {
      assert.ok(def.ruoli.length > 0, `${nome} senza ruoli che possano autorizzarla`);
      assert.ok(def.sistemi.length > 0, `${nome} non dice cosa tocca`);
      assert.ok(def.descrizione.length > 20, `${nome} senza una descrizione utile`);
      assert.ok(ETICHETTE_CLASSE[def.classe], `${nome} con una classe sconosciuta`);
    }
  });

  it("le azioni che toccano prezzi e pazienti sono sensibili", () => {
    assert.equal(AZIONI.aggiorna_prezzo_servizio.classe, "sensitive");
    assert.equal(AZIONI.prepara_riattivazione.classe, "sensitive");
    assert.equal(AZIONI.pubblica_conoscenza.classe, "sensitive");
  });

  it("le azioni sensibili le autorizza solo la direzione", () => {
    for (const [nome, def] of Object.entries(AZIONI)) {
      if (def.classe !== "sensitive") continue;
      assert.deepEqual(
        def.ruoli.slice().sort(),
        ["admin", "owner"],
        `${nome} è sensibile ma non è riservata alla direzione`,
      );
    }
  });

  it("un'azione fuori catalogo non esiste", () => {
    assert.equal(definizione("cancella_tutto"), null);
    assert.equal(puoDecidere("owner", "cancella_tutto"), false);
  });
});

describe("quando serve un'approvazione", () => {
  it("leggere e proporre non la richiedono", () => {
    assert.equal(richiedeApprovazione("read"), false);
    assert.equal(richiedeApprovazione("suggest"), false);
  });

  it("fare qualcosa sì, reversibile o no", () => {
    assert.equal(richiedeApprovazione("reversible"), true);
    assert.equal(richiedeApprovazione("sensitive"), true);
  });
});

describe("chi può decidere", () => {
  it("la reception può creare un task ma non toccare un prezzo", () => {
    assert.equal(puoDecidere("reception", "crea_task"), true);
    assert.equal(puoDecidere("reception", "aggiorna_prezzo_servizio"), false);
  });

  it("il founder può tutto ciò che è in catalogo", () => {
    for (const nome of Object.keys(AZIONI)) {
      assert.equal(puoDecidere("owner", nome), true, `owner bloccato su ${nome}`);
    }
  });

  it("un paziente non decide niente", () => {
    for (const nome of Object.keys(AZIONI)) {
      assert.equal(puoDecidere("patient", nome), false, `paziente ammesso a ${nome}`);
    }
  });
});

describe("dall'approvazione all'esecuzione", () => {
  const valida = calcolaScadenza(ADESSO);

  it("una proposta autorizzata e fresca si può eseguire", () => {
    const esito = puoEseguire(
      { state: "approved", action: "crea_task", expiresAt: valida },
      "admin",
      ADESSO,
    );
    assert.deepEqual(esito, { ok: true });
  });

  it("una in attesa no, e lo dice", () => {
    const esito = puoEseguire(
      { state: "pending", action: "crea_task", expiresAt: valida },
      "owner",
      ADESSO,
    );
    assert.equal(esito.ok, false);
    assert.match(esito.ok === false ? esito.motivo : "", /autorizzata/);
  });

  it("una già eseguita non si esegue due volte", () => {
    const esito = puoEseguire(
      { state: "executed", action: "crea_task", expiresAt: valida },
      "owner",
      ADESSO,
    );
    assert.equal(esito.ok, false);
  });

  it("un'anteprima vecchia blocca l'esecuzione anche se autorizzata", () => {
    const vecchia = calcolaScadenza(new Date("2026-08-01T09:00:00Z"));
    const esito = puoEseguire(
      { state: "approved", action: "aggiorna_prezzo_servizio", expiresAt: vecchia },
      "owner",
      ADESSO,
    );
    assert.equal(esito.ok, false);
    assert.match(esito.ok === false ? esito.motivo : "", /vecchia/);
  });

  it("il ruolo si ricontrolla al momento di eseguire, non solo di approvare", () => {
    const esito = puoEseguire(
      { state: "approved", action: "aggiorna_prezzo_servizio", expiresAt: valida },
      "marketing",
      ADESSO,
    );
    assert.equal(esito.ok, false);
    assert.match(esito.ok === false ? esito.motivo : "", /ruolo/);
  });
});

describe("scadenza", () => {
  it("sette giorni dopo, l'anteprima non descrive più il presente", () => {
    const scadenzaCalcolata = calcolaScadenza(ADESSO);
    assert.equal(scaduta(scadenzaCalcolata, ADESSO), false);
    assert.equal(
      scaduta(scadenzaCalcolata, new Date("2026-09-12T09:00:00Z")),
      true,
    );
  });
});
