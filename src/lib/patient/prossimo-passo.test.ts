import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prossimiPassi, type StatoPaziente } from "./prossimo-passo.ts";

const OGGI = "2026-09-10";

/** Un paziente in regola: niente da fare. È il punto di partenza. */
function stato(patch: Partial<StatoPaziente> = {}): StatoPaziente {
  return {
    oggi: OGGI,
    fase: "program_active",
    giorniDaScore: 20,
    pilastriIncompleti: [],
    prossimaVisitaIso: "2026-10-01",
    visiteInProgramma: 1,
    questionariDaFare: [],
    documentiNonLetti: 0,
    messaggiNonLetti: 0,
    azioniDelPiano: [],
    creditiDisponibili: 0,
    giorniAllaScadenzaMembership: 200,
    pagamentiFalliti: 0,
    consensiMancanti: [],
    ...patch,
  };
}

describe("il prossimo passo del paziente", () => {
  it("quando non c'è niente da fare, non inventa niente", () => {
    const { principale, altri } = prossimiPassi(stato());
    assert.equal(principale, null);
    assert.deepEqual(altri, []);
  });

  it("ne esce uno solo in cima: dieci inviti non sono dieci opportunità", () => {
    const { principale, altri } = prossimiPassi(
      stato({
        pagamentiFalliti: 1,
        documentiNonLetti: 2,
        messaggiNonLetti: 1,
        creditiDisponibili: 4,
        visiteInProgramma: 0,
        prossimaVisitaIso: null,
      }),
    );
    assert.equal(principale?.id, "pagamento-fallito");
    assert.ok(altri.length > 0);
    assert.ok(altri.length <= 3);
    assert.ok(!altri.some((p) => p.id === principale?.id));
  });

  it("un pagamento fallito batte tutto il resto", () => {
    const { principale } = prossimiPassi(stato({ pagamentiFalliti: 2, documentiNonLetti: 5 }));
    assert.equal(principale?.id, "pagamento-fallito");
    assert.match(principale?.motivo ?? "", /2 pagamenti/);
  });

  it("la visita di domani viene prima di un referto nuovo", () => {
    const { principale } = prossimiPassi(
      stato({ prossimaVisitaIso: "2026-09-11", documentiNonLetti: 1 }),
    );
    assert.equal(principale?.id, "visita-imminente");
    assert.match(principale?.titolo ?? "", /Domani/);
  });

  it("una visita fra un mese non è imminente", () => {
    const { principale } = prossimiPassi(stato({ prossimaVisitaIso: "2026-10-10", documentiNonLetti: 1 }));
    assert.equal(principale?.id, "referti-nuovi");
  });

  it("il referto nuovo non interpreta niente: dice che c'è e chi lo guarda", () => {
    const { principale } = prossimiPassi(stato({ documentiNonLetti: 1 }));
    assert.equal(principale?.id, "referti-nuovi");
    assert.match(principale?.motivo ?? "", /validati dal tuo medico/);
  });

  it("un questionario scaduto sale a urgenza uno", () => {
    const { principale } = prossimiPassi(
      stato({ questionariDaFare: [{ id: "q1", titolo: "Qualità del sonno", scadeIl: "2026-09-05" }] }),
    );
    assert.equal(principale?.id, "questionario-q1");
    assert.equal(principale?.urgenza, 1);
    assert.match(principale?.motivo ?? "", /5 giorni fa/);
    assert.deepEqual(principale?.azione, {
      tipo: "vai",
      href: "/questionari/q1",
      etichetta: "Inizia",
    });
  });

  it("un questionario senza scadenza resta un invito, non una scadenza", () => {
    const { principale } = prossimiPassi(
      stato({ questionariDaFare: [{ id: "q2", titolo: "Stile di vita", scadeIl: null }] }),
    );
    assert.equal(principale?.urgenza, 2);
    assert.match(principale?.motivo ?? "", /nessun esame misura/);
  });

  it("chi non ha mai fatto lo Score viene invitato a farlo", () => {
    const { principale } = prossimiPassi(stato({ giorniDaScore: null, fase: "first_visit_booked" }));
    assert.equal(principale?.id, "primo-score");
  });

  it("lo Score si ripropone prima della scadenza, per lasciare il tempo di prenotare", () => {
    // La rivalutazione è a 120 giorni: a 95 il suggerimento c'è già.
    assert.equal(prossimiPassi(stato({ giorniDaScore: 95 })).principale?.id, "ripeti-score");
    assert.equal(prossimiPassi(stato({ giorniDaScore: 60 })).principale, null);
  });

  it("lo Score in ritardo diventa urgente", () => {
    assert.equal(prossimiPassi(stato({ giorniDaScore: 95 })).principale?.urgenza, 2);
    assert.equal(prossimiPassi(stato({ giorniDaScore: 160 })).principale?.urgenza, 1);
  });

  it("la membership scaduta si dice per quello che è", () => {
    const { principale } = prossimiPassi(stato({ giorniAllaScadenzaMembership: -4 }));
    assert.equal(principale?.id, "membership-in-scadenza");
    assert.match(principale?.titolo ?? "", /è scaduta/);
    assert.match(principale?.motivo ?? "", /4 giorni/);
  });

  it("crediti fermi e nessuna visita: un invito quieto, non un allarme", () => {
    const { principale } = prossimiPassi(
      stato({ creditiDisponibili: 6, visiteInProgramma: 0, prossimaVisitaIso: null }),
    );
    assert.equal(principale?.id, "crediti-da-usare");
    assert.equal(principale?.urgenza, 3);
  });

  it("con crediti ma una visita già fissata non insiste", () => {
    const { principale } = prossimiPassi(stato({ creditiDisponibili: 6, visiteInProgramma: 1 }));
    assert.equal(principale, null);
  });

  it("i consensi mancanti si chiedono subito, e si dice quali", () => {
    const { principale } = prossimiPassi(stato({ consensiMancanti: ["informativa privacy"] }));
    assert.equal(principale?.id, "consensi");
    assert.match(principale?.motivo ?? "", /informativa privacy/);
  });

  it("ogni passo porta da qualche parte", () => {
    const { principale, altri } = prossimiPassi(
      stato({
        documentiNonLetti: 1,
        messaggiNonLetti: 1,
        giorniDaScore: 200,
        pilastriIncompleti: ["Nutrition"],
        azioniDelPiano: [{ id: "a1", titolo: "Camminare 30 minuti", scadeIl: null }],
      }),
    );
    for (const passo of [principale, ...altri]) {
      assert.ok(passo);
      assert.equal(passo.azione.tipo, "vai");
      if (passo.azione.tipo === "vai") {
        assert.match(passo.azione.href, /^\//);
        assert.ok(passo.azione.etichetta.length > 0);
      }
      assert.ok(passo.motivo.length > 0, `${passo.id} senza motivo`);
    }
  });
});
