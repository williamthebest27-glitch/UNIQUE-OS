import type { PatientDashboardData } from "@/lib/domain/types";

/**
 * Dati dimostrativi della home paziente.
 *
 * Servono a progettare e valutare l’interfaccia prima che Supabase sia
 * collegato. `getPatientDashboard()` in `src/lib/data/patient.ts` è già
 * la sola porta d’accesso: quando arriva il database reale si sostituisce
 * l’implementazione lì, e nessun componente cambia.
 */
export const mockPatientDashboard: PatientDashboardData = {
  profile: {
    id: "00000000-0000-0000-0000-000000000001",
    role: "patient",
    fullName: "Alessandro Rinaldi",
    firstName: "Alessandro",
    email: "alessandro.rinaldi@example.com",
    avatarUrl: null,
  },

  score: {
    id: "score-2026-08",
    measuredOn: "2026-08-28",
    score: 78,
    previousScore: 74,
    trend: "up",
    biologicalAge: 39.4,
    summary:
      "Metabolismo e movimento sono in fascia ottimale. Il margine di crescita più ampio resta sullo stile di vita, con il sonno come primo fattore.",
    coverage: 0.86,
    pillars: [
      { key: "metabolic_health", label: "Salute metabolica", value: 82, coverage: 1, delta: 5 },
      { key: "cardiovascular", label: "Cardiovascolare", value: 74, coverage: 0.92, delta: 3 },
      { key: "body_composition", label: "Composizione corporea", value: 71, coverage: 0.85, delta: 6 },
      { key: "movement", label: "Movimento", value: 86, coverage: 0.8, delta: 7 },
      { key: "nutrition", label: "Nutrizione", value: 76, coverage: 0.85, delta: 2 },
      { key: "mental_wellbeing", label: "Benessere mentale", value: 80, coverage: 0.65, delta: 4 },
      { key: "lifestyle", label: "Stile di vita", value: 69, coverage: 0.9, delta: -1 },
    ],
  },

  scoreHistory: [
    { measuredOn: "2025-06-12", score: 64 },
    { measuredOn: "2025-09-18", score: 68 },
    { measuredOn: "2025-12-04", score: 71 },
    { measuredOn: "2026-02-20", score: 70 },
    { measuredOn: "2026-05-15", score: 74 },
    { measuredOn: "2026-08-28", score: 78 },
  ],

  nextAppointment: {
    id: "appt-1",
    serviceName: "Consulenza longevity di controllo",
    status: "confirmed",
    startsAt: "2026-09-17T09:30:00+02:00",
    endsAt: "2026-09-17T10:30:00+02:00",
    location: "Unique Clinic — Studio 2",
    professional: {
      id: "pro-1",
      fullName: "Chiara Fontana",
      title: "Dott.ssa",
      specialty: "Medicina della longevità",
      avatarUrl: null,
    },
    creditsCost: 1,
  },

  enrollment: {
    id: "enr-1",
    programName: "Metabolic Reset — 90 giorni",
    description:
      "Protocollo integrato di nutrizione, allenamento e recupero, con due checkpoint ematochimici.",
    status: "active",
    startedOn: "2026-07-06",
    endsOn: "2026-10-04",
    progressPct: 64,
    stepsDone: 9,
    stepsTotal: 14,
  },

  membership: {
    planName: "Unique Signature",
    status: "active",
    startsOn: "2026-04-01",
    endsOn: "2027-03-31",
    renewsOn: "2027-04-01",
    autoRenew: true,
    paymentBrand: "Visa",
    paymentLast4: "4242",
    credits: { granted: 24, used: 12, reserved: 1, available: 11 },
    extras: [
      {
        id: "extra-1",
        name: "IV Therapy — ciclo di 3 sedute",
        description: "Acquistato fuori membership.",
        priceCents: 45000,
        currency: "EUR",
        creditsGranted: 3,
        purchasedOn: "2026-06-18",
      },
    ],
  },

  actions: [
    {
      id: "act-1",
      title: "Riportare il colesterolo LDL sotto 100",
      description:
        "Sei a 118 mg/dL. È la leva più pesante rimasta sul pilastro cardiovascolare.",
      pillarKey: "cardiovascular",
      source: "professional",
      status: "suggested",
      dueOn: "2026-09-15",
      priority: 1,
    },
    {
      id: "act-2",
      title: "Portare il cardio a 150 minuti a settimana",
      description:
        "Sei a 110 minuti di media. Bastano due sessioni in più in zona 2 per chiudere il divario.",
      pillarKey: "movement",
      source: "protocol",
      status: "in_progress",
      dueOn: null,
      priority: 2,
    },
    {
      id: "act-3",
      title: "Anticipare la cena di 60 minuti",
      description:
        "La finestra di digiuno notturno è il fattore che sposta di più il tuo punteggio metabolico.",
      pillarKey: "metabolic_health",
      source: "brain",
      status: "suggested",
      dueOn: null,
      priority: 2,
    },
    {
      id: "act-4",
      title: "Caricare il referto della densitometria",
      description: "Manca per completare la valutazione della composizione corporea.",
      pillarKey: "body_composition",
      source: "professional",
      status: "suggested",
      dueOn: "2026-09-20",
      priority: 3,
    },
  ],

  newDocuments: [
    {
      id: "doc-1",
      kind: "lab_report",
      title: "Pannello metabolico completo — agosto 2026",
      issuedOn: "2026-08-28",
      createdAt: "2026-08-29T11:05:00+02:00",
      isNewForPatient: true,
      sizeBytes: 412_000,
    },
    {
      id: "doc-2",
      kind: "care_plan",
      title: "Aggiornamento piano nutrizionale",
      issuedOn: "2026-08-30",
      createdAt: "2026-08-30T16:20:00+02:00",
      isNewForPatient: true,
      sizeBytes: 188_000,
    },
    {
      id: "doc-3",
      kind: "imaging",
      title: "Ecocardiogramma con color doppler",
      issuedOn: "2026-08-12",
      createdAt: "2026-08-13T09:40:00+02:00",
      isNewForPatient: false,
      sizeBytes: 2_140_000,
    },
  ],

  notifications: [
    {
      id: "not-1",
      title: "Il tuo nuovo Longevity Score è disponibile",
      body: "78/100, quattro punti in più rispetto a maggio.",
      linkUrl: "/percorso",
      readAt: null,
      createdAt: "2026-08-29T11:10:00+02:00",
    },
    {
      id: "not-2",
      title: "Messaggio dalla Dott.ssa Fontana",
      body: "Ho aggiornato il piano nutrizionale in vista del controllo di settembre.",
      linkUrl: "/documenti",
      readAt: null,
      createdAt: "2026-08-30T16:22:00+02:00",
    },
  ],

  highlights: [
    {
      id: "hl-1",
      label: "Emoglobina glicata",
      value: "5,2 %",
      change: "−0,4",
      direction: "down",
      isImprovement: true,
    },
    {
      id: "hl-2",
      label: "VO₂ max",
      value: "44,1",
      change: "+3,6",
      direction: "up",
      isImprovement: true,
    },
    {
      id: "hl-3",
      label: "Massa grassa",
      value: "18,4 %",
      change: "−2,9",
      direction: "down",
      isImprovement: true,
    },
    {
      id: "hl-4",
      label: "Pressione sistolica",
      value: "118",
      change: "−9",
      direction: "down",
      isImprovement: true,
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   Le sezioni nuove, in modalità dimostrativa

   Servono a poter lavorare su risultati, questionari e messaggi senza un
   database. Sono dichiaratamente finti: l'avviso nella barra laterale lo
   dice, e nessuna di queste righe raggiunge mai un paziente vero.
   ═══════════════════════════════════════════════════════════════════ */

export const mockLetture = [
  { metricCode: "hba1c", label: "Emoglobina glicata", unit: "%", value: 5.9, category: null, refLow: 4, refHigh: 5.6, measuredOn: "2026-01-14" },
  { metricCode: "hba1c", label: "Emoglobina glicata", unit: "%", value: 5.3, category: null, refLow: 4, refHigh: 5.6, measuredOn: "2026-08-20" },
  { metricCode: "glucose_fasting", label: "Glicemia a digiuno", unit: "mg/dL", value: 96, category: null, refLow: 70, refHigh: 99, measuredOn: "2026-01-14" },
  { metricCode: "glucose_fasting", label: "Glicemia a digiuno", unit: "mg/dL", value: 89, category: null, refLow: 70, refHigh: 99, measuredOn: "2026-08-20" },
  { metricCode: "ldl", label: "Colesterolo LDL", unit: "mg/dL", value: 132, category: null, refLow: null, refHigh: 115, measuredOn: "2026-01-14" },
  { metricCode: "ldl", label: "Colesterolo LDL", unit: "mg/dL", value: 121, category: null, refLow: null, refHigh: 115, measuredOn: "2026-08-20" },
  { metricCode: "hdl", label: "Colesterolo HDL", unit: "mg/dL", value: 58, category: null, refLow: 40, refHigh: null, measuredOn: "2026-08-20" },
  { metricCode: "vo2max", label: "VO₂ max", unit: "mL/kg/min", value: 40.5, category: null, refLow: null, refHigh: null, measuredOn: "2026-01-14" },
  { metricCode: "vo2max", label: "VO₂ max", unit: "mL/kg/min", value: 44.1, category: null, refLow: null, refHigh: null, measuredOn: "2026-08-20" },
  { metricCode: "body_fat_pct", label: "Massa grassa", unit: "%", value: 21.3, category: null, refLow: null, refHigh: null, measuredOn: "2026-01-14" },
  { metricCode: "body_fat_pct", label: "Massa grassa", unit: "%", value: 18.4, category: null, refLow: null, refHigh: null, measuredOn: "2026-08-20" },
  { metricCode: "sbp", label: "Pressione sistolica", unit: "mmHg", value: 127, category: null, refLow: null, refHigh: 130, measuredOn: "2026-01-14" },
  { metricCode: "sbp", label: "Pressione sistolica", unit: "mmHg", value: 118, category: null, refLow: null, refHigh: 130, measuredOn: "2026-08-20" },
];

export const mockQuestionari = [
  {
    id: "demo-q1",
    titolo: "Qualità del sonno",
    descrizione: "Sette domande sulle ultime due settimane.",
    stato: "not_started" as const,
    progressoPct: 0,
    minutiStimati: 4,
    scadeIl: "2026-09-20",
    completatoIl: null,
    domande: [],
    risposte: {},
  },
  {
    id: "demo-q2",
    titolo: "Stile di vita",
    descrizione: "Movimento, alimentazione, alcol e fumo.",
    stato: "in_progress" as const,
    progressoPct: 50,
    minutiStimati: 6,
    scadeIl: null,
    completatoIl: null,
    domande: [],
    risposte: {},
  },
  {
    id: "demo-q3",
    titolo: "Benessere ed energia",
    descrizione: "Come ti senti nelle ultime due settimane.",
    stato: "completed" as const,
    progressoPct: 100,
    minutiStimati: 4,
    scadeIl: null,
    completatoIl: "2026-08-18T10:12:00Z",
    domande: [],
    risposte: {},
  },
];

export const mockConversazioni = [
  {
    id: "demo-t1",
    oggetto: "Referto di agosto",
    categoria: "clinical" as const,
    chiusa: false,
    ultimoMessaggioIl: "2026-08-22T08:40:00Z",
    nonLetti: 1,
    anteprima: "Ho visto i valori: la glicata è scesa. Ne parliamo alla prossima visita.",
  },
  {
    id: "demo-t2",
    oggetto: "Fattura di luglio",
    categoria: "administrative" as const,
    chiusa: true,
    ultimoMessaggioIl: "2026-07-30T15:05:00Z",
    nonLetti: 0,
    anteprima: "Trovi la fattura fra i tuoi documenti. Buona giornata.",
  },
];
