/**
 * Stato del form di accesso.
 *
 * Vive fuori da `auth-actions.ts` perché un file marcato "use server" può
 * esportare soltanto funzioni async: un tipo e una costante lì dentro
 * fanno fallire la compilazione.
 */
export type StatoAccesso = {
  /**
   * `inviato` è il link di accesso, `reimpostazione` quello per rifare la
   * password. Sono due email diverse e vanno raccontate in modo diverso:
   * chi aspetta la seconda e riceve la prima pensa che il sistema abbia
   * capito male, e ha ragione.
   */
  esito: "iniziale" | "inviato" | "reimpostazione" | "errore";
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

/**
 * Stato del form con cui si sceglie una password.
 *
 * Separato da quello dell'accesso perché non ha niente a che vedere con
 * un'email spedita: o la password è stata cambiata — e allora si esce da
 * questa pagina — o c'è un motivo per cui non si può.
 */
export type StatoPassword = {
  esito: "iniziale" | "errore";
  messaggio?: string;
  codice?: string;
};

export const statoPasswordIniziale: StatoPassword = { esito: "iniziale" };

/**
 * Lunghezza minima della password.
 *
 * Dodici, non otto. Qui dentro ci sono referti e diagnosi: la password di
 * un professionista è la chiave della cartella clinica di qualcun altro,
 * e le regole di Supabase (sei caratteri, per impostazione predefinita)
 * sono pensate per un'applicazione qualunque.
 *
 * Il controllo va rifatto anche nel progetto Supabase — Authentication →
 * Policies: questo vale per chi passa dall'applicazione, quello vale per
 * tutti.
 */
export const PASSWORD_MINIMA = 12;
