import { test } from "node:test";
import assert from "node:assert/strict";
import { frammenta } from "./frammenti.ts";

/**
 * Il frammentatore.
 *
 * È logica pura, e quindi si prova per intero senza database. Vale la
 * pena elencare cosa si sta davvero verificando, perché un test che
 * conta i frammenti non dice niente: quello che conta è che **un valore
 * di laboratorio non si spezzi in due**, che una citazione porti la
 * pagina giusta, e che un documento di rumore non produca mille righe
 * in tabella.
 */

test("un testo vuoto non produce frammenti", () => {
  assert.deepEqual(frammenta(""), []);
  assert.deepEqual(frammenta(null), []);
  assert.deepEqual(frammenta("   \n\n  "), []);
});

test("un referto corto resta un frammento solo", () => {
  const testo =
    "Referto di laboratorio del 12 agosto 2026.\n\n" +
    "Colesterolo LDL: 118 mg/dL. Glicemia a digiuno: 92 mg/dL.";

  const f = frammenta(testo);
  assert.equal(f.length, 1);
  assert.match(f[0].testo, /Colesterolo LDL: 118 mg\/dL/);
  assert.equal(f[0].ordinale, 0);
});

test("le righe troppo corte per dire qualcosa non entrano", () => {
  // Numero di pagina, sigla, riga di intestazione: rumore.
  assert.deepEqual(frammenta("Pag. 3"), []);
});

test("i capoversi non si spezzano a metà", () => {
  const valore = "Colesterolo LDL: 118 mg/dL, in calo rispetto al precedente.";
  const riempitivo = "Nota clinica di contorno senza valori misurati. ".repeat(12);

  const f = frammenta(`${riempitivo}\n\n${valore}`, { massimo: 300 });

  // Il capoverso con il valore compare intero in almeno un frammento:
  // è la garanzia che rende utile la ricerca.
  assert.ok(
    f.some((x) => x.testo.includes(valore)),
    "il capoverso con il valore è stato spezzato",
  );
});

test("la sovrapposizione ripete la coda del frammento precedente", () => {
  const a = "Primo capoverso, che parla della tiroide in modo esteso. ".repeat(4);
  const b = "Secondo capoverso, che parla di tutt'altro. ".repeat(4);

  const f = frammenta(`${a.trim()}\n\n${b.trim()}`, {
    massimo: 200,
    sovrapposizione: 60,
  });

  assert.ok(f.length > 1, "il testo doveva produrre più frammenti");

  // La coda del primo ricompare in testa al secondo: una frase a
  // cavallo dei due resta cercabile.
  const codaPrimo = f[0].testo.slice(-30);
  const parole = codaPrimo.split(" ").filter((p) => p.length > 3);
  assert.ok(
    parole.some((p) => f[1].testo.startsWith(p) || f[1].testo.includes(p)),
    "nessuna sovrapposizione fra il primo e il secondo frammento",
  );
});

test("le pagine si riconoscono dall'interruzione di pagina", () => {
  const f = frammenta(
    "Prima pagina del referto, con abbastanza testo per contare.\f" +
      "Seconda pagina del referto, con abbastanza testo per contare.",
  );

  assert.equal(f.length, 2);
  assert.equal(f[0].pagina, 1);
  assert.equal(f[1].pagina, 2);
});

test("senza interruzioni la pagina resta ignota invece di essere inventata", () => {
  const f = frammenta("Un referto in un formato che non dichiara le pagine, abbastanza lungo.");
  assert.equal(f.length, 1);
  assert.equal(f[0].pagina, null);
});

test("una pagina vuota non produce un frammento vuoto", () => {
  const f = frammenta("Testo della prima pagina, sufficientemente lungo.\f\f\f");
  assert.equal(f.length, 1);
  assert.equal(f[0].pagina, 1);
});

test("una frase senza punteggiatura si taglia comunque", () => {
  // È il caso dell'OCR che non riconosce i punti: non ci sono confini
  // da rispettare, e senza questo ramo il frammento sarebbe lunghissimo.
  const muro = "parola ".repeat(400);
  const f = frammenta(muro, { massimo: 200 });

  assert.ok(f.length > 1);
  for (const x of f) {
    assert.ok(x.testo.length <= 200, `frammento da ${x.testo.length} caratteri`);
  }
});

test("il tetto sul numero di frammenti si rispetta", () => {
  const rumore = Array.from({ length: 500 }, (_, i) => `Riga numero ${i} del documento scansionato male.`).join(
    "\n\n",
  );

  const f = frammenta(rumore, { massimo: 60, massimoFrammenti: 20 });
  assert.equal(f.length, 20);
});

test("gli ordinali sono progressivi e senza buchi, anche fra pagine", () => {
  const pagina = "Testo di una pagina del referto, abbastanza lungo da contare. ".repeat(3);
  const f = frammenta(`${pagina}\f${pagina}\f${pagina}`, { massimo: 200 });

  assert.ok(f.length >= 3);
  f.forEach((x, i) => assert.equal(x.ordinale, i));
});

test("gli spazi doppi e le tabulazioni non arrivano in tabella", () => {
  const f = frammenta("Colesterolo   LDL:\t118    mg/dL, misurato in agosto duemilaventisei.");
  assert.equal(f.length, 1);
  assert.equal(f[0].testo, "Colesterolo LDL: 118 mg/dL, misurato in agosto duemilaventisei.");
});

test("nessun frammento supera mai il massimo, sovrapposizione compresa", () => {
  /*
   * L'invariante che il primo giro sbagliava.
   *
   * La coda del frammento precedente si sommava al blocco successivo
   * senza che nessuno controllasse il totale: con il massimo a 200 e la
   * sovrapposizione a 120 uscivano frammenti da 317 caratteri. Non è un
   * dettaglio estetico — il frammento è ciò che finisce nel prompt di un
   * modello, e un tetto che non tiene è un costo che non si prevede.
   */
  const testi = [
    "parola ".repeat(400),
    Array.from({ length: 40 }, (_, i) => `Capoverso numero ${i}, di lunghezza media.`).join("\n\n"),
    "Frase corta. ".repeat(80),
    "Referto senza struttura ma con qualche punto. ".repeat(30),
  ];

  for (const massimo of [80, 150, 200, 500]) {
    for (const testo of testi) {
      for (const f of frammenta(testo, { massimo })) {
        assert.ok(
          f.testo.length <= massimo,
          `massimo ${massimo}: uscito un frammento da ${f.testo.length}`,
        );
      }
    }
  }
});
