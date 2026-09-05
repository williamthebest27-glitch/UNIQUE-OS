import type { CategoriaClinica } from "./tipi.ts";

/**
 * Il catalogo dei biomarcatori che il motore sa riconoscere.
 *
 * ⚠️ **Gli intervalli qui dentro sono una struttura di lavoro, non un
 * riferimento clinicamente validato.** Vanno confermati dal team medico
 * prima di qualunque uso reale. La stessa avvertenza vale per
 * `lib/score/metrics.ts`, e per la stessa ragione.
 *
 * Ma c'è una garanzia che rende il rischio molto più piccolo di quanto
 * sembri, ed è la regola centrale del modulo: **quando il documento
 * stampa il proprio intervallo, vince quello.** Un referto italiano
 * riporta quasi sempre i valori di riferimento del laboratorio che ha
 * fatto l'analisi, e sono quelli giusti — dipendono dal metodo, dallo
 * strumento, dalla popolazione. Gli intervalli di questo file entrano in
 * gioco soltanto quando il documento tace, e ogni valore porta scritto
 * da dove viene il metro con cui è stato giudicato.
 *
 * ---
 *
 * **Perché un catalogo separato da quello dello Score.**
 * `lib/score/metrics.ts` contiene le trentasette metriche che *calcolano
 * il Longevity Score*, con i loro pesi e le loro curve. Aggiungere qui
 * dentro la ferritina o il TSH cambierebbe il punteggio di ogni paziente
 * — o costringerebbe a dare peso zero a metà catalogo, che è un modo
 * contorto di dire che sono due cose diverse.
 *
 * Sono due cose diverse. Un referto contiene quaranta esami; il
 * punteggio ne usa dieci. Gli altri trenta sono dati clinici veri, che
 * vanno letti, mostrati e seguiti nel tempo — semplicemente non entrano
 * in una formula. `metricCode` è il ponte: dove esiste, il biomarcatore
 * alimenta anche lo Score passando dalla validazione di sempre.
 */

/** Un intervallo di riferimento del catalogo. `null` significa aperto. */
export interface Riferimento {
  min: number | null;
  max: number | null;
}

/**
 * Una conversione fra unità: `valore × fattore + offset`.
 *
 * Moltiplicativa nella quasi totalità dei casi. L'offset esiste per
 * l'emoglobina glicata, che fra la scala percentuale e quella IFCC ha
 * una relazione lineare con intercetta — e trattarla come una
 * proporzione darebbe un errore di due punti su un esame in cui due
 * punti sono la differenza fra normale e diabete.
 */
export interface Conversione {
  fattore: number;
  offset?: number;
}

export interface VoceCatalogo {
  /** Il nome canonico. Uno per concetto clinico, stabile per sempre. */
  canonical: string;
  display: string;
  categoria: CategoriaClinica;
  /** L'unità in cui il catalogo esprime i propri intervalli. */
  unita: string;
  /**
   * Come l'esame compare sui referti. Italiano e inglese insieme: un
   * laboratorio italiano scrive "Colesterolo LDL", un macchinario
   * tedesco esporta "LDL Cholesterol", e sono lo stesso esame.
   */
  sinonimi: readonly string[];
  /** Il codice dello Score, dove questo biomarcatore ne alimenta uno. */
  metricCode?: string;
  /** L'intervallo di riferimento generale. */
  riferimento?: Riferimento;
  /** Dove il sesso cambia il riferimento in modo clinicamente rilevante. */
  perSesso?: { M: Riferimento; F: Riferimento };
  /**
   * L'intervallo che Unique considera ottimale.
   *
   * Non è «più normale del normale»: è la fascia in cui la longevity
   * medicine punta, che spesso è più stretta dell'intervallo di
   * laboratorio. Un LDL di 115 è dentro molti riferimenti di
   * laboratorio e non è un obiettivo.
   */
  ottimale?: [number, number];
  /**
   * Le soglie oltre le quali il valore va guardato oggi, non alla
   * prossima visita. Sono il confine fra HIGH e CRITICAL.
   */
  critico?: { sotto?: number; sopra?: number };
  /** Unità alternative e come si convertono in quella canonica. */
  conversioni?: Readonly<Record<string, Conversione>>;
  /**
   * L'intervallo fisiologicamente possibile. Fuori di qui non è un
   * paziente grave: è un errore di lettura, quasi sempre di unità.
   */
  plausibile: readonly [number, number];
  /** Vero per gli esami che non hanno un numero: "negativo", "tracce". */
  qualitativo?: boolean;
}

/* ── Conversioni ricorrenti ───────────────────────────────────────── */

// I lipidi condividono il fattore fra mmol/L e mg/dL perché la massa
// molare del colesterolo è la stessa in ogni frazione.
const DA_MMOL_COLESTEROLO: Record<string, Conversione> = { "mmol/L": { fattore: 38.67 } };

export const CATALOGO: readonly VoceCatalogo[] = [
  /* ── Glicemia e insulina ────────────────────────────────────────── */
  {
    canonical: "GLUCOSE_FASTING",
    display: "Glicemia a digiuno",
    categoria: "glicemia",
    unita: "mg/dL",
    sinonimi: ["glicemia", "glucosio", "glucosio a digiuno", "glicemia a digiuno", "glucose", "fasting glucose"],
    metricCode: "glucose_fasting",
    riferimento: { min: 70, max: 99 },
    ottimale: [75, 90],
    critico: { sotto: 55, sopra: 200 },
    conversioni: { "mmol/L": { fattore: 18.016 } },
    plausibile: [20, 900],
  },
  {
    canonical: "HBA1C",
    display: "Emoglobina glicata",
    categoria: "glicemia",
    unita: "%",
    sinonimi: ["emoglobina glicata", "glicata", "hba1c", "hb a1c", "a1c", "emoglobina glicosilata"],
    metricCode: "hba1c",
    riferimento: { min: 4, max: 5.6 },
    ottimale: [4.6, 5.2],
    critico: { sopra: 8 },
    // La scala IFCC è lineare ma con intercetta: trattarla come una
    // proporzione sposterebbe il risultato di due punti percentuali.
    conversioni: { "mmol/mol": { fattore: 0.0915, offset: 2.15 } },
    plausibile: [3, 20],
  },
  {
    canonical: "INSULIN_FASTING",
    display: "Insulina a digiuno",
    categoria: "glicemia",
    unita: "µU/mL",
    sinonimi: ["insulina", "insulina a digiuno", "insulinemia", "insulin"],
    metricCode: "insulin_fasting",
    riferimento: { min: 2, max: 15 },
    ottimale: [2, 6],
    conversioni: { "pmol/L": { fattore: 0.1443 } },
    plausibile: [0.2, 400],
  },
  {
    canonical: "HOMA_IR",
    display: "Indice HOMA-IR",
    categoria: "metabolico",
    unita: "",
    sinonimi: ["homa", "homa-ir", "homa ir", "indice homa", "insulino resistenza"],
    riferimento: { min: 0, max: 2.5 },
    ottimale: [0, 1.5],
    plausibile: [0, 60],
  },
  {
    canonical: "C_PEPTIDE",
    display: "Peptide C",
    categoria: "glicemia",
    unita: "ng/mL",
    sinonimi: ["peptide c", "c-peptide", "c peptide"],
    riferimento: { min: 0.8, max: 3.9 },
    plausibile: [0.05, 40],
  },

  /* ── Lipidi ─────────────────────────────────────────────────────── */
  {
    canonical: "CHOLESTEROL_TOTAL",
    display: "Colesterolo totale",
    categoria: "lipidi",
    unita: "mg/dL",
    sinonimi: ["colesterolo totale", "colesterolo tot", "total cholesterol", "colesterolemia"],
    riferimento: { min: 120, max: 200 },
    ottimale: [140, 180],
    critico: { sopra: 320 },
    conversioni: DA_MMOL_COLESTEROLO,
    plausibile: [50, 800],
  },
  {
    canonical: "LDL_CHOLESTEROL",
    display: "Colesterolo LDL",
    categoria: "lipidi",
    unita: "mg/dL",
    sinonimi: ["ldl", "colesterolo ldl", "ldl cholesterol", "ldl-c", "colesterolo ldl calcolato"],
    metricCode: "ldl",
    riferimento: { min: 0, max: 116 },
    ottimale: [0, 80],
    critico: { sopra: 190 },
    conversioni: DA_MMOL_COLESTEROLO,
    plausibile: [10, 500],
  },
  {
    canonical: "HDL_CHOLESTEROL",
    display: "Colesterolo HDL",
    categoria: "lipidi",
    unita: "mg/dL",
    sinonimi: ["hdl", "colesterolo hdl", "hdl cholesterol", "hdl-c"],
    metricCode: "hdl",
    perSesso: { M: { min: 40, max: 90 }, F: { min: 50, max: 95 } },
    ottimale: [55, 90],
    critico: { sotto: 25 },
    conversioni: DA_MMOL_COLESTEROLO,
    plausibile: [8, 150],
  },
  {
    canonical: "NON_HDL_CHOLESTEROL",
    display: "Colesterolo non-HDL",
    categoria: "lipidi",
    unita: "mg/dL",
    sinonimi: ["colesterolo non hdl", "non-hdl", "non hdl cholesterol", "colesterolo non-hdl"],
    riferimento: { min: 0, max: 145 },
    ottimale: [0, 100],
    conversioni: DA_MMOL_COLESTEROLO,
    plausibile: [10, 600],
  },
  {
    canonical: "TRIGLYCERIDES",
    display: "Trigliceridi",
    categoria: "lipidi",
    unita: "mg/dL",
    sinonimi: ["trigliceridi", "triglycerides", "trigliceridemia", "tg"],
    metricCode: "triglycerides",
    riferimento: { min: 0, max: 150 },
    ottimale: [0, 90],
    critico: { sopra: 500 },
    conversioni: { "mmol/L": { fattore: 88.57 } },
    plausibile: [10, 3000],
  },
  {
    canonical: "APOB",
    display: "Apolipoproteina B",
    categoria: "cardiovascolare",
    unita: "mg/dL",
    sinonimi: ["apob", "apo b", "apolipoproteina b", "apolipoprotein b"],
    metricCode: "apob",
    riferimento: { min: 0, max: 100 },
    ottimale: [0, 70],
    critico: { sopra: 150 },
    conversioni: { "g/L": { fattore: 100 } },
    plausibile: [10, 400],
  },
  {
    canonical: "APOA1",
    display: "Apolipoproteina A1",
    categoria: "cardiovascolare",
    unita: "mg/dL",
    sinonimi: ["apoa1", "apo a1", "apolipoproteina a1", "apolipoprotein a1"],
    perSesso: { M: { min: 110, max: 180 }, F: { min: 125, max: 215 } },
    conversioni: { "g/L": { fattore: 100 } },
    plausibile: [30, 400],
  },
  {
    canonical: "LIPOPROTEIN_A",
    display: "Lipoproteina (a)",
    categoria: "cardiovascolare",
    unita: "mg/dL",
    sinonimi: ["lipoproteina a", "lp(a)", "lpa", "lipoprotein (a)", "lipoproteina (a)"],
    riferimento: { min: 0, max: 30 },
    ottimale: [0, 20],
    critico: { sopra: 90 },
    plausibile: [0, 400],
  },

  /* ── Funzionalità epatica ───────────────────────────────────────── */
  {
    canonical: "ALT",
    display: "ALT (GPT)",
    categoria: "epatica",
    unita: "U/L",
    sinonimi: ["alt", "gpt", "transaminasi gpt", "alanina aminotransferasi", "sgpt", "alt (gpt)"],
    metricCode: "alt",
    perSesso: { M: { min: 0, max: 41 }, F: { min: 0, max: 33 } },
    ottimale: [0, 25],
    critico: { sopra: 200 },
    plausibile: [1, 5000],
  },
  {
    canonical: "AST",
    display: "AST (GOT)",
    categoria: "epatica",
    unita: "U/L",
    sinonimi: ["ast", "got", "transaminasi got", "aspartato aminotransferasi", "sgot", "ast (got)"],
    perSesso: { M: { min: 0, max: 40 }, F: { min: 0, max: 32 } },
    ottimale: [0, 25],
    critico: { sopra: 200 },
    plausibile: [1, 5000],
  },
  {
    canonical: "GGT",
    display: "Gamma GT",
    categoria: "epatica",
    unita: "U/L",
    sinonimi: ["ggt", "gamma gt", "gamma-gt", "gammaglutamil transferasi", "y-gt"],
    perSesso: { M: { min: 0, max: 60 }, F: { min: 0, max: 40 } },
    ottimale: [0, 25],
    critico: { sopra: 300 },
    plausibile: [1, 3000],
  },
  {
    canonical: "ALP",
    display: "Fosfatasi alcalina",
    categoria: "epatica",
    unita: "U/L",
    sinonimi: ["fosfatasi alcalina", "alp", "alkaline phosphatase", "fal"],
    riferimento: { min: 40, max: 130 },
    plausibile: [5, 2000],
  },
  {
    canonical: "BILIRUBIN_TOTAL",
    display: "Bilirubina totale",
    categoria: "epatica",
    unita: "mg/dL",
    sinonimi: ["bilirubina totale", "bilirubina tot", "total bilirubin", "bilirubinemia totale"],
    riferimento: { min: 0.1, max: 1.2 },
    critico: { sopra: 5 },
    conversioni: { "µmol/L": { fattore: 0.05847 }, "umol/L": { fattore: 0.05847 } },
    plausibile: [0, 60],
  },
  {
    canonical: "BILIRUBIN_DIRECT",
    display: "Bilirubina diretta",
    categoria: "epatica",
    unita: "mg/dL",
    sinonimi: ["bilirubina diretta", "bilirubina coniugata", "direct bilirubin"],
    riferimento: { min: 0, max: 0.3 },
    conversioni: { "µmol/L": { fattore: 0.05847 }, "umol/L": { fattore: 0.05847 } },
    plausibile: [0, 40],
  },
  {
    canonical: "ALBUMIN",
    display: "Albumina",
    categoria: "epatica",
    unita: "g/dL",
    sinonimi: ["albumina", "albumin", "albuminemia"],
    riferimento: { min: 3.5, max: 5.2 },
    ottimale: [4.2, 5 ],
    conversioni: { "g/L": { fattore: 0.1 } },
    plausibile: [1, 8],
  },

  /* ── Funzionalità renale ────────────────────────────────────────── */
  {
    canonical: "CREATININE",
    display: "Creatinina",
    categoria: "renale",
    unita: "mg/dL",
    sinonimi: ["creatinina", "creatinine", "creatininemia"],
    perSesso: { M: { min: 0.7, max: 1.2 }, F: { min: 0.5, max: 1.0 } },
    critico: { sopra: 3 },
    conversioni: { "µmol/L": { fattore: 0.0113 }, "umol/L": { fattore: 0.0113 } },
    plausibile: [0.1, 25],
  },
  {
    canonical: "EGFR",
    display: "Filtrato glomerulare stimato",
    categoria: "renale",
    unita: "mL/min/1.73m²",
    sinonimi: ["egfr", "e-gfr", "vfg", "filtrato glomerulare", "gfr", "velocità di filtrazione glomerulare", "ckd-epi"],
    riferimento: { min: 90, max: 140 },
    critico: { sotto: 30 },
    plausibile: [1, 200],
  },
  {
    canonical: "UREA",
    display: "Azotemia (urea)",
    categoria: "renale",
    unita: "mg/dL",
    sinonimi: ["azotemia", "urea", "uremia"],
    riferimento: { min: 17, max: 49 },
    conversioni: { "mmol/L": { fattore: 6.006 } },
    plausibile: [3, 500],
  },
  {
    // Azoto ureico e urea non sono lo stesso numero — il rapporto è
    // 2,14 — e tenerli distinti evita di confonderli quando un referto
    // riporta l'uno e lo storico l'altro.
    canonical: "BUN",
    display: "Azoto ureico (BUN)",
    categoria: "renale",
    unita: "mg/dL",
    sinonimi: ["azoto ureico", "bun", "blood urea nitrogen"],
    riferimento: { min: 8, max: 23 },
    plausibile: [1, 250],
  },
  {
    canonical: "URIC_ACID",
    display: "Acido urico",
    categoria: "renale",
    unita: "mg/dL",
    sinonimi: ["acido urico", "uricemia", "uric acid", "urato"],
    perSesso: { M: { min: 3.4, max: 7 }, F: { min: 2.4, max: 6 } },
    ottimale: [3.4, 5.5],
    critico: { sopra: 11 },
    conversioni: { "µmol/L": { fattore: 0.0168 }, "umol/L": { fattore: 0.0168 } },
    plausibile: [0.5, 30],
  },
  {
    canonical: "CYSTATIN_C",
    display: "Cistatina C",
    categoria: "renale",
    unita: "mg/L",
    sinonimi: ["cistatina c", "cystatin c", "cistatina"],
    riferimento: { min: 0.5, max: 1.0 },
    plausibile: [0.1, 10],
  },

  /* ── Tiroide ────────────────────────────────────────────────────── */
  {
    canonical: "TSH",
    display: "TSH",
    categoria: "tiroide",
    unita: "µU/mL",
    sinonimi: ["tsh", "tireotropina", "ormone tireostimolante", "thyrotropin"],
    riferimento: { min: 0.4, max: 4 },
    ottimale: [0.8, 2.5],
    critico: { sotto: 0.05, sopra: 10 },
    // µU/mL, mUI/L e µUI/mL sono la stessa quantità scritta in tre modi.
    conversioni: { "mIU/L": { fattore: 1 }, "µIU/mL": { fattore: 1 } },
    plausibile: [0.001, 200],
  },
  {
    canonical: "FT4",
    display: "FT4 (tiroxina libera)",
    categoria: "tiroide",
    unita: "ng/dL",
    sinonimi: ["ft4", "ft-4", "t4 libera", "tiroxina libera", "free t4"],
    riferimento: { min: 0.8, max: 1.8 },
    conversioni: { "pmol/L": { fattore: 0.0777 }, "ng/L": { fattore: 0.1 } },
    plausibile: [0.05, 15],
  },
  {
    canonical: "FT3",
    display: "FT3 (triiodotironina libera)",
    categoria: "tiroide",
    unita: "pg/mL",
    sinonimi: ["ft3", "ft-3", "t3 libera", "triiodotironina libera", "free t3"],
    riferimento: { min: 2.3, max: 4.2 },
    conversioni: { "pmol/L": { fattore: 0.651 } },
    plausibile: [0.2, 40],
  },
  {
    canonical: "ANTI_TPO",
    display: "Anticorpi anti-TPO",
    categoria: "tiroide",
    unita: "U/mL",
    sinonimi: ["anti tpo", "anti-tpo", "ab anti tpo", "anticorpi anti tireoperossidasi", "tpoab"],
    riferimento: { min: 0, max: 34 },
    plausibile: [0, 10000],
  },
  {
    canonical: "ANTI_TG",
    display: "Anticorpi anti-tireoglobulina",
    categoria: "tiroide",
    unita: "U/mL",
    sinonimi: ["anti tg", "anti-tg", "anticorpi anti tireoglobulina", "tgab"],
    riferimento: { min: 0, max: 115 },
    plausibile: [0, 10000],
  },

  /* ── Ormoni ─────────────────────────────────────────────────────── */
  {
    canonical: "TESTOSTERONE_TOTAL",
    display: "Testosterone totale",
    categoria: "ormoni",
    unita: "ng/dL",
    sinonimi: ["testosterone", "testosterone totale", "total testosterone", "testosteronemia"],
    perSesso: { M: { min: 300, max: 900 }, F: { min: 15, max: 70 } },
    conversioni: { "nmol/L": { fattore: 28.84 }, "ng/mL": { fattore: 100 } },
    plausibile: [1, 3000],
  },
  {
    canonical: "TESTOSTERONE_FREE",
    display: "Testosterone libero",
    categoria: "ormoni",
    unita: "pg/mL",
    sinonimi: ["testosterone libero", "free testosterone", "testosterone free"],
    perSesso: { M: { min: 8.7, max: 25 }, F: { min: 0.1, max: 6.4 } },
    plausibile: [0.01, 200],
  },
  {
    canonical: "ESTRADIOL",
    display: "Estradiolo",
    categoria: "ormoni",
    unita: "pg/mL",
    sinonimi: ["estradiolo", "estradiol", "e2", "17-beta estradiolo"],
    // Nella donna dipende dalla fase del ciclo: un intervallo unico
    // direbbe il falso, e non se ne mette nessuno.
    perSesso: { M: { min: 10, max: 40 }, F: { min: 0, max: 0 } },
    conversioni: { "pmol/L": { fattore: 0.2724 } },
    plausibile: [1, 5000],
  },
  {
    canonical: "PROGESTERONE",
    display: "Progesterone",
    categoria: "ormoni",
    unita: "ng/mL",
    sinonimi: ["progesterone", "progesteronemia"],
    conversioni: { "nmol/L": { fattore: 0.3145 } },
    plausibile: [0.01, 300],
  },
  {
    canonical: "CORTISOL",
    display: "Cortisolo",
    categoria: "ormoni",
    unita: "µg/dL",
    sinonimi: ["cortisolo", "cortisol", "cortisolemia", "cortisolo basale"],
    // L'intervallo del mattino: il cortisolo ha un ritmo circadiano, e
    // un prelievo pomeridiano si legge con un altro metro.
    riferimento: { min: 6, max: 23 },
    conversioni: { "nmol/L": { fattore: 0.0363 }, "ng/mL": { fattore: 0.1 } },
    plausibile: [0.1, 150],
  },
  {
    canonical: "DHEA_S",
    display: "DHEA solfato",
    categoria: "ormoni",
    unita: "µg/dL",
    sinonimi: ["dhea", "dhea-s", "dheas", "deidroepiandrosterone solfato"],
    perSesso: { M: { min: 80, max: 560 }, F: { min: 35, max: 430 } },
    conversioni: { "µmol/L": { fattore: 36.85 } },
    plausibile: [1, 2000],
  },
  {
    canonical: "SHBG",
    display: "SHBG",
    categoria: "ormoni",
    unita: "nmol/L",
    sinonimi: ["shbg", "sex hormone binding globulin", "globulina legante ormoni sessuali"],
    perSesso: { M: { min: 18, max: 54 }, F: { min: 32, max: 128 } },
    plausibile: [1, 400],
  },
  {
    canonical: "IGF1",
    display: "IGF-1",
    categoria: "ormoni",
    unita: "ng/mL",
    sinonimi: ["igf-1", "igf 1", "somatomedina c", "insulin like growth factor"],
    riferimento: { min: 90, max: 280 },
    plausibile: [5, 1500],
  },
  {
    canonical: "FSH",
    display: "FSH",
    categoria: "ormoni",
    unita: "U/L",
    sinonimi: ["fsh", "ormone follicolo stimolante"],
    plausibile: [0.1, 300],
  },
  {
    canonical: "LH",
    display: "LH",
    categoria: "ormoni",
    unita: "U/L",
    sinonimi: ["lh", "ormone luteinizzante"],
    plausibile: [0.1, 300],
  },
  {
    canonical: "PROLACTIN",
    display: "Prolattina",
    categoria: "ormoni",
    unita: "ng/mL",
    sinonimi: ["prolattina", "prolactin", "prl"],
    perSesso: { M: { min: 3, max: 15 }, F: { min: 4, max: 23 } },
    conversioni: { "mU/L": { fattore: 0.0472 }, "µU/mL": { fattore: 0.0472 } },
    plausibile: [0.1, 500],
  },
  {
    canonical: "PSA_TOTAL",
    display: "PSA totale",
    categoria: "ormoni",
    unita: "ng/mL",
    sinonimi: ["psa", "psa totale", "antigene prostatico specifico"],
    riferimento: { min: 0, max: 4 },
    critico: { sopra: 10 },
    plausibile: [0, 500],
  },

  /* ── Vitamine ───────────────────────────────────────────────────── */
  {
    canonical: "VITAMIN_D_25OH",
    display: "25-OH Vitamina D",
    categoria: "vitamine",
    unita: "ng/mL",
    sinonimi: [
      "vitamina d", "vit d", "vit. d", "25-oh vitamina d", "25 oh vitamina d",
      "25(oh)d", "25-oh-d", "25 hydroxy vitamin d", "vitamin d", "colecalciferolo",
      "25-idrossivitamina d", "calcifediolo",
    ],
    metricCode: "vitamin_d",
    riferimento: { min: 30, max: 100 },
    ottimale: [40, 70],
    critico: { sotto: 10 },
    conversioni: { "nmol/L": { fattore: 0.4006 } },
    plausibile: [1, 250],
  },
  {
    canonical: "VITAMIN_B12",
    display: "Vitamina B12",
    categoria: "vitamine",
    unita: "pg/mL",
    sinonimi: ["vitamina b12", "vit b12", "b12", "cobalamina", "vitamin b12"],
    riferimento: { min: 200, max: 900 },
    ottimale: [400, 800],
    critico: { sotto: 150 },
    conversioni: { "pmol/L": { fattore: 1.355 } },
    plausibile: [20, 5000],
  },
  {
    canonical: "FOLATE",
    display: "Folati",
    categoria: "vitamine",
    unita: "ng/mL",
    sinonimi: ["folati", "acido folico", "folato", "vitamina b9", "folate"],
    riferimento: { min: 3.9, max: 20 },
    critico: { sotto: 2 },
    conversioni: { "nmol/L": { fattore: 0.4413 } },
    plausibile: [0.2, 100],
  },
  {
    canonical: "HOMOCYSTEINE",
    display: "Omocisteina",
    categoria: "cardiovascolare",
    unita: "µmol/L",
    sinonimi: ["omocisteina", "homocysteine", "omocisteinemia"],
    riferimento: { min: 5, max: 15 },
    ottimale: [5, 9],
    critico: { sopra: 30 },
    plausibile: [1, 200],
  },

  /* ── Minerali ed elettroliti ────────────────────────────────────── */
  {
    canonical: "SODIUM",
    display: "Sodio",
    categoria: "minerali",
    unita: "mmol/L",
    sinonimi: ["sodio", "sodium", "na+", "sodiemia"],
    riferimento: { min: 136, max: 145 },
    critico: { sotto: 125, sopra: 155 },
    plausibile: [100, 200],
  },
  {
    canonical: "POTASSIUM",
    display: "Potassio",
    categoria: "minerali",
    unita: "mmol/L",
    sinonimi: ["potassio", "potassium", "k+", "potassiemia"],
    riferimento: { min: 3.5, max: 5.1 },
    critico: { sotto: 2.8, sopra: 6 },
    plausibile: [1.5, 10],
  },
  {
    canonical: "CALCIUM",
    display: "Calcio",
    categoria: "minerali",
    unita: "mg/dL",
    sinonimi: ["calcio", "calcium", "calcemia", "calcio totale"],
    riferimento: { min: 8.6, max: 10.2 },
    critico: { sotto: 7, sopra: 12 },
    conversioni: { "mmol/L": { fattore: 4.008 } },
    plausibile: [3, 20],
  },
  {
    canonical: "MAGNESIUM",
    display: "Magnesio",
    categoria: "minerali",
    unita: "mg/dL",
    sinonimi: ["magnesio", "magnesium", "magnesiemia", "mg"],
    riferimento: { min: 1.7, max: 2.4 },
    ottimale: [2, 2.4],
    conversioni: { "mmol/L": { fattore: 2.431 } },
    plausibile: [0.3, 10],
  },
  {
    canonical: "PHOSPHORUS",
    display: "Fosforo",
    categoria: "minerali",
    unita: "mg/dL",
    sinonimi: ["fosforo", "fosforemia", "phosphorus", "fosfati"],
    riferimento: { min: 2.5, max: 4.5 },
    conversioni: { "mmol/L": { fattore: 3.097 } },
    plausibile: [0.5, 15],
  },
  {
    canonical: "ZINC",
    display: "Zinco",
    categoria: "minerali",
    unita: "µg/dL",
    sinonimi: ["zinco", "zinc", "zn"],
    riferimento: { min: 70, max: 120 },
    conversioni: { "µmol/L": { fattore: 6.538 } },
    plausibile: [10, 500],
  },
  {
    canonical: "SELENIUM",
    display: "Selenio",
    categoria: "minerali",
    unita: "µg/L",
    sinonimi: ["selenio", "selenium", "se"],
    riferimento: { min: 70, max: 150 },
    plausibile: [5, 1000],
  },

  /* ── Assetto marziale ───────────────────────────────────────────── */
  {
    canonical: "FERRITIN",
    display: "Ferritina",
    categoria: "ferro",
    unita: "ng/mL",
    sinonimi: ["ferritina", "ferritin", "ferritinemia"],
    perSesso: { M: { min: 30, max: 400 }, F: { min: 15, max: 200 } },
    ottimale: [50, 150],
    critico: { sotto: 10, sopra: 1000 },
    // ng/mL e µg/L sono la stessa quantità: la conversione è l'identità,
    // e dichiararla evita che l'unità venga segnalata come inattesa.
    conversioni: { "µg/L": { fattore: 1 }, "ug/L": { fattore: 1 } },
    plausibile: [1, 20000],
  },
  {
    canonical: "IRON_SERUM",
    display: "Sideremia",
    categoria: "ferro",
    unita: "µg/dL",
    sinonimi: ["sideremia", "ferro", "ferro sierico", "serum iron", "iron"],
    perSesso: { M: { min: 65, max: 175 }, F: { min: 50, max: 170 } },
    conversioni: { "µmol/L": { fattore: 5.585 } },
    plausibile: [5, 800],
  },
  {
    canonical: "TRANSFERRIN",
    display: "Transferrina",
    categoria: "ferro",
    unita: "mg/dL",
    sinonimi: ["transferrina", "transferrin"],
    riferimento: { min: 200, max: 360 },
    conversioni: { "g/L": { fattore: 100 } },
    plausibile: [20, 800],
  },
  {
    canonical: "TRANSFERRIN_SATURATION",
    display: "Saturazione della transferrina",
    categoria: "ferro",
    unita: "%",
    sinonimi: ["saturazione transferrina", "sat transferrina", "tsat", "% saturazione transferrina"],
    riferimento: { min: 20, max: 50 },
    critico: { sopra: 60 },
    plausibile: [0, 100],
  },

  /* ── Emocromo ───────────────────────────────────────────────────── */
  {
    canonical: "HEMOGLOBIN",
    display: "Emoglobina",
    categoria: "ematologia",
    unita: "g/dL",
    sinonimi: ["emoglobina", "hb", "hgb", "haemoglobin", "hemoglobin"],
    perSesso: { M: { min: 13.5, max: 17.5 }, F: { min: 12, max: 16 } },
    critico: { sotto: 8, sopra: 20 },
    conversioni: { "g/L": { fattore: 0.1 } },
    plausibile: [2, 25],
  },
  {
    canonical: "HEMATOCRIT",
    display: "Ematocrito",
    categoria: "ematologia",
    unita: "%",
    sinonimi: ["ematocrito", "hct", "hematocrit"],
    perSesso: { M: { min: 40, max: 52 }, F: { min: 36, max: 47 } },
    critico: { sotto: 25 },
    plausibile: [10, 70],
  },
  {
    canonical: "RBC",
    display: "Globuli rossi",
    categoria: "ematologia",
    unita: "10⁶/µL",
    sinonimi: ["globuli rossi", "eritrociti", "rbc", "gr", "red blood cells"],
    perSesso: { M: { min: 4.5, max: 5.9 }, F: { min: 4.1, max: 5.1 } },
    plausibile: [1, 10],
  },
  {
    canonical: "WBC",
    display: "Globuli bianchi",
    categoria: "ematologia",
    unita: "10³/µL",
    sinonimi: ["globuli bianchi", "leucociti", "wbc", "gb", "white blood cells"],
    riferimento: { min: 4, max: 10 },
    critico: { sotto: 2, sopra: 20 },
    plausibile: [0.1, 200],
  },
  {
    canonical: "PLATELETS",
    display: "Piastrine",
    categoria: "ematologia",
    unita: "10³/µL",
    sinonimi: ["piastrine", "plt", "platelets", "trombociti"],
    riferimento: { min: 150, max: 400 },
    critico: { sotto: 50, sopra: 900 },
    plausibile: [3, 3000],
  },
  {
    canonical: "MCV",
    display: "Volume corpuscolare medio",
    categoria: "ematologia",
    unita: "fL",
    sinonimi: ["mcv", "volume corpuscolare medio", "vcm"],
    riferimento: { min: 80, max: 100 },
    plausibile: [40, 160],
  },
  {
    canonical: "NEUTROPHILS_PCT",
    display: "Neutrofili",
    categoria: "ematologia",
    unita: "%",
    sinonimi: ["neutrofili", "neutrofili %", "neutrophils"],
    riferimento: { min: 40, max: 75 },
    plausibile: [0, 100],
  },
  {
    canonical: "LYMPHOCYTES_PCT",
    display: "Linfociti",
    categoria: "ematologia",
    unita: "%",
    sinonimi: ["linfociti", "linfociti %", "lymphocytes"],
    riferimento: { min: 20, max: 45 },
    plausibile: [0, 100],
  },

  /* ── Infiammazione ──────────────────────────────────────────────── */
  {
    canonical: "CRP",
    display: "Proteina C reattiva",
    categoria: "infiammazione",
    unita: "mg/L",
    sinonimi: ["pcr", "proteina c reattiva", "crp", "c reactive protein", "pcr quantitativa"],
    riferimento: { min: 0, max: 5 },
    ottimale: [0, 1],
    critico: { sopra: 50 },
    // mg/dL → mg/L è un fattore dieci, ed è l'errore di unità più
    // frequente su questo esame.
    conversioni: { "mg/dL": { fattore: 10 } },
    plausibile: [0, 500],
  },
  {
    canonical: "HS_CRP",
    display: "PCR ad alta sensibilità",
    categoria: "cardiovascolare",
    unita: "mg/L",
    sinonimi: ["pcr hs", "hs-crp", "hscrp", "pcr alta sensibilità", "high sensitivity crp"],
    riferimento: { min: 0, max: 3 },
    ottimale: [0, 1],
    conversioni: { "mg/dL": { fattore: 10 } },
    plausibile: [0, 200],
  },
  {
    canonical: "ESR",
    display: "VES",
    categoria: "infiammazione",
    unita: "mm/h",
    sinonimi: ["ves", "velocità di eritrosedimentazione", "esr", "sedimentazione"],
    perSesso: { M: { min: 0, max: 15 }, F: { min: 0, max: 20 } },
    plausibile: [0, 200],
  },
  {
    canonical: "FIBRINOGEN",
    display: "Fibrinogeno",
    categoria: "coagulazione",
    unita: "mg/dL",
    sinonimi: ["fibrinogeno", "fibrinogen"],
    riferimento: { min: 200, max: 400 },
    conversioni: { "g/L": { fattore: 100 } },
    plausibile: [30, 1200],
  },
  {
    canonical: "INR",
    display: "INR",
    categoria: "coagulazione",
    unita: "",
    sinonimi: ["inr", "rapporto internazionale normalizzato"],
    riferimento: { min: 0.8, max: 1.2 },
    critico: { sopra: 4.5 },
    plausibile: [0.4, 12],
  },

  /* ── Marker cardiovascolari e metabolici ────────────────────────── */
  {
    canonical: "NT_PROBNP",
    display: "NT-proBNP",
    categoria: "cardiovascolare",
    unita: "pg/mL",
    sinonimi: ["nt-probnp", "ntprobnp", "probnp", "peptide natriuretico"],
    riferimento: { min: 0, max: 125 },
    critico: { sopra: 900 },
    plausibile: [0, 40000],
  },
  {
    canonical: "TROPONIN_HS",
    display: "Troponina ad alta sensibilità",
    categoria: "cardiovascolare",
    unita: "ng/L",
    sinonimi: ["troponina", "troponina i", "troponina t", "hs-troponina", "troponin"],
    riferimento: { min: 0, max: 14 },
    critico: { sopra: 50 },
    plausibile: [0, 50000],
  },

  /* ── Parametri vitali e composizione corporea ───────────────────── */
  {
    canonical: "SYSTOLIC_BP",
    display: "Pressione sistolica",
    categoria: "parametri-vitali",
    unita: "mmHg",
    sinonimi: ["pressione sistolica", "pa sistolica", "massima", "systolic", "sbp"],
    metricCode: "sbp",
    riferimento: { min: 90, max: 130 },
    ottimale: [105, 120],
    critico: { sotto: 85, sopra: 180 },
    plausibile: [50, 280],
  },
  {
    canonical: "DIASTOLIC_BP",
    display: "Pressione diastolica",
    categoria: "parametri-vitali",
    unita: "mmHg",
    sinonimi: ["pressione diastolica", "pa diastolica", "minima", "diastolic", "dbp"],
    metricCode: "dbp",
    riferimento: { min: 60, max: 85 },
    ottimale: [65, 80],
    critico: { sotto: 45, sopra: 110 },
    plausibile: [30, 180],
  },
  {
    canonical: "RESTING_HEART_RATE",
    display: "Frequenza cardiaca a riposo",
    categoria: "parametri-vitali",
    unita: "bpm",
    sinonimi: ["frequenza cardiaca", "fc a riposo", "battito a riposo", "polso", "resting heart rate"],
    metricCode: "resting_hr",
    riferimento: { min: 50, max: 80 },
    ottimale: [48, 62],
    critico: { sotto: 38, sopra: 120 },
    plausibile: [25, 220],
  },
  {
    canonical: "BODY_FAT_PCT",
    display: "Massa grassa",
    categoria: "composizione-corporea",
    unita: "%",
    sinonimi: ["massa grassa", "body fat", "grasso corporeo", "fm%", "percentuale di grasso"],
    metricCode: "body_fat_pct",
    perSesso: { M: { min: 8, max: 20 }, F: { min: 18, max: 30 } },
    plausibile: [2, 70],
  },
  {
    canonical: "SKELETAL_MUSCLE_INDEX",
    display: "Indice di massa muscolare",
    categoria: "composizione-corporea",
    unita: "kg/m²",
    sinonimi: ["smi", "indice massa muscolare", "massa muscolare scheletrica", "asmi"],
    metricCode: "smi",
    perSesso: { M: { min: 7.3, max: 11 }, F: { min: 5.8, max: 9 } },
    plausibile: [2, 18],
  },
  {
    canonical: "VISCERAL_FAT",
    display: "Grasso viscerale",
    categoria: "composizione-corporea",
    unita: "livello",
    sinonimi: ["grasso viscerale", "visceral fat", "vfa", "adipe viscerale"],
    metricCode: "visceral_fat",
    riferimento: { min: 0, max: 12 },
    ottimale: [0, 8],
    critico: { sopra: 18 },
    plausibile: [0, 60],
  },
  {
    canonical: "VO2MAX",
    display: "VO₂ max",
    categoria: "cardiovascolare",
    unita: "mL/kg/min",
    sinonimi: ["vo2max", "vo2 max", "consumo di ossigeno", "massimo consumo di ossigeno"],
    metricCode: "vo2max",
    perSesso: { M: { min: 35, max: 60 }, F: { min: 30, max: 55 } },
    plausibile: [5, 95],
  },
  {
    canonical: "BMI",
    display: "Indice di massa corporea",
    categoria: "composizione-corporea",
    unita: "kg/m²",
    sinonimi: ["bmi", "imc", "indice di massa corporea", "body mass index"],
    riferimento: { min: 18.5, max: 25 },
    ottimale: [20, 24],
    plausibile: [10, 80],
  },
  {
    canonical: "WEIGHT",
    display: "Peso",
    categoria: "composizione-corporea",
    unita: "kg",
    sinonimi: ["peso", "peso corporeo", "weight"],
    plausibile: [20, 350],
  },

  /* ── Esame urine ────────────────────────────────────────────────── */
  {
    canonical: "URINE_GLUCOSE",
    display: "Glucosio nelle urine",
    categoria: "urine",
    unita: "",
    sinonimi: ["glicosuria", "glucosio urine", "glucosio urinario"],
    qualitativo: true,
    plausibile: [0, 1],
  },
  {
    canonical: "URINE_PROTEIN",
    display: "Proteine nelle urine",
    categoria: "urine",
    unita: "",
    sinonimi: ["proteinuria", "proteine urine", "albuminuria"],
    qualitativo: true,
    plausibile: [0, 1],
  },
  {
    canonical: "MICROALBUMINURIA",
    display: "Microalbuminuria",
    categoria: "renale",
    unita: "mg/L",
    sinonimi: ["microalbuminuria", "microalbumina", "albumina urinaria"],
    riferimento: { min: 0, max: 20 },
    plausibile: [0, 5000],
  },
];

/* ── Indice ───────────────────────────────────────────────────────── */

const PER_CANONICAL = new Map(CATALOGO.map((v) => [v.canonical, v]));

export function vocePerCanonical(canonical: string): VoceCatalogo | undefined {
  return PER_CANONICAL.get(canonical);
}

/**
 * L'indice dei sinonimi, ordinato per lunghezza decrescente.
 *
 * L'ordine è la regola che evita l'errore più grave del riconoscimento a
 * sinonimi: **il pezzo non deve vincere sul tutto.** "Colesterolo"
 * compare dentro "colesterolo ldl"; cercando prima il corto, ogni riga
 * di LDL finirebbe registrata come colesterolo totale, e la cartella si
 * riempirebbe di valori plausibili e sbagliati.
 *
 * Ordinando per lunghezza, "colesterolo ldl" viene provato prima, e
 * "colesterolo" resta per le righe che davvero dicono solo quello.
 */
export const INDICE_SINONIMI: readonly { sinonimo: string; voce: VoceCatalogo }[] = CATALOGO.flatMap(
  (voce) =>
    [...voce.sinonimi, voce.display]
      .map((s) => ({ sinonimo: s.toLowerCase().trim(), voce }))
      .filter((v) => v.sinonimo.length >= 2),
).sort((a, b) => b.sinonimo.length - a.sinonimo.length);

/** I biomarcatori di una categoria. */
export function perCategoria(categoria: CategoriaClinica): VoceCatalogo[] {
  return CATALOGO.filter((v) => v.categoria === categoria);
}

/** Quanti biomarcatori il motore conosce. Serve a raccontarlo, in pagina. */
export const QUANTI_BIOMARCATORI = CATALOGO.length;

/**
 * Il ponte verso lo Score.
 *
 * Da nome canonico a codice della metrica, per i biomarcatori che
 * alimentano il Longevity Score. Gli altri restano dati clinici e basta,
 * il che è già molto.
 */
export const VERSO_METRICA: Readonly<Record<string, string>> = Object.fromEntries(
  CATALOGO.filter((v) => v.metricCode).map((v) => [v.canonical, v.metricCode as string]),
);
