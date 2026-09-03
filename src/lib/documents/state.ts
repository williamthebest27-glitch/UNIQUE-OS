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
