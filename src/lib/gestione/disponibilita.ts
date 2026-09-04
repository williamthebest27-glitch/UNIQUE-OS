/**
 * Generare le disponibilità dai turni.
 *
 * Un professionista ha un turno settimanale — "martedì dalle 9 alle 13" —
 * e un servizio ha una durata. Le disponibilità sono l'intersezione:
 * ogni martedì fra le due date, dalle 9 alle 13, a fette della durata del
 * servizio, saltando le fette già occupate.
 *
 * Il punto delicato è il fuso. I turni sono scritti in ora di Roma ("le
 * 9"), il database vuole istanti assoluti, e fra marzo e ottobre le due
 * cose distano un'ora in più. Un generatore che ignora l'ora legale
 * produce turni sbagliati esattamente sei mesi l'anno — e sono i sei mesi
 * in cui nessuno guarda il codice.
 *
 * Nessun import: si testa con date d'inverno e d'estate, senza database.
 */

export interface Turno {
  /** 0 = domenica, 6 = sabato, come in Postgres. */
  weekday: number;
  /** "09:00". */
  startsAt: string;
  /** "13:00". */
  endsAt: string;
  validFrom: string;
  validTo: string | null;
}

export interface Intervallo {
  startsAt: string;
  endsAt: string;
}

export interface SlotGenerato {
  startsAt: string;
  endsAt: string;
}

const FUSO = "Europe/Rome";

/**
 * Lo scarto di Roma rispetto a UTC in un dato istante, in minuti.
 *
 * Si ricava facendo formattare a Intl lo stesso istante nel fuso di Roma
 * e leggendo la differenza: è l'unico modo, senza librerie, di sapere se
 * quel giorno era ora legale.
 */
function scartoRomaMinuti(istante: Date): number {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(istante);

  const n = (tipo: string) => Number(parti.find((p) => p.type === tipo)?.value ?? "0");
  const comeUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((comeUtc - istante.getTime()) / 60_000);
}

/**
 * Un giorno e un'ora di Roma, come istante ISO.
 *
 * Prima si prova l'ipotesi "UTC", si legge lo scarto reale di quel
 * giorno e si corregge. Basta un passaggio: lo scarto cambia solo alle
 * due di notte nei giorni di passaggio, e i turni non stanno lì.
 */
export function romaComeIso(giorno: string, ora: string): string {
  const [anno, mese, dd] = giorno.split("-").map(Number);
  const [hh, mm] = ora.split(":").map(Number);
  const ipotesi = new Date(Date.UTC(anno, mese - 1, dd, hh, mm, 0));
  const scarto = scartoRomaMinuti(ipotesi);
  return new Date(ipotesi.getTime() - scarto * 60_000).toISOString();
}

/** I giorni da `da` ad `a` inclusi, in formato YYYY-MM-DD. */
export function giorniFra(da: string, a: string): string[] {
  const giorni: string[] = [];
  const corrente = new Date(`${da}T00:00:00Z`);
  const fine = new Date(`${a}T00:00:00Z`);
  while (corrente <= fine) {
    giorni.push(corrente.toISOString().slice(0, 10));
    corrente.setUTCDate(corrente.getUTCDate() + 1);
  }
  return giorni;
}

function siSovrappongono(a: Intervallo, b: Intervallo): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Le disponibilità di un professionista per un servizio, in un intervallo.
 *
 * Gli slot esistenti — prenotati o no — non si duplicano: rieseguire la
 * generazione deve essere sicuro, o nessuno la eseguirà due volte. E non
 * si genera nel passato: una disponibilità di ieri non è una
 * disponibilità.
 */
export function generaSlot(input: {
  turni: readonly Turno[];
  durataMinuti: number;
  da: string;
  a: string;
  esistenti: readonly Intervallo[];
  adesso?: string;
}): SlotGenerato[] {
  if (input.durataMinuti <= 0) return [];

  const adesso = input.adesso ?? new Date().toISOString();
  const slot: SlotGenerato[] = [];
  const occupati: Intervallo[] = [...input.esistenti];

  for (const giorno of giorniFra(input.da, input.a)) {
    const weekday = new Date(`${giorno}T12:00:00Z`).getUTCDay();

    for (const turno of input.turni) {
      if (turno.weekday !== weekday) continue;
      if (turno.validFrom > giorno) continue;
      if (turno.validTo !== null && turno.validTo < giorno) continue;

      const inizioTurno = Date.parse(romaComeIso(giorno, turno.startsAt));
      const fineTurno = Date.parse(romaComeIso(giorno, turno.endsAt));
      const passo = input.durataMinuti * 60_000;

      for (let t = inizioTurno; t + passo <= fineTurno; t += passo) {
        const candidato = {
          startsAt: new Date(t).toISOString(),
          endsAt: new Date(t + passo).toISOString(),
        };

        if (candidato.startsAt <= adesso) continue;
        if (occupati.some((o) => siSovrappongono(o, candidato))) continue;

        slot.push(candidato);
        occupati.push(candidato);
      }
    }
  }

  return slot.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}
