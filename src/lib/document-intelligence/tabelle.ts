import { numeroItaliano } from "../clinical/lettura-referto.ts";
import type { Cella, Tabella } from "./tipi.ts";

/**
 * Riconoscere una tabella dove non c'è una tabella.
 *
 * In un `.xlsx` la tabella è dichiarata: ci sono fogli, righe e celle, e
 * non c'è niente da indovinare. In un PDF no. Un referto di laboratorio
 * *sembra* una tabella — nome dell'esame, valore, unità, intervallo — ma
 * nel file non esiste nessuna tabella: esistono frammenti di testo con
 * una coordinata, e l'allineamento in colonne è un fatto visivo che si
 * ricostruisce dalle posizioni.
 *
 * Perché vale la pena farlo invece di leggere le righe come stringhe.
 * Con le sole righe, "Ferritina 210 ng/mL 30 - 400" ha quattro numeri e
 * nessun modo sicuro di sapere quale sia il risultato: si taglia al
 * primo marcatore di riferimento e si spera. Con le colonne, il valore
 * è quello nella colonna dei risultati — sempre, anche quando il
 * laboratorio scrive "v.r." in modo che nessuna espressione regolare
 * prevede.
 *
 * Il riconoscimento **dichiara la propria confidenza** e non pretende di
 * riuscire sempre. Quando fallisce, il lettore a righe resta la strada
 * normale: questa è una lettura in più, non una sostituzione.
 */

/* ── Numeri nelle celle ───────────────────────────────────────────── */

/**
 * Il numero contenuto in una cella, se ce n'è uno solo e chiaro.
 *
 * Una cella con due numeri — "30 - 400" — non ha *un* valore: è un
 * intervallo, e restituirne il primo sarebbe la peggiore delle
 * risposte, perché sembrerebbe un risultato. Meglio `null`: chi legge
 * saprà che lì non c'è una misura.
 */
export function numeroDaCella(testo: string): number | null {
  const pulito = testo.trim();
  if (pulito.length === 0 || pulito.length > 40) return null;

  // Un intervallo, una frazione, una data: non sono un valore singolo.
  if (/\d\s*[-–—/]\s*\d/.test(pulito)) return null;

  // Toglie l'unità di misura e i marcatori di soglia, che non fanno
  // parte del numero ma non lo rendono illeggibile.
  const senzaContorno = pulito
    .replace(/^[<>≤≥=~+]+\s*/, "")
    .replace(/\s*[a-zA-Zµ%°/²³]+\.?$/, "")
    .trim();

  const soloNumero = /^[-+]?[\d.,]+$/.test(senzaContorno);
  if (!soloNumero) return null;

  return numeroItaliano(senzaContorno);
}

/** Vero se la cella contiene un numero, comunque scritto. */
export function contieneNumero(testo: string): boolean {
  return /\d/.test(testo);
}

/* ── Il testo con le posizioni ────────────────────────────────────── */

/** Un frammento di testo con la sua posizione orizzontale sulla pagina. */
export interface Frammento {
  x: number;
  larghezza: number;
  testo: string;
}

/** Una riga di pagina, con i frammenti già ordinati da sinistra a destra. */
export interface RigaPosizionata {
  pagina: number;
  y: number;
  frammenti: Frammento[];
}

/* ── Colonne ──────────────────────────────────────────────────────── */

/**
 * Le colonne di una pagina, dedotte dagli inizi dei frammenti.
 *
 * Il metodo: si prendono tutte le coordinate x di inizio, si raggruppano
 * quelle vicine, e un gruppo diventa una colonna se compare in
 * abbastanza righe. La soglia serve a non promuovere a colonna un
 * rientro capitato una volta sola.
 */
function colonneDi(righe: RigaPosizionata[], tolleranza: number): number[] {
  const conteggi = new Map<number, number>();

  for (const riga of righe) {
    // Un x per riga per colonna: una riga con tre frammenti nella stessa
    // colonna — una parola spezzata — non deve contare tre volte.
    const gia = new Set<number>();
    for (const frammento of riga.frammenti) {
      const chiave = Math.round(frammento.x / tolleranza) * tolleranza;
      if (gia.has(chiave)) continue;
      gia.add(chiave);
      conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
    }
  }

  // Una colonna vera compare su almeno un terzo delle righe, e comunque
  // su almeno tre: sotto, è un allineamento casuale.
  const minimo = Math.max(3, Math.floor(righe.length / 3));

  return [...conteggi.entries()]
    .filter(([, quante]) => quante >= minimo)
    .map(([x]) => x)
    .sort((a, b) => a - b);
}

/** In quale colonna cade un frammento. */
function colonnaDi(x: number, colonne: number[], tolleranza: number): number {
  for (let i = colonne.length - 1; i >= 0; i -= 1) {
    if (x >= colonne[i] - tolleranza) return i;
  }
  return 0;
}

/**
 * La tabella di una pagina, se la pagina ne contiene una.
 *
 * Restituisce `null` quando non trova una griglia credibile — una
 * lettera, un consenso, un referto scritto in prosa. Non è un
 * fallimento: è la risposta giusta per un documento che non è una
 * tabella, e forzarne una produrrebbe righe di spazzatura che poi
 * qualcuno dovrebbe rivedere.
 */
export function tabellaDaPagina(
  righe: RigaPosizionata[],
  pagina: number,
  tolleranza = 6,
): Tabella | null {
  if (righe.length < 3) return null;

  const colonne = colonneDi(righe, tolleranza);
  // Sotto le due colonne non è una tabella: è testo con un rientro.
  if (colonne.length < 2) return null;

  const griglia: Cella[][] = [];

  for (const riga of righe) {
    const celle: string[] = new Array(colonne.length).fill("");

    for (const frammento of riga.frammenti) {
      const indice = colonnaDi(frammento.x, colonne, tolleranza);
      celle[indice] = celle[indice] ? `${celle[indice]} ${frammento.testo}` : frammento.testo;
    }

    const pulite = celle.map((testo) => {
      const t = testo.replace(/\s+/g, " ").trim();
      return { testo: t, numero: numeroDaCella(t) };
    });

    // Una riga con una cella sola non appartiene alla tabella: è un
    // titolo di sezione — "CHIMICA CLINICA" — e va lasciato al testo.
    if (pulite.filter((c) => c.testo.length > 0).length < 2) continue;

    griglia.push(pulite);
  }

  if (griglia.length < 2) return null;

  // ── Le intestazioni ─────────────────────────────────────────────
  // La prima riga senza numeri è l'intestazione, ma solo se sta in cima:
  // più in basso è una riga di esami qualitativi, non un'intestazione.
  const prima = griglia[0];
  const eIntestazione =
    prima.every((c) => c.numero === null) &&
    prima.filter((c) => c.testo.length > 0).length >= 2;

  // ── La confidenza ───────────────────────────────────────────────
  // Non è "quanto è bella": è quanto la griglia è regolare. Una tabella
  // in cui metà delle righe ha celle vuote sparse è quasi sempre testo
  // scambiato per tabella, e chi la userà a valle deve saperlo.
  const piene = griglia.flat().filter((c) => c.testo.length > 0).length;
  const densita = piene / (griglia.length * colonne.length);
  const confidenza = Math.max(0.3, Math.min(0.95, densita + (eIntestazione ? 0.15 : 0)));

  return {
    origine: "pdf",
    nome: null,
    pagina,
    intestazioni: eIntestazione ? prima.map((c) => c.testo) : [],
    righe: eIntestazione ? griglia.slice(1) : griglia,
    confidenza: Number(confidenza.toFixed(2)),
  };
}

/* ── Tabelle nel testo semplice ───────────────────────────────────── */

/**
 * Una tabella dentro del testo senza coordinate.
 *
 * Serve ai formati che arrivano già appiattiti: un `.doc`, l'uscita di
 * un OCR, un `.txt` incollato. Qui l'unico indizio di colonna è la
 * sequenza di due o più spazi — che è come si allinea una tabella
 * quando non si ha una tabella.
 *
 * È il riconoscimento meno affidabile dei tre, e la confidenza lo dice.
 */
export function tabellaDaTestoAllineato(righe: string[]): Tabella | null {
  const candidate = righe
    .map((r) => r.split(/ {2,}|\t+/).map((c) => c.trim()).filter((c) => c.length > 0))
    .filter((celle) => celle.length >= 2);

  if (candidate.length < 3) return null;

  // Il numero di colonne più frequente: le righe che non lo rispettano
  // sono intestazioni di sezione o note a piè di pagina.
  const frequenze = new Map<number, number>();
  for (const celle of candidate) {
    frequenze.set(celle.length, (frequenze.get(celle.length) ?? 0) + 1);
  }

  const [quanteColonne, quanteRighe] = [...frequenze.entries()].sort((a, b) => b[1] - a[1])[0];
  if (quanteRighe < 3) return null;

  const griglia = candidate
    .filter((celle) => celle.length === quanteColonne)
    .map((celle) => celle.map((testo) => ({ testo, numero: numeroDaCella(testo) })));

  const prima = griglia[0];
  const eIntestazione = prima.every((c) => c.numero === null);

  return {
    origine: "pdf",
    nome: null,
    pagina: null,
    intestazioni: eIntestazione ? prima.map((c) => c.testo) : [],
    righe: eIntestazione ? griglia.slice(1) : griglia,
    // Deliberatamente bassa: l'allineamento a spazi è un indizio, non
    // una struttura, e a valle si preferirà sempre una lettura a righe
    // quando questa e quella non concordano.
    confidenza: 0.55,
  };
}

/* ── Leggere le colonne di un referto ─────────────────────────────── */

/**
 * Che ruolo ha ciascuna colonna di un referto di laboratorio.
 *
 * Un referto italiano ha quasi sempre quattro colonne — esame,
 * risultato, unità, valori di riferimento — ma le intesta in venti modi
 * diversi, e certi laboratori non le intestano affatto.
 *
 * Per questo il riconoscimento è **doppio**: prima si guardano le
 * intestazioni, e se non bastano si guarda il contenuto — la colonna dei
 * risultati è quella con più numeri singoli, quella dei riferimenti è
 * quella con più intervalli. Il contenuto non mente mai su ciò che è, e
 * un'intestazione può mancare.
 */
export interface RuoliColonne {
  esame: number | null;
  risultato: number | null;
  unita: number | null;
  riferimento: number | null;
  /** Come si è deciso: dalle intestazioni o dal contenuto delle celle. */
  via: "intestazioni" | "contenuto" | "misto";
}

const PAROLE_ESAME = /^(esame|analisi|test|parametro|descrizione|prova|indagine)/i;
const PAROLE_RISULTATO = /^(risultato|valore|result|esito|referto)/i;
const PAROLE_UNITA = /^(u\.?\s*m\.?|unit|unità|misura)/i;
const PAROLE_RIFERIMENTO =
  /(riferiment|v\.?\s*r\.?|range|intervall|normal|attes|desiderabil|reference)/i;

/** Vero se la cella è scritta come un intervallo: "30 - 400", "< 150". */
function eIntervallo(testo: string): boolean {
  const t = testo.trim();
  if (t.length === 0) return false;
  return /^[<>≤≥]?\s*[\d.,]+\s*[-–—]\s*[\d.,]+$/.test(t) || /^[<>≤≥]\s*[\d.,]+$/.test(t);
}

export function ruoliDelleColonne(tabella: Tabella): RuoliColonne {
  const quante = Math.max(
    tabella.intestazioni.length,
    ...tabella.righe.map((r) => r.length),
    0,
  );

  const ruoli: RuoliColonne = {
    esame: null,
    risultato: null,
    unita: null,
    riferimento: null,
    via: "contenuto",
  };

  // ── Dalle intestazioni ──────────────────────────────────────────
  let daIntestazioni = 0;
  tabella.intestazioni.forEach((testo, i) => {
    const t = testo.trim();
    if (ruoli.esame === null && PAROLE_ESAME.test(t)) { ruoli.esame = i; daIntestazioni += 1; }
    else if (ruoli.risultato === null && PAROLE_RISULTATO.test(t)) { ruoli.risultato = i; daIntestazioni += 1; }
    else if (ruoli.unita === null && PAROLE_UNITA.test(t)) { ruoli.unita = i; daIntestazioni += 1; }
    else if (ruoli.riferimento === null && PAROLE_RIFERIMENTO.test(t)) { ruoli.riferimento = i; daIntestazioni += 1; }
  });

  if (daIntestazioni >= 2) ruoli.via = "intestazioni";

  // ── Dal contenuto ───────────────────────────────────────────────
  const statistiche = Array.from({ length: quante }, (_, i) => {
    let numeri = 0;
    let intervalli = 0;
    let parole = 0;
    let unita = 0;

    for (const riga of tabella.righe) {
      const cella = riga[i]?.testo ?? "";
      if (!cella) continue;
      if (eIntervallo(cella)) intervalli += 1;
      else if (riga[i]?.numero !== null) numeri += 1;
      else if (/^[a-zA-Zµ%°/²³.]{1,12}$/.test(cella.trim())) unita += 1;
      else parole += 1;
    }

    return { numeri, intervalli, parole, unita };
  });

  const migliore = (
    punteggio: (s: (typeof statistiche)[number]) => number,
    escluse: (number | null)[],
  ): number | null => {
    let scelta: number | null = null;
    let massimo = 0;
    statistiche.forEach((s, i) => {
      if (escluse.includes(i)) return;
      const p = punteggio(s);
      if (p > massimo) { massimo = p; scelta = i; }
    });
    return scelta;
  };

  // L'ordine non è casuale: prima l'intervallo, che è il più
  // riconoscibile, così non ruba la colonna dei risultati.
  if (ruoli.riferimento === null) {
    ruoli.riferimento = migliore((s) => s.intervalli, [ruoli.esame, ruoli.risultato, ruoli.unita]);
  }
  if (ruoli.risultato === null) {
    ruoli.risultato = migliore((s) => s.numeri, [ruoli.esame, ruoli.riferimento, ruoli.unita]);
  }
  if (ruoli.unita === null) {
    ruoli.unita = migliore((s) => s.unita, [ruoli.esame, ruoli.risultato, ruoli.riferimento]);
  }
  if (ruoli.esame === null) {
    ruoli.esame = migliore((s) => s.parole, [ruoli.risultato, ruoli.riferimento, ruoli.unita]);
  }

  if (ruoli.via === "intestazioni" && daIntestazioni < 4) ruoli.via = "misto";

  return ruoli;
}

/**
 * Un intervallo scritto in una cella, letto come due numeri.
 *
 * Le forme che i laboratori usano davvero: "30 - 400", "30-400",
 * "< 150", "> 40", "fino a 100", "0,5 – 4,5". Ciò che non rientra in
 * queste torna `null` e non viene indovinato — un intervallo sbagliato
 * farebbe giudicare male ogni valore che ci si confronta.
 */
export function intervalloDaTesto(testo: string): { min: number | null; max: number | null } | null {
  const t = testo.trim().replace(/\s+/g, " ");
  if (t.length === 0) return null;

  const doppio = /^([<>≤≥]?\s*[\d.,]+)\s*[-–—]\s*([\d.,]+)$/.exec(t);
  if (doppio) {
    const min = numeroItaliano(doppio[1].replace(/[<>≤≥\s]/g, ""));
    const max = numeroItaliano(doppio[2]);
    if (min !== null && max !== null && min <= max) return { min, max };
    return null;
  }

  const soloMax = /^[<≤]\s*([\d.,]+)$/.exec(t) ?? /^fino a\s+([\d.,]+)$/i.exec(t);
  if (soloMax) {
    const max = numeroItaliano(soloMax[1]);
    return max === null ? null : { min: null, max };
  }

  const soloMin = /^[>≥]\s*([\d.,]+)$/.exec(t) ?? /^oltre\s+([\d.,]+)$/i.exec(t);
  if (soloMin) {
    const min = numeroItaliano(soloMin[1]);
    return min === null ? null : { min, max: null };
  }

  return null;
}
