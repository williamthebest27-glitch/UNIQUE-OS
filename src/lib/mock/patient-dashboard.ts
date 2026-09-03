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
      "Metabolismo e infiammazione sono in fascia ottimale. Il margine di crescita più ampio resta sull’assetto ormonale.",
    pillars: [
      { key: "metabolic", label: "Metabolismo", value: 82, delta: 5 },
      { key: "cardiovascular", label: "Cardiovascolare", value: 76, delta: 3 },
      { key: "body_composition", label: "Composizione corporea", value: 71, delta: 6 },
      { key: "inflammation", label: "Infiammazione", value: 84, delta: 2 },
      { key: "hormonal", label: "Assetto ormonale", value: 69, delta: -1 },
      { key: "cognitive_sleep", label: "Cognitivo e sonno", value: 74, delta: 7 },
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

  credits: {
    balance: 12,
    totalCredited: 24,
    totalUsed: 12,
    membershipName: "Unique Signature",
    membershipEndsOn: "2027-03-31",
  },

  actions: [
    {
      id: "act-1",
      title: "Ripetere il pannello ormonale",
      description:
        "L’unico pilastro in leggero calo. Prelievo a digiuno, idealmente entro due settimane.",
      pillarKey: "hormonal",
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
      pillarKey: "cardiovascular",
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
      pillarKey: "metabolic",
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
      label: "VO₂ max stimato",
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
      label: "Sonno profondo",
      value: "1h 22m",
      change: "+18m",
      direction: "up",
      isImprovement: true,
    },
  ],
};
