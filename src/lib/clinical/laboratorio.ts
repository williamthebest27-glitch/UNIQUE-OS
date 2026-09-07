/**
 * Il vocabolario del laboratorio.
 *
 * Sei stati, e le due separazioni che sembrano pedanteria e non lo sono:
 *
 *   `requested` → `collected`  in mezzo c'è una persona che deve andare
 *   a fare un prelievo. Unirli avrebbe cancellato la coda
 *   dell'infermieristica.
 *
 *   `resulted` → `validated`   in mezzo c'è una firma. Un valore
 *   risultato è un numero uscito da uno strumento; un valore validato è
 *   un numero di cui qualcuno risponde, ed è solo il secondo che entra
 *   in cartella e muove il Longevity Score.
 */

export const STATI_ESAME = [
  "requested",
  "collected",
  "processing",
  "resulted",
  "validated",
  "cancelled",
] as const;

export type StatoEsame = (typeof STATI_ESAME)[number];

export const ETICHETTE_ESAME: Record<StatoEsame, string> = {
  requested: "Richiesto",
  collected: "Prelevato",
  processing: "In analisi",
  resulted: "Risultati arrivati",
  validated: "Validato",
  cancelled: "Annullato",
};

/** Il verbo del pulsante: dice cosa fa, non come si chiamerà lo stato. */
export const VERBI_ESAME: Record<StatoEsame, string> = {
  requested: "Rimetti in richiesta",
  collected: "Prelevato",
  processing: "In analisi",
  resulted: "Risultati arrivati",
  validated: "Valida",
  cancelled: "Annulla",
};

/**
 * La catena, in ordine.
 *
 * Serve a disegnare l'avanzamento e a sapere cosa viene dopo. `cancelled`
 * non ne fa parte: è un'uscita, non un passo.
 */
export const CATENA_ESAME: StatoEsame[] = [
  "requested",
  "collected",
  "processing",
  "resulted",
  "validated",
];

/**
 * Cosa si può fare adesso.
 *
 * La macchina a stati vive nel database — `advance_lab_order` conosce le
 * transizioni ammesse — e questa è la sua copia per l'interfaccia: serve
 * a non disegnare un pulsante che verrebbe rifiutato. Se le due
 * divergono, quella giusta è il database.
 *
 * L'unica marcia indietro ammessa è da «risultati arrivati» a «in
 * analisi», quando i risultati vanno rifatti.
 */
export function prossimiStatiEsame(stato: StatoEsame): StatoEsame[] {
  switch (stato) {
    case "requested":
      return ["collected", "cancelled"];
    case "collected":
      return ["processing", "cancelled"];
    case "processing":
      return ["resulted", "cancelled"];
    case "resulted":
      return ["validated", "processing", "cancelled"];
    case "validated":
    case "cancelled":
      return [];
  }
}

export function tonoEsame(
  s: StatoEsame,
): "neutral" | "brand" | "gold" | "attention" | "positive" {
  switch (s) {
    case "requested":
      return "attention";
    case "collected":
    case "processing":
      return "brand";
    case "resulted":
      return "gold";
    case "validated":
      return "positive";
    case "cancelled":
      return "neutral";
  }
}

export function isStatoEsame(v: string): v is StatoEsame {
  return (STATI_ESAME as readonly string[]).includes(v);
}

/** A che punto della catena si è, da 0 a 1. Serve alla barra. */
export function avanzamento(stato: StatoEsame): number {
  if (stato === "cancelled") return 0;
  const i = CATENA_ESAME.indexOf(stato);
  return i < 0 ? 0 : (i + 1) / CATENA_ESAME.length;
}

/* ── I pannelli che si chiedono davvero ───────────────────────────── */

/**
 * Le richieste pronte.
 *
 * Non sono un vincolo — il campo del pannello resta libero — ma coprono
 * la gran parte di ciò che una clinica di longevità chiede, e riempiono
 * anche l'elenco dei codici attesi. Senza, «emocromo» sarebbe finito
 * scritto in sei modi, e nessuno dei sei avrebbe permesso di accorgersi
 * che un valore non è arrivato.
 *
 * I codici vengono dal catalogo in `lib/score/metrics.ts`: sono gli
 * stessi che alimentano il punteggio, e usarne altri avrebbe prodotto
 * valori in cartella che nessun pilastro guarda.
 */
export const PANNELLI: { nome: string; codici: string[] }[] = [
  {
    nome: "Profilo metabolico",
    codici: ["glucose_fasting", "hba1c", "insulin_fasting"],
  },
  {
    nome: "Profilo lipidico",
    codici: ["ldl", "hdl", "triglycerides", "apob"],
  },
  {
    nome: "Funzionalità epatica",
    codici: ["alt"],
  },
  {
    nome: "Vitamina D",
    codici: ["vitamin_d"],
  },
  {
    nome: "Composizione corporea",
    codici: ["body_fat_pct", "smi", "visceral_fat", "waist_hip_ratio"],
  },
  {
    nome: "Valutazione cardiorespiratoria",
    codici: ["sbp", "dbp", "resting_hr", "vo2max", "ecg_status", "fev1_fvc_ratio"],
  },
  {
    nome: "Forza e funzione",
    codici: ["grip_strength", "strength_sessions_week"],
  },
];

/**
 * La direzione di una variazione, senza dire se è buona.
 *
 * È deliberatamente muta sul giudizio clinico: sale, scende, o è ferma.
 * Se una discesa dell'emoglobina sia una buona notizia lo decide la
 * curva di normalizzazione del punteggio — che vive nel codice ed è
 * versionata con l'algoritmo — non il segno di una sottrazione.
 */
export function direzione(delta: number | null): "su" | "giu" | "fermo" | null {
  if (delta === null) return null;
  if (delta > 0) return "su";
  if (delta < 0) return "giu";
  return "fermo";
}

/**
 * Una serie che scende (o sale) da tre rilevazioni di fila.
 *
 * Tre discese consecutive sono un'altra informazione rispetto a una
 * discesa sola, ed è la cosa che due valori a confronto non sanno dire.
 * Tre e non due: due punti sono una variazione, tre sono un andamento.
 */
export function tendenza(valori: number[]): "in-calo" | "in-salita" | null {
  if (valori.length < 3) return null;

  const ultimi = valori.slice(-3);
  const scende = ultimi[0] > ultimi[1] && ultimi[1] > ultimi[2];
  const sale = ultimi[0] < ultimi[1] && ultimi[1] < ultimi[2];

  return scende ? "in-calo" : sale ? "in-salita" : null;
}
