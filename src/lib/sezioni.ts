import { CANCELLATION_HOURS } from "@/lib/credits/rules";

/**
 * I titoli delle sezioni del paziente.
 *
 * Stanno qui e non nelle pagine perché li usano in due: la pagina vera e
 * lo scheletro che compare mentre la pagina arriva. Se divergessero, chi
 * clicca vedrebbe per un istante un titolo e poi un altro — che è il modo
 * più veloce per far sembrare rotto qualcosa che funziona.
 */
export const SEZIONI_PAZIENTE = {
  dashboard: {
    title: "Home",
    subtitle: null,
  },
  percorso: {
    title: "Il tuo percorso",
    subtitle:
      "Lo Score nel tempo, il protocollo in corso e le azioni che lo fanno avanzare.",
  },
  documenti: {
    title: "Documenti e risultati",
    subtitle:
      "Referti, esami e piani di cura. Ogni file resta accessibile solo a te e ai professionisti che ti seguono.",
  },
  appuntamenti: {
    title: "Appuntamenti",
    subtitle: `Le tue visite e le disponibilità in clinica. Disdicendo con almeno ${CANCELLATION_HOURS} ore di anticipo il credito torna disponibile.`,
  },
  crediti: {
    title: "Membership e crediti",
    subtitle: "Il tuo piano, i movimenti e i crediti ancora a disposizione.",
  },
} as const;

export type SezionePaziente = keyof typeof SEZIONI_PAZIENTE;

/**
 * Le sezioni dell'area clinica e della control room, per percorso.
 *
 * Qui la chiave è il percorso e non un nome, perché a cercarle è lo
 * scheletro, che di una sezione conosce solo l'indirizzo verso cui si sta
 * andando.
 *
 * Dove il titolo dipende dai dati — "Ciao Alessandro", il nome di un
 * paziente in cartella — non c'è voce: meglio un rettangolo che un
 * titolo da sostituire un istante dopo.
 */
export interface Sezione {
  title: string;
  subtitle?: string | null;
}

export const SEZIONI_PRO: Record<string, Sezione> = {
  "/pro/agenda": {
    title: "Agenda",
    subtitle:
      "Le visite dei prossimi trenta giorni, giorno per giorno. Apri una riga per la cartella del paziente.",
  },
  "/pro/documenti": {
    title: "Documenti",
    subtitle:
      "Referti e allegati dei pazienti che segui, dal più recente. Si aprono nella cartella, dove si analizzano e si approvano i valori.",
  },
  "/pro/pazienti": {
    title: "Pazienti",
    subtitle: "I pazienti che segui, con il punteggio più recente.",
  },
  "/pro/revisioni": {
    title: "Revisioni cliniche",
    subtitle:
      "I valori che il motore AI propone di scrivere nella cartella del paziente.",
  },
  "/pro/task": {
    title: "Task",
    subtitle:
      "Il lavoro clinico che non è una visita: richiami, referti da leggere, piani da aggiornare.",
  },
};

export const SEZIONI_CONTROL: Record<string, Sezione> = {
  "/control": { title: "Oggi" },
  "/control/brain": {
    title: "Unique Brain",
    subtitle:
      "Chiedi come sta andando, e poi chiedi perché. Il Brain propone azioni; a eseguirle sei tu, dopo aver visto cosa cambia.",
  },
  "/control/agenda": {
    title: "Agenda",
    subtitle: "I prossimi sette giorni, tutti i professionisti. Da qui si fissa, si conferma, si sposta e si disdice.",
  },
  "/control/pazienti": {
    title: "Pazienti",
    subtitle: "L'anagrafica della clinica. Recapiti, membership e crediti; la cartella clinica resta ai professionisti.",
  },
  "/control/incassi": {
    title: "Incassi",
    subtitle: "Quello che entra al banco: contanti, POS, bonifici. Ogni incasso ha la sua ricevuta.",
  },
  "/control/servizi": {
    title: "Listino e stanze",
    subtitle: "I servizi che si prenotano, con durata, crediti e prezzo. E le stanze in cui si svolgono.",
  },
  "/control/professionisti": {
    title: "Professionisti",
    subtitle: "La squadra, gli orari settimanali e le disponibilità pubblicate.",
  },
  "/control/economia": { title: "Unit economics" },
  "/control/capacita": { title: "Capacità" },
  "/control/crm": {
    title: "CRM",
    subtitle:
      "Il valore generato si legge dai pagamenti del paziente, non da un campo aggiornato a mano.",
  },
  "/control/task": { title: "Task" },
  "/control/approvazioni": {
    title: "Approvazioni",
    subtitle:
      "Ciò che il Brain propone, con l’anteprima calcolata sui dati veri. Approvare non esegue.",
  },
  "/control/marketing": { title: "Marketing" },
  "/control/contenuti": { title: "Contenuti" },
  "/control/conoscenza": { title: "Knowledge base" },
};

/**
 * La sezione che corrisponde a un percorso, o null.
 *
 * Corrispondenza esatta soltanto: `/control/conoscenza/listino-servizi` è
 * la scheda di una voce, non l'elenco, e mostrarle il titolo dell'elenco
 * sarebbe una bugia breve ma visibile.
 */
export function sezionePerPercorso(
  mappa: Record<string, Sezione>,
  percorso: string,
): Sezione | null {
  return mappa[percorso] ?? null;
}
