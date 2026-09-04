import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CATEGORIE_ATTENZIONE,
  GIORNI_ANOMALIA_RECENTE,
  contaPerCategoria,
  pazientiDaGuardare,
  segnaliAttenzione,
  segnaliDelPaziente,
  type FattiAttenzione,
} from "./attenzione.ts";

const OGGI = "2026-09-10";

function fatti(over: Partial<FattiAttenzione> = {}): FattiAttenzione {
  return {
    oggi: OGGI,
    proposte: [],
    documenti: [],
    anomalie: [],
    visite: [],
    pazienti: [],
    task: [],
    messaggi: [],
    ...over,
  };
}

function proposta(over: Partial<FattiAttenzione["proposte"][number]> = {}) {
  return {
    id: "p1",
    patientId: "paz-1",
    patientName: "Mario Rossi",
    documentId: "doc-1",
    documentTitle: "Pannello ematico",
    label: "Emoglobina glicata",
    createdAt: "2026-09-09T08:00:00Z",
    fuoriSoglia: false,
    ...over,
  };
}

describe("un fatto, un segnale", () => {
  it("raggruppa nove valori dello stesso referto in una riga sola", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: Array.from({ length: 9 }, (_, i) =>
          proposta({ id: `p${i}`, label: `Metrica ${i}` }),
        ),
      }),
    );

    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "risultato");
    assert.match(segnali[0].titolo, /9 valori/);
  });

  it("separa i referti diversi dello stesso paziente", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [
          proposta({ id: "a", documentId: "doc-1" }),
          proposta({ id: "b", documentId: "doc-2", documentTitle: "Body scan" }),
        ],
      }),
    );

    assert.equal(segnali.length, 2);
  });

  it("raggruppa per paziente le proposte senza documento", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [
          proposta({ id: "a", documentId: null, documentTitle: null }),
          proposta({ id: "b", documentId: null, documentTitle: null, label: "Glicemia" }),
        ],
      }),
    );

    assert.equal(segnali.length, 1);
  });
});

describe("un segnale forte assorbe uno debole", () => {
  it("non produce «risultati nuovi» per un referto che ha già una criticità", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [
          proposta({ id: "a", fuoriSoglia: true, label: "Glicemia" }),
          proposta({ id: "b", fuoriSoglia: false, label: "Colesterolo" }),
        ],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "criticita");
    // Il valore assorbito resta citato: sparisce la riga, non il fatto.
    assert.ok(segnali[0].motivo.join(" ").includes("Glicemia"));
  });

  it("nasconde il referto quando i suoi valori sono già in coda", () => {
    const segnali = segnaliAttenzione(
      fatti({
        documenti: [
          {
            id: "doc-1",
            patientId: "paz-1",
            patientName: "Mario Rossi",
            title: "Pannello ematico",
            createdAt: "2026-09-09T08:00:00Z",
            reviewState: "pending",
            proposteInAttesa: 4,
          },
        ],
      }),
    );

    assert.equal(segnali.length, 0);
  });

  it("mostra il referto che il motore non ha saputo leggere", () => {
    const segnali = segnaliAttenzione(
      fatti({
        documenti: [
          {
            id: "doc-1",
            patientId: "paz-1",
            patientName: "Mario Rossi",
            title: "Risonanza lombare",
            createdAt: "2026-09-09T08:00:00Z",
            reviewState: "pending",
            proposteInAttesa: 0,
          },
        ],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "documento");
  });

  it("non segnala un referto già revisionato", () => {
    const segnali = segnaliAttenzione(
      fatti({
        documenti: [
          {
            id: "doc-1",
            patientId: "paz-1",
            patientName: "Mario Rossi",
            title: "Risonanza lombare",
            createdAt: "2026-09-01T08:00:00Z",
            reviewState: "reviewed",
            proposteInAttesa: 0,
          },
        ],
      }),
    );

    assert.equal(segnali.length, 0);
  });

  it("preferisce il reassessment al percorso fermo, mai entrambi", () => {
    const segnali = segnaliAttenzione(
      fatti({
        pazienti: [
          {
            patientId: "paz-1",
            patientName: "Anna Bianchi",
            giorniDaPunteggio: 200,
            giorniPercorsoFermo: 90,
            pilastriMancanti: [],
            membershipAttiva: true,
          },
        ],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "reassessment");
  });

  it("segnala il percorso fermo quando lo Score è recente", () => {
    const segnali = segnaliAttenzione(
      fatti({
        pazienti: [
          {
            patientId: "paz-1",
            patientName: "Anna Bianchi",
            giorniDaPunteggio: 10,
            giorniPercorsoFermo: 90,
            pilastriMancanti: [],
            membershipAttiva: true,
          },
        ],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "follow_up");
  });
});

describe("il confine clinico", () => {
  it("dichiara che un valore fuori soglia richiede un medico", () => {
    const segnali = segnaliAttenzione(
      fatti({ proposte: [proposta({ fuoriSoglia: true })] }),
    );

    assert.equal(segnali[0].richiedeMedico, true);
  });

  it("non lo dichiara per un valore che chiunque può confermare", () => {
    const segnali = segnaliAttenzione(fatti({ proposte: [proposta()] }));
    assert.equal(segnali[0].richiedeMedico, false);
  });

  it("tiene fuori i messaggi amministrativi: li risponde la reception", () => {
    const segnali = segnaliAttenzione(
      fatti({
        messaggi: [
          {
            threadId: "t1",
            patientId: "paz-1",
            patientName: "Mario Rossi",
            oggetto: "Fattura di agosto",
            ultimoIl: "2026-09-09T08:00:00Z",
            nonLetti: 2,
            categoria: "administrative",
          },
        ],
      }),
    );

    assert.equal(segnali.length, 0);
  });
});

describe("le visite", () => {
  const visita = {
    id: "v1",
    patientId: "paz-1",
    patientName: "Mario Rossi",
    servizio: "Visita di controllo",
    iniziaAlle: "2026-09-09T09:00:00Z",
    stato: "confirmed",
    oggi: false,
    passata: true,
    preparata: false,
  };

  it("mette in cima una visita di ieri senza esito", () => {
    const segnali = segnaliAttenzione(fatti({ visite: [visita] }));
    assert.equal(segnali[0].categoria, "visita");
    assert.equal(segnali[0].priorita, 1);
  });

  it("non segnala una visita già completata", () => {
    const segnali = segnaliAttenzione(
      fatti({ visite: [{ ...visita, stato: "completed" }] }),
    );
    assert.equal(segnali.length, 0);
  });

  it("non segnala una visita disdetta", () => {
    const segnali = segnaliAttenzione(
      fatti({ visite: [{ ...visita, stato: "cancelled" }] }),
    );
    assert.equal(segnali.length, 0);
  });

  it("chiede di preparare una visita di oggi che non ha una sintesi", () => {
    const segnali = segnaliAttenzione(
      fatti({
        visite: [{ ...visita, passata: false, oggi: true, iniziaAlle: `${OGGI}T16:00:00Z` }],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.match(segnali[0].titolo, /preparare/);
  });

  it("tace su una visita di oggi già preparata", () => {
    const segnali = segnaliAttenzione(
      fatti({
        visite: [
          { ...visita, passata: false, oggi: true, preparata: true, iniziaAlle: `${OGGI}T16:00:00Z` },
        ],
      }),
    );

    assert.equal(segnali.length, 0);
  });
});

describe("le anomalie invecchiano", () => {
  const anomalia = {
    patientId: "paz-1",
    patientName: "Mario Rossi",
    metrica: "Colesterolo LDL",
    valore: "182 mg/dL",
    misurataIl: "2026-08-20",
  };

  it("segnala un valore fuori range recente", () => {
    const segnali = segnaliAttenzione(fatti({ anomalie: [anomalia] }));
    assert.equal(segnali.length, 1);
    assert.equal(segnali[0].categoria, "anomalia");
  });

  it("smette dopo la finestra: a quel punto è storia clinica", () => {
    const vecchia = { ...anomalia, misurataIl: "2025-01-10" };
    const segnali = segnaliAttenzione(fatti({ anomalie: [vecchia] }));
    assert.equal(segnali.length, 0);
    assert.ok(GIORNI_ANOMALIA_RECENTE < 365);
  });

  it("raccoglie in una riga sola le anomalie dello stesso paziente", () => {
    const segnali = segnaliAttenzione(
      fatti({
        anomalie: [anomalia, { ...anomalia, metrica: "Trigliceridi", valore: "240 mg/dL" }],
      }),
    );

    assert.equal(segnali.length, 1);
    assert.match(segnali[0].titolo, /2 valori/);
  });
});

describe("i task", () => {
  const base = {
    id: "t1",
    titolo: "Richiamare per il referto",
    patientId: "paz-1",
    patientName: "Mario Rossi",
    scadenzaIl: null as string | null,
    priorita: 2,
    origine: "professional",
    assegnatarioId: null as string | null,
    assegnatario: null as string | null,
    creatoIl: "2026-09-01T08:00:00Z",
  };

  it("alza a priorità massima ciò che è scaduto", () => {
    const segnali = segnaliAttenzione(
      fatti({ task: [{ ...base, scadenzaIl: "2026-09-01" }] }),
    );

    assert.equal(segnali[0].priorita, 1);
    assert.match(segnali[0].motivo[0], /Scaduto da 9 giorni/);
  });

  it("dice quando un task viene dal Brain", () => {
    const segnali = segnaliAttenzione(
      fatti({ task: [{ ...base, origine: "brain" }] }),
    );

    assert.ok(segnali[0].motivo.some((m) => m.includes("Brain")));
  });

  it("conserva l'incaricato", () => {
    const segnali = segnaliAttenzione(
      fatti({ task: [{ ...base, assegnatarioId: "prof-1", assegnatario: "Dott.ssa Neri" }] }),
    );

    assert.equal(segnali[0].assegnatario, "Dott.ssa Neri");
  });
});

describe("ordinamento e raggruppamento", () => {
  it("mette la priorità alta prima, e fra pari il fatto più vecchio", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [
          proposta({ id: "a", documentId: "doc-1", createdAt: "2026-09-09T08:00:00Z" }),
          proposta({
            id: "b",
            documentId: "doc-2",
            createdAt: "2026-09-02T08:00:00Z",
            patientId: "paz-2",
            patientName: "Anna Bianchi",
          }),
          proposta({ id: "c", documentId: "doc-3", fuoriSoglia: true, patientId: "paz-3" }),
        ],
      }),
    );

    assert.equal(segnali[0].categoria, "criticita");
    assert.equal(segnali[1].patientName, "Anna Bianchi");
  });

  it("raggruppa per paziente ordinando per gravità, non per quantità", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [proposta({ patientId: "grave", fuoriSoglia: true, documentId: "d1" })],
        task: [
          {
            id: "t1",
            titolo: "Uno",
            patientId: "molti",
            patientName: "Chi ha tanti task",
            scadenzaIl: null,
            priorita: 3,
            origine: "professional",
            assegnatarioId: null,
            assegnatario: null,
            creatoIl: "2026-09-01T08:00:00Z",
          },
          {
            id: "t2",
            titolo: "Due",
            patientId: "molti",
            patientName: "Chi ha tanti task",
            scadenzaIl: null,
            priorita: 3,
            origine: "professional",
            assegnatarioId: null,
            assegnatario: null,
            creatoIl: "2026-09-01T08:00:00Z",
          },
        ],
      }),
    );

    const pazienti = pazientiDaGuardare(segnali);
    assert.equal(pazienti[0].patientId, "grave");
    assert.equal(pazienti[0].segnali.length, 1);
    assert.equal(pazienti[1].segnali.length, 2);
  });

  it("filtra i segnali di un paziente solo", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [
          proposta({ documentId: "d1", patientId: "paz-1" }),
          proposta({ documentId: "d2", patientId: "paz-2", patientName: "Anna" }),
        ],
      }),
    );

    assert.equal(segnaliDelPaziente(segnali, "paz-1").length, 1);
  });

  it("conta ogni categoria, anche quelle vuote", () => {
    const conti = contaPerCategoria(
      segnaliAttenzione(fatti({ proposte: [proposta({ fuoriSoglia: true })] })),
    );

    assert.equal(conti.length, CATEGORIE_ATTENZIONE.length);
    const criticita = conti.find((c) => c.categoria === "criticita");
    assert.equal(criticita?.totale, 1);
    assert.equal(criticita?.urgenti, 1);
    assert.equal(conti.find((c) => c.categoria === "task")?.totale, 0);
  });

  it("non produce due righe con lo stesso id", () => {
    const segnali = segnaliAttenzione(
      fatti({
        proposte: [proposta({ id: "a" }), proposta({ id: "b" })],
        anomalie: [
          {
            patientId: "paz-1",
            patientName: "Mario Rossi",
            metrica: "LDL",
            valore: "180",
            misurataIl: "2026-09-01",
          },
        ],
      }),
    );

    const ids = segnali.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
