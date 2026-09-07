/**
 * Come si leggono gli eventi di dominio.
 *
 * `domain_events` conserva nomi da macchina — `lab.validated`,
 * `consultation.requested` — perché un evento deve restare confrontabile
 * e indicizzabile. Il feed del Command Center serve invece a una persona
 * che passa davanti a uno schermo, e «lab.validated» non si legge
 * passando.
 *
 * **Il modulo non importa niente**, ed è deliberato: la stessa frase
 * serve al server che compone la pagina e al componente che la
 * rinfresca, e un solo `import` da un modulo server qui dentro
 * trascinerebbe `next/headers` dentro il bundle del browser. È già
 * successo una volta in questo progetto, e il messaggio di errore
 * indicava un'altra cosa.
 */

/** Cosa è successo, al passato e senza soggetto: il soggetto è la riga. */
const EVENTI: Record<string, string> = {
  "appointment.booked": "Nuova prenotazione",
  "appointment.completed": "Visita conclusa",
  "appointment.rescheduled": "Appuntamento spostato",
  "assessment.completed": "Questionario completato",
  "brain.proposal_approved": "Proposta approvata",
  "brain.proposal_rejected": "Proposta respinta",
  "consent.granted": "Consenso registrato",
  "consent.revoked": "Consenso revocato",
  "consultation.requested": "Nuova richiesta di consulenza",
  "credit.used": "Crediti utilizzati",
  "document.reviewed": "Referto portato in cartella",
  "document.uploaded": "Nuovo documento caricato",
  "knowledge.published": "Contenuto pubblicato",
  "lab.requested": "Esame richiesto",
  "lab.validated": "Nuovo risultato di laboratorio",
  "lead.converted": "Lead convertito",
  "lead.created": "Nuovo contatto",
  "membership.cancelled": "Membership disdetta",
  "membership.started": "Nuova membership",
  "message.sent": "Messaggio inviato",
  "patient.created": "Nuovo paziente",
  "patient.erased": "Paziente cancellato",
  "prescription.created": "Nuova prescrizione",
  "score.updated": "Longevity Score aggiornato",
  "task.completed": "Attività conclusa",
  "task.created": "Nuova attività",
};

/**
 * Il ripiego non inventa: se il nome è ignoto si legge il nome.
 *
 * Un evento nuovo aggiunto in una migrazione e dimenticato qui deve
 * comparire lo stesso — illeggibile ma presente. Nasconderlo sarebbe
 * peggio: un feed che tace su ciò che non conosce insegna a fidarsi di
 * un elenco incompleto.
 */
export function descriviEvento(nome: string): string {
  return EVENTI[nome] ?? nome.replace(/[._]/g, " ");
}

/**
 * Quali eventi meritano il colore.
 *
 * Pochissimi, e per la stessa ragione per cui in `comunicazioni` solo
 * `urgent` e `critical` prendono il rosso: un feed in cui tutto risalta
 * è un feed in cui niente risalta.
 */
export function tonoEvento(nome: string): "neutro" | "clinico" | "grave" {
  if (nome === "patient.erased" || nome === "consent.revoked") return "grave";
  if (
    nome === "lab.validated" ||
    nome === "consultation.requested" ||
    nome === "prescription.created" ||
    nome === "document.reviewed"
  ) {
    return "clinico";
  }
  return "neutro";
}

/** `08:42` — l'ora e basta: il feed copre le ultime ore, la data è oggi. */
export function oraDi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

/**
 * Da quanto una cosa aspetta.
 *
 * Non l'ora in cui è arrivata: in una coda la domanda è «da quanto», e
 * «richiesto alle 08:12» costringe chi guarda a fare una sottrazione a
 * mente ogni volta.
 *
 * Le soglie salgono con l'attesa — minuti sotto l'ora, ore fino a due
 * giorni, poi giorni — perché «2880 min» è un numero che non si legge,
 * e a quel punto la precisione al minuto non decide più niente.
 */
export function attesaDa(iso: string, adesso: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";

  const minuti = Math.max(0, Math.round((adesso - t) / 60_000));
  if (minuti < 60) return `${minuti} min`;

  const ore = Math.round(minuti / 60);
  if (ore < 48) return `${ore} h`;

  return `${Math.round(ore / 24)} g`;
}
