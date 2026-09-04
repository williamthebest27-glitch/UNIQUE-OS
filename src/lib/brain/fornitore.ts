/**
 * Chi risponde alle domande del founder.
 *
 * Due motori, e la scelta predefinita è il primo:
 *
 * **`proprio`** — il motore di Unique. Riconosce l'intento della domanda,
 * interroga i motori di calcolo che già esistono e compone la risposta
 * con frasi scritte a mano. Nessuna rete, nessun costo per domanda,
 * nessun dato che esce dall'infrastruttura — e questo, con dati sanitari,
 * non è un dettaglio tecnico ma un fatto giuridico.
 *
 * **`anthropic`** — un modello linguistico, per chi vuole conversazione
 * libera. Si accende di proposito, mai per il solo fatto che una chiave
 * sia presente: una chiave dimenticata in un file di ambiente non è un
 * consenso a mandare fuori i numeri dell'azienda.
 *
 * Il motore proprietario non è un ripiego in attesa del modello. È
 * l'applicazione di ciò che la visione chiedeva: il Brain non deve essere
 * "ChatGPT con i documenti di Unique caricati". I numeri li sa il
 * database, le regole le sa il codice, e la lingua italiana si può
 * scrivere una volta sola.
 */

export type MotoreConversazione = "proprio" | "anthropic";

/** Vero se una chiave per il modello esiste. Non basta a usarlo. */
export function chiaveModelloPresente(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
}

/**
 * Il motore attivo per la chat del founder.
 *
 * `UNIQUE_BRAIN=anthropic` accende il modello, e solo se la chiave c'è.
 * Qualunque altro valore, o nessun valore, lascia il motore proprietario:
 * funziona senza configurare niente.
 */
export function motoreConversazione(): MotoreConversazione {
  const scelto = (process.env.UNIQUE_BRAIN ?? "").trim().toLowerCase();
  if (scelto === "anthropic" && chiaveModelloPresente()) return "anthropic";
  return "proprio";
}

/**
 * Che cosa funziona con il motore attivo.
 *
 * Alcune cose un motore deterministico non le sa fare, e fingere che le
 * faccia sarebbe peggio che dirlo: leggere un referto in PDF ed
 * estrarne i valori, scrivere un carosello, rispondere a una domanda
 * libera sulla cartella di un paziente. Sono lavori di lingua, e servono
 * un modello.
 */
export interface Capacita {
  /** Rispondere sui numeri dell'azienda. Sempre disponibile. */
  conversazione: true;
  /** Domande poste in modo del tutto libero, fuori dagli intenti noti. */
  testoLibero: boolean;
  /** Estrarre misure da un documento. */
  estrazione: boolean;
  /** Scrivere contenuti sul brand. */
  redazione: boolean;
  /** Il copilot clinico dentro la cartella. */
  copilot: boolean;
}

export function capacitaAttive(): Capacita {
  const conModello = chiaveModelloPresente();
  return {
    conversazione: true,
    testoLibero: motoreConversazione() === "anthropic",
    estrazione: conModello,
    redazione: conModello,
    copilot: conModello,
  };
}

export const ETICHETTA_MOTORE: Record<MotoreConversazione, string> = {
  proprio: "Motore Unique",
  anthropic: "Modello linguistico",
};
