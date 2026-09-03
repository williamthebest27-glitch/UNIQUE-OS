/**
 * Che cosa dire quando l'accesso non riesce.
 *
 * Prima ogni fallimento diventava «Non siamo riusciti a inviare il link»:
 * vero, ma inutile. Chi lo legge non sa se ha sbagliato indirizzo, se il
 * servizio email ha finito il credito orario, o se il progetto non è
 * configurato — e chi assiste non ha niente su cui lavorare.
 *
 * Un confine resta però invalicabile: **non si può mai far capire se un
 * indirizzo è registrato**. Dire "questa email non esiste" permetterebbe a
 * chiunque di scoprire chi è paziente di una clinica della longevità. Nel
 * dubbio si torna al messaggio generico.
 */

export interface EsitoErrore {
  messaggio: string;
  /** Breve, mostrato in fondo: dà a chi assiste un appiglio. */
  codice: string;
}

const GENERICO: EsitoErrore = {
  messaggio:
    "Non siamo riusciti a inviare il link. Controlla l’indirizzo, oppure scrivi alla segreteria.",
  codice: "invio",
};

/**
 * Traduce l'errore di Supabase in qualcosa di leggibile.
 *
 * @param codice  il campo `code` dell'errore, quando c'è
 * @param testo   il messaggio originale, in inglese
 */
export function messaggioPerErrore(codice?: string | null, testo?: string | null): EsitoErrore {
  const c = (codice ?? "").toLowerCase();
  const t = (testo ?? "").toLowerCase();

  // Troppe richieste. Il servizio incluso in Supabase ne consente due
  // all'ora: è il muro contro cui si sbatte per primi, provando.
  if (
    c.includes("rate_limit") ||
    t.includes("rate limit") ||
    t.includes("too many requests") ||
    t.includes("for security purposes")
  ) {
    return {
      messaggio:
        "Troppe richieste ravvicinate. Il servizio email di prova ne consente poche all’ora: " +
        "attendi qualche minuto e riprova.",
      codice: "limite-email",
    };
  }

  // Il progetto non riesce a spedire: SMTP assente, credenziali sbagliate,
  // dominio non verificato dal fornitore.
  if (t.includes("error sending") || t.includes("smtp") || c.includes("email_provider")) {
    return {
      messaggio:
        "Il servizio email non ha accettato il messaggio. È un problema di configurazione, " +
        "non tuo: segnalalo alla segreteria.",
      codice: "smtp",
    };
  }

  // L'indirizzo di ritorno non è fra quelli permessi dal progetto: il link
  // partirebbe verso un posto che Supabase rifiuta.
  //
  // Il controllo cerca "redirect" e nient'altro. Un più generoso
  // `not allowed` catturava anche "Signups not allowed for otp", che è la
  // risposta per un indirizzo non registrato: bastava quello a rendere
  // distinguibile chi è paziente e chi no.
  if (c.includes("redirect") || t.includes("redirect")) {
    return {
      messaggio:
        "L’indirizzo di ritorno non è fra quelli autorizzati. È un problema di configurazione, " +
        "non tuo: segnalalo alla segreteria.",
      codice: "ritorno",
    };
  }

  // Restano i casi che rivelerebbero se l'indirizzo è registrato
  // (`otp_disabled`, "signups not allowed"): messaggio generico, sempre.
  return GENERICO;
}

/** I motivi per cui un collegamento ricevuto via email può non funzionare. */
export const MOTIVI_LINK = {
  scaduto:
    "Il link è scaduto o è già stato usato. Richiedine uno nuovo: ne basta uno solo, l’ultimo ricevuto.",
  mancante:
    "Il collegamento è arrivato incompleto. Succede quando viene aperto da un’anteprima o riscritto da un filtro antispam: prova a incollarlo nella barra degli indirizzi.",
  link: "Il link non è più valido. Richiedine uno nuovo.",
} as const;

export type MotivoLink = keyof typeof MOTIVI_LINK;

export function motivoLink(valore?: string | null): string {
  const k = (valore ?? "") as MotivoLink;
  return MOTIVI_LINK[k] ?? MOTIVI_LINK.link;
}
