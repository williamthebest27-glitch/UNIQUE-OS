import { normalizzaUnita as normalizzaUnitaBase, numeroItaliano } from "../clinical/lettura-referto.ts";
import { INDICE_SINONIMI, type VoceCatalogo } from "./catalogo.ts";

/**
 * Ricondurre ciò che sta scritto a ciò che significa.
 *
 * Due referti dello stesso paziente, fatti in due laboratori diversi,
 * scrivono lo stesso esame in due modi: «Vit. D», «25-OH Vitamina D».
 * Finché restano due stringhe diverse sono due esami diversi, e la
 * domanda che conta — *sta migliorando?* — non ha risposta.
 *
 * La canonicalizzazione è quindi la precondizione dell'analisi
 * temporale, non un abbellimento. Senza, ogni referto è un'isola.
 *
 * ---
 *
 * **La regola sulle conversioni.** Si converte solo quando il fattore è
 * matematicamente determinato: mmol/L e mg/dL di glucosio stanno in un
 * rapporto fisso, perché dipende dalla massa molare del glucosio e
 * quella non cambia. Non si converte mai ciò che dipende dal metodo di
 * misura o dal contesto clinico — e quando l'unità non è né quella
 * attesa né una convertibile, il numero resta com'è e la fiducia scende.
 *
 * Un valore convertito male è peggio di un valore non convertito: il
 * secondo si vede, il primo entra in cartella con l'aria di un dato buono.
 */

/* ── Unità ────────────────────────────────────────────────────────── */

/**
 * Le unità che il catalogo dei biomarcatori usa e che il lettore di
 * referti non conosceva.
 *
 * `lib/clinical/lettura-referto.ts` ha già la sua tabella, tarata sulle
 * metriche dello Score, ed è quella che serve al motore clinico. Questa
 * la estende invece di sostituirla: dove la prima risponde, vince lei —
 * così le due non possono divergere su ciò che entrambe conoscono.
 */
const UNITA_ESTESE: Readonly<Record<string, string>> = {
  "g/dl": "g/dL",
  "g/l": "g/L",
  "mg/l": "mg/L",
  "ug/dl": "µg/dL",
  "ug/l": "µg/L",
  "ng/dl": "ng/dL",
  "ng/l": "ng/L",
  "pg/ml": "pg/mL",
  "pg/dl": "pg/dL",
  "umol/l": "µmol/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "mmol/mol": "mmol/mol",
  "meq/l": "mEq/L",
  "u/ml": "U/mL",
  "iu/ml": "U/mL",
  "ui/ml": "U/mL",
  "miu/ml": "µU/mL",
  "mu/l": "mU/L",
  "kui/l": "kU/L",
  "mm/h": "mm/h",
  "mm/ora": "mm/h",
  fl: "fL",
  pg: "pg",
  "10^3/ul": "10³/µL",
  "10^6/ul": "10⁶/µL",
  "10e3/ul": "10³/µL",
  "10e6/ul": "10⁶/µL",
  "x10^3/ul": "10³/µL",
  "x10^6/ul": "10⁶/µL",
  "cell/ul": "10³/µL",
  "mila/ul": "10³/µL",
  "milioni/ul": "10⁶/µL",
  "ml/min/1.73m2": "mL/min/1.73m²",
  "ml/min/1,73m2": "mL/min/1.73m²",
  "ml/min": "mL/min/1.73m²",
  "kg/m2": "kg/m²",
  "kg/m^2": "kg/m²",
  "ug/ml": "µg/mL",
};

/**
 * L'unità di misura, ridotta a una forma sola.
 *
 * Le tre normalizzazioni preliminari — minuscolo, niente spazi, mu greca
 * ridotta a "u" — servono perché la stessa unità arriva scritta in
 * cinque modi a seconda del font con cui è stato generato il PDF.
 */
export function normalizzaUnita(grezza: string | null | undefined): string | null {
  if (!grezza) return null;

  const pulita = grezza.trim();
  if (pulita.length === 0) return null;

  // Prima il lettore di referti: è la tabella già in uso e già testata.
  const base = normalizzaUnitaBase(pulita);
  const chiave = pulita
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[μµ]/g, "u")
    .replace(/·/g, "/")
    .replace(/\.$/, "");

  // Se la tabella base ha davvero riconosciuto qualcosa — cioè ha
  // restituito una forma diversa dal grezzo — quella è la risposta.
  if (base && base !== pulita) return base;

  return UNITA_ESTESE[chiave] ?? pulita;
}

/** Vero se due unità sono la stessa cosa scritta diversamente. */
export function stessaUnita(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const riduci = (u: string) =>
    u.toLowerCase().replace(/[\s.]/g, "").replace(/[μµ]/g, "u").replace(/[²³^]/g, "");
  return riduci(a) === riduci(b);
}

/* ── Canonicalizzazione ───────────────────────────────────────────── */

export interface Riconoscimento {
  voce: VoceCatalogo;
  /** Il sinonimo che ha fatto scattare il riconoscimento. */
  sinonimo: string;
  /** Quanto ci si fida dell'accostamento. */
  fiducia: number;
}

/**
 * Toglie da un'etichetta ciò che non fa parte del nome dell'esame.
 *
 * I referti aggiungono di tutto attorno al nome: un asterisco per il
 * fuori range, il metodo fra parentesi, il codice interno del
 * laboratorio, i due punti. Nessuno di questi cambia quale esame sia, e
 * tutti impedirebbero il riconoscimento se restassero.
 */
export function ripulisciEtichetta(grezza: string): string {
  return (
    grezza
      .replace(/\([^)]*\)/g, " ") // il metodo fra parentesi
      .replace(/\[[^\]]*\]/g, " ")
      // Marcatori di elenco: sempre.
      .replace(/^[\s•·*+]+/, "")
      /*
       * La numerazione di riga — «3. Colesterolo» — solo quando è
       * seguita da uno spazio.
       *
       * Senza quella condizione la regola mangerebbe il «25» di
       * «25-OH-D», e la vitamina D smetterebbe di essere riconosciuta
       * proprio nella scrittura più tecnica. È capitato: lo ha trovato
       * un test, non un referto.
       */
      .replace(/^\d{1,2}[.)]\s+/, "")
      .replace(/[*#]+/g, " ")
      .replace(/[:;]+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Da come è scritto a quale esame è.
 *
 * Il riconoscimento è per **contenimento** e non per uguaglianza: su un
 * referto l'etichetta è "Colesterolo LDL calcolato (Friedewald)", e
 * pretendere l'uguaglianza esatta non riconoscerebbe quasi niente.
 *
 * La fiducia distingue i due casi. Un'etichetta che *è* il sinonimo vale
 * più di una che lo *contiene*, e un sinonimo corto dentro un'etichetta
 * lunga vale meno di uno lungo: "hb" dentro "hbsag" sarebbe un errore, e
 * il rapporto fra le lunghezze è ciò che lo rende visibile.
 */
export function canonicalizza(etichettaGrezza: string): Riconoscimento | null {
  const etichetta = ripulisciEtichetta(etichettaGrezza).toLowerCase();
  if (etichetta.length < 2) return null;

  for (const { sinonimo, voce } of INDICE_SINONIMI) {
    if (etichetta === sinonimo) {
      return { voce, sinonimo, fiducia: 1 };
    }
  }

  for (const { sinonimo, voce } of INDICE_SINONIMI) {
    if (!contieneParola(etichetta, sinonimo)) continue;

    // Quanto del nome è coperto dal sinonimo. Un sinonimo di tre lettere
    // dentro un'etichetta di trenta è un indizio debole, e va detto.
    const copertura = sinonimo.length / etichetta.length;
    const fiducia = copertura >= 0.6 ? 0.95 : copertura >= 0.3 ? 0.85 : 0.7;

    return { voce, sinonimo, fiducia };
  }

  return null;
}

/**
 * Il sinonimo compare come parola, non come pezzo di parola.
 *
 * Senza questo controllo "hb" riconoscerebbe "HBsAg" — l'antigene
 * dell'epatite B — come emoglobina, e un valore di epatite finirebbe in
 * cartella come un emocromo. È l'errore che la ricerca per
 * contenimento nudo commette, ed è silenzioso.
 */
function contieneParola(testo: string, sinonimo: string): boolean {
  let da = 0;

  for (;;) {
    const trovato = testo.indexOf(sinonimo, da);
    if (trovato < 0) return false;

    const prima = trovato === 0 ? " " : testo[trovato - 1];
    const dopoIndice = trovato + sinonimo.length;
    const dopo = dopoIndice >= testo.length ? " " : testo[dopoIndice];

    // Un confine è qualunque cosa non sia una lettera o una cifra. Il
    // trattino e il punto contano come confine: "25-oh-d" è composto.
    const confine = (c: string) => !/[a-z0-9]/i.test(c);

    if (confine(prima) && confine(dopo)) return true;
    da = trovato + 1;
  }
}

/* ── Conversione ──────────────────────────────────────────────────── */

export interface Convertito {
  valore: number;
  unita: string;
  /** Quanto ci si fida del numero dopo il passaggio. */
  fiducia: number;
  /** Da dove viene, se una conversione è avvenuta. */
  conversione?: { da: string; valoreOriginale: number };
  /** Cosa segnalare a chi rivede, quando c'è qualcosa da segnalare. */
  nota?: string;
}

/**
 * Porta un valore nell'unità del catalogo, quando è lecito farlo.
 *
 * Quattro esiti, e sono tutti espliciti:
 *
 *   L'unità è già quella attesa → niente da fare, piena fiducia.
 *   Manca l'unità → il numero resta, la fiducia scende: senza unità
 *     non si può escludere che sia in un'altra scala.
 *   L'unità è convertibile → si converte, e resta traccia di com'era.
 *   L'unità è un'altra → **non si converte**, e la fiducia crolla.
 *     Quasi sempre significa che si è letta la riga sbagliata.
 */
export function convertiValore(
  voce: VoceCatalogo,
  valore: number,
  unitaLetta: string | null,
): Convertito {
  const attesa = voce.unita;
  const unita = normalizzaUnita(unitaLetta);

  // Un biomarcatore senza unità canonica — INR, HOMA, rapporti — non ha
  // niente da convertire.
  if (attesa === "") {
    return { valore, unita: "", fiducia: unita ? 0.9 : 0.95 };
  }

  if (!unita) {
    return {
      valore,
      unita: attesa,
      fiducia: 0.72,
      nota: "Nessuna unità di misura sul documento: il valore è stato letto assumendo quella attesa.",
    };
  }

  if (stessaUnita(unita, attesa)) {
    return { valore, unita: attesa, fiducia: 0.97 };
  }

  const conversione = voce.conversioni
    ? Object.entries(voce.conversioni).find(([da]) => stessaUnita(da, unita))
    : undefined;

  if (conversione) {
    const { fattore, offset } = conversione[1];
    /*
     * Prima il fattore, poi l'offset: `y = mx + q`.
     *
     * L'unico caso con offset è l'emoglobina glicata, dove la relazione
     * fra la scala IFCC e quella percentuale è `% = mmol/mol × 0,0915 +
     * 2,15`. Applicare l'offset prima del fattore darebbe 5,0 al posto
     * di 7,0 — un paziente sano al posto di uno diabetico.
     */
    const convertito = valore * fattore + (offset ?? 0);

    return {
      valore: Number(convertito.toFixed(4)),
      unita: attesa,
      // Alta ma non massima: la conversione è esatta, la lettura
      // dell'unità sul documento no.
      fiducia: 0.9,
      conversione: { da: unita, valoreOriginale: valore },
    };
  }

  return {
    valore,
    unita,
    fiducia: 0.38,
    nota: `Unità inattesa: il documento riporta ${unita}, il riferimento è in ${attesa}. Il valore non è stato convertito.`,
  };
}

/* ── Numeri incerti ───────────────────────────────────────────────── */

/** Come si presenta un numero letto da un documento. */
export interface NumeroLetto {
  valore: number | null;
  /** Il testo da cui viene, per chi deve verificare. */
  grezzo: string;
  fiducia: number;
  /** Vero se il valore è dichiarato sotto o sopra una soglia: "<5". */
  soglia: "<" | ">" | null;
  motivo?: string;
}

/**
 * Un numero che arriva da un documento, con l'onestà di dire quando non
 * si è capito.
 *
 * **Questa funzione è il punto in cui il sistema promette di non
 * inventare.** Se il riconoscimento ottico ha prodotto «1?5», qui non
 * esce né 105 né 125: esce `null` con una fiducia bassa e il motivo
 * scritto. Un valore inventato che finisce in una cartella clinica non
 * si distingue più da uno vero, e nessuno lo andrà a ricontrollare
 * proprio perché sembra normale.
 *
 * `fiduciaRiga` è quella dichiarata dal motore OCR: una riga letta male
 * abbassa la fiducia di ogni numero che contiene, anche di quelli che
 * *sembrano* leggibili.
 */
export function leggiNumero(grezzo: string, fiduciaRiga = 1): NumeroLetto {
  const testo = grezzo.trim();

  if (testo.length === 0) {
    return { valore: null, grezzo, fiducia: 0, soglia: null, motivo: "Nessun valore." };
  }

  // ── Caratteri illeggibili ───────────────────────────────────────
  // Il punto interrogativo lo scrive il nostro OCR quando non riconosce
  // un carattere; gli altri sono ciò che i motori classici producono al
  // posto di una cifra che non hanno capito.
  if (/[?■□�]/.test(testo)) {
    return {
      valore: null,
      grezzo,
      fiducia: Math.min(0.35, fiduciaRiga * 0.4),
      soglia: null,
      motivo: `Il riconoscimento non ha letto tutte le cifre di «${testo}». Il valore non è stato indovinato.`,
    };
  }

  const soglia = /^[<≤]/.test(testo) ? "<" : /^[>≥]/.test(testo) ? ">" : null;
  const senzaSoglia = testo.replace(/^[<>≤≥=~\s]+/, "").trim();

  const valore = numeroItaliano(senzaSoglia);

  if (valore === null) {
    return {
      valore: null,
      grezzo,
      fiducia: 0,
      soglia,
      motivo: `«${testo}» non è un numero leggibile.`,
    };
  }

  // ── La fiducia ──────────────────────────────────────────────────
  let fiducia = fiduciaRiga;

  if (soglia) {
    // "<5" non è cinque: è "meno di cinque". Il numero è utilizzabile,
    // ma chi lo confronta con un intervallo deve sapere che è un
    // estremo e non una misura.
    fiducia *= 0.9;
  }

  // Una riga che il motore ha letto male abbassa tutto ciò che contiene,
  // anche le cifre che sembrano nitide: se ha sbagliato una lettera lì
  // accanto, può aver sbagliato una cifra qui.
  if (fiduciaRiga < 0.75) fiducia = Math.min(fiducia, 0.6);

  return {
    valore,
    grezzo,
    fiducia: Number(Math.max(0, Math.min(1, fiducia)).toFixed(3)),
    soglia,
    motivo:
      soglia !== null
        ? `Il documento riporta «${testo}»: è un estremo dichiarato dal laboratorio, non una misura puntuale.`
        : undefined,
  };
}
