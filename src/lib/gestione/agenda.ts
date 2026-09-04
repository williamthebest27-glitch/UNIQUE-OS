/**
 * Le regole dell'agenda.
 *
 * Un appuntamento nuovo può entrare in agenda se non si sovrappone a un
 * altro dello stesso professionista né a un altro nella stessa stanza.
 * Sembra ovvio, ed è la cosa che ogni gestionale prima o poi sbaglia —
 * di solito su una riprogrammazione, dove l'appuntamento da spostare si
 * sovrappone a se stesso.
 *
 * Il controllo sta qui e non solo nel database perché deve poter dire
 * *con chi* si sovrappone, in una frase che la reception legge al
 * telefono con il paziente in linea.
 */

export interface AppuntamentoInAgenda {
  id: string;
  professionalId: string | null;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  /** Per il messaggio: chi c'è già in quell'ora. */
  etichetta: string;
}

export interface Candidato {
  /** Null quando è nuovo; valorizzato quando si sposta, per non sovrapporsi a sé. */
  id: string | null;
  professionalId: string | null;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface Conflitto {
  tipo: "professionista" | "stanza";
  con: AppuntamentoInAgenda;
}

/** Gli stati che occupano davvero l'agenda. Una disdetta libera il posto. */
const OCCUPANO = new Set(["scheduled", "confirmed", "completed"]);

export function conflitti(
  candidato: Candidato,
  agenda: readonly AppuntamentoInAgenda[],
): Conflitto[] {
  const trovati: Conflitto[] = [];

  for (const altro of agenda) {
    if (altro.id === candidato.id) continue;
    if (!OCCUPANO.has(altro.status)) continue;

    const sovrapposti = candidato.startsAt < altro.endsAt && altro.startsAt < candidato.endsAt;
    if (!sovrapposti) continue;

    if (candidato.professionalId && altro.professionalId === candidato.professionalId) {
      trovati.push({ tipo: "professionista", con: altro });
    }
    if (candidato.roomId && altro.roomId === candidato.roomId) {
      trovati.push({ tipo: "stanza", con: altro });
    }
  }

  return trovati;
}

/** La frase per chi sta al banco. */
export function descriviConflitti(elenco: readonly Conflitto[]): string | null {
  if (elenco.length === 0) return null;

  const primo = elenco[0];
  const soggetto =
    primo.tipo === "professionista"
      ? "Il professionista è già impegnato"
      : "La stanza è già occupata";

  return `${soggetto} in quell'orario: ${primo.con.etichetta}.${
    elenco.length > 1 ? ` E ci sono altri ${elenco.length - 1} conflitti.` : ""
  }`;
}

/** Fine di un appuntamento, data la durata del servizio. */
export function fineDa(startsAt: string, durataMinuti: number): string {
  return new Date(Date.parse(startsAt) + durataMinuti * 60_000).toISOString();
}

/**
 * Un orario valido per un nuovo appuntamento?
 *
 * Nel passato no. A meno di dieci minuti no: chi prenota "adesso" al
 * banco vuole il prossimo slot utile, non un appuntamento già iniziato.
 */
export function orarioAmmesso(startsAt: string, adesso: string): string | null {
  const inizio = Date.parse(startsAt);
  if (!Number.isFinite(inizio)) return "L'orario non è leggibile.";
  if (inizio < Date.parse(adesso)) return "Non si fissa un appuntamento nel passato.";
  return null;
}
