import {
  ACCEPT_DOCUMENT_INTELLIGENCE,
  MIME_ACCETTATI,
} from "@/lib/document-intelligence/rilevatore";

/**
 * Esito del caricamento di un documento.
 *
 * Vive fuori da `actions.ts` perché un file marcato "use server" può
 * esportare soltanto funzioni async.
 */
export type StatoUpload = {
  esito: "iniziale" | "ok" | "errore";
  messaggio?: string;
  /** Riga secondaria: cosa ha fatto il motore dopo il caricamento. */
  dettaglio?: string;
  /** L'id del documento appena creato, per portarci sopra chi ha caricato. */
  documentId?: string;
  /** Vero se lo stesso file era già in cartella. */
  duplicato?: boolean;
};

export const statoUploadIniziale: StatoUpload = { esito: "iniziale" };

/**
 * I tipi accettati: sono quelli che il motore sa anche **leggere**.
 *
 * L'elenco non è scritto qui: viene dal registro dei formati del
 * Document Intelligence Engine. È deliberato — quando il motore
 * imparerà un formato nuovo, il caricamento lo accetterà senza che
 * nessuno debba ricordarsi di aggiornare una seconda lista. Due elenchi
 * di formati in due file divergono, e il modo in cui divergono è che
 * l'interfaccia rifiuta un file che il motore avrebbe letto benissimo.
 */
export const TIPI_ACCETTATI = MIME_ACCETTATI;

export const ACCEPT_ATTRIBUTE = ACCEPT_DOCUMENT_INTELLIGENCE;

/**
 * Oltre questa soglia il caricamento non passa dalla server action.
 *
 * Sta sotto al limite di `serverActions.bodySizeLimit` in
 * `next.config.ts`: il margine serve perché il corpo della richiesta
 * porta anche i campi del modulo, e un file esattamente al limite
 * verrebbe rifiutato da Next con un errore che non spiega niente.
 */
export const DIMENSIONE_MASSIMA_BYTE = 11 * 1024 * 1024;

/**
 * Esito di un cambio di stato di revisione.
 *
 * Porta anche lo stato raggiunto, non solo il messaggio: il componente
 * lo usa per disegnare la pastiglia giusta senza aspettare che la
 * pagina si rigeneri. Il dato vero resta quello del database — questo è
 * ciò che si mostra nel frattempo.
 */
export type StatoRevisioneDocumento = {
  esito: "iniziale" | "ok" | "errore";
  stato?: "pending" | "reviewed" | "approved";
  messaggio?: string;
};

export const statoRevisioneIniziale: StatoRevisioneDocumento = { esito: "iniziale" };

/** Esito della revisione di un'analisi automatica. */
export type StatoRevisioneAnalisi = {
  esito: "iniziale" | "ok" | "errore";
  messaggio?: string;
};

export const statoRevisioneAnalisiIniziale: StatoRevisioneAnalisi = { esito: "iniziale" };
