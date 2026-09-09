import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compositore } from "./attraversamento.ts";

/**
 * L'attraversamento è una funzione pura del progresso, e questo file è
 * il posto in cui lo si può dimostrare senza un browser.
 *
 * I numeri attesi non sono stati inventati qui: sono stati **letti dalla
 * pagina viva** prima del rifacimento, con la vecchia timeline di GSAP
 * ancora al suo posto, a 375×812 e a scorrimenti noti. Se un giorno una
 * modifica sposta anche solo un decimale, questi test dicono di quanto e
 * su quale elemento — che è l'unico modo di rifare un motore
 * d'animazione senza cambiare l'animazione.
 */

interface Finto {
  style: Record<string, string>;
}

/** Una radice finta: undici elementi, ciascuno con il suo `style`. */
function palco() {
  const nodi = new Map<string, Finto>();
  const radice = {
    querySelector(selettore: string) {
      // "[data-marchio]" → "marchio"
      const chiave = selettore.slice(6, -1);
      let nodo = nodi.get(chiave);
      if (!nodo) {
        nodo = { style: {} };
        nodi.set(chiave, nodo);
      }
      return nodo;
    },
  };
  return { radice: radice as unknown as HTMLElement, nodi };
}

/** Lo stesso scorrimento che la sonda usava sulla pagina viva. */
const p200 = 200 / 812;
const p400 = 400 / 812;
const p600 = 600 / 812;

describe("l'attraversamento sul telefono", () => {
  it("a riposo non muove e non spegne niente", () => {
    const { radice, nodi } = palco();
    compositore(radice, "telefono").disegna(0);

    assert.equal(nodi.get("marchio")!.style.transform, "translate3d(0,0.00px,0) scale(1.0000)");
    assert.equal(nodi.get("marchio")!.style.opacity, "1.000");
    assert.equal(nodi.get("titolo")!.style.opacity, "1.000");
    assert.equal(nodi.get("comandi")!.style.opacity, "1.000");
    assert.equal(nodi.get("sotto")!.style.opacity, "1.000");
    // Le due gomme bianche partono invisibili: il piano è sotto ai piedi
    // e il cuore è a scala zero.
    assert.equal(nodi.get("suolo")!.style.transform, "translate3d(0,0.000%,0)");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(0.0000)");
    assert.equal(nodi.get("buio")!.style.opacity, "0.000");
  });

  it("a un quarto di corsa disegna quello che disegnava prima", () => {
    const { radice, nodi } = palco();
    compositore(radice, "telefono").disegna(p200);

    // Letti sulla pagina viva a scrollY 200: marchio 2.24 · y −15.52 ·
    // opacità 0.483; rete 1.28 · y −20.69; titolo 0.92 · opacità 0.583.
    assert.equal(nodi.get("marchio")!.style.transform, "translate3d(0,-15.52px,0) scale(2.2414)");
    assert.equal(nodi.get("marchio")!.style.opacity, "0.483");
    assert.equal(nodi.get("rete")!.style.transform, "translate3d(0,-20.69px,0) scale(1.2845)");
    assert.equal(nodi.get("titolo")!.style.transform, "translate3d(0,-17.524%,0) scale(0.9249)");
    assert.equal(nodi.get("titolo")!.style.opacity, "0.583");
    assert.equal(nodi.get("sotto")!.style.transform, "translate3d(0,-36.21px,0)");
    assert.equal(nodi.get("stato")!.style.transform, "translate3d(0,20.69px,0)");
    // La figura si avvicina per tutta la scena e non si spegne ancora.
    assert.equal(nodi.get("figura")!.style.transform, "translate3d(0,-1.478%,0) scale(1.0542)");
    assert.equal(nodi.get("figura")!.style.opacity, "1.000");
    // Il piano di luce sale con `power1.in`: a un quarto di corsa è
    // ancora quasi fermo.
    assert.equal(nodi.get("suolo")!.style.transform, "translate3d(0,-14.268%,0)");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(0.0121)");
    assert.equal(nodi.get("buio")!.style.opacity, "0.000");
  });

  it("a metà corsa la testa della scena è già passata", () => {
    const { radice, nodi } = palco();
    compositore(radice, "telefono").disegna(p400);

    // Le battute in testa finiscono a 0.476 di progresso: da lì in poi
    // restano il corpo, il cuore e il buio. Era così anche prima.
    assert.equal(nodi.get("marchio")!.style.opacity, "0.000");
    assert.equal(nodi.get("sotto")!.style.opacity, "0.000");
    assert.equal(nodi.get("comandi")!.style.opacity, "0.000");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(0.7158)");
    assert.equal(nodi.get("figura")!.style.opacity, "1.000");
    assert.equal(nodi.get("buio")!.style.opacity, "0.000");
  });

  it("verso la fine il corpo si spegne e il buio si chiude", () => {
    const { radice, nodi } = palco();
    compositore(radice, "telefono").disegna(p600);

    // Letti sulla pagina viva a scrollY 600: figura 0.528, buio 0.452.
    assert.equal(nodi.get("figura")!.style.opacity, "0.528");
    assert.equal(nodi.get("buio")!.style.opacity, "0.452");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(2.5033)");
  });

  it("in fondo alla corsa arriva dove arrivava", () => {
    const { radice, nodi } = palco();
    compositore(radice, "telefono").disegna(1);

    assert.equal(nodi.get("rete")!.style.transform, "translate3d(0,-40.00px,0) scale(1.5500)");
    assert.equal(nodi.get("marchio")!.style.transform, "translate3d(0,-30.00px,0) scale(3.4000)");
    assert.equal(nodi.get("titolo")!.style.transform, "translate3d(0,-42.000%,0) scale(0.8200)");
    assert.equal(nodi.get("figura")!.style.transform, "translate3d(0,-6.000%,0) scale(1.2200)");
    assert.equal(nodi.get("suolo")!.style.transform, "translate3d(0,-82.000%,0)");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(4.2000)");
    assert.equal(nodi.get("comandi")!.style.transform, "translate3d(0,-50.00px,0)");
    assert.equal(nodi.get("stato")!.style.transform, "translate3d(0,40.00px,0)");
    assert.equal(nodi.get("buio")!.style.opacity, "1.000");
    assert.equal(nodi.get("figura")!.style.opacity, "0.000");
  });
});

describe("l'attraversamento sulla tavoletta", () => {
  it("stessa coreografia, distanze e scale più ampie", () => {
    const { radice, nodi } = palco();
    compositore(radice, "tavoletta").disegna(1);

    // Distanze × 1.3, ampiezza delle scale × 1.25.
    assert.equal(nodi.get("marchio")!.style.transform, "translate3d(0,-39.00px,0) scale(4.0000)");
    assert.equal(nodi.get("rete")!.style.transform, "translate3d(0,-52.00px,0) scale(1.6875)");
    assert.equal(nodi.get("sotto")!.style.transform, "translate3d(0,-91.00px,0)");
    assert.equal(nodi.get("comandi")!.style.transform, "translate3d(0,-65.00px,0)");
    assert.equal(nodi.get("stato")!.style.transform, "translate3d(0,52.00px,0)");
    assert.equal(nodi.get("titolo")!.style.transform, "translate3d(0,-42.000%,0) scale(0.7750)");
    assert.equal(nodi.get("figura")!.style.transform, "translate3d(0,-6.000%,0) scale(1.2750)");
    assert.equal(nodi.get("cuore")!.style.transform, "translate3d(0,0.00px,0) scale(5.2500)");
  });

  it("gli spostamenti in frazione del proprio riquadro non si toccano", () => {
    // Sono già relativi all'elemento: moltiplicarli per la distanza
    // vorrebbe dire far uscire il piano di luce dal corpo che deve
    // consumare, e togliere al titolo il suo riferimento.
    const telefono = palco();
    const tavoletta = palco();
    compositore(telefono.radice, "telefono").disegna(0.7);
    compositore(tavoletta.radice, "tavoletta").disegna(0.7);

    assert.equal(
      telefono.nodi.get("suolo")!.style.transform,
      tavoletta.nodi.get("suolo")!.style.transform,
    );
  });

  it("le opacità non dipendono dal profilo", () => {
    const telefono = palco();
    const tavoletta = palco();
    compositore(telefono.radice, "telefono").disegna(0.3);
    compositore(tavoletta.radice, "tavoletta").disegna(0.3);

    for (const chiave of ["marchio", "titolo", "rete", "buio", "figura"]) {
      assert.equal(
        telefono.nodi.get(chiave)!.style.opacity,
        tavoletta.nodi.get(chiave)!.style.opacity,
        `l'opacità di ${chiave} cambia col profilo`,
      );
    }
  });
});

describe("le proprietà che rendono la scena affidabile", () => {
  it("lo stesso progresso dà lo stesso fotogramma, da qualunque parte si arrivi", () => {
    const salita = palco();
    const discesa = palco();
    const su = compositore(salita.radice, "telefono");
    const giu = compositore(discesa.radice, "telefono");

    // In discesa, passo per passo.
    for (let p = 0; p <= 1.0001; p += 0.05) su.disegna(Math.min(1, p));
    // E poi indietro fino allo stesso punto.
    for (let p = 1; p >= 0.3999; p -= 0.05) su.disegna(p);
    // L'altro ci arriva di colpo, senza aver visto nulla prima.
    giu.disegna(0.4);

    for (const [chiave, nodo] of salita.nodi) {
      assert.deepEqual(
        nodo.style,
        discesa.nodi.get(chiave)!.style,
        `${chiave} ricorda da dove è passato`,
      );
    }
  });

  it("fuori dai suoi estremi ogni battuta resta ferma", () => {
    const { radice, nodi } = palco();
    const scena = compositore(radice, "telefono");

    scena.disegna(1);
    const fine = { ...nodi.get("marchio")!.style };
    // Oltre la fine della corsa il progresso è comunque limitato a 1, ma
    // anche chiedendo di più non deve succedere niente.
    scena.disegna(2);
    assert.deepEqual(nodi.get("marchio")!.style, fine);

    scena.disegna(-1);
    assert.equal(nodi.get("marchio")!.style.transform, "translate3d(0,0.00px,0) scale(1.0000)");
    assert.equal(nodi.get("marchio")!.style.opacity, "1.000");
  });

  it("liberando la scena il CSS torna padrone", () => {
    const { radice, nodi } = palco();
    const scena = compositore(radice, "telefono");

    scena.disegna(0.5);
    assert.notEqual(nodi.get("marchio")!.style.transform, "");

    scena.libera();
    for (const [chiave, nodo] of nodi) {
      if (nodo.style.transform !== undefined) {
        assert.equal(nodo.style.transform, "", `${chiave} resta trasformato`);
      }
      if (nodo.style.opacity !== undefined) {
        assert.equal(nodo.style.opacity, "", `${chiave} resta velato`);
      }
    }
  });

  it("un elemento che manca non ferma la scena", () => {
    // Il compositore cerca gli undici elementi una volta sola: se il
    // markup ne perdesse uno, gli altri devono continuare a muoversi.
    const radice = { querySelector: () => null } as unknown as HTMLElement;
    assert.doesNotThrow(() => compositore(radice, "telefono").disegna(0.5));
  });
});
