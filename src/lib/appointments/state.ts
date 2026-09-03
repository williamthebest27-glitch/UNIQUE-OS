/** Esito di una prenotazione o di una disdetta. */
export type StatoPrenotazione = {
  esito: "iniziale" | "ok" | "errore";
  messaggio?: string;
};

export const statoPrenotazioneIniziale: StatoPrenotazione = { esito: "iniziale" };
