/**
 * La forma di un documento dopo che il motore l'ha letto.
 *
 * Un solo file per tutti i tipi perché sono un contratto, non
 * un'implementazione: ogni fase della pipeline riceve una di queste
 * strutture e ne restituisce un'altra, e finché la forma regge si può
 * sostituire il lettore di PDF, il motore OCR o il riconoscitore di
 * tabelle senza che nessun'altra fase se ne accorga.
 *
 * ---
 *
 * **La distinzione che regge tutto il modulo.** La visione la chiede
 * esplicitamente e qui è resa in tipi, non in una convenzione:
 *
 *   `Biomarcatore`     — un fatto: sta scritto nel documento, e porta la
 *                        citazione da cui è stato letto.
 *   `StatoValore`      — un'interpretazione: cosa quel numero significa
 *                        rispetto a un intervallo. Codice deterministico.
 *   `Intuizione`       — inferenza del Brain su più dati o nel tempo.
 *   `Raccomandazione`  — azione da valutare. Mai una prescrizione.
 *   decisione clinica  — non è un tipo di questo file: è una riga firmata
 *                        da una persona in `document_reviews`.
 *
 * Sono categorie distinte e nessuna eredita dall'altra, così è
 * impossibile passare un'inferenza dove è atteso un fatto.
 */

/* ── Formati ──────────────────────────────────────────────────────── */

export const FORMATI = [
  "pdf",
  "jpeg",
  "png",
  "webp",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "csv",
] as const;

export type Formato = (typeof FORMATI)[number];

export const ETICHETTE_FORMATO: Record<Formato, string> = {
  pdf: "PDF",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  docx: "Word",
  doc: "Word 97-2003",
  xlsx: "Excel",
  xls: "Excel 97-2003",
  csv: "CSV",
};

/** I MIME che il browser manda per ciascun formato. */
export const MIME_PER_FORMATO: Record<Formato, readonly string[]> = {
  pdf: ["application/pdf"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  doc: ["application/msword"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  csv: ["text/csv", "application/csv", "text/plain"],
};

/** Il MIME canonico di ciascun formato: quello che si salva in cartella. */
export const MIME_CANONICO: Record<Formato, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

export const ESTENSIONI: Record<Formato, readonly string[]> = {
  pdf: ["pdf"],
  jpeg: ["jpg", "jpeg"],
  png: ["png"],
  webp: ["webp"],
  docx: ["docx"],
  doc: ["doc"],
  xlsx: ["xlsx", "xlsm"],
  xls: ["xls"],
  csv: ["csv"],
};

/* ── Rilevamento ──────────────────────────────────────────────────── */

export interface Rilevamento {
  formato: Formato | null;
  /** Come lo si è capito. Serve a spiegare un rifiuto a chi carica. */
  fonte: "contenuto" | "estensione" | "mime" | "ignoto";
  /** Il MIME canonico, che può differire da quello dichiarato dal browser. */
  mime: string | null;
  /**
   * Quanto ci si fida. Il contenuto vale più dell'estensione: un `.pdf`
   * rinominato resta ciò che è, e i primi byte lo dicono.
   */
  confidenza: number;
  motivo?: string;
}

/* ── Testo e struttura ────────────────────────────────────────────── */

/** Una cella di una tabella riconosciuta. */
export interface Cella {
  testo: string;
  /** Il numero letto dalla cella, quando ce n'è uno solo e non ambiguo. */
  numero: number | null;
}

/**
 * Una tabella dentro un documento.
 *
 * Le intestazioni sono separate dalle righe perché un referto senza
 * intestazioni riconosciute resta leggibile — per posizione — mentre un
 * foglio Excel senza intestazioni quasi mai lo è.
 */
export interface Tabella {
  /** Da dove viene: foglio Excel, tabella Word, blocco allineato in un PDF. */
  origine: "excel" | "word" | "pdf" | "csv";
  /** Nome del foglio, o titolo se il documento ne dà uno. */
  nome: string | null;
  pagina: number | null;
  intestazioni: string[];
  righe: Cella[][];
  /** Quanto è sicura la struttura, non il contenuto. */
  confidenza: number;
}

/** Un blocco di testo con il suo ruolo nel documento. */
export interface Blocco {
  tipo: "titolo" | "paragrafo" | "elenco" | "riga-tabella";
  testo: string;
  /** Livello del titolo, quando è un titolo. */
  livello?: number;
  pagina: number | null;
}

/**
 * Cosa il lettore ha tirato fuori da un file, prima che qualcuno provi a
 * capirne il significato clinico.
 *
 * `leggibile: false` non è un errore: è un esito. Un referto scansionato
 * senza OCR disponibile arriva qui con il motivo scritto, resta in
 * cartella e lo guarda una persona. Sollevare sarebbe peggio —
 * perderebbe il file per un limite del lettore.
 */
export interface ContenutoEstratto {
  formato: Formato;
  leggibile: boolean;
  motivo?: string;
  /** Il testo, riga per riga, nell'ordine in cui si legge. */
  testo: string;
  blocchi: Blocco[];
  tabelle: Tabella[];
  pagine: number;
  /** Chi ha letto: il lettore nativo o un riconoscimento ottico. */
  via: "nativo" | "ocr" | "misto";
  /** Il motore OCR usato, quando è stato usato. */
  motoreOcr?: string;
  /** Metadati del file: autore, titolo, foglio, quel che c'è. */
  metadati: Record<string, string>;
  /**
   * Fiducia media nella lettura del testo. Un PDF nativo è 1: i
   * caratteri sono quelli. Un OCR porta la propria stima.
   */
  fiduciaTesto: number;
  /**
   * La fiducia riga per riga, quando a leggere è stato un OCR.
   *
   * Non è ridondante rispetto a `fiduciaTesto`: su una scansione storta
   * la prima metà della pagina si legge benissimo e l'ultima riga no, e
   * quella riga è dove sta il valore che conta. Serve all'estrattore per
   * abbassare la fiducia dei singoli valori invece di quella del
   * documento intero.
   */
  fiduciaRighe?: { testo: string; fiducia: number }[];
}

/* ── Il dato clinico ──────────────────────────────────────────────── */

/**
 * Lo stato di un valore rispetto al suo intervallo.
 *
 * `UNKNOWN` non è un ripiego: è la risposta onesta quando non esiste un
 * intervallo con cui confrontare il numero. Inventarne uno universale
 * sarebbe peggio del silenzio — un TSH "normale" dipende dal metodo del
 * laboratorio, e un intervallo preso da un manuale direbbe il falso su
 * un referto che ne stampa un altro.
 */
export const STATI_VALORE = [
  "OPTIMAL",
  "NORMAL",
  "BORDERLINE",
  "LOW",
  "HIGH",
  "CRITICAL",
  "UNKNOWN",
] as const;

export type StatoValore = (typeof STATI_VALORE)[number];

export const ETICHETTE_STATO: Record<StatoValore, string> = {
  OPTIMAL: "Ottimale",
  NORMAL: "Nella norma",
  BORDERLINE: "Al limite",
  LOW: "Sotto l'intervallo",
  HIGH: "Sopra l'intervallo",
  CRITICAL: "Fuori soglia critica",
  UNKNOWN: "Senza riferimento",
};

/**
 * Il tono con cui si disegna uno stato.
 *
 * `UNKNOWN` è neutro e non ambra: non sapere non è un allarme, e un
 * referto con trenta esami senza intervallo stampato diventerebbe un
 * muro giallo che non dice niente.
 */
export function tonoStato(stato: StatoValore): "positive" | "neutral" | "attention" | "alert" {
  if (stato === "OPTIMAL") return "positive";
  if (stato === "NORMAL") return "positive";
  if (stato === "CRITICAL") return "alert";
  if (stato === "BORDERLINE" || stato === "LOW" || stato === "HIGH") return "attention";
  return "neutral";
}

/** Da dove viene l'intervallo con cui si è giudicato il valore. */
export type FonteIntervallo =
  | "documento" // stampato sul referto: ha sempre la precedenza
  | "catalogo" // il riferimento di Unique per quel biomarcatore
  | "assente";

export const ETICHETTE_FONTE_INTERVALLO: Record<FonteIntervallo, string> = {
  documento: "intervallo del laboratorio",
  catalogo: "riferimento Unique",
  assente: "nessun intervallo",
};

export interface Intervallo {
  min: number | null;
  max: number | null;
  fonte: FonteIntervallo;
  /** Il testo da cui l'intervallo è stato letto, quando viene dal documento. */
  testo?: string;
}

/**
 * **Un fatto.** Un valore che sta scritto nel documento.
 *
 * Porta sempre la citazione da cui è stato letto: senza, non è
 * verificabile, e un dato clinico non verificabile non è un dato.
 *
 * `valore: null` con `richiedeVerifica: true` è un caso normale e
 * previsto — il lettore ha visto un numero e non è riuscito a leggerlo.
 * Il sistema dice che non lo sa. Non tira a indovinare: "1?5" non
 * diventa né 105 né 125.
 */
export interface Biomarcatore {
  /** Nome canonico: `VITAMIN_D_25OH`. Uno per concetto clinico. */
  canonical_name: string;
  /** Come lo si scrive a un essere umano. */
  display_name: string;
  /** Come compariva sul documento, verbatim. */
  etichetta_documento: string;
  /** Il codice del catalogo dello Score, se questo biomarcatore lo alimenta. */
  metric_code: string | null;
  categoria: CategoriaClinica;
  valore: number | null;
  /** Per gli esami qualitativi: "negativo", "assente", "tracce". */
  valore_testuale: string | null;
  unita: string | null;
  intervallo: Intervallo;
  stato: StatoValore;
  confidenza: number;
  richiedeVerifica: boolean;
  /** Perché richiede verifica, in italiano. */
  note: string[];
  /** La riga del documento da cui viene. */
  citazione: string;
  pagina: number | null;
  /** La data dell'esame, se il documento la dichiara. */
  data: string | null;
  /** Se il valore è stato convertito, l'unità e il numero di partenza. */
  conversione?: { da: string; valoreOriginale: number };
}

/**
 * Le categorie cliniche che il motore riconosce.
 *
 * Non è un elenco chiuso per capriccio: aggiungerne una è aggiungere una
 * riga qui e una nel catalogo. Questo tipo è la lista di quelle che
 * esistono oggi, non il limite di quelle possibili.
 */
export const CATEGORIE_CLINICHE = [
  "ematologia",
  "glicemia",
  "lipidi",
  "epatica",
  "renale",
  "tiroide",
  "ormoni",
  "vitamine",
  "minerali",
  "ferro",
  "infiammazione",
  "cardiovascolare",
  "metabolico",
  "composizione-corporea",
  "parametri-vitali",
  "urine",
  "coagulazione",
  "altro",
] as const;

export type CategoriaClinica = (typeof CATEGORIE_CLINICHE)[number];

export const ETICHETTE_CATEGORIA: Record<CategoriaClinica, string> = {
  ematologia: "Emocromo",
  glicemia: "Glicemia e insulina",
  lipidi: "Lipidi",
  epatica: "Funzionalità epatica",
  renale: "Funzionalità renale",
  tiroide: "Tiroide",
  ormoni: "Ormoni",
  vitamine: "Vitamine",
  minerali: "Minerali ed elettroliti",
  ferro: "Assetto marziale",
  infiammazione: "Infiammazione",
  cardiovascolare: "Marker cardiovascolari",
  metabolico: "Marker metabolici",
  "composizione-corporea": "Composizione corporea",
  "parametri-vitali": "Parametri vitali",
  urine: "Esame urine",
  coagulazione: "Coagulazione",
  altro: "Altro",
};

/** L'ordine in cui le categorie si mostrano: come su un referto vero. */
export const ORDINE_CATEGORIE: readonly CategoriaClinica[] = [
  "ematologia",
  "glicemia",
  "lipidi",
  "epatica",
  "renale",
  "tiroide",
  "ormoni",
  "ferro",
  "vitamine",
  "minerali",
  "infiammazione",
  "cardiovascolare",
  "metabolico",
  "coagulazione",
  "urine",
  "composizione-corporea",
  "parametri-vitali",
  "altro",
];

/* ── Terapia, anamnesi, referti ───────────────────────────────────── */

export interface Farmaco {
  nome: string;
  principio_attivo: string | null;
  dose: string | null;
  posologia: string | null;
  citazione: string;
  confidenza: number;
}

export interface Integratore {
  nome: string;
  dose: string | null;
  posologia: string | null;
  citazione: string;
  confidenza: number;
}

/** Una frase del referto che non è un numero: una conclusione, un rilievo. */
export interface NotaClinica {
  tipo: "conclusione" | "rilievo" | "anamnesi" | "indicazione" | "diagnosi-riportata";
  testo: string;
  pagina: number | null;
  confidenza: number;
}

export const ETICHETTE_NOTA: Record<NotaClinica["tipo"], string> = {
  conclusione: "Conclusioni del referto",
  rilievo: "Rilievo",
  anamnesi: "Anamnesi",
  indicazione: "Indicazione riportata",
  "diagnosi-riportata": "Diagnosi riportata nel documento",
};

/* ── Il tipo di documento ─────────────────────────────────────────── */

export const TIPI_DOCUMENTO = [
  "LAB_REPORT",
  "IMAGING_REPORT",
  "SPECIALIST_REPORT",
  "BODY_COMPOSITION",
  "PRESCRIPTION",
  "ANAMNESIS",
  "VITALS",
  "CONSENT",
  "INVOICE",
  "UNKNOWN",
] as const;

export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number];

export const ETICHETTE_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  LAB_REPORT: "Esame di laboratorio",
  IMAGING_REPORT: "Diagnostica per immagini",
  SPECIALIST_REPORT: "Referto specialistico",
  BODY_COMPOSITION: "Composizione corporea",
  PRESCRIPTION: "Prescrizione",
  ANAMNESIS: "Anamnesi",
  VITALS: "Parametri vitali",
  CONSENT: "Consenso",
  INVOICE: "Fattura",
  UNKNOWN: "Documento",
};

/**
 * La corrispondenza con il `document_kind` che il database conosce già.
 *
 * Il modulo distingue più tipi di quanti la colonna ne abbia. Questa
 * mappa è preferibile a un'alterazione dell'enum: `document_kind` è usata
 * in venti punti, e cambiarla per un dettaglio di lettura sarebbe un
 * costo pagato ovunque per un beneficio in un posto solo.
 */
export const TIPO_VERSO_KIND: Record<TipoDocumento, string> = {
  LAB_REPORT: "lab_report",
  IMAGING_REPORT: "imaging",
  SPECIALIST_REPORT: "imaging",
  BODY_COMPOSITION: "lab_report",
  PRESCRIPTION: "prescription",
  ANAMNESIS: "other",
  VITALS: "other",
  CONSENT: "consent",
  INVOICE: "invoice",
  UNKNOWN: "other",
};

/* ── Il risultato ─────────────────────────────────────────────────── */

/** Un problema incontrato leggendo. Non ferma la pipeline: la annota. */
export interface Avvertenza {
  codice:
    | "ocr-assente"
    | "ocr-fallito"
    | "documento-vuoto"
    | "documento-illeggibile"
    | "tabella-non-riconosciuta"
    | "valore-illeggibile"
    | "unita-inattesa"
    | "data-assente"
    | "duplicato"
    | "confidenza-bassa"
    | "formato-parziale"
    | "paziente-non-corrispondente";
  messaggio: string;
  /** Su quale biomarcatore, quando riguarda uno solo. */
  riferimento?: string;
}

/**
 * Il JSON strutturato di un documento: ciò che esce dal motore ed entra
 * nel Brain.
 *
 * È volutamente una fotografia completa e autoconsistente. Chi la legge
 * fra un anno — un medico, un collega, un'autorità — deve poter
 * ricostruire cosa il sistema ha visto senza riaprire il file.
 */
export interface DocumentoStrutturato {
  documento: {
    id: string | null;
    nome_file: string;
    formato: Formato;
    mime: string | null;
    dimensione_byte: number;
    /** SHA-256 del file: l'identità del contenuto, e il modo di riconoscere i duplicati. */
    impronta: string;
    pagine: number;
    caricato_il: string;
  };
  paziente: {
    /** Il nome letto sul documento, quando c'è. Serve a verificare, non a identificare. */
    nome: string | null;
    data_nascita: string | null;
    confidenza: number;
  };
  tipo_documento: TipoDocumento;
  data_documento: string | null;
  laboratorio: string | null;
  biomarcatori: Biomarcatore[];
  farmaci: Farmaco[];
  integratori: Integratore[];
  note_cliniche: NotaClinica[];
  tabelle: Tabella[];
  avvertenze: Avvertenza[];
  /** Il testo integrale letto: la prova di cosa il motore aveva davanti. */
  testo_estratto: string;
  lettura: {
    via: "nativo" | "ocr" | "misto";
    motoreOcr?: string;
    fiduciaTesto: number;
  };
  /**
   * Vero se qualcosa qui dentro non può entrare in cartella da solo.
   * Il calcolo sta in `processore.ts`, in un posto solo.
   */
  richiede_revisione_umana: boolean;
  confidenza_complessiva: number;
}

/* ── Stato della lavorazione ──────────────────────────────────────── */

/**
 * Gli stati di un documento in lavorazione.
 *
 * Sono quelli della visione, tradotti uno a uno. `REVIEW_REQUIRED` non è
 * un fallimento: è il caso normale per un referto con valori fuori
 * soglia, ed è il punto in cui la responsabilità torna a una persona.
 */
export const STATI_LAVORAZIONE = [
  "UPLOADED",
  "PROCESSING",
  "OCR",
  "EXTRACTING",
  "ANALYZING",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "FAILED",
] as const;

export type StatoLavorazione = (typeof STATI_LAVORAZIONE)[number];

export const ETICHETTE_LAVORAZIONE: Record<StatoLavorazione, string> = {
  UPLOADED: "Caricato",
  PROCESSING: "In lavorazione",
  OCR: "Riconoscimento del testo",
  EXTRACTING: "Estrazione dei dati",
  ANALYZING: "Analisi del Brain",
  REVIEW_REQUIRED: "Da rivedere",
  COMPLETED: "Completato",
  FAILED: "Non riuscito",
};

/** Cosa sta succedendo, detto a chi guarda l'avanzamento. */
export const SPIEGAZIONI_LAVORAZIONE: Record<StatoLavorazione, string> = {
  UPLOADED: "Il file è al sicuro. Sta per essere letto.",
  PROCESSING: "Riconosco il formato e apro il documento.",
  OCR: "Il documento è un'immagine: sto riconoscendo il testo.",
  EXTRACTING: "Sto riconoscendo gli esami, i valori e gli intervalli.",
  ANALYZING: "Confronto i valori con lo storico e con i riferimenti.",
  REVIEW_REQUIRED: "Pronto, ma qualcosa va guardato da un professionista.",
  COMPLETED: "Documento analizzato.",
  FAILED: "Non sono riuscito ad analizzarlo. Il file resta in cartella.",
};

/** Quanto manca, per la barra di avanzamento. Zero a uno. */
export const AVANZAMENTO: Record<StatoLavorazione, number> = {
  UPLOADED: 0.1,
  PROCESSING: 0.25,
  OCR: 0.45,
  EXTRACTING: 0.65,
  ANALYZING: 0.85,
  REVIEW_REQUIRED: 1,
  COMPLETED: 1,
  FAILED: 1,
};

export function etichettaLavorazione(stato: string | null | undefined): string {
  return ETICHETTE_LAVORAZIONE[(stato ?? "") as StatoLavorazione] ?? "In attesa";
}

/** Vero se lo stato è un punto d'arrivo e non un passaggio. */
export function lavorazioneFinita(stato: string | null | undefined): boolean {
  return stato === "COMPLETED" || stato === "FAILED" || stato === "REVIEW_REQUIRED";
}
