/**
 * Lo stato di revisione di un referto, in italiano.
 *
 * Sta fuori dalle azioni perché un file `"use server"` esporta soltanto
 * funzioni async, e queste sono etichette e regole pure — che è anche il
 * posto giusto per discuterle.
 *
 * La distinzione che il resto dell'applicazione deve avere sempre chiara:
 * **analizzato e revisionato sono due cose diverse.** «Analizzato» dice
 * che il motore ha letto il PDF e ne ha proposto dei valori; è un fatto
 * tecnico, e un referto scansionato male risulta analizzato senza che
 * nessuno abbia capito cosa c'è scritto. «Revisionato» dice che una
 * persona l'ha guardato. Solo la seconda è un'informazione clinica.
 */

export const STATI_REVISIONE = ["pending", "reviewed", "approved"] as const;

export type StatoRevisione = (typeof STATI_REVISIONE)[number];

export const ETICHETTE_REVISIONE: Record<StatoRevisione, string> = {
  pending: "Da revisionare",
  reviewed: "Revisionato",
  approved: "Approvato",
};

/** Cosa significa ciascuno stato, per chi lo legge la prima volta. */
export const SPIEGAZIONI_REVISIONE: Record<StatoRevisione, string> = {
  pending: "Nessuno l'ha ancora aperto.",
  reviewed: "Un professionista l'ha letto.",
  approved: "Ha valore clinico. L'ha stabilito un medico.",
};

/**
 * Approvare richiede un medico.
 *
 * La stessa regola sta nel database, in `review_document`, e questa è la
 * sua copia per l'interfaccia. Non è una duplicazione da eliminare: se
 * l'interfaccia non la conoscesse mostrerebbe a un nutrizionista un
 * pulsante che Postgres poi rifiuta, e una promessa negata dal server è
 * peggio di un pulsante assente.
 *
 * Se le due copie divergessero, quella che decide resta il database.
 */
export function puoApprovare(disciplina: string | null, ruolo: string): boolean {
  if (ruolo === "admin" || ruolo === "owner") return true;
  return disciplina === "physician";
}

export function toStatoRevisione(valore: string | null | undefined): StatoRevisione {
  return (STATI_REVISIONE as readonly string[]).includes(valore ?? "")
    ? (valore as StatoRevisione)
    : "pending";
}

/**
 * Il tono con cui si disegna lo stato.
 *
 * «Da revisionare» è ambra e non rossa: è lavoro da fare, non un
 * allarme. Il rosso è il marchio, e su venti righe di coda direbbe
 * soltanto che ci sono venti referti.
 */
export function tonoRevisione(stato: StatoRevisione): "attention" | "neutral" | "positive" {
  if (stato === "pending") return "attention";
  if (stato === "reviewed") return "neutral";
  return "positive";
}
