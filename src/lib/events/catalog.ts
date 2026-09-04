/**
 * Il vocabolario degli eventi di Unique OS.
 *
 * Un evento è un fatto già avvenuto, scritto al passato e senza sapere
 * chi lo userà: `appointment.completed` non presume che qualcuno debba
 * mandare un messaggio, e proprio per questo può farlo chiunque.
 *
 * Questo file non importa nulla di proposito — così i nomi degli eventi
 * sono leggibili dal database (che li scrive), dai webhook (che li
 * spediscono), dal Brain (che li legge) e dai test, senza che nessuno dei
 * quattro debba conoscere gli altri tre.
 */

export type EventSeverity = "critical" | "important" | "info";

export interface EventDescriptor {
  /** Su cosa è successo: paziente, appuntamento, pagamento… */
  entity: string;
  /** Come si legge in italiano, in una riga di elenco. */
  label: string;
  /**
   * Quanto merita di interrompere qualcuno.
   *
   * `critical` chiede un intervento oggi, `important` va visto in
   * giornata, `info` finisce nel digest. È il default: le regole di
   * notifica possono alzarlo o abbassarlo guardando il contenuto.
   */
  severity: EventSeverity;
}

export const EVENT_CATALOG = {
  "patient.created":          { entity: "patient",     label: "Nuovo paziente preso in carico",      severity: "info" },
  "patient.updated":          { entity: "patient",     label: "Anagrafica paziente aggiornata",      severity: "info" },

  "appointment.booked":       { entity: "appointment", label: "Visita prenotata",                    severity: "info" },
  "appointment.rescheduled":  { entity: "appointment", label: "Visita spostata",                     severity: "info" },
  "appointment.completed":    { entity: "appointment", label: "Visita svolta",                       severity: "info" },
  "appointment.cancelled":    { entity: "appointment", label: "Visita disdetta",                     severity: "important" },
  "appointment.no_show":      { entity: "appointment", label: "Paziente non presentato",             severity: "important" },
  "appointment.updated":      { entity: "appointment", label: "Appuntamento aggiornato",             severity: "info" },

  "document.uploaded":        { entity: "document",    label: "Documento caricato",                  severity: "important" },
  "score.updated":            { entity: "score",       label: "Longevity Score aggiornato",          severity: "info" },
  "measurement.flagged":      { entity: "measurement", label: "Valore fuori soglia da rivedere",     severity: "critical" },

  "membership.started":       { entity: "membership",  label: "Membership attivata",                 severity: "info" },
  "membership.activated":     { entity: "membership",  label: "Membership tornata attiva",           severity: "info" },
  "membership.past_due":      { entity: "membership",  label: "Membership in sofferenza",            severity: "important" },
  "membership.cancelled":     { entity: "membership",  label: "Membership disdetta",                 severity: "important" },
  "membership.expired":       { entity: "membership",  label: "Membership scaduta",                  severity: "important" },
  "membership.updated":       { entity: "membership",  label: "Membership aggiornata",               severity: "info" },

  "credit.used":              { entity: "credit",      label: "Credito utilizzato",                  severity: "info" },

  "payment.succeeded":        { entity: "payment",     label: "Incasso andato a buon fine",          severity: "info" },
  "payment.failed":           { entity: "payment",     label: "Pagamento fallito",                   severity: "critical" },
  "payment.refunded":         { entity: "payment",     label: "Pagamento rimborsato",                severity: "important" },

  "lead.created":             { entity: "lead",        label: "Nuovo lead",                          severity: "info" },
  "lead.stage_changed":       { entity: "lead",        label: "Lead avanzato di stato",              severity: "info" },
  "lead.converted":           { entity: "lead",        label: "Lead diventato paziente",             severity: "info" },
  "lead.lost":                { entity: "lead",        label: "Lead perso",                          severity: "info" },

  "knowledge.published":      { entity: "knowledge",   label: "Nuova versione in knowledge base",    severity: "important" },
  "knowledge.archived":       { entity: "knowledge",   label: "Informazione archiviata",             severity: "info" },

  "brain.proposal_created":   { entity: "proposal",    label: "Il Brain propone un'azione",          severity: "important" },
  "brain.proposal_approved":  { entity: "proposal",    label: "Azione autorizzata",                  severity: "info" },
  "brain.proposal_rejected":  { entity: "proposal",    label: "Azione rifiutata",                    severity: "info" },
  "brain.action_executed":    { entity: "proposal",    label: "Azione eseguita dal Brain",           severity: "important" },
  "brain.action_failed":      { entity: "proposal",    label: "Azione del Brain fallita",            severity: "critical" },

  "task.created":             { entity: "task",        label: "Nuovo task",                          severity: "info" },
  "task.completed":           { entity: "task",        label: "Task completato",                     severity: "info" },

  "campaign.synced":          { entity: "campaign",    label: "Dati campagna aggiornati",            severity: "info" },
} as const satisfies Record<string, EventDescriptor>;

export type EventName = keyof typeof EVENT_CATALOG;

export const EVENT_NAMES = Object.keys(EVENT_CATALOG) as EventName[];

export function describeEvent(name: string): EventDescriptor {
  // Un evento sconosciuto non è un errore: il database può emetterne di
  // nuovi prima che questo file li conosca, e un feed che si rompe per un
  // nome nuovo è peggio di un'etichetta generica.
  return (
    (EVENT_CATALOG as Record<string, EventDescriptor>)[name] ?? {
      entity: name.split(".")[0] ?? "evento",
      label: name,
      severity: "info",
    }
  );
}

/**
 * Un endpoint riceve un evento?
 *
 * Tre forme, in ordine di specificità: `*` prende tutto, `payment.*`
 * prende una famiglia, `payment.failed` prende quello e basta. Le stesse
 * tre che riconosce il trigger `fanout_event` nel database — se cambiano
 * qui, vanno cambiate lì.
 */
export function matchesSubscription(patterns: readonly string[], event: string): boolean {
  const family = `${event.split(".")[0]}.*`;
  return patterns.some((p) => p === "*" || p === event || p === family);
}
