import { REASSESSMENT_DAYS, type JourneyStage } from "../journey/stages.ts";

/**
 * Il prossimo passo del paziente.
 *
 * Esiste già un motore di Next Best Action — `src/lib/nba/rules.ts` — ma
 * parla alla clinica: *«Contattare il paziente»*, *«Proporre la
 * membership»*. Sono azioni che qualcun altro deve compiere su di lui.
 *
 * Questo motore parla **al paziente**, e ha una regola che l'altro non
 * ha: ne esce **un passo solo**. Dieci inviti all'azione su una
 * schermata non sono dieci opportunità, sono nessuna — chi legge sceglie
 * il più facile, o non sceglie. Il resto sta sotto, come elenco quieto.
 *
 * Nessuna regola qui interpreta un valore clinico. La più clinica di
 * tutte si limita a dire che un referto è arrivato e che il medico lo sta
 * guardando: chi legge un numero e ne trae una conseguenza è un medico,
 * non una funzione.
 */

export type PassoAzione =
  | { tipo: "vai"; href: string; etichetta: string }
  | { tipo: "nessuna" };

export interface Passo {
  id: string;
  /** Il titolo, rivolto al paziente. Breve: è un titolo, non una frase. */
  titolo: string;
  /** Perché glielo stiamo dicendo. Una riga, in italiano, verificabile. */
  motivo: string;
  azione: PassoAzione;
  /** 1 = adesso, 2 = questa settimana, 3 = quando capita. */
  urgenza: 1 | 2 | 3;
}

export interface StatoPaziente {
  oggi: string;
  fase: JourneyStage;

  /** Giorni dall'ultimo Longevity Score. Null se non ne ha mai avuto uno. */
  giorniDaScore: number | null;
  /** Pilastri che il motore non riesce a calcolare per dati mancanti. */
  pilastriIncompleti: string[];

  /** Visita più vicina, se ce n'è una. */
  prossimaVisitaIso: string | null;
  /** Visite in programma, in tutto. */
  visiteInProgramma: number;

  questionariDaFare: { id: string; titolo: string; scadeIl: string | null }[];
  documentiNonLetti: number;
  messaggiNonLetti: number;

  azioniDelPiano: { id: string; titolo: string; scadeIl: string | null }[];

  creditiDisponibili: number;
  /** Giorni alla scadenza della membership. Negativo se già scaduta. */
  giorniAllaScadenzaMembership: number | null;
  pagamentiFalliti: number;
  consensiMancanti: string[];
}

function giorniDa(iso: string | null, oggi: string): number | null {
  if (!iso) return null;
  const x = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${oggi.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((x - y) / 86_400_000);
}

/**
 * Le regole, dalla più urgente alla meno.
 *
 * L'ordine dell'array **è** la priorità: la prima che si attiva vince il
 * posto in cima alla home. Scriverlo così — invece di assegnare punteggi
 * e ordinare — rende la gerarchia leggibile da chiunque apra il file,
 * compreso chi dovrà cambiarla fra sei mesi.
 */
type Regola = (s: StatoPaziente) => Passo | null;

const REGOLE: Regola[] = [
  // ── Adesso ──────────────────────────────────────────────────────
  (s) =>
    s.pagamentiFalliti > 0
      ? {
          id: "pagamento-fallito",
          titolo: "Aggiorna il metodo di pagamento",
          motivo:
            s.pagamentiFalliti === 1
              ? "Un pagamento non è andato a buon fine."
              : `${s.pagamentiFalliti} pagamenti non sono andati a buon fine.`,
          azione: { tipo: "vai", href: "/crediti", etichetta: "Vai alla membership" },
          urgenza: 1,
        }
      : null,

  (s) => {
    if (s.consensiMancanti.length === 0) return null;
    return {
      id: "consensi",
      titolo: "Completa i consensi",
      motivo: `Mancano: ${s.consensiMancanti.join(", ")}.`,
      azione: { tipo: "vai", href: "/profilo", etichetta: "Apri il profilo" },
      urgenza: 1,
    };
  },

  (s) => {
    const giorni = giorniDa(s.prossimaVisitaIso, s.oggi);
    if (giorni === null || giorni < 0 || giorni > 2) return null;
    return {
      id: "visita-imminente",
      titolo: giorni === 0 ? "Oggi hai una visita" : giorni === 1 ? "Domani hai una visita" : "Fra due giorni hai una visita",
      motivo: "Trovi orario, luogo e professionista negli appuntamenti.",
      azione: { tipo: "vai", href: "/appuntamenti", etichetta: "Vedi i dettagli" },
      urgenza: 1,
    };
  },

  (s) =>
    s.documentiNonLetti > 0
      ? {
          id: "referti-nuovi",
          titolo:
            s.documentiNonLetti === 1
              ? "C'è un nuovo referto per te"
              : `Ci sono ${s.documentiNonLetti} nuovi referti per te`,
          motivo: "I valori vengono letti e validati dal tuo medico prima di entrare nel punteggio.",
          azione: { tipo: "vai", href: "/risultati", etichetta: "Vedi i risultati" },
          urgenza: 1,
        }
      : null,

  (s) =>
    s.messaggiNonLetti > 0
      ? {
          id: "messaggi",
          titolo:
            s.messaggiNonLetti === 1
              ? "Hai un messaggio da leggere"
              : `Hai ${s.messaggiNonLetti} messaggi da leggere`,
          motivo: "Dalla clinica, nella tua area riservata.",
          azione: { tipo: "vai", href: "/messaggi", etichetta: "Apri i messaggi" },
          urgenza: 1,
        }
      : null,

  // ── Questa settimana ────────────────────────────────────────────
  (s) => {
    const scaduti = s.questionariDaFare.filter((q) => {
      const g = giorniDa(q.scadeIl, s.oggi);
      return g !== null && g <= 3;
    });
    const primo = scaduti[0] ?? s.questionariDaFare[0];
    if (!primo) return null;

    const g = giorniDa(primo.scadeIl, s.oggi);
    return {
      id: `questionario-${primo.id}`,
      titolo: `Completa «${primo.titolo}»`,
      motivo:
        g === null
          ? "Ci sono cose che nessun esame misura: le sai solo tu."
          : g < 0
            ? `Era atteso ${Math.abs(g)} giorni fa.`
            : g === 0
              ? "Scade oggi."
              : `Restano ${g} giorni.`,
      azione: { tipo: "vai", href: `/questionari/${primo.id}`, etichetta: "Inizia" },
      urgenza: scaduti.length > 0 ? 1 : 2,
    };
  },

  (s) => {
    if (s.giorniDaScore === null) {
      return {
        id: "primo-score",
        titolo: "Prenota il primo Longevity Score",
        motivo: "È il pannello da cui nasce tutto il resto del percorso.",
        azione: { tipo: "vai", href: "/appuntamenti", etichetta: "Vedi le disponibilità" },
        urgenza: 2,
      };
    }
    if (s.giorniDaScore < REASSESSMENT_DAYS - 30) return null;
    return {
      id: "ripeti-score",
      titolo: "È ora di rifare il Longevity Score",
      motivo: `L'ultimo è di ${s.giorniDaScore} giorni fa.`,
      azione: { tipo: "vai", href: "/appuntamenti", etichetta: "Vedi le disponibilità" },
      urgenza: s.giorniDaScore > REASSESSMENT_DAYS ? 1 : 2,
    };
  },

  (s) => {
    const scadenza = s.giorniAllaScadenzaMembership;
    if (scadenza === null || scadenza > 30) return null;
    return {
      id: "membership-in-scadenza",
      titolo: scadenza < 0 ? "La tua membership è scaduta" : "La membership sta per scadere",
      motivo:
        scadenza < 0
          ? `Scaduta da ${Math.abs(scadenza)} giorni.`
          : scadenza === 0
            ? "Scade oggi."
            : `Scade fra ${scadenza} giorni.`,
      azione: { tipo: "vai", href: "/crediti", etichetta: "Vedi il piano" },
      urgenza: scadenza <= 7 ? 1 : 2,
    };
  },

  (s) => {
    const inScadenza = s.azioniDelPiano.filter((a) => {
      const g = giorniDa(a.scadeIl, s.oggi);
      return g !== null && g <= 7;
    });
    const prima = inScadenza[0];
    if (!prima) return null;
    const g = giorniDa(prima.scadeIl, s.oggi) ?? 0;
    return {
      id: `piano-${prima.id}`,
      titolo: prima.titolo,
      motivo: g < 0 ? `Era in programma ${Math.abs(g)} giorni fa.` : g === 0 ? "In programma per oggi." : `In programma fra ${g} giorni.`,
      azione: { tipo: "vai", href: "/piano", etichetta: "Apri il piano" },
      urgenza: 2,
    };
  },

  // ── Quando capita ───────────────────────────────────────────────
  (s) =>
    s.visiteInProgramma === 0 && s.creditiDisponibili > 0
      ? {
          id: "crediti-da-usare",
          titolo: "Hai crediti da usare",
          motivo: `${s.creditiDisponibili.toLocaleString("it-IT", { maximumFractionDigits: 1 })} disponibili e nessuna visita in programma.`,
          azione: { tipo: "vai", href: "/appuntamenti", etichetta: "Prenota una visita" },
          urgenza: 3,
        }
      : null,

  (s) =>
    s.pilastriIncompleti.length > 0
      ? {
          id: "pilastri-incompleti",
          titolo: "Il tuo punteggio è ancora parziale",
          motivo: `Servono più dati per: ${s.pilastriIncompleti.join(", ")}.`,
          azione: { tipo: "vai", href: "/score", etichetta: "Vedi cosa manca" },
          urgenza: 3,
        }
      : null,

  (s) =>
    s.azioniDelPiano.length > 0
      ? {
          id: "piano-aperto",
          titolo: "Continua il tuo piano",
          motivo: `${s.azioniDelPiano.length} ${s.azioniDelPiano.length === 1 ? "attività aperta" : "attività aperte"}.`,
          azione: { tipo: "vai", href: "/piano", etichetta: "Apri il piano" },
          urgenza: 3,
        }
      : null,
];

/**
 * Il passo principale e quelli che vengono dopo.
 *
 * `principale` è null solo quando davvero non c'è niente da fare: è uno
 * stato legittimo, e va detto invece di riempirlo con un invito
 * inventato.
 */
export interface ProssimiPassi {
  principale: Passo | null;
  altri: Passo[];
}

export function prossimiPassi(stato: StatoPaziente, quantiAltri = 3): ProssimiPassi {
  const trovati: Passo[] = [];
  for (const regola of REGOLE) {
    const passo = regola(stato);
    if (passo) trovati.push(passo);
  }

  return {
    principale: trovati[0] ?? null,
    altri: trovati.slice(1, 1 + quantiAltri),
  };
}
