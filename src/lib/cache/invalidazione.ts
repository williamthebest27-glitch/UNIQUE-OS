import { revalidatePath } from "next/cache";

/**
 * Dove ricompare un dato quando cambia.
 *
 * Un dato clinico non vive in una pagina sola. Una misura approvata in
 * «Revisioni» finisce nei risultati del paziente, nel suo andamento, nel
 * Longevity Score, nella cartella che il medico apre il giorno dopo e
 * nella scheda che la reception vede dal banco. Se l'azione che la
 * scrive invalida solo la pagina da cui è partito il clic, tutte le
 * altre continuano a raccontare la versione precedente.
 *
 * Per questo qui non ci sono funzioni chiamate come le pagine, ma come
 * i fatti: `invalidaCartellaClinica`, `invalidaAgenda`. Chi scrive una
 * nuova azione deve sapere *cosa* ha cambiato, non ricordarsi l'elenco
 * delle otto schermate che lo leggono — quell'elenco invecchia, e
 * invecchia in silenzio.
 *
 * ---
 *
 * Due cose che questo modulo **non** fa, ed è bene sapere perché.
 *
 * `revalidatePath` agisce sulla sessione che ha eseguito l'azione: pulisce
 * la cache del router di *quel* browser. Il medico che approva una misura
 * non può svuotare la cache del telefono del paziente. La freschezza fra
 * persone diverse la garantisce `unstable_dynamicStaleTime = 0` sulle
 * pagine cliniche — vedi docs/freschezza-dei-dati.md. I due meccanismi
 * coprono metà del problema ciascuno, e servono entrambi.
 *
 * Invalidare più del necessario costa una rilettura; invalidare meno
 * costa un dato sbagliato sotto gli occhi di qualcuno. Dove c'è dubbio,
 * qui si invalida di più.
 */

/**
 * Le sezioni in cui il paziente vede il proprio stato clinico.
 *
 * Sono percorsi fissi e non parametrici: ogni paziente vede i propri, e
 * la Row Level Security fa il resto. Invalidarli significa invalidarli
 * per chi sta usando l'applicazione in questo momento.
 */
const SEZIONI_CLINICHE_PAZIENTE = [
  "/dashboard",
  "/percorso",
  "/piano",
  "/risultati",
  "/progressi",
  "/score",
  "/documenti",
] as const;

/**
 * È cambiato qualcosa nel corpo di una persona: una misura, un referto,
 * il punteggio, una nota, un passo del piano di cura.
 *
 * Passare `patientId` quando lo si conosce: aggiunge la cartella clinica
 * e la scheda vista dalla control room, che sono percorsi parametrici.
 */
export function invalidaCartellaClinica(patientId?: string | null): void {
  for (const sezione of SEZIONI_CLINICHE_PAZIENTE) revalidatePath(sezione);

  // Lato clinico: l'elenco mostra il punteggio più recente, «Oggi» i
  // pazienti della giornata, «Revisioni» ciò che resta da validare.
  revalidatePath("/pro");
  revalidatePath("/pro/pazienti");
  revalidatePath("/pro/revisioni");
  revalidatePath("/pro/documenti");

  if (patientId) {
    revalidatePath(`/pro/pazienti/${patientId}`);
    revalidatePath(`/control/pazienti/${patientId}`);
  }
}

/**
 * È cambiato un appuntamento: creato, spostato, disdetto, concluso.
 *
 * Tocca tre mondi che di solito non si parlano — il paziente che ha
 * prenotato, il professionista che ha l'ora occupata, il banco che
 * gestisce la giornata — ed è il motivo per cui una disdetta fatta
 * dall'app restava invisibile in control room.
 */
export function invalidaAgenda(patientId?: string | null): void {
  revalidatePath("/appuntamenti");
  revalidatePath("/dashboard");
  revalidatePath("/percorso");

  revalidatePath("/pro");
  revalidatePath("/pro/agenda");

  revalidatePath("/control/agenda");
  revalidatePath("/control");
  revalidatePath("/control/capacita");

  if (patientId) {
    revalidatePath(`/pro/pazienti/${patientId}`);
    revalidatePath(`/control/pazienti/${patientId}`);
  }
}

/**
 * È cambiato il saldo crediti o una membership.
 *
 * Il saldo si vede in tre punti che si aggiornano insieme o non si
 * aggiornano affatto: la tessera del paziente, la card in home, la
 * scheda al banco.
 */
export function invalidaCrediti(patientId?: string | null): void {
  revalidatePath("/crediti");
  revalidatePath("/dashboard");

  revalidatePath("/control/pazienti");
  revalidatePath("/control/incassi");
  revalidatePath("/control");

  if (patientId) {
    revalidatePath(`/pro/pazienti/${patientId}`);
    revalidatePath(`/control/pazienti/${patientId}`);
  }
}

/**
 * È cambiato un incasso, un listino, una membership: i numeri che la
 * direzione legge la mattina dopo.
 */
export function invalidaNumeriDirezione(): void {
  revalidatePath("/control");
  revalidatePath("/control/economia");
  revalidatePath("/control/incassi");
  revalidatePath("/control/crm");
}

/**
 * È cambiato un task.
 *
 * La lista di lavoro è una sola tabella letta da due schermate diverse —
 * quella del banco e quella clinica. Chiudere un task da una parte lo
 * lasciava aperto agli occhi dell'altra.
 */
export function invalidaLavoro(): void {
  revalidatePath("/control/task");
  revalidatePath("/control");
  revalidatePath("/pro/task");
  revalidatePath("/pro");
}

/**
 * Il Brain ha eseguito una proposta approvata.
 *
 * Cosa può eseguire sta nel catalogo di `lib/approvals/executor.ts`, ed
 * è deliberatamente corto: task, avvisi allo staff, prezzi di listino,
 * voci di knowledge base. Nessuna di queste è una scrittura clinica — se
 * un giorno lo diventasse, questa funzione dovrà chiamare anche
 * `invalidaCartellaClinica`, e il catalogo è il posto da cui accorgersene.
 */
export function invalidaEsecuzioneBrain(): void {
  invalidaLavoro();

  revalidatePath("/control/approvazioni");
  revalidatePath("/control/brain");

  revalidatePath("/control/servizi");
  revalidatePath("/control/economia");

  revalidatePath("/control/conoscenza");
  // Percorso con segmento dinamico: qui il secondo argomento non è
  // facoltativo, e senza non invaliderebbe nulla.
  revalidatePath("/control/conoscenza/[slug]", "page");
}

/**
 * Sono cambiati i contatori del menu del paziente: messaggi non letti,
 * questionari da compilare, notifiche.
 *
 * Vivono nel layout, non in una pagina, e un `revalidatePath` su una
 * pagina non li tocca. L'unico modo di rinfrescarli è invalidare il
 * layout radice — costa la rilettura delle pagine già viste da questo
 * utente, e succede solo quando è lui stesso a leggere un messaggio o a
 * consegnare un questionario. È un prezzo onesto per un pallino che
 * dice il vero.
 */
export function invalidaContatoriPaziente(): void {
  revalidatePath("/", "layout");
}
