/**
 * Il centro di attenzione clinica.
 *
 * La domanda è una sola — «cosa richiede me, adesso?» — e la risposta
 * sbagliata è un elenco lungo. Un centro di attenzione che segnala
 * quaranta cose non ne segnala nessuna: chi lo apre la prima settimana
 * legge, la seconda scorre, la terza lo ignora. Da quel momento in poi
 * il segnale importante è già perso, e nessuno se ne accorgerà.
 *
 * Per questo qui ci sono più righe dedicate a **togliere** segnali che
 * a produrne:
 *
 *   Un fatto, un segnale. Un referto con dentro nove valori estratti
 *   non fa dieci righe: fa una riga che dice nove. Il lavoro è aprire
 *   quel referto, e il lavoro è uno.
 *
 *   Un segnale forte ne assorbe uno debole. Se un paziente ha un valore
 *   fuori soglia in attesa di un medico, «ha dei risultati nuovi» non
 *   aggiunge niente: è lo stesso referto, detto peggio.
 *
 *   Chi non ha un'azione non compare. Una riga che si può solo leggere
 *   è una notifica, e le notifiche stanno altrove.
 *
 * Funzioni pure, come le regole del Next Best Action e del journey: si
 * discute una soglia guardando il codice, non ricostruendola da una
 * query. Nulla qui dentro decide chi può vedere cosa — quello è già
 * successo, nella Row Level Security, prima che questi fatti esistano.
 */

import { REASSESSMENT_DAYS } from "../journey/stages.ts";
import { PROGRAM_STALL_DAYS, SCORE_REFRESH_DAYS } from "../nba/rules.ts";

/* ── Categorie ────────────────────────────────────────────────────── */

export const CATEGORIE_ATTENZIONE = [
  "criticita",
  "visita",
  "documento",
  "risultato",
  "anomalia",
  "reassessment",
  "follow_up",
  "task",
  "messaggio",
  "attenzione",
] as const;

export type CategoriaAttenzione = (typeof CATEGORIE_ATTENZIONE)[number];

export const ETICHETTE_CATEGORIA: Record<CategoriaAttenzione, string> = {
  criticita: "Criticità",
  visita: "Visite",
  documento: "Documenti da revisionare",
  risultato: "Risultati nuovi",
  anomalia: "Anomalie",
  reassessment: "Reassessment",
  follow_up: "Follow-up",
  task: "Task",
  messaggio: "Messaggi",
  attenzione: "Attenzione",
};

/**
 * Cosa significa ciascuna categoria, in una riga.
 *
 * Sta accanto al titolo nella schermata: senza, «anomalia» e
 * «criticità» sembrano sinonimi, e la differenza fra le due è chi deve
 * agire e quando.
 */
export const SPIEGAZIONI_CATEGORIA: Record<CategoriaAttenzione, string> = {
  criticita: "Un valore fuori soglia clinica che aspetta la decisione di un medico.",
  visita: "Visite svolte senza esito registrato, e visite di oggi da preparare.",
  documento: "Referti arrivati che nessuno ha ancora aperto.",
  risultato: "Valori letti da un referto, in attesa di conferma.",
  anomalia: "Valori già in cartella che stanno fuori dall'intervallo di riferimento.",
  reassessment: "Pazienti il cui Longevity Score non è più recente.",
  follow_up: "Percorsi fermi e richiami dovuti.",
  task: "Il lavoro assegnato, in scadenza o scaduto.",
  messaggio: "Messaggi dei pazienti senza risposta.",
  attenzione: "Dati mancanti che tengono parziale il quadro clinico.",
};

/** 1 alta, 2 media, 3 bassa. Come i task e le azioni consigliate. */
export type PrioritaAttenzione = 1 | 2 | 3;

/**
 * Da dove nasce un segnale.
 *
 * Non è decorazione: chi legge deve poter risalire al fatto senza
 * fidarsi della frase. `regola` significa che nessuno l'ha scritto —
 * lo ha dedotto una soglia, e la soglia è in questo file.
 */
export type OrigineAttenzione =
  | "referto"
  | "misura"
  | "agenda"
  | "punteggio"
  | "percorso"
  | "task"
  | "messaggio"
  | "regola";

/**
 * Da dove viene, detto a chi legge.
 *
 * «Regola» è l'etichetta più importante dell'elenco: dice che nessuno
 * ha scritto quella riga a mano, e che quindi va verificata guardando i
 * fatti citati sotto — non creduta perché è comparsa.
 */
export const ETICHETTE_ORIGINE: Record<OrigineAttenzione, string> = {
  referto: "Da un referto",
  misura: "Da una misura",
  agenda: "Dall'agenda",
  punteggio: "Dal Longevity Score",
  percorso: "Dal percorso",
  task: "Da un task",
  messaggio: "Da un messaggio",
  regola: "Da una regola",
};

export interface AzioneAttenzione {
  label: string;
  href: string;
}

export interface SegnaleAttenzione {
  /** Stabile fra due caricamenti: è la chiave con cui si deduplica. */
  id: string;
  categoria: CategoriaAttenzione;
  priorita: PrioritaAttenzione;
  titolo: string;
  /** I fatti che lo hanno acceso. Mai un aggettivo, sempre un dato. */
  motivo: string[];
  patientId: string | null;
  patientName: string | null;
  /** Quando è avvenuto il fatto, non quando è comparsa la riga. */
  quando: string | null;
  origine: OrigineAttenzione;
  /** Dove si va per farci qualcosa. Senza, il segnale non compare. */
  azione: AzioneAttenzione | null;
  /** Il profilo a cui il lavoro è assegnato, se qualcuno lo ha preso. */
  assegnatarioId: string | null;
  assegnatario: string | null;
  /** Vero quando servono i poteri di un medico per chiuderlo. */
  richiedeMedico: boolean;
}

/* ── I fatti in ingresso ──────────────────────────────────────────── */

export interface PropostaFatto {
  id: string;
  patientId: string;
  patientName: string;
  /** Il documento da cui la lettura è arrivata: serve a raggrupparle. */
  documentId: string | null;
  documentTitle: string | null;
  label: string;
  createdAt: string;
  /** Vero se fra i motivi di revisione c'è una soglia clinica. */
  fuoriSoglia: boolean;
}

export interface DocumentoFatto {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  createdAt: string;
  /** `pending` | `reviewed` | `approved`. */
  reviewState: string;
  /** Quanti valori quel referto ha prodotto e attendono conferma. */
  proposteInAttesa: number;
}

export interface AnomaliaFatto {
  patientId: string;
  patientName: string;
  metrica: string;
  valore: string;
  misurataIl: string;
}

export interface VisitaFatto {
  id: string;
  patientId: string;
  patientName: string;
  servizio: string;
  iniziaAlle: string;
  /** `scheduled` | `confirmed`: una completata non è più un lavoro. */
  stato: string;
  /** Vero se è oggi, secondo il calendario della clinica. */
  oggi: boolean;
  /** Vero se l'ora di inizio è già passata. */
  passata: boolean;
  /** Vero se la cartella ha già una sintesi pre-visita. */
  preparata: boolean;
}

export interface PazienteFatto {
  patientId: string;
  patientName: string;
  /** Giorni dall'ultimo punteggio. Null se non ne ha mai avuto uno. */
  giorniDaPunteggio: number | null;
  /** Giorni dall'ultimo movimento sul percorso, se ce n'è uno attivo. */
  giorniPercorsoFermo: number | null;
  /** Pilastri che non si possono calcolare per dati mancanti. */
  pilastriMancanti: string[];
  membershipAttiva: boolean;
}

export interface TaskFatto {
  id: string;
  titolo: string;
  patientId: string | null;
  patientName: string | null;
  scadenzaIl: string | null;
  priorita: number;
  origine: string;
  assegnatarioId: string | null;
  assegnatario: string | null;
  creatoIl: string;
}

export interface MessaggioFatto {
  threadId: string;
  patientId: string;
  patientName: string;
  oggetto: string;
  ultimoIl: string;
  nonLetti: number;
  /** `clinical` | `administrative`: gli amministrativi non sono nostri. */
  categoria: string;
}

export interface FattiAttenzione {
  /** Oggi a Roma, `YYYY-MM-DD`. */
  oggi: string;
  proposte: PropostaFatto[];
  documenti: DocumentoFatto[];
  anomalie: AnomaliaFatto[];
  visite: VisitaFatto[];
  pazienti: PazienteFatto[];
  task: TaskFatto[];
  messaggi: MessaggioFatto[];
}

/* ── Soglie ───────────────────────────────────────────────────────── */

/** Oltre questi giorni, un referto non ancora aperto diventa urgente. */
export const GIORNI_REFERTO_FERMO = 3;

/** Oltre questi giorni, un messaggio senza risposta diventa urgente. */
export const GIORNI_MESSAGGIO_FERMO = 2;

/**
 * Oltre questi giorni, un'anomalia non è più una novità.
 *
 * Un valore fuori range di due anni fa è storia clinica, non una
 * segnalazione: chi doveva vederlo l'ha visto. Tenerlo acceso per
 * sempre riempirebbe il centro di attenzione di cose già affrontate,
 * che è il modo più rapido per farlo smettere di funzionare.
 */
export const GIORNI_ANOMALIA_RECENTE = 90;

/* ── Utilità ──────────────────────────────────────────────────────── */

function giorniTra(da: string, a: string): number {
  const x = Date.parse(`${da.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  return Math.round((y - x) / 86_400_000);
}

function plurale(n: number, uno: string, molti: string): string {
  return `${n} ${n === 1 ? uno : molti}`;
}

function cartella(patientId: string, sezione = ""): string {
  return `/pro/pazienti/${patientId}${sezione}`;
}

/* ── Le regole ────────────────────────────────────────────────────── */

/**
 * Criticità: un valore fuori soglia clinica che aspetta un medico.
 *
 * È l'unica categoria che dichiara `richiedeMedico`, e non è un
 * dettaglio dell'interfaccia: è la stessa regola che il database impone
 * con `can_approve_clinical_flag()`. Mostrare a un nutrizionista un
 * pulsante che il suo ruolo non può premere sarebbe una promessa che
 * Postgres poi rifiuta.
 *
 * Le proposte si raggruppano per referto: nove valori letti dallo
 * stesso PDF sono un documento da aprire, non nove decisioni.
 */
function criticita(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const perGruppo = new Map<string, PropostaFatto[]>();

  for (const p of fatti.proposte) {
    if (!p.fuoriSoglia) continue;
    // Senza documento il raggruppamento è per paziente: resta vero che
    // il lavoro è una revisione sola.
    const chiave = p.documentId ?? `paziente:${p.patientId}`;
    perGruppo.set(chiave, [...(perGruppo.get(chiave) ?? []), p]);
  }

  return [...perGruppo.entries()].map(([chiave, gruppo]) => {
    const primo = gruppo[0];
    const nomi = gruppo.map((p) => p.label);

    return {
      id: `criticita:${chiave}`,
      categoria: "criticita" as const,
      priorita: 1 as const,
      titolo:
        gruppo.length === 1
          ? `${primo.label} fuori soglia clinica`
          : `${plurale(gruppo.length, "valore", "valori")} fuori soglia clinica`,
      motivo: [
        nomi.slice(0, 4).join(", ") + (nomi.length > 4 ? ` e altri ${nomi.length - 4}` : ""),
        primo.documentTitle
          ? `Letti da «${primo.documentTitle}».`
          : "Estratti da un referto.",
        "L'approvazione di un valore fuori soglia richiede un medico.",
      ],
      patientId: primo.patientId,
      patientName: primo.patientName,
      quando: primo.createdAt,
      origine: "misura" as const,
      azione: { label: "Rivedi", href: "/pro/revisioni" },
      assegnatarioId: null,
      assegnatario: null,
      richiedeMedico: true,
    };
  });
}

/**
 * Risultati nuovi: valori letti che aspettano una conferma qualsiasi.
 *
 * Stessa forma delle criticità, senza la soglia clinica: li può
 * confermare chiunque scriva in cartella. Se lo stesso referto ha
 * prodotto anche un valore fuori soglia, questa riga non nasce — sono
 * lo stesso PDF, e aprirlo una volta risolve entrambe.
 */
function risultati(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const conCriticita = new Set(
    fatti.proposte
      .filter((p) => p.fuoriSoglia)
      .map((p) => p.documentId ?? `paziente:${p.patientId}`),
  );

  const perGruppo = new Map<string, PropostaFatto[]>();

  for (const p of fatti.proposte) {
    if (p.fuoriSoglia) continue;
    const chiave = p.documentId ?? `paziente:${p.patientId}`;
    if (conCriticita.has(chiave)) continue;
    perGruppo.set(chiave, [...(perGruppo.get(chiave) ?? []), p]);
  }

  return [...perGruppo.entries()].map(([chiave, gruppo]) => {
    const primo = gruppo[0];

    return {
      id: `risultato:${chiave}`,
      categoria: "risultato" as const,
      priorita: 2 as const,
      titolo: `${plurale(gruppo.length, "valore", "valori")} in attesa di conferma`,
      motivo: [
        gruppo.slice(0, 4).map((p) => p.label).join(", ") +
          (gruppo.length > 4 ? ` e altri ${gruppo.length - 4}` : ""),
        primo.documentTitle ? `Letti da «${primo.documentTitle}».` : "Estratti da un referto.",
      ],
      patientId: primo.patientId,
      patientName: primo.patientName,
      quando: primo.createdAt,
      origine: "misura" as const,
      azione: { label: "Rivedi", href: "/pro/revisioni" },
      assegnatarioId: null,
      assegnatario: null,
      richiedeMedico: false,
    };
  });
}

/**
 * Referti che nessuno ha ancora aperto.
 *
 * Un referto che ha già prodotto valori in attesa non compare: quelli
 * lo dicono meglio, con dentro cosa c'è scritto. Questa riga è per i
 * documenti che il motore non ha saputo leggere — una risonanza, una
 * scansione, una lettera di un collega — che sono esattamente quelli
 * che un occhio umano deve guardare.
 */
function documenti(fatti: FattiAttenzione): SegnaleAttenzione[] {
  return fatti.documenti
    .filter((d) => d.reviewState === "pending" && d.proposteInAttesa === 0)
    .map((d) => {
      const giorni = giorniTra(d.createdAt, fatti.oggi);
      const fermo = giorni >= GIORNI_REFERTO_FERMO;

      return {
        id: `documento:${d.id}`,
        categoria: "documento" as const,
        priorita: (fermo ? 1 : 2) as PrioritaAttenzione,
        titolo: d.title,
        motivo: [
          giorni <= 0
            ? "Arrivato oggi."
            : `Arrivato ${plurale(giorni, "giorno", "giorni")} fa, mai aperto.`,
        ],
        patientId: d.patientId,
        patientName: d.patientName,
        quando: d.createdAt,
        origine: "referto" as const,
        azione: { label: "Apri", href: cartella(d.patientId, "/documenti") },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      };
    });
}

/**
 * Valori già in cartella che stanno fuori dall'intervallo di
 * riferimento.
 *
 * Sono approvati: qualcuno li ha guardati e li ha fatti entrare. Restano
 * accesi perché un valore fuori range approvato è una cosa da seguire,
 * non una da decidere — ed è la differenza fra questa categoria e le
 * criticità. Dopo tre mesi si spengono: a quel punto sono storia.
 */
function anomalie(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const perPaziente = new Map<string, AnomaliaFatto[]>();

  for (const a of fatti.anomalie) {
    if (giorniTra(a.misurataIl, fatti.oggi) > GIORNI_ANOMALIA_RECENTE) continue;
    perPaziente.set(a.patientId, [...(perPaziente.get(a.patientId) ?? []), a]);
  }

  return [...perPaziente.entries()].map(([patientId, gruppo]) => {
    const recente = [...gruppo].sort((a, b) => b.misurataIl.localeCompare(a.misurataIl))[0];

    return {
      id: `anomalia:${patientId}`,
      categoria: "anomalia" as const,
      priorita: 2 as const,
      titolo:
        gruppo.length === 1
          ? `${recente.metrica} fuori dall'intervallo di riferimento`
          : `${plurale(gruppo.length, "valore", "valori")} fuori dall'intervallo di riferimento`,
      motivo: gruppo
        .slice(0, 3)
        .map((a) => `${a.metrica}: ${a.valore} (${a.misurataIl.slice(0, 10)})`),
      patientId,
      patientName: recente.patientName,
      quando: recente.misurataIl,
      origine: "misura" as const,
      azione: { label: "Vedi il quadro", href: cartella(patientId, "/clinico") },
      assegnatarioId: null,
      assegnatario: null,
      richiedeMedico: false,
    };
  });
}

/**
 * Visite.
 *
 * Due fatti diversi sotto la stessa categoria, perché sono lo stesso
 * gesto — aprire quella visita:
 *
 *   Passata senza esito. Finché l'esito manca il credito resta
 *   prenotato, il percorso non avanza e la timeline ha un buco. È
 *   priorità alta il giorno dopo, non fra una settimana.
 *
 *   Di oggi, senza sintesi pre-visita. Non è un problema: è un lavoro
 *   che conviene fare prima che il paziente entri.
 */
function visite(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const segnali: SegnaleAttenzione[] = [];

  for (const v of fatti.visite) {
    if (v.stato === "completed" || v.stato === "cancelled") continue;

    if (v.passata) {
      const giorni = giorniTra(v.iniziaAlle, fatti.oggi);
      segnali.push({
        id: `visita:${v.id}`,
        categoria: "visita",
        priorita: giorni >= 1 ? 1 : 2,
        titolo: `${v.servizio}: esito non registrato`,
        motivo: [
          giorni <= 0
            ? "Si è svolta oggi."
            : `Si è svolta ${plurale(giorni, "giorno", "giorni")} fa.`,
          "Finché l'esito manca, il credito resta prenotato e il percorso non avanza.",
        ],
        patientId: v.patientId,
        patientName: v.patientName,
        quando: v.iniziaAlle,
        origine: "agenda",
        azione: { label: "Registra l'esito", href: cartella(v.patientId, "/visita") },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      });
      continue;
    }

    if (v.oggi && !v.preparata) {
      segnali.push({
        id: `preparazione:${v.id}`,
        categoria: "visita",
        priorita: 2,
        titolo: `${v.servizio}: da preparare`,
        motivo: ["In agenda oggi, nessuna sintesi pre-visita in cartella."],
        patientId: v.patientId,
        patientName: v.patientName,
        quando: v.iniziaAlle,
        origine: "agenda",
        azione: { label: "Prepara", href: cartella(v.patientId, "/visita") },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      });
    }
  }

  return segnali;
}

/**
 * Reassessment e follow-up.
 *
 * Uno per paziente, mai due: se lo Score è scaduto *e* il percorso è
 * fermo, la riga è il reassessment. È la cosa concreta da fare, e
 * farla risolve anche l'altra — mentre «il percorso è fermo» da solo
 * non dice a nessuno cosa prenotare.
 */
function percorso(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const segnali: SegnaleAttenzione[] = [];

  for (const p of fatti.pazienti) {
    const giorni = p.giorniDaPunteggio;
    const scaduto = giorni === null || giorni >= SCORE_REFRESH_DAYS;

    if (scaduto) {
      const mai = giorni === null;
      segnali.push({
        id: `reassessment:${p.patientId}`,
        categoria: "reassessment",
        priorita: mai || giorni >= REASSESSMENT_DAYS ? 1 : 2,
        titolo: mai ? "Primo Longevity Score da effettuare" : "Longevity Score da ripetere",
        motivo: [
          mai
            ? "Nessun punteggio registrato."
            : `Ultimo punteggio ${plurale(giorni, "giorno", "giorni")} fa.`,
          ...(p.membershipAttiva ? ["Membership attiva."] : []),
        ],
        patientId: p.patientId,
        patientName: p.patientName,
        quando: null,
        origine: "punteggio",
        azione: { label: "Apri la cartella", href: cartella(p.patientId, "/score") },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      });
      continue;
    }

    if (p.giorniPercorsoFermo !== null && p.giorniPercorsoFermo >= PROGRAM_STALL_DAYS) {
      segnali.push({
        id: `follow_up:${p.patientId}`,
        categoria: "follow_up",
        priorita: 2,
        titolo: "Percorso fermo",
        motivo: [
          `Nessun movimento da ${plurale(p.giorniPercorsoFermo, "giorno", "giorni")}.`,
        ],
        patientId: p.patientId,
        patientName: p.patientName,
        quando: null,
        origine: "percorso",
        azione: { label: "Vedi il percorso", href: cartella(p.patientId, "/percorso") },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      });
    }
  }

  return segnali;
}

/**
 * Dati mancanti.
 *
 * Non è un allarme, è una lacuna: un pilastro non calcolabile tiene
 * parziale il punteggio e nessuno se ne accorge, perché un numero
 * parziale ha lo stesso aspetto di uno completo. Priorità bassa per
 * costruzione — non deve mai stare sopra una visita da chiudere.
 *
 * Chi non ha nemmeno un punteggio non compare: gli manca tutto, e la
 * riga giusta per lui è già il reassessment.
 */
function lacune(fatti: FattiAttenzione): SegnaleAttenzione[] {
  return fatti.pazienti
    .filter((p) => p.pilastriMancanti.length > 0 && p.giorniDaPunteggio !== null)
    .map((p) => ({
      id: `lacuna:${p.patientId}`,
      categoria: "attenzione" as const,
      priorita: 3 as const,
      titolo: "Dati mancanti nello Score",
      motivo: [
        `Non calcolabili: ${p.pilastriMancanti.join(", ")}.`,
        "Il punteggio resta parziale finché mancano.",
      ],
      patientId: p.patientId,
      patientName: p.patientName,
      quando: null,
      origine: "punteggio" as const,
      azione: { label: "Vedi lo Score", href: cartella(p.patientId, "/score") },
      assegnatarioId: null,
      assegnatario: null,
      richiedeMedico: false,
    }));
}

/** I task, con la scadenza tradotta in priorità. */
function task(fatti: FattiAttenzione): SegnaleAttenzione[] {
  return fatti.task.map((t) => {
    const giorni = t.scadenzaIl ? giorniTra(fatti.oggi, t.scadenzaIl) : null;

    const priorita: PrioritaAttenzione =
      giorni !== null && giorni < 0
        ? 1
        : giorni !== null && giorni <= 1
          ? 1
          : t.priorita === 1
            ? 1
            : t.priorita === 3
              ? 3
              : 2;

    const scadenza =
      giorni === null
        ? "Senza scadenza."
        : giorni < 0
          ? `Scaduto da ${plurale(-giorni, "giorno", "giorni")}.`
          : giorni === 0
            ? "Scade oggi."
            : `Scade fra ${plurale(giorni, "giorno", "giorni")}.`;

    return {
      id: `task:${t.id}`,
      categoria: "task" as const,
      priorita,
      titolo: t.titolo,
      motivo: [scadenza, ...(t.origine === "brain" ? ["Proposto dal Brain."] : [])],
      patientId: t.patientId,
      patientName: t.patientName,
      quando: t.creatoIl,
      origine: "task" as const,
      azione: { label: "Apri", href: "/pro/task" },
      assegnatarioId: t.assegnatarioId,
      assegnatario: t.assegnatario,
      richiedeMedico: false,
    };
  });
}

/**
 * Messaggi dei pazienti senza risposta.
 *
 * Solo i fili clinici. Gli amministrativi li vede e risponde la
 * reception, e portarli qui significherebbe due persone che aprono lo
 * stesso messaggio — o, più spesso, nessuna delle due.
 */
function messaggi(fatti: FattiAttenzione): SegnaleAttenzione[] {
  return fatti.messaggi
    .filter((m) => m.nonLetti > 0 && m.categoria === "clinical")
    .map((m) => {
      const giorni = giorniTra(m.ultimoIl, fatti.oggi);

      return {
        id: `messaggio:${m.threadId}`,
        categoria: "messaggio" as const,
        priorita: (giorni >= GIORNI_MESSAGGIO_FERMO ? 1 : 2) as PrioritaAttenzione,
        titolo: m.oggetto,
        motivo: [
          `${plurale(m.nonLetti, "messaggio", "messaggi")} da leggere.`,
          giorni <= 0 ? "Scritto oggi." : `In attesa da ${plurale(giorni, "giorno", "giorni")}.`,
        ],
        patientId: m.patientId,
        patientName: m.patientName,
        quando: m.ultimoIl,
        origine: "messaggio" as const,
        azione: { label: "Rispondi", href: `/pro/messaggi/${m.threadId}` },
        assegnatarioId: null,
        assegnatario: null,
        richiedeMedico: false,
      };
    });
}

/* ── Composizione ─────────────────────────────────────────────────── */

const REGOLE = [
  criticita,
  risultati,
  documenti,
  anomalie,
  visite,
  percorso,
  lacune,
  task,
  messaggi,
] as const;

/**
 * L'ordine in cui si legge.
 *
 * Prima la priorità, poi il fatto più vecchio: fra due cose ugualmente
 * urgenti tocca prima a quella che aspetta da più tempo, che è l'unico
 * criterio che impedisce a una riga di restare in fondo per sempre.
 * A parità di tutto, l'id — così due caricamenti dello stesso momento
 * non riordinano lo schermo sotto le mani di chi legge.
 */
function ordina(a: SegnaleAttenzione, b: SegnaleAttenzione): number {
  if (a.priorita !== b.priorita) return a.priorita - b.priorita;
  if (a.quando && b.quando) return a.quando.localeCompare(b.quando);
  if (a.quando) return -1;
  if (b.quando) return 1;
  return a.id.localeCompare(b.id);
}

/**
 * Tutti i segnali, deduplicati e ordinati.
 *
 * La deduplica finale sull'id è una rete di sicurezza, non la strategia:
 * il grosso del lavoro lo fanno le regole, che si guardano fra loro
 * prima di produrre una riga. Ma due regole si possono sovrapporre per
 * distrazione di chi ne aggiunge una terza, e allora è meglio che
 * l'ultima riga vinca in silenzio piuttosto che comparire due volte.
 */
export function segnaliAttenzione(fatti: FattiAttenzione): SegnaleAttenzione[] {
  const perId = new Map<string, SegnaleAttenzione>();

  for (const regola of REGOLE) {
    for (const segnale of regola(fatti)) {
      // Senza azione non è un segnale: è una notifica, e vive altrove.
      if (segnale.azione === null) continue;
      perId.set(segnale.id, segnale);
    }
  }

  return [...perId.values()].sort(ordina);
}

/** I segnali di un paziente solo, per la sua cartella. */
export function segnaliDelPaziente(
  segnali: readonly SegnaleAttenzione[],
  patientId: string,
): SegnaleAttenzione[] {
  return segnali.filter((s) => s.patientId === patientId);
}

export interface ContoAttenzione {
  categoria: CategoriaAttenzione;
  totale: number;
  urgenti: number;
}

/**
 * Quanti per categoria.
 *
 * Le categorie vuote restano nell'elenco, in ordine fisso: una colonna
 * che compare e scompare costringe a rileggere l'intestazione ogni
 * volta, e «zero documenti da revisionare» è un'informazione — quella
 * che dice che la coda è finita.
 */
export function contaPerCategoria(
  segnali: readonly SegnaleAttenzione[],
): ContoAttenzione[] {
  return CATEGORIE_ATTENZIONE.map((categoria) => {
    const gruppo = segnali.filter((s) => s.categoria === categoria);
    return {
      categoria,
      totale: gruppo.length,
      urgenti: gruppo.filter((s) => s.priorita === 1).length,
    };
  });
}

/**
 * I pazienti che richiedono attenzione, con il perché.
 *
 * Ordinati per gravità e non per numero di righe: un paziente con una
 * criticità viene prima di uno con sei task, ed è l'unico ordinamento
 * che rispecchia come si lavora davvero.
 */
export interface PazienteDaGuardare {
  patientId: string;
  patientName: string;
  segnali: SegnaleAttenzione[];
  prioritaMassima: PrioritaAttenzione;
}

export function pazientiDaGuardare(
  segnali: readonly SegnaleAttenzione[],
): PazienteDaGuardare[] {
  const perPaziente = new Map<string, SegnaleAttenzione[]>();

  for (const s of segnali) {
    if (!s.patientId) continue;
    perPaziente.set(s.patientId, [...(perPaziente.get(s.patientId) ?? []), s]);
  }

  return [...perPaziente.entries()]
    .map(([patientId, gruppo]) => ({
      patientId,
      patientName: gruppo[0].patientName ?? "Paziente",
      segnali: [...gruppo].sort(ordina),
      prioritaMassima: Math.min(...gruppo.map((s) => s.priorita)) as PrioritaAttenzione,
    }))
    .sort(
      (a, b) =>
        a.prioritaMassima - b.prioritaMassima ||
        b.segnali.length - a.segnali.length ||
        a.patientName.localeCompare(b.patientName),
    );
}
