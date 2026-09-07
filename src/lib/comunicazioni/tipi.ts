/**
 * Il vocabolario delle comunicazioni interne.
 *
 * Sta in un file suo e non dentro le funzioni di lettura perché lo usano
 * in tre: le pagine server, i moduli client e le azioni. Un modulo
 * `"use server"` può esportare solo funzioni async, quindi ogni costante
 * condivisa deve vivere fuori — è la stessa ragione per cui esiste
 * `lib/clinical/state.ts`.
 *
 * Le etichette sono qui e non nel database per la ragione di sempre:
 * cambiare una parola in italiano non deve essere una migrazione.
 */

/* ── Priorità ─────────────────────────────────────────────────────── */

export const PRIORITA = ["low", "normal", "high", "urgent", "critical"] as const;
export type Priorita = (typeof PRIORITA)[number];

export const ETICHETTE_PRIORITA: Record<Priorita, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
  critical: "Critica",
};

/**
 * Quanto conta, in un numero.
 *
 * Serve a ordinare senza scrivere quattro `if` in ogni elenco, e a
 * confrontare — «più urgente di alta» è una domanda che si pone in tre
 * punti diversi dell'interfaccia.
 */
export const PESO_PRIORITA: Record<Priorita, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
  critical: 4,
};

/** Vero per ciò che deve staccare l'occhio dallo schermo. */
export function eUrgente(p: Priorita): boolean {
  return PESO_PRIORITA[p] >= PESO_PRIORITA.urgent;
}

/**
 * La priorità come tono del design system.
 *
 * Il rosso in Unique è il colore del **marchio**, non dell'allarme:
 * usarlo per «alta» significherebbe che metà interfaccia sembra in
 * emergenza. Per questo solo `urgent` e `critical` lo prendono, `high`
 * è oro, e tutto il resto è neutro — cioè invisibile, che per una
 * priorità normale è il comportamento giusto.
 */
export function tonoPriorita(p: Priorita): "neutral" | "brand" | "gold" | "attention" {
  switch (p) {
    case "critical":
    case "urgent":
      return "brand";
    case "high":
      return "attention";
    default:
      return "neutral";
  }
}

/** Il livello della barra verticale del command center: 1 alta, 3 bassa. */
export function livelloPriorita(p: Priorita): 1 | 2 | 3 {
  if (PESO_PRIORITA[p] >= PESO_PRIORITA.urgent) return 1;
  if (p === "high") return 2;
  return 3;
}

export function isPriorita(v: string): v is Priorita {
  return (PRIORITA as readonly string[]).includes(v);
}

/* ── Tipo di messaggio ────────────────────────────────────────────── */

/**
 * Di cosa si parla.
 *
 * «Urgente» e «critico» non compaiono qui di proposito: sono priorità.
 * Tenerli fra i tipi avrebbe permesso un messaggio di tipo «urgente» con
 * priorità «bassa», che non vuol dire niente e che qualcuno avrebbe
 * scritto entro la prima settimana.
 */
export const TIPI_MESSAGGIO = [
  "info",
  "request",
  "consultation",
  "exam",
  "therapy",
  "transfer",
] as const;
export type TipoMessaggio = (typeof TIPI_MESSAGGIO)[number];

export const ETICHETTE_TIPO: Record<TipoMessaggio, string> = {
  info: "Informazione",
  request: "Richiesta",
  consultation: "Consulto",
  exam: "Esame",
  therapy: "Terapia",
  transfer: "Trasferimento",
};

export function isTipoMessaggio(v: string): v is TipoMessaggio {
  return (TIPI_MESSAGGIO as readonly string[]).includes(v);
}

/* ── Genere di conversazione ──────────────────────────────────────── */

export const GENERI = ["direct", "group", "department", "consultation"] as const;
export type GenereConversazione = (typeof GENERI)[number];

export const ETICHETTE_GENERE: Record<GenereConversazione, string> = {
  direct: "Diretta",
  group: "Gruppo",
  department: "Reparto",
  consultation: "Consulto",
};

export function isGenere(v: string): v is GenereConversazione {
  return (GENERI as readonly string[]).includes(v);
}

/* ── Stati del consulto ───────────────────────────────────────────── */

export const STATI_CONSULTO = [
  "open",
  "taken",
  "in_review",
  "answered",
  "closed",
] as const;
export type StatoConsulto = (typeof STATI_CONSULTO)[number];

export const ETICHETTE_STATO: Record<StatoConsulto, string> = {
  open: "Aperto",
  taken: "Preso in carico",
  in_review: "In valutazione",
  answered: "Risposto",
  closed: "Chiuso",
};

export function isStatoConsulto(v: string): v is StatoConsulto {
  return (STATI_CONSULTO as readonly string[]).includes(v);
}

/**
 * Cosa si può fare adesso.
 *
 * La macchina a stati vive nel database — `advance_consultation` è
 * l'unica strada — e questa è la sua copia per l'interfaccia: serve a
 * non disegnare un pulsante che il database rifiuterebbe. Se le due
 * divergono, quella giusta è il database.
 */
export function prossimiStati(stato: StatoConsulto): StatoConsulto[] {
  switch (stato) {
    case "open":
      return ["taken", "closed"];
    case "taken":
      return ["in_review", "answered", "closed"];
    case "in_review":
      return ["answered", "closed"];
    case "answered":
      return ["in_review", "closed"];
    case "closed":
      return [];
  }
}

export function tonoStato(
  stato: StatoConsulto,
): "neutral" | "brand" | "gold" | "attention" | "positive" {
  switch (stato) {
    case "open":
      return "attention";
    case "taken":
    case "in_review":
      return "brand";
    case "answered":
      return "positive";
    case "closed":
      return "neutral";
  }
}

/* ── Le viste della inbox ─────────────────────────────────────────── */

/**
 * Le sei code, e nessuna è un filtro estetico.
 *
 * Ognuna risponde a una domanda diversa di chi apre la sezione:
 * *cosa devo leggere*, *cosa non può aspettare*, *cosa ho chiesto io*,
 * *cosa mi hanno chiesto*. Un menu a tendina con «filtra per priorità»
 * avrebbe risposto a nessuna delle quattro.
 */
export const VISTE = [
  "tutte",
  "non-lette",
  "importanti",
  "urgenti",
  "mie",
  "consulti",
] as const;
export type Vista = (typeof VISTE)[number];

export const ETICHETTE_VISTA: Record<Vista, string> = {
  tutte: "Tutte",
  "non-lette": "Non lette",
  importanti: "Importanti",
  urgenti: "Urgenti",
  mie: "Mie richieste",
  consulti: "Consulti",
};

export const NOTE_VISTA: Record<Vista, string> = {
  tutte: "Tutto ciò a cui partecipi, dal più recente.",
  "non-lette": "Righe scritte da altri che non hai ancora aperto.",
  importanti: "Priorità alta e oltre.",
  urgenti: "Urgenti e critiche. Non aspettano la fine della visita.",
  mie: "Le conversazioni e i consulti che hai aperto tu.",
  consulti: "Le richieste di parere, con il loro stato.",
};

export function isVista(v: string): v is Vista {
  return (VISTE as readonly string[]).includes(v);
}
