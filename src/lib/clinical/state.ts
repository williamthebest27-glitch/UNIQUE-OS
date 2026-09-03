/**
 * Stati dei form clinici.
 *
 * Vivono fuori dalle azioni perché un file "use server" può esportare
 * soltanto funzioni async.
 */

export interface FonteRisposta {
  kind: string;
  label: string;
  date: string | null;
}

export type StatoCopilot = {
  esito: "iniziale" | "ok" | "errore";
  domanda?: string;
  risposta?: string;
  fonti?: FonteRisposta[];
  messaggio?: string;
};

export const statoCopilotIniziale: StatoCopilot = { esito: "iniziale" };

export type StatoTesto = {
  esito: "iniziale" | "ok" | "errore";
  messaggio?: string;
};

export const statoTestoIniziale: StatoTesto = { esito: "iniziale" };

/** Domande di partenza, quelle che un professionista fa davvero. */
export const DOMANDE_RAPIDE = [
  "Fammi un riepilogo degli ultimi sei mesi.",
  "Quali parametri sono peggiorati?",
  "Confronta gli ultimi due esami.",
  "Fammi vedere l’evoluzione della composizione corporea.",
  "Quali elementi potrebbero richiedere attenzione?",
  "Preparami una sintesi della visita precedente.",
] as const;
