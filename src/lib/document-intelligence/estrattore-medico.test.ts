import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estraiDatiClinici } from "./estrattore-medico.ts";
import type { ContenutoEstratto } from "./tipi.ts";

/**
 * Chi ha firmato il referto.
 *
 * Un'estrazione a espressioni regolari è esattamente il genere di codice
 * che va provato: funziona sui tre casi che si sono guardati scrivendola
 * e sbaglia sul quarto, e quando sbaglia mette il nome di una persona
 * accanto a dei valori che non ha firmato.
 *
 * La promessa che questi test difendono è quella negativa: **quando non
 * si legge, resta null.** Un nome plausibile dedotto da una riga ambigua
 * entrerebbe in cartella come fatto, e un fatto sbagliato non lo
 * ricontrolla nessuno proprio perché sembra normale.
 */

const OGGI = "2026-09-07";

function contenuto(testo: string): ContenutoEstratto {
  const righe = testo.split("\n").filter((r) => r.trim().length > 0);

  return {
    formato: "pdf",
    leggibile: true,
    testo,
    blocchi: righe.map((r) => ({ tipo: "paragrafo" as const, testo: r, pagina: 1 })),
    tabelle: [],
    pagine: 1,
    via: "nativo",
    metadati: {},
    fiduciaTesto: 1,
  };
}

function medicoDi(testo: string): string | null {
  return estraiDatiClinici(contenuto(testo), { oggi: OGGI }).medico;
}

describe("il medico firmatario", () => {
  it("legge l'etichetta esplicita", () => {
    assert.equal(
      medicoDi("Referto\n\nMedico refertante: Dott.ssa Chiara Neri\n"),
      "Chiara Neri",
    );
  });

  it("legge la firma digitale", () => {
    assert.equal(
      medicoDi("Esito\n\nFirmato digitalmente da Prof. Marco Vallone Rossi\n"),
      "Marco Vallone Rossi",
    );
  });

  it("legge il direttore sanitario", () => {
    assert.equal(
      medicoDi("Analisi\n\nIl Direttore Sanitario: Dr. Andrea Lombardi\n"),
      "Andrea Lombardi",
    );
  });

  /*
   * La ragione per cui si cerca in fondo e non in cima.
   *
   * In un referto di laboratorio il primo «Dott.» è quasi sempre il
   * medico *richiedente* — un'altra persona, con un altro ruolo.
   * Attribuirgli una firma che non ha messo è peggio che lasciare il
   * campo vuoto.
   */
  it("non scambia il richiedente per il firmatario", () => {
    const referto = [
      "LABORATORIO SAN MARCO",
      "Medico richiedente: Dott. Alessandro Conti",
      "Paziente: Rossi Mario",
      "",
      "Glicemia 102 mg/dL",
      "",
      "Dott.ssa Chiara Neri",
    ].join("\n");

    assert.equal(medicoDi(referto), "Chiara Neri");
  });

  it("prende la firma in fondo quando non c'è un'etichetta", () => {
    const referto = [
      "CENTRO DIAGNOSTICO",
      "Paziente: Bianchi Anna",
      "Emocromo nella norma.",
      "",
      "Dott. Paolo Rinaldi",
      "Specialista in Medicina Interna",
    ].join("\n");

    assert.equal(medicoDi(referto), "Paolo Rinaldi");
  });

  it("resta null quando nessuno ha firmato", () => {
    assert.equal(
      medicoDi("LABORATORIO SAN MARCO\nPaziente: Rossi Mario\nGlicemia 102 mg/dL\n"),
      null,
    );
  });

  it("resta null su un titolo senza nome", () => {
    assert.equal(medicoDi("Referto\n\nIl Medico:\n\n\n"), null);
  });

  it("non prende una riga lunghissima per un nome", () => {
    const testo =
      "Firmato da " + "A".repeat(200) + "\n";
    assert.equal(medicoDi(testo), null);
  });

  it("non confonde la struttura con la persona", () => {
    const esito = estraiDatiClinici(
      contenuto(
        [
          "LABORATORIO ANALISI CLINICHE SAN MARCO",
          "Paziente: Rossi Mario",
          "Glicemia 102 mg/dL",
          "Medico refertante: Dott. Luca Barbieri",
        ].join("\n"),
      ),
      { oggi: OGGI },
    );

    assert.equal(esito.medico, "Luca Barbieri");
    assert.match(esito.laboratorio ?? "", /LABORATORIO ANALISI CLINICHE SAN MARCO/);
  });
});
