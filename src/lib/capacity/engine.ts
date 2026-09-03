/**
 * Capacity management.
 *
 * Serve a rispondere a quattro domande che, senza numeri, si rispondono
 * a sensazione:
 *
 *   - quanti nuovi membri possiamo acquisire senza saturare la clinica?
 *   - quale professionista sta diventando il collo di bottiglia?
 *   - se arriviamo a mille membri, quante ore di nutrizione servono?
 *   - quando va inserito un secondo medico?
 *
 * Il modello di consumo non è un'ipotesi: si ricava da quanto i membri
 * attuali hanno davvero consumato. Se i dati non bastano, le funzioni lo
 * dicono invece di restituire un numero che sembra una previsione.
 */

export interface Room {
  id: string;
  name: string;
  isActive: boolean;
}

export interface OpeningHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  /** Null significa "tutta la clinica": vale per ogni ambulatorio attivo. */
  roomId: string | null;
}

export interface Schedule {
  professionalId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
}

export interface DeliveredVisit {
  professionalId: string | null;
  discipline: string;
  startsAt: string;
  endsAt: string;
}

/** "08:30" → 510 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

function durataMinuti(startsAt: string, endsAt: string): number {
  const d = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/* ── Capacità teorica ─────────────────────────────────────────────── */

/**
 * Minuti-ambulatorio disponibili in una settimana.
 *
 * Un orario senza `roomId` vale per tutti gli ambulatori attivi: è così
 * che si scrive "la clinica apre 8–19", senza ripeterlo per stanza.
 */
export function weeklyRoomMinutes(rooms: Room[], hours: OpeningHour[]): number {
  const attivi = rooms.filter((r) => r.isActive);
  if (attivi.length === 0) return 0;

  return hours.reduce((acc, h) => {
    const durata = Math.max(0, toMinutes(h.closesAt) - toMinutes(h.opensAt));
    const stanze = h.roomId === null ? attivi.length : attivi.some((r) => r.id === h.roomId) ? 1 : 0;
    return acc + durata * stanze;
  }, 0);
}

/** Minuti settimanali di presenza, per professionista. */
export function weeklyProfessionalMinutes(schedules: Schedule[]): Map<string, number> {
  const per = new Map<string, number>();

  for (const s of schedules) {
    const durata = Math.max(0, toMinutes(s.endsAt) - toMinutes(s.startsAt));
    per.set(s.professionalId, (per.get(s.professionalId) ?? 0) + durata);
  }

  return per;
}

/* ── Capacità utilizzata ──────────────────────────────────────────── */

export interface Utilizzo {
  professionalId: string;
  minutiErogati: number;
  minutiDisponibili: number;
  /** 0–1, ma può superare 1: significa che si lavora oltre l'orario. */
  saturazione: number;
}

export function occupancyByProfessional(
  visits: DeliveredVisit[],
  schedules: Schedule[],
  settimane: number,
): Utilizzo[] {
  const disponibili = weeklyProfessionalMinutes(schedules);
  const erogati = new Map<string, number>();

  for (const v of visits) {
    if (!v.professionalId) continue;
    erogati.set(
      v.professionalId,
      (erogati.get(v.professionalId) ?? 0) + durataMinuti(v.startsAt, v.endsAt),
    );
  }

  const chiavi = new Set([...disponibili.keys(), ...erogati.keys()]);

  return [...chiavi]
    .map((professionalId) => {
      const capacita = (disponibili.get(professionalId) ?? 0) * Math.max(1, settimane);
      const usati = erogati.get(professionalId) ?? 0;
      return {
        professionalId,
        minutiErogati: usati,
        minutiDisponibili: capacita,
        saturazione: capacita === 0 ? 0 : usati / capacita,
      };
    })
    .sort((a, b) => b.saturazione - a.saturazione);
}

/**
 * Il collo di bottiglia: chi è più vicino a saturare.
 *
 * Chi non ha orari configurati non può essere il collo di bottiglia —
 * di lui non sappiamo la capacità, e un'ignoranza non è una diagnosi.
 */
export function bottleneck(utilizzi: Utilizzo[]): Utilizzo | null {
  const misurabili = utilizzi.filter((u) => u.minutiDisponibili > 0);
  return misurabili.length > 0 ? misurabili[0] : null;
}

/* ── Modello di consumo ───────────────────────────────────────────── */

export interface ConsumoDisciplina {
  discipline: string;
  minutiPerMembroAnno: number;
}

/**
 * Quanto consuma un membro in un anno, per disciplina.
 *
 * Ricavato dal periodo osservato e annualizzato. Con pochi membri o un
 * periodo corto il numero è rumore: `membriAttivi` a zero restituisce un
 * elenco vuoto, e chi chiama deve saperlo gestire.
 */
export function consumptionModel(
  visits: DeliveredVisit[],
  membriAttivi: number,
  giorniOsservati: number,
): ConsumoDisciplina[] {
  if (membriAttivi <= 0 || giorniOsservati <= 0) return [];

  const per = new Map<string, number>();
  for (const v of visits) {
    per.set(v.discipline, (per.get(v.discipline) ?? 0) + durataMinuti(v.startsAt, v.endsAt));
  }

  const fattoreAnnuo = 365 / giorniOsservati;

  return [...per.entries()]
    .map(([discipline, minuti]) => ({
      discipline,
      minutiPerMembroAnno: (minuti / membriAttivi) * fattoreAnnuo,
    }))
    .sort((a, b) => b.minutiPerMembroAnno - a.minutiPerMembroAnno);
}

/** "Se arriviamo a mille membri, quante ore di nutrizione servono?" */
export function projectDemand(
  membri: number,
  modello: ConsumoDisciplina[],
): { discipline: string; oreAnno: number }[] {
  return modello.map((m) => ({
    discipline: m.discipline,
    oreAnno: (m.minutiPerMembroAnno * membri) / 60,
  }));
}

/* ── Quanto possiamo ancora crescere ──────────────────────────────── */

export interface Margine {
  /** Membri aggiuntivi sostenibili prima di saturare. */
  membriAggiuntivi: number;
  /** La disciplina che si satura per prima. */
  vincolo: string | null;
}

/**
 * "Quanti nuovi membri possiamo acquisire senza saturare la clinica?"
 *
 * Il limite lo pone la disciplina che si esaurisce per prima, non la
 * media: una clinica con nutrizione al 40% e medicina al 98% non ha
 * margine, ha un problema.
 */
export function growthHeadroom(
  membriAttuali: number,
  modello: ConsumoDisciplina[],
  capacitaAnnuaPerDisciplina: Map<string, number>,
): Margine {
  if (modello.length === 0) return { membriAggiuntivi: 0, vincolo: null };

  let minimo = Number.POSITIVE_INFINITY;
  let vincolo: string | null = null;

  for (const m of modello) {
    const capacita = capacitaAnnuaPerDisciplina.get(m.discipline);
    if (capacita === undefined || m.minutiPerMembroAnno <= 0) continue;

    const membriSostenibili = capacita / m.minutiPerMembroAnno;
    const margine = Math.floor(membriSostenibili - membriAttuali);

    if (margine < minimo) {
      minimo = margine;
      vincolo = m.discipline;
    }
  }

  if (vincolo === null) return { membriAggiuntivi: 0, vincolo: null };
  return { membriAggiuntivi: Math.max(0, minimo), vincolo };
}

/**
 * "Quando dobbiamo inserire un secondo medico dello sport?"
 *
 * Mesi che mancano alla saturazione di una disciplina, dato il ritmo di
 * crescita. Null quando non si satura mai al ritmo attuale — o quando la
 * crescita è ferma, che è un'altra informazione ancora.
 */
export function monthsToSaturation(
  membriAttuali: number,
  nuoviMembriAlMese: number,
  discipline: string,
  modello: ConsumoDisciplina[],
  capacitaAnnua: number,
): number | null {
  const consumo = modello.find((m) => m.discipline === discipline);
  if (!consumo || consumo.minutiPerMembroAnno <= 0) return null;

  const membriSostenibili = capacitaAnnua / consumo.minutiPerMembroAnno;

  // Già saturi: zero mesi, non "mai".
  if (membriAttuali >= membriSostenibili) return 0;
  if (nuoviMembriAlMese <= 0) return null;

  return Math.ceil((membriSostenibili - membriAttuali) / nuoviMembriAlMese);
}

/** Minuti settimanali → minuti annui, al netto di quattro settimane di chiusura. */
export function annualFromWeekly(minutiSettimana: number, settimaneLavorate = 48): number {
  return minutiSettimana * settimaneLavorate;
}
