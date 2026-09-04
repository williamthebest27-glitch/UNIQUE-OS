import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { controllaContenuto, pubblicabile } from "./regole-brand.ts";

const regole = (testo: string, contesto = {}) =>
  controllaContenuto(testo, contesto).map((s) => s.regola);

describe("quello che una clinica non può scrivere", () => {
  it("nessuna promessa di guarigione", () => {
    assert.ok(regole("Il nostro percorso guarisce l'insulino-resistenza.").includes("promessa di guarigione"));
    assert.equal(pubblicabile(controllaContenuto("Un percorso che guarisce")), false);
  });

  it("nessuna prevenzione garantita", () => {
    assert.ok(regole("Previeni il diabete con il Longevity Score.").includes("prevenzione garantita"));
    assert.ok(regole("Un percorso senza rischi.").includes("prevenzione garantita"));
  });

  it("nessuna diagnosi promessa in un post", () => {
    assert.ok(regole("Scopri se hai una sindrome metabolica in dieci minuti.").includes("diagnosi in un contenuto"));
  });

  it("nessun confronto con altri centri", () => {
    assert.ok(regole("A differenza degli altri centri, noi misuriamo.").includes("confronto con altri centri"));
    assert.ok(regole("L'unico centro in Lombardia che lo fa.").includes("confronto con altri centri"));
  });

  it("nessuna urgenza inventata", () => {
    assert.ok(regole("Ultimi posti disponibili, affrettati!").includes("urgenza artificiale"));
  });

  it("e questi sono blocchi, non consigli", () => {
    const s = controllaContenuto("Guarigione garantita, ultimi posti");
    assert.ok(s.every((x) => x.gravita === "blocco"));
    assert.equal(pubblicabile(s), false);
  });
});

describe("quello che va guardato prima di pubblicare", () => {
  it("i superlativi non bloccano ma si segnalano", () => {
    const s = controllaContenuto("Il migliore percorso di longevità.");
    assert.equal(s[0].regola, "superlativo assoluto");
    assert.equal(s[0].gravita, "attenzione");
    assert.equal(pubblicabile(s), true);
  });

  it("un risultato promesso entro una data è una promessa clinica travestita", () => {
    assert.ok(regole("In 30 giorni vedrai i primi risultati sul metabolismo.").includes("promessa a tempo"));
  });

  it("una percentuale senza fonte", () => {
    assert.ok(regole("Il 42% delle persone ha carenza di vitamina D.").includes("percentuale senza fonte"));
  });

  it("ma con la fonte accanto va bene", () => {
    assert.ok(
      !regole("Secondo uno studio pubblicato su Lancet, il 42% ha carenza di vitamina D.").includes(
        "percentuale senza fonte",
      ),
    );
  });

  it("le emoji non sono punteggiatura", () => {
    assert.ok(regole("Prenota la tua visita 🚀").includes("emoji a fine riga"));
  });
});

describe("una sola call to action", () => {
  it("due chiamate diverse sono zero chiamate", () => {
    assert.ok(
      regole("Prenota il tuo Score. Oppure scrivici in direct.").includes("più di una call to action"),
    );
  });

  it("una sola, ripetuta, va benissimo", () => {
    assert.ok(
      !regole("Prenota il tuo Longevity Score. Prenota adesso.").includes("più di una call to action"),
    );
  });
});

describe("i prezzi vengono dal listino", () => {
  const listino = { prezziAmmessiCents: [14900, 20000, 12000] };

  it("un prezzo che non c'è è un blocco", () => {
    const s = controllaContenuto("Il Longevity Score costa 129 €.", listino);
    assert.equal(s[0].regola, "prezzo fuori listino");
    assert.equal(s[0].gravita, "blocco");
  });

  it("un prezzo in listino passa", () => {
    assert.deepEqual(regole("Il Longevity Score costa 149 €.", listino), []);
  });

  it("legge i prezzi scritti in ogni modo", () => {
    assert.deepEqual(regole("Costa 149 euro.", listino), []);
    assert.deepEqual(regole("A 200 € la consulenza.", listino), []);
  });

  it("senza listino non si pronuncia sui prezzi", () => {
    assert.deepEqual(regole("Costa 129 €."), []);
  });
});

describe("lunghezza", () => {
  it("segnala quando il formato è più corto del testo", () => {
    const lungo = "parola ".repeat(200);
    assert.ok(regole(lungo, { massimoCaratteri: 300 }).includes("troppo lungo per il formato"));
  });
});

describe("un contenuto pulito non produce rumore", () => {
  it("nessuna segnalazione su un testo che rispetta le regole", () => {
    const testo = [
      "Il tuo corpo ti manda segnali che un check-up standard non misura.",
      "",
      "L'Unique Longevity Score mette insieme trentadue parametri in un numero solo, e lo rimisura ogni sei mesi.",
      "",
      "Non è una diagnosi: è una misura, e serve a capire dove intervenire.",
      "",
      "Prenota il tuo Longevity Score.",
    ].join("\n");

    assert.deepEqual(controllaContenuto(testo, { prezziAmmessiCents: [14900] }), []);
  });
});
