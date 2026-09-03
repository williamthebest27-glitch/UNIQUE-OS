import type { PillarKey } from "./pillars.ts";

/**
 * Catalogo delle metriche che alimentano l’Unique Longevity Score.
 *
 * È la traduzione, in dati misurabili, delle fonti previste dalla visione:
 * anamnesi, esami ematici, composizione corporea e body scan, pressione,
 * parametri cardiovascolari, ECG, test da sforzo, spirometria, stile di
 * vita, sonno, attività fisica, alimentazione, questionari e — in futuro —
 * dispositivi indossabili.
 *
 * ⚠️ Curve di normalizzazione e pesi sono una struttura di lavoro, non un
 * algoritmo clinicamente validato. Vanno confermati dal team medico prima
 * di qualunque uso reale. Il campo `computed_by` sui punteggi registra la
 * versione usata, così un cambio di formula non si confonde mai con un
 * miglioramento del paziente.
 */

export type MetricSource =
  | "anamnesis"
  | "lab"
  | "body_scan"
  | "vitals"
  | "ecg"
  | "spirometry"
  | "stress_test"
  | "questionnaire"
  | "activity"
  | "wearable"
  | "professional";

/** Un punto della curva: a questo valore corrisponde questo punteggio. */
export type Anchor = readonly [value: number, score: number];

export interface MetricDefinition {
  code: string;
  label: string;
  unit: string;
  pillar: PillarKey;
  source: MetricSource;
  /** Peso della metrica dentro il proprio pilastro. */
  weight: number;
  /**
   * Curva di normalizzazione, in valori crescenti. Fra due ancore si
   * interpola linearmente; oltre gli estremi si tiene il valore dell’ancora.
   * Le ancore reggono anche le metriche a campana — la glicemia è peggiore
   * sia troppo bassa sia troppo alta — senza bisogno di casi speciali.
   */
  anchors?: readonly Anchor[];
  /** Per le metriche categoriali (ECG, fumo): valore → punteggio. */
  categories?: Readonly<Record<string, number>>;
  /**
   * Intervallo fisiologicamente plausibile. Un valore fuori da qui non è
   * un paziente messo male: è quasi sempre un errore di estrazione o di
   * unità di misura, e va fermato prima di entrare nel database.
   */
  plausible: readonly [min: number, max: number];
  /** Soglia oltre la quale il dato è clinicamente rilevante e va rivisto. */
  clinicalAlert?: (value: number) => boolean;
  /** Sinonimi con cui la metrica compare sui referti italiani. */
  aliases?: readonly string[];
}

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  // ── Metabolic Health ────────────────────────────────────────────
  {
    code: "glucose_fasting",
    label: "Glicemia a digiuno",
    unit: "mg/dL",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.2,
    anchors: [[55, 30], [70, 85], [78, 100], [90, 100], [100, 68], [110, 45], [126, 20], [180, 0]],
    plausible: [30, 600],
    clinicalAlert: (v) => v >= 126 || v < 60,
    aliases: ["glicemia", "glucosio"],
  },
  {
    code: "hba1c",
    label: "Emoglobina glicata",
    unit: "%",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.25,
    anchors: [[4.2, 90], [4.8, 100], [5.2, 95], [5.6, 75], [6.0, 50], [6.5, 25], [8.0, 0]],
    plausible: [3, 20],
    clinicalAlert: (v) => v >= 6.5,
    aliases: ["hba1c", "emoglobina glicata", "glicata"],
  },
  {
    code: "insulin_fasting",
    label: "Insulina a digiuno",
    unit: "µU/mL",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.1,
    anchors: [[2, 90], [3, 100], [6, 90], [10, 65], [15, 40], [25, 10], [40, 0]],
    plausible: [0.5, 300],
    aliases: ["insulina"],
  },
  {
    code: "triglycerides",
    label: "Trigliceridi",
    unit: "mg/dL",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.15,
    anchors: [[40, 100], [90, 100], [120, 80], [150, 60], [200, 35], [300, 10], [500, 0]],
    plausible: [20, 2000],
    clinicalAlert: (v) => v >= 200,
    aliases: ["trigliceridi"],
  },
  {
    code: "hdl",
    label: "Colesterolo HDL",
    unit: "mg/dL",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.15,
    anchors: [[25, 0], [40, 45], [50, 70], [60, 90], [75, 100], [110, 100]],
    plausible: [10, 150],
    aliases: ["hdl", "colesterolo hdl"],
  },
  {
    code: "alt",
    label: "ALT (GPT)",
    unit: "U/L",
    pillar: "metabolic_health",
    source: "lab",
    weight: 0.15,
    anchors: [[5, 95], [15, 100], [25, 85], [40, 60], [60, 30], [120, 0]],
    plausible: [1, 2000],
    clinicalAlert: (v) => v >= 80,
    aliases: ["alt", "gpt", "transaminasi gpt"],
  },

  // ── Cardiovascular ──────────────────────────────────────────────
  {
    code: "sbp",
    label: "Pressione sistolica",
    unit: "mmHg",
    pillar: "cardiovascular",
    source: "vitals",
    weight: 0.16,
    anchors: [[85, 55], [100, 90], [112, 100], [120, 92], [130, 70], [140, 45], [160, 15], [190, 0]],
    plausible: [60, 260],
    clinicalAlert: (v) => v >= 140 || v < 90,
    aliases: ["pressione sistolica", "pa sistolica", "massima"],
  },
  {
    code: "dbp",
    label: "Pressione diastolica",
    unit: "mmHg",
    pillar: "cardiovascular",
    source: "vitals",
    weight: 0.09,
    anchors: [[50, 55], [65, 92], [75, 100], [82, 88], [90, 60], [100, 30], [120, 0]],
    plausible: [30, 160],
    clinicalAlert: (v) => v >= 90,
    aliases: ["pressione diastolica", "pa diastolica", "minima"],
  },
  {
    code: "resting_hr",
    label: "Frequenza cardiaca a riposo",
    unit: "bpm",
    pillar: "cardiovascular",
    source: "vitals",
    weight: 0.11,
    anchors: [[38, 95], [48, 100], [58, 92], [68, 75], [78, 55], [90, 30], [110, 0]],
    plausible: [30, 200],
    aliases: ["frequenza cardiaca", "fc a riposo", "battito a riposo"],
  },
  {
    code: "vo2max",
    label: "VO₂ max",
    unit: "ml/kg/min",
    pillar: "cardiovascular",
    source: "stress_test",
    weight: 0.26,
    anchors: [[18, 0], [26, 30], [34, 55], [42, 78], [50, 93], [58, 100]],
    plausible: [8, 90],
    aliases: ["vo2max", "vo2 max", "consumo di ossigeno"],
  },
  {
    code: "apob",
    label: "ApoB",
    unit: "mg/dL",
    pillar: "cardiovascular",
    source: "lab",
    weight: 0.13,
    anchors: [[40, 100], [60, 100], [80, 85], [100, 60], [120, 35], [150, 10], [200, 0]],
    plausible: [20, 300],
    clinicalAlert: (v) => v >= 130,
    aliases: ["apob", "apolipoproteina b"],
  },
  {
    code: "ldl",
    label: "Colesterolo LDL",
    unit: "mg/dL",
    pillar: "cardiovascular",
    source: "lab",
    weight: 0.09,
    anchors: [[50, 100], [80, 92], [100, 78], [130, 52], [160, 28], [190, 8], [250, 0]],
    plausible: [20, 500],
    clinicalAlert: (v) => v >= 190,
    aliases: ["ldl", "colesterolo ldl"],
  },
  {
    code: "ecg_status",
    label: "ECG",
    unit: "",
    pillar: "cardiovascular",
    source: "ecg",
    weight: 0.08,
    categories: { normal: 100, minor_findings: 68, abnormal: 25 },
    plausible: [0, 100],
    aliases: ["ecg", "elettrocardiogramma"],
  },
  {
    code: "fev1_fvc_ratio",
    label: "Indice di Tiffeneau (FEV1/FVC)",
    unit: "%",
    pillar: "cardiovascular",
    source: "spirometry",
    weight: 0.08,
    anchors: [[50, 0], [65, 35], [72, 70], [80, 95], [90, 100]],
    plausible: [20, 100],
    clinicalAlert: (v) => v < 70,
    aliases: ["fev1/fvc", "tiffeneau", "indice di tiffeneau"],
  },

  // ── Body Composition ────────────────────────────────────────────
  {
    code: "body_fat_pct",
    label: "Massa grassa",
    unit: "%",
    pillar: "body_composition",
    source: "body_scan",
    weight: 0.32,
    anchors: [[6, 80], [11, 100], [17, 92], [22, 72], [28, 45], [35, 18], [45, 0]],
    plausible: [2, 70],
    aliases: ["massa grassa", "body fat", "grasso corporeo"],
  },
  {
    code: "smi",
    label: "Indice di massa muscolare",
    unit: "kg/m²",
    pillar: "body_composition",
    source: "body_scan",
    weight: 0.28,
    anchors: [[5.5, 0], [6.5, 35], [7.5, 70], [8.5, 92], [10, 100]],
    plausible: [3, 16],
    aliases: ["smi", "indice massa muscolare", "massa muscolare scheletrica"],
  },
  {
    code: "visceral_fat",
    label: "Grasso viscerale",
    unit: "livello",
    pillar: "body_composition",
    source: "body_scan",
    weight: 0.25,
    anchors: [[1, 100], [5, 95], [9, 75], [13, 45], [17, 20], [25, 0]],
    plausible: [0, 40],
    clinicalAlert: (v) => v >= 15,
    aliases: ["grasso viscerale", "visceral fat"],
  },
  {
    code: "waist_hip_ratio",
    label: "Rapporto vita-fianchi",
    unit: "",
    pillar: "body_composition",
    source: "body_scan",
    weight: 0.15,
    anchors: [[0.7, 100], [0.85, 90], [0.92, 70], [1.0, 40], [1.1, 10]],
    plausible: [0.5, 1.6],
    aliases: ["rapporto vita fianchi", "whr"],
  },

  // ── Movement ────────────────────────────────────────────────────
  {
    code: "activity_minutes_week",
    label: "Attività fisica settimanale",
    unit: "min/sett.",
    pillar: "movement",
    source: "activity",
    weight: 0.35,
    anchors: [[0, 0], [60, 35], [120, 65], [150, 80], [220, 95], [300, 100]],
    plausible: [0, 2000],
    aliases: ["minuti di attività", "attività fisica settimanale"],
  },
  {
    code: "steps_daily_avg",
    label: "Passi giornalieri",
    unit: "passi",
    pillar: "movement",
    source: "wearable",
    weight: 0.2,
    anchors: [[1500, 0], [4000, 40], [7000, 72], [9000, 90], [12000, 100]],
    plausible: [0, 60000],
    aliases: ["passi", "passi al giorno"],
  },
  {
    code: "strength_sessions_week",
    label: "Sedute di forza",
    unit: "sedute/sett.",
    pillar: "movement",
    source: "activity",
    weight: 0.25,
    anchors: [[0, 0], [1, 45], [2, 80], [3, 95], [4, 100]],
    plausible: [0, 14],
    aliases: ["allenamento di forza", "sedute di forza"],
  },
  {
    code: "grip_strength",
    label: "Forza di presa",
    unit: "kg",
    pillar: "movement",
    source: "professional",
    weight: 0.2,
    anchors: [[15, 0], [25, 40], [35, 72], [45, 92], [55, 100]],
    plausible: [5, 100],
    aliases: ["hand grip", "forza di presa", "dinamometria"],
  },

  // ── Nutrition ───────────────────────────────────────────────────
  {
    code: "diet_quality_score",
    label: "Qualità della dieta",
    unit: "punti",
    pillar: "nutrition",
    source: "questionnaire",
    weight: 0.35,
    anchors: [[0, 0], [40, 35], [60, 62], [75, 82], [90, 100]],
    plausible: [0, 100],
    aliases: ["qualità della dieta", "aderenza mediterranea"],
  },
  {
    code: "protein_g_per_kg",
    label: "Proteine per kg",
    unit: "g/kg",
    pillar: "nutrition",
    source: "questionnaire",
    weight: 0.2,
    anchors: [[0.4, 0], [0.8, 45], [1.2, 82], [1.6, 100], [2.4, 92]],
    plausible: [0.1, 5],
    aliases: ["proteine per kg", "apporto proteico"],
  },
  {
    code: "veg_servings_day",
    label: "Porzioni di verdura",
    unit: "porzioni/g",
    pillar: "nutrition",
    source: "questionnaire",
    weight: 0.2,
    anchors: [[0, 0], [2, 45], [4, 80], [5, 95], [7, 100]],
    plausible: [0, 20],
    aliases: ["porzioni di verdura", "verdura al giorno"],
  },
  {
    code: "ultraprocessed_meals_week",
    label: "Pasti ultraprocessati",
    unit: "pasti/sett.",
    pillar: "nutrition",
    source: "questionnaire",
    weight: 0.1,
    anchors: [[0, 100], [3, 82], [7, 55], [12, 25], [20, 0]],
    plausible: [0, 60],
    aliases: ["cibi ultraprocessati", "pasti ultraprocessati"],
  },
  {
    code: "vitamin_d",
    label: "Vitamina D (25-OH)",
    unit: "ng/mL",
    pillar: "nutrition",
    source: "lab",
    weight: 0.15,
    anchors: [[8, 0], [20, 45], [30, 78], [45, 100], [80, 95], [110, 60]],
    plausible: [2, 200],
    clinicalAlert: (v) => v < 20,
    aliases: ["vitamina d", "25-oh vitamina d", "colecalciferolo"],
  },

  // ── Mental Wellbeing ────────────────────────────────────────────
  {
    code: "who5_wellbeing",
    label: "Benessere percepito (WHO-5)",
    unit: "punti",
    pillar: "mental_wellbeing",
    source: "questionnaire",
    weight: 0.35,
    anchors: [[0, 0], [28, 25], [50, 55], [70, 82], [90, 100]],
    plausible: [0, 100],
    clinicalAlert: (v) => v <= 28,
    aliases: ["who-5", "benessere percepito"],
  },
  {
    code: "perceived_stress",
    label: "Stress percepito (PSS-10)",
    unit: "punti",
    pillar: "mental_wellbeing",
    source: "questionnaire",
    weight: 0.3,
    anchors: [[0, 100], [10, 88], [16, 62], [22, 35], [30, 5], [40, 0]],
    plausible: [0, 40],
    clinicalAlert: (v) => v >= 27,
    aliases: ["pss", "stress percepito"],
  },
  {
    code: "cognitive_score",
    label: "Valutazione cognitiva",
    unit: "punti",
    pillar: "mental_wellbeing",
    source: "professional",
    weight: 0.35,
    anchors: [[40, 0], [60, 35], [75, 65], [88, 90], [98, 100]],
    plausible: [0, 100],
    aliases: ["test cognitivo", "valutazione cognitiva"],
  },

  // ── Lifestyle ───────────────────────────────────────────────────
  {
    code: "sleep_hours_avg",
    label: "Ore di sonno",
    unit: "ore",
    pillar: "lifestyle",
    source: "wearable",
    weight: 0.28,
    anchors: [[4, 10], [5.5, 45], [6.5, 75], [7.2, 97], [8, 100], [9.5, 72], [11, 40]],
    plausible: [2, 16],
    aliases: ["ore di sonno", "durata del sonno"],
  },
  {
    code: "sleep_efficiency",
    label: "Efficienza del sonno",
    unit: "%",
    pillar: "lifestyle",
    source: "wearable",
    weight: 0.22,
    anchors: [[60, 0], [75, 40], [85, 78], [92, 97], [97, 100]],
    plausible: [20, 100],
    aliases: ["efficienza del sonno"],
  },
  {
    code: "smoking_status",
    label: "Fumo",
    unit: "",
    pillar: "lifestyle",
    source: "anamnesis",
    weight: 0.25,
    categories: { never: 100, former: 78, occasional: 45, current: 10 },
    plausible: [0, 100],
    aliases: ["fumo", "tabagismo"],
  },
  {
    code: "alcohol_units_week",
    label: "Alcol settimanale",
    unit: "unità/sett.",
    pillar: "lifestyle",
    source: "anamnesis",
    weight: 0.15,
    anchors: [[0, 100], [3, 92], [7, 72], [14, 42], [21, 18], [35, 0]],
    plausible: [0, 100],
    clinicalAlert: (v) => v >= 21,
    aliases: ["alcol", "unità alcoliche"],
  },
  {
    code: "sedentary_hours_day",
    label: "Ore sedentarie",
    unit: "ore/g",
    pillar: "lifestyle",
    source: "wearable",
    weight: 0.1,
    anchors: [[4, 100], [6, 88], [8, 68], [10, 45], [13, 15], [16, 0]],
    plausible: [0, 24],
    aliases: ["ore sedentarie", "sedentarietà"],
  },
];

const BY_CODE = new Map(METRIC_DEFINITIONS.map((m) => [m.code, m]));

export function getMetric(code: string): MetricDefinition | undefined {
  return BY_CODE.get(code);
}

export const METRIC_CODES: readonly string[] = METRIC_DEFINITIONS.map((m) => m.code);

export function metricsForPillar(pillar: PillarKey): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter((m) => m.pillar === pillar);
}
