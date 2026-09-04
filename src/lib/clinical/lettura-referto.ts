import { METRIC_DEFINITIONS, type MetricDefinition } from "../score/metrics.ts";

/**
 * Leggere un referto senza un modello linguistico.
 *
 * Un referto di laboratorio italiano non è prosa: è una tabella con tre
 * colonne — nome dell'esame, valore, intervallo di riferimento — scritta
 * in cento impaginazioni diverse. Il catalogo delle metriche porta già i
 * sinonimi con cui ogni esame compare su quei fogli; qui si aggiunge il
 * resto: i numeri con la virgola, le unità di misura, le conversioni, e
 * la disciplina di non confondere un valore con il suo intervallo.
 *
 * **Perché deterministico è meglio, qui.** Non per costo o per privacy —
 * quelle sono ragioni vere ma vengono dopo. È che un lettore a regole
 * sbaglia sempre allo stesso modo: se non riconosce "colesterolo non-HDL"
 * non lo riconosce mai, e lo si vede subito. Un modello lo riconosce
 * nove volte su dieci, e la decima sbaglia in silenzio su un paziente che
 * nessuno ricontrolla.
 *
 * Quello che estrae non entra comunque in cartella da solo: passa da
 * `validateExtraction` e, se clinicamente rilevante, da un medico.
 *
 * **Cosa non sa fare.** Un referto scansionato è un'immagine, e qui non
 * c'è nessun riconoscimento ottico: si dichiara, non si tenta.
 */

export interface RigaLetta {
  metric_code: string;
  label: string;
  value: number | null;
  category: string | null;
  unit: string | null;
  measured_on: string | null;
  confidence: number;
  source_excerpt: string;
}

export interface EsitoLettura {
  document_kind: "lab_report" | "other";
  document_date: string | null;
  measurements: RigaLetta[];
  summary: string;
  next_steps: string[];
  /** Righe che sembravano una misura ma non corrispondono al catalogo. */
  non_riconosciute: string[];
}

/* ── Numeri, unità, date all'italiana ─────────────────────────────── */

/**
 * Un numero come lo scrive un laboratorio italiano.
 *
 * La virgola è il separatore decimale, il punto quello delle migliaia — e
 * "1.234" è milleduecentotrentaquattro, non uno virgola due. Sbagliarlo
 * su un valore di laboratorio significa un ordine di grandezza.
 */
export function numeroItaliano(grezzo: string): number | null {
  const pulito = grezzo.trim().replace(/\s/g, "");
  if (!/^[<>]?[-+]?[\d.,]+$/.test(pulito)) return null;

  const senzaSegno = pulito.replace(/^[<>]/, "");
  const virgola = senzaSegno.lastIndexOf(",");
  const punto = senzaSegno.lastIndexOf(".");

  let normalizzato: string;
  if (virgola > punto) {
    // 1.234,56 → il punto separa le migliaia
    normalizzato = senzaSegno.replace(/\./g, "").replace(",", ".");
  } else if (punto > virgola && virgola >= 0) {
    // 1,234.56 → referto scritto all'inglese
    normalizzato = senzaSegno.replace(/,/g, "");
  } else if (punto >= 0) {
    /*
     * Un punto solo, e nessuna virgola: "1.234" è ambiguo.
     *
     * Milleduecentotrentaquattro all'italiana, uno virgola
     * duecentotrentaquattro all'inglese. La regola che sbaglia meno su un
     * referto è: **tre cifre esatte dopo il punto sono migliaia**. Copre
     * i globuli bianchi (5.600) e le piastrine (250.000), e lascia
     * decimali i valori scritti come "12.5" o "0.85".
     *
     * Se la regola sbagliasse, l'errore è di mille volte — e un errore
     * di mille volte non passa il controllo di plausibilità che ogni
     * metrica porta con sé. È il motivo per cui qui si può scegliere la
     * lettura più probabile invece della più prudente.
     */
    const decimali = senzaSegno.length - punto - 1;
    const unSoloPunto = senzaSegno.indexOf(".") === punto;
    normalizzato =
      unSoloPunto && decimali === 3 ? senzaSegno.replace(".", "") : senzaSegno;
  } else {
    normalizzato = senzaSegno;
  }

  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : null;
}

/** Le unità come compaiono davvero, ridotte a una forma sola. */
export function normalizzaUnita(grezza: string | null): string | null {
  if (!grezza) return null;
  const u = grezza
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/μ|µ/g, "u")
    .replace(/·/g, "/");

  const equivalenze: Record<string, string> = {
    "mg/dl": "mg/dL",
    "mg/dl.": "mg/dL",
    "mmol/l": "mmol/L",
    "uu/ml": "µU/mL",
    "mui/l": "µU/mL",
    "ui/l": "U/L",
    "u/l": "U/L",
    "ng/ml": "ng/mL",
    "%": "%",
    mmhg: "mmHg",
    bpm: "bpm",
    kg: "kg",
    cm: "cm",
    "ml/kg/min": "mL/kg/min",
  };

  return equivalenze[u] ?? grezza.trim();
}

/**
 * Conversioni fra unità che i laboratori usano davvero.
 *
 * Senza queste, un referto in mmol/L verrebbe scartato come implausibile
 * — o peggio, accettato con il numero sbagliato.
 */
const CONVERSIONI: Record<string, Record<string, number>> = {
  glucose_fasting: { "mmol/L": 18.016 },
  ldl: { "mmol/L": 38.67 },
  hdl: { "mmol/L": 38.67 },
  triglycerides: { "mmol/L": 88.57 },
  vitamin_d: { "nmol/L": 0.4006 },
};

/** Data del referto: "12/03/2026", "12-03-2026", "12 marzo 2026". */
const MESI_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function estraiData(testo: string, oggi: string): string | null {
  const t = testo.toLowerCase();

  const numerica = t.match(/\b(0?[1-9]|[12]\d|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](20\d{2})\b/);
  if (numerica) {
    const giorno = numerica[1].padStart(2, "0");
    const mese = numerica[2].padStart(2, "0");
    const data = `${numerica[3]}-${mese}-${giorno}`;
    // Una data futura su un referto è un errore di lettura, non un esame
    // di domani.
    if (data <= oggi) return data;
  }

  const estesa = t.match(
    new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])\\s+(${MESI_IT.join("|")})\\s+(20\\d{2})\\b`),
  );
  if (estesa) {
    const mese = String(MESI_IT.indexOf(estesa[2]) + 1).padStart(2, "0");
    const data = `${estesa[3]}-${mese}-${estesa[1].padStart(2, "0")}`;
    if (data <= oggi) return data;
  }

  return null;
}

/* ── Il catalogo, indicizzato per come si legge ───────────────────── */

interface VoceIndice {
  metrica: MetricDefinition;
  alias: string;
}

/**
 * Gli alias in ordine di lunghezza decrescente.
 *
 * Serve a non far vincere il pezzo sul tutto: "colesterolo" comparirebbe
 * dentro "colesterolo ldl", e una riga di LDL finirebbe registrata come
 * colesterolo totale.
 */
const INDICE: VoceIndice[] = METRIC_DEFINITIONS.flatMap((metrica) =>
  [...(metrica.aliases ?? []), metrica.label]
    .map((alias) => ({ metrica, alias: alias.toLowerCase() }))
    .filter((v) => v.alias.length >= 3),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Dove finisce il valore e comincia l'intervallo di riferimento.
 *
 * "Colesterolo 187 mg/dL v.r. 130-200" contiene tre numeri, e due sono
 * la normalità di riferimento. Tagliare la riga al primo marcatore
 * elimina il caso più frequente di lettura sbagliata.
 */
const MARCATORI_RIFERIMENTO =
  /\b(v\.?r\.?|valori\s+di\s+riferimento|rif\.?|range|intervallo|normale|desiderabile|attes[oi])\b|\(/;

function tagliaRiferimenti(riga: string): string {
  const trovato = riga.search(MARCATORI_RIFERIMENTO);
  return trovato > 0 ? riga.slice(0, trovato) : riga;
}

const UNITA = /(mg\/dl|mmol\/l|nmol\/l|µu\/ml|uu\/ml|mui\/l|ng\/ml|u\/l|ui\/l|mmhg|bpm|ml\/kg\/min|kg|cm|%)/i;

/* ── La lettura ───────────────────────────────────────────────────── */

/**
 * Estrae le misure da un referto già convertito in testo.
 *
 * Riga per riga: si cerca l'esame, si taglia via l'intervallo di
 * riferimento, si prende il primo numero che resta, si legge l'unità e —
 * se serve — si converte. La fiducia dichiarata non è un ornamento: la
 * usa `validateExtraction` per decidere cosa può entrare da solo e cosa
 * aspetta un medico.
 */
export function leggiReferto(testo: string, oggi: string): EsitoLettura {
  const righe = testo
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const data = estraiData(testo, oggi);
  const trovate = new Map<string, RigaLetta>();
  const nonRiconosciute: string[] = [];

  for (const riga of righe) {
    const minuscola = riga.toLowerCase();

    /* La pressione si scrive come una frazione, e sono due misure. */
    const pressione = minuscola.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
    if (pressione && /pressione|p\.?a\.?|arteriosa|mmhg/.test(minuscola)) {
      registra(trovate, "sbp", Number(pressione[1]), "mmHg", riga, data, 0.9);
      registra(trovate, "dbp", Number(pressione[2]), "mmHg", riga, data, 0.9);
      continue;
    }

    const voce = INDICE.find((v) => minuscola.includes(v.alias));
    if (!voce) {
      // Una riga con un numero e nessun esame riconosciuto: la si
      // segnala invece di lasciarla sparire in silenzio.
      if (/\d/.test(riga) && riga.length < 120 && /[a-z]{4}/i.test(riga)) {
        nonRiconosciute.push(riga);
      }
      continue;
    }

    const utile = tagliaRiferimenti(riga);
    const dopoAlias = utile.toLowerCase().indexOf(voce.alias) + voce.alias.length;
    const coda = utile.slice(dopoAlias);

    const numeri = coda.match(/[<>]?\s*-?\d[\d.,]*/g);
    if (!numeri || numeri.length === 0) continue;

    const valore = numeroItaliano(numeri[0].replace(/\s/g, ""));
    if (valore === null) continue;

    const unitaGrezza = coda.match(UNITA)?.[0] ?? null;
    const unita = normalizzaUnita(unitaGrezza);

    const { valoreFinale, fiducia } = converti(voce.metrica, valore, unita);
    registra(trovate, voce.metrica.code, valoreFinale, unita ?? voce.metrica.unit, riga, data, fiducia);
  }

  const measurements = [...trovate.values()];
  const diLaboratorio = measurements.filter(
    (m) => METRIC_DEFINITIONS.find((d) => d.code === m.metric_code)?.source === "lab",
  ).length;

  return {
    document_kind: diLaboratorio >= 2 ? "lab_report" : "other",
    document_date: data,
    measurements,
    summary: componiSintesi(measurements.length, diLaboratorio, data, nonRiconosciute.length),
    next_steps: prossimiPassi(measurements, nonRiconosciute.length),
    non_riconosciute: nonRiconosciute.slice(0, 20),
  };
}

function registra(
  dove: Map<string, RigaLetta>,
  code: string,
  value: number,
  unit: string | null,
  riga: string,
  data: string | null,
  confidence: number,
) {
  const metrica = METRIC_DEFINITIONS.find((d) => d.code === code);
  if (!metrica) return;

  // Se lo stesso esame compare due volte, tiene quello letto con più
  // fiducia: capita con le intestazioni ripetute a ogni pagina.
  const esistente = dove.get(code);
  if (esistente && esistente.confidence >= confidence) return;

  dove.set(code, {
    metric_code: code,
    label: metrica.label,
    value,
    category: null,
    unit,
    measured_on: data,
    confidence,
    // Il pezzo di testo da cui viene: è ciò che permette a un medico di
    // verificare in due secondi invece che riaprire il PDF.
    source_excerpt: riga.slice(0, 160),
  });
}

/** Converte quando serve, e abbassa la fiducia quando ha dovuto farlo. */
function converti(
  metrica: MetricDefinition,
  valore: number,
  unita: string | null,
): { valoreFinale: number; fiducia: number } {
  if (!unita) {
    // Nessuna unità: plausibile ma non certo. La validazione a valle
    // scarterà comunque i valori fuori dall'intervallo fisiologico.
    return { valoreFinale: valore, fiducia: 0.7 };
  }

  if (unita === metrica.unit) return { valoreFinale: valore, fiducia: 0.95 };

  const fattore = CONVERSIONI[metrica.code]?.[unita];
  if (fattore) return { valoreFinale: Number((valore * fattore).toFixed(2)), fiducia: 0.85 };

  // Unità che non c'entra: quasi sempre è la riga sbagliata.
  return { valoreFinale: valore, fiducia: 0.4 };
}

function componiSintesi(
  quante: number,
  diLaboratorio: number,
  data: string | null,
  nonRiconosciute: number,
): string {
  if (quante === 0) {
    return "Non ho riconosciuto nessun parametro in questo documento. Può essere un referto scansionato — un'immagine, non testo — oppure un tipo di esame che il catalogo non copre ancora.";
  }

  const parti = [
    `Riconosciuti ${quante} parametri${diLaboratorio > 0 ? `, di cui ${diLaboratorio} di laboratorio` : ""}`,
  ];
  parti.push(data ? `datati ${data}` : "senza una data leggibile nel documento");
  if (nonRiconosciute > 0) {
    parti.push(`${nonRiconosciute} righe con numeri non corrispondono al catalogo e sono state ignorate`);
  }

  return `${parti.join(", ")}.`;
}

function prossimiPassi(measurements: RigaLetta[], nonRiconosciute: number): string[] {
  const passi: string[] = [];

  const senzaData = measurements.some((m) => m.measured_on === null);
  if (senzaData) {
    passi.push("Nessuna data leggibile nel documento: verificare quando è stato eseguito l'esame.");
  }

  const dubbie = measurements.filter((m) => m.confidence < 0.6);
  if (dubbie.length > 0) {
    passi.push(
      `Da controllare a occhio: ${dubbie.map((m) => m.label).join(", ")} — l'unità di misura letta non corrisponde a quella attesa.`,
    );
  }

  if (nonRiconosciute > 0) {
    passi.push(
      `${nonRiconosciute} righe con valori non sono nel catalogo delle metriche: se sono esami che seguiamo, vanno aggiunti.`,
    );
  }

  return passi;
}
