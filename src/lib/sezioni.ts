/**
 * I titoli delle sezioni di area clinica e control room.
 *
 * Quelle del paziente vivono in `@/lib/patient/sezioni`, insieme alle
 * icone e ai gruppi del menu: erano due elenchi della stessa cosa, e due
 * elenchi della stessa cosa divergono sempre.
 */

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
  "/pro/attenzione": {
    title: "Centro di attenzione",
    subtitle:
      "Tutto ciò che richiede una decisione, diviso per tipo di lavoro. Ogni riga porta con sé i fatti che l’hanno accesa.",
  },
  "/pro/agenda": {
    title: "Agenda",
    subtitle:
      "Le visite dei pazienti che segui. Da una riga si apre il workspace della visita, dove si prepara e si registra l’esito.",
  },
  "/pro/notifiche": {
    title: "Notifiche",
    subtitle:
      "Fatti già avvenuti che qualcuno voleva farti sapere. Il lavoro che aspetta sta nel centro di attenzione: sono due code diverse.",
  },
  "/pro/documenti": {
    title: "Documenti",
    subtitle:
      "Referti e allegati dei pazienti che segui, dal più recente. Si aprono nella cartella, dove si analizzano, si revisionano e si approvano i valori.",
  },
  "/pro/pazienti": {
    title: "Pazienti",
    subtitle:
      "I pazienti che segui. In ordine di attenzione richiesta, non di cognome: questa è una coda di lavoro, non un archivio.",
  },
  "/pro/revisioni": {
    title: "Revisioni cliniche",
    subtitle:
      "I valori che il motore AI propone di scrivere nella cartella del paziente.",
  },
  "/pro/task": {
    title: "Task",
    subtitle:
      "Richiami, referti da leggere, piani da aggiornare. Un task ha sempre un incaricato: senza, è un desiderio.",
  },
  "/pro/messaggi": {
    title: "Messaggi",
    subtitle:
      "Le conversazioni con i pazienti che segui. Un filo clinico lo vedono il paziente e il care team; uno amministrativo anche la reception.",
  },
  "/pro/team": {
    title: "Team",
    subtitle:
      "Chi c’è, su cosa può scrivere, quando riceve. Leggere una cartella è di tutto il care team; scrivere una misura è per disciplina.",
  },
  "/pro/conoscenza": {
    title: "Knowledge base",
    subtitle:
      "Protocolli, procedure, listini e policy: ciò che è in vigore oggi. Le versioni precedenti restano leggibili nella scheda di ogni voce.",
  },
  "/pro/report": {
    title: "Report clinici",
    subtitle:
      "I pazienti che segui stanno migliorando? Il perimetro è il tuo: lo stesso report letto da due persone dà due numeri.",
  },
  "/pro/cerca": {
    title: "Ricerca",
    subtitle:
      "Pazienti, referti, visite, task, note cliniche e procedure. I risultati arrivano divisi per categoria.",
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
