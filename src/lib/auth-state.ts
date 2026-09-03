/**
 * Stato del form di accesso.
 *
 * Vive fuori da `auth-actions.ts` perché un file marcato "use server" può
 * esportare soltanto funzioni async: un tipo e una costante lì dentro
 * fanno fallire la compilazione.
 */
export type StatoAccesso = {
  esito: "iniziale" | "inviato" | "errore";
  messaggio?: string;
  email?: string;
};

export const statoAccessoIniziale: StatoAccesso = { esito: "iniziale" };
