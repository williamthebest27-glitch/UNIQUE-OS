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
  /** Breve codice dell'errore, per chi assiste. */
  codice?: string;
  /**
   * L'origine verso cui punta il collegamento appena spedito.
   *
   * Mostrarla non è un vezzo tecnico: se in produzione dicesse
   * `localhost`, l'email arriverebbe con un link verso il computer di chi
   * la riceve, e il guasto sarebbe altrimenti invisibile.
   */
  origine?: string;
};

export const statoAccessoIniziale: StatoAccesso = { esito: "iniziale" };
