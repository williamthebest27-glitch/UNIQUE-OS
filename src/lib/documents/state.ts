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
};

export const statoUploadIniziale: StatoUpload = { esito: "iniziale" };

/** Tipi accettati: sono quelli che il motore sa anche leggere. */
export const TIPI_ACCETTATI = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.webp";

/** Oltre questa soglia il caricamento non passa dalla server action. */
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
