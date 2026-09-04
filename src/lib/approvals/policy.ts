/**
 * Cosa l'AI può fare da sola, e cosa no.
 *
 * Quattro classi, in ordine di conseguenze:
 *
 *   read       leggere. Non chiede niente a nessuno.
 *   suggest    proporre. L'AI dice, la persona decide.
 *   reversible fare qualcosa che si può disfare. Basta una conferma.
 *   sensitive  prezzi, dati clinici, comunicazioni verso l'esterno,
 *              denaro. Richiede autorizzazione esplicita di chi ha il
 *              ruolo per darla.
 *
 * **La classe non la sceglie il modello.** Sta in questo catalogo,
 * scritto a mano. Se il modello potesse dichiarare "questa azione è
 * reversibile" avrebbe il permesso di declassare la propria azione, e
 * l'intero sistema di approvazione sarebbe una formalità.
 *
 * Nessun import: sono le regole che decidono se una macchina può toccare
 * l'azienda, e vanno verificate senza database, senza rete e senza
 * modello.
 */

export type ClasseAzione = "read" | "suggest" | "reversible" | "sensitive";

export type StatoProposta =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "expired";

export type RuoloApp =
  | "patient"
  | "professional"
  | "admin"
  | "owner"
  | "reception"
  | "marketing";

export interface DefinizioneAzione {
  classe: ClasseAzione;
  titolo: string;
  /**
   * Cosa viene toccato, in italiano.
   *
   * È l'elenco che compare nell'anteprima prima di "vuoi applicare
   * l'aggiornamento?". Senza, la domanda sarebbe a scatola chiusa.
   */
  sistemi: string[];
  /** Chi può autorizzarla. */
  ruoli: RuoloApp[];
  /** Cosa succede davvero, detto a chi deve decidere. */
  descrizione: string;
}

export const AZIONI: Record<string, DefinizioneAzione> = {
  crea_task: {
    classe: "reversible",
    titolo: "Creare un task",
    sistemi: ["Elenco task", "Notifiche dell'incaricato"],
    ruoli: ["owner", "admin", "reception", "marketing", "professional"],
    descrizione:
      "Assegna un'attività a una persona, con priorità e scadenza. Si chiude o si annulla in qualsiasi momento.",
  },

  avvisa_staff: {
    classe: "reversible",
    titolo: "Avvisare la direzione",
    sistemi: ["Notifiche"],
    ruoli: ["owner", "admin"],
    descrizione: "Scrive una notifica interna. Non esce nulla verso i pazienti.",
  },

  aggiorna_prezzo_servizio: {
    classe: "sensitive",
    titolo: "Aggiornare il prezzo di un servizio",
    sistemi: [
      "Listino servizi",
      "Knowledge base (nuova versione del listino)",
      "Preventivi e materiale commerciale",
      "Risposte del Brain e del chatbot",
      "Dashboard amministrativa",
    ],
    ruoli: ["owner", "admin"],
    descrizione:
      "Cambia il prezzo in listino e apre la versione corrispondente in knowledge base, così che nessun sistema risponda più con il prezzo vecchio. Le prestazioni già fatturate non si toccano.",
  },

  pubblica_conoscenza: {
    classe: "sensitive",
    titolo: "Mettere in vigore un'informazione",
    sistemi: ["Knowledge base", "Risposte del Brain", "Contenuti generati"],
    ruoli: ["owner", "admin"],
    descrizione:
      "Attiva una versione e chiude la precedente il giorno prima. Da quel momento il sistema risponde con questa.",
  },

  prepara_riattivazione: {
    classe: "sensitive",
    titolo: "Preparare una riattivazione",
    sistemi: ["Elenco task della reception", "CRM", "Bozza di comunicazione"],
    ruoli: ["owner", "admin"],
    descrizione:
      "Individua i pazienti inattivi e prepara i contatti da fare, uno per persona. Non invia nulla: i messaggi partono quando qualcuno li manda.",
  },
};

/** Quanti giorni resta valida un'anteprima. */
export const GIORNI_VALIDITA = 7;

export function definizione(azione: string): DefinizioneAzione | null {
  return AZIONI[azione] ?? null;
}

/**
 * Un'azione che non tocca niente non ha bisogno di approvazione.
 *
 * Leggere e proporre non cambiano lo stato del mondo: chiedere una
 * conferma per ognuna insegnerebbe a chi decide a cliccare "sì" senza
 * leggere, che è il modo migliore per rendere inutile il momento in cui
 * la conferma conta davvero.
 */
export function richiedeApprovazione(classe: ClasseAzione): boolean {
  return classe === "reversible" || classe === "sensitive";
}

export function puoDecidere(ruolo: RuoloApp, azione: string): boolean {
  const def = definizione(azione);
  if (!def) return false;
  return def.ruoli.includes(ruolo);
}

/** Vero se l'anteprima è troppo vecchia per essere ancora una descrizione fedele. */
export function scaduta(expiresAt: string, adesso: Date = new Date()): boolean {
  return Date.parse(expiresAt) < adesso.getTime();
}

export function calcolaScadenza(adesso: Date = new Date()): string {
  return new Date(adesso.getTime() + GIORNI_VALIDITA * 86_400_000).toISOString();
}

/**
 * Se una proposta può passare all'esecuzione, e altrimenti perché no.
 *
 * Restituisce un motivo leggibile invece di un booleano: chi guarda un
 * pulsante spento deve poter sapere cosa manca.
 */
export function puoEseguire(
  proposta: { state: StatoProposta; action: string; expiresAt: string },
  ruolo: RuoloApp,
  adesso: Date = new Date(),
): { ok: true } | { ok: false; motivo: string } {
  const def = definizione(proposta.action);
  if (!def) return { ok: false, motivo: "Azione sconosciuta: non esiste più nel catalogo." };

  if (proposta.state === "executed") return { ok: false, motivo: "Già eseguita." };
  if (proposta.state === "rejected") return { ok: false, motivo: "Rifiutata." };
  if (proposta.state === "expired") return { ok: false, motivo: "Scaduta." };
  if (proposta.state === "failed") {
    return { ok: false, motivo: "L'esecuzione è fallita: serve una proposta nuova." };
  }
  if (proposta.state === "pending") {
    return { ok: false, motivo: "Non è ancora stata autorizzata." };
  }

  if (scaduta(proposta.expiresAt, adesso)) {
    return {
      ok: false,
      motivo: "L'anteprima è vecchia: i dati di adesso possono essere diversi.",
    };
  }

  if (!def.ruoli.includes(ruolo)) {
    return { ok: false, motivo: "Il tuo ruolo non può autorizzare questa azione." };
  }

  return { ok: true };
}

export const ETICHETTE_CLASSE: Record<ClasseAzione, string> = {
  read: "Lettura",
  suggest: "Suggerimento",
  reversible: "Reversibile",
  sensitive: "Sensibile",
};

export const ETICHETTE_STATO: Record<StatoProposta, string> = {
  pending: "In attesa",
  approved: "Autorizzata",
  rejected: "Rifiutata",
  executed: "Eseguita",
  failed: "Fallita",
  expired: "Scaduta",
};
