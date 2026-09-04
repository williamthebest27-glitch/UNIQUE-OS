/**
 * Chi risponde alle domande del founder, e chi legge, scrive, confronta.
 *
 * Tre motori, e la scelta predefinita è il primo:
 *
 * **`proprio`** — il motore di Unique. Riconosce ciò che si misura, per
 * cosa si raggruppa e con quali filtri, interroga i motori di calcolo che
 * già esistono e compone la risposta con frasi scritte a mano. Nessuna
 * rete, nessun costo per domanda, nessun dato che esce — e questo, con
 * dati sanitari, è un fatto giuridico prima che tecnico.
 *
 * **`ollama`** — un modello aperto sul server di Unique. Aggiunge ciò che
 * una grammatica non copre: la domanda posta in modo davvero libero, il
 * referto scansionato, il copy finito. Anche qui niente esce dalla
 * clinica: il modello gira su una macchina propria.
 *
 * **`anthropic`** — un modello linguistico esterno. Si accende di
 * proposito, mai per il solo fatto che una chiave sia presente: una
 * chiave dimenticata in un file di ambiente non è un consenso a mandare
 * fuori i numeri dell'azienda.
 *
 * Il motore proprietario non è un ripiego in attesa di un modello. È
 * l'applicazione di ciò che la visione chiedeva: il Brain non deve essere
 * "ChatGPT con i documenti di Unique caricati". I numeri li sa il
 * database, le regole le sa il codice, e la lingua italiana si può
 * scrivere una volta sola. I modelli servono dove il codice si ferma.
 */

export type MotoreConversazione = "proprio" | "ollama" | "anthropic";

/** Vero se una chiave per il modello esterno esiste. Non basta a usarlo. */
export function chiaveModelloPresente(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
}

/**
 * Il motore attivo.
 *
 * `UNIQUE_BRAIN=ollama` accende il modello locale; `UNIQUE_BRAIN=anthropic`
 * quello esterno, e solo se la chiave c'è. Qualunque altro valore, o
 * nessun valore, lascia il motore proprietario: funziona senza
 * configurare niente.
 */
export function motoreConversazione(): MotoreConversazione {
  const scelto = (process.env.UNIQUE_BRAIN ?? "").trim().toLowerCase();
  if (scelto === "ollama") return "ollama";
  if (scelto === "anthropic" && chiaveModelloPresente()) return "anthropic";
  return "proprio";
}

/** Vero se un modello linguistico — locale o esterno — è acceso. */
export function modelloAttivo(): boolean {
  return motoreConversazione() !== "proprio";
}

/**
 * Che cosa funziona con il motore attivo.
 *
 * Con il motore proprietario funziona tutto ciò che è misura, confronto
 * e struttura. Un modello aggiunge i lavori di lingua: la conversazione
 * libera, la lettura di un referto scansionato, il copy finito invece
 * dell'impalcatura, la sintesi pre-visita scritta.
 */
export interface Capacita {
  /** Rispondere sui numeri dell'azienda. Sempre disponibile. */
  conversazione: true;
  /** Domande poste in modo del tutto libero, fuori dalla grammatica. */
  testoLibero: boolean;
  /** Leggere un referto scansionato: un'immagine, non testo. */
  estrazione: boolean;
  /** Scrivere copy finito, non solo l'impalcatura. */
  redazione: boolean;
  /** Il copilot clinico su domande libere. */
  copilot: boolean;
  /** Dove gira il modello, se gira. */
  inCasa: boolean;
}

export function capacitaAttive(): Capacita {
  const motore = motoreConversazione();
  const conModello = motore !== "proprio";
  return {
    conversazione: true,
    testoLibero: conModello,
    estrazione: conModello,
    redazione: conModello,
    copilot: conModello,
    inCasa: motore !== "anthropic",
  };
}

export const ETICHETTA_MOTORE: Record<MotoreConversazione, string> = {
  proprio: "Motore Unique",
  ollama: "Modello locale",
  anthropic: "Modello esterno",
};
