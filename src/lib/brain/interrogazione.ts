/**
 * Lo strato semantico: da una domanda a un'interrogazione.
 *
 * Il salto rispetto al catalogo di intenti è questo. Un intento è una
 * domanda scritta a mano, e quindici intenti sono quindici domande. Qui
 * invece si riconoscono **tre cose componibili** — che cosa si misura, per
 * cosa lo si raggruppa, con quali filtri — e le combinazioni sono
 * centinaia senza che nessuno le abbia previste una per una.
 *
 *   "quanto abbiamo fatturato"                   → fatturato
 *   "fatturato per servizio"                     → fatturato × servizio
 *   "quanto ha fatturato Rossi ad agosto"        → fatturato, professionista=Rossi, 2026-08
 *   "qual è il servizio più redditizio"          → margine × servizio, ordinato
 *   "quante visite di nutrizione questo mese"    → visite, disciplina=nutrizione
 *   "i tre professionisti che fatturano di più"  → fatturato × professionista, primi 3
 *
 * Nessuna di queste sei è stata scritta a mano: sono la stessa struttura
 * riempita in modi diversi. È la differenza fra un elenco di risposte e
 * una grammatica.
 *
 * Nessun import, come per il resto del motore: le regole con cui si legge
 * una domanda devono poter essere verificate senza database e senza rete.
 */

export type Misura =
  | "fatturato"
  | "margine"
  | "visite"
  | "pazienti"
  | "lead"
  | "membership"
  | "crediti"
  | "spesa"
  | "compensi"
  | "conversione"
  | "no_show"
  | "documenti"
  | "task";

export type Dimensione =
  | "servizio"
  | "professionista"
  | "disciplina"
  | "canale"
  | "campagna"
  | "sede"
  | "paziente";

export interface Filtro {
  dimensione: Dimensione;
  /** Il testo così come compare nella domanda: la risoluzione è a valle. */
  valore: string;
}

export interface Interrogazione {
  misura: Misura;
  /** Per cosa si raggruppa, quando la domanda lo chiede. */
  raggruppa?: Dimensione;
  filtri: Filtro[];
  /** Mese in formato YYYY-MM. */
  periodo?: string;
  /** Se la domanda cerca il primo o l'ultimo della classifica. */
  ordina?: "alto" | "basso";
  /** Quanti ne vuole: "i tre professionisti che…". */
  limite?: number;
  /** Vero se la domanda chiede il perché di una variazione. */
  spiegazione: boolean;
}

/* ── Vocabolario ──────────────────────────────────────────────────── */

const MISURE: { id: Misura; parole: string[]; peso?: number }[] = [
  { id: "fatturato", parole: ["fattur", "incass", "ricav", "revenue", "giro d'affari", "quanto abbiamo fatto"] },
  { id: "margine", parole: ["margine", "marginalit", "redditiv", "redditiz", "rende", "guadagn", "utile"] },
  { id: "spesa", parole: ["speso", "spesa", "spendiamo", "spendendo", "investito", "budget"] },
  { id: "compensi", parole: ["compens", "da liquidare", "da pagare ai", "quota professionist"] },
  { id: "visite", parole: ["visit", "prestazioni", "appuntament", "sedute", "erogato"] },
  { id: "pazienti", parole: ["pazient", "persone", "assistiti"] },
  { id: "lead", parole: ["lead", "contatti", "richieste"] },
  { id: "membership", parole: ["membership", "membri", "abbonament"] },
  { id: "crediti", parole: ["credit"] },
  { id: "conversione", parole: ["conversion", "convert"] },
  { id: "no_show", parole: ["no show", "no-show", "non presentat", "mancate presenz", "buchi"] },
  { id: "documenti", parole: ["referti", "documenti caricati"] },
  { id: "task", parole: ["task", "attivita aperte", "in sospeso"] },
];

const DIMENSIONI: { id: Dimensione; parole: string[] }[] = [
  { id: "servizio", parole: ["servizio", "servizi", "prestazione", "prestazioni", "per tipo di visita"] },
  { id: "professionista", parole: ["professionist", "medic", "dottor", "collaborator", "chi lavora"] },
  { id: "disciplina", parole: ["disciplina", "specialit", "area", "reparto"] },
  { id: "canale", parole: ["canale", "canali", "sorgente", "provenienza"] },
  { id: "campagna", parole: ["campagna", "campagne"] },
  { id: "sede", parole: ["sede", "sedi", "clinica", "cliniche"] },
  { id: "paziente", parole: ["paziente", "pazienti"] },
];

/**
 * Le discipline e i canali, riconosciuti per nome.
 *
 * Sono un elenco chiuso e piccolo: si possono nominare direttamente nella
 * domanda ("quante visite di nutrizione") senza che ci sia bisogno di
 * dire "per disciplina".
 */
const VALORI_DISCIPLINA: Record<string, string> = {
  nutrizion: "nutritionist",
  dietolog: "nutritionist",
  osteopat: "osteopath",
  psicolog: "psychologist",
  medic: "physician",
  infermier: "nurse",
  preparator: "trainer",
  allenator: "trainer",
};

const VALORI_CANALE: Record<string, string> = {
  meta: "meta",
  facebook: "facebook",
  instagram: "instagram",
  google: "google",
  tiktok: "tiktok",
  whatsapp: "whatsapp",
  email: "email",
  passaparola: "referral",
  referral: "referral",
  organico: "organic",
  sito: "web",
};

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

const NUMERI_A_PAROLE: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
};

/* ── Normalizzazione ──────────────────────────────────────────────── */

export function normalizzaDomanda(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contiene(testo: string, parola: string): boolean {
  return new RegExp(`\\b${parola.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(testo);
}

/* ── Il tempo ─────────────────────────────────────────────────────── */

function meseIndietro(oggi: string, quanti: number): string {
  const [anno, mese] = oggi.split("-").map(Number);
  const totale = anno * 12 + (mese - 1) - quanti;
  return `${Math.floor(totale / 12)}-${String((totale % 12) + 1).padStart(2, "0")}`;
}

export function periodoDellaDomanda(t: string, oggi: string): string | undefined {
  if (/\b(mese scorso|scorso mese|mese precedente)\b/.test(t)) return meseIndietro(oggi, 1);
  if (/\bdue mesi fa\b/.test(t)) return meseIndietro(oggi, 2);
  if (/\btre mesi fa\b/.test(t)) return meseIndietro(oggi, 3);
  if (/\b(questo mese|mese corrente|adesso|ora|oggi)\b/.test(t)) return oggi.slice(0, 7);

  const esplicito = t.match(/\b(20\d{2})[- /](0?[1-9]|1[0-2])\b/);
  if (esplicito) return `${esplicito[1]}-${String(Number(esplicito[2])).padStart(2, "0")}`;

  for (let i = 0; i < MESI.length; i += 1) {
    if (!new RegExp(`\\b${MESI[i]}\\b`).test(t)) continue;
    const conAnno = t.match(new RegExp(`${MESI[i]}\\s+(20\\d{2})`));
    if (conAnno) return `${conAnno[1]}-${String(i + 1).padStart(2, "0")}`;

    const [anno, mese] = oggi.split("-").map(Number);
    const annoScelto = i + 1 > mese ? anno - 1 : anno;
    return `${annoScelto}-${String(i + 1).padStart(2, "0")}`;
  }

  return undefined;
}

/* ── Il nome proprio ──────────────────────────────────────────────── */

/**
 * Un nome di persona nella domanda, se c'è.
 *
 * Si cerca dopo le preposizioni che introducono un agente — "di Rossi",
 * "del dottor Bianchi", "da Verdi" — e si prende la parola successiva se
 * comincia per maiuscola nel testo originale. La maiuscola è l'unico
 * segnale affidabile che si ha senza consultare l'anagrafica, e chi
 * scrive un cognome lo scrive maiuscolo quasi sempre.
 *
 * Il nome esce così com'è: a decidere se corrisponde a qualcuno è chi ha
 * l'elenco dei professionisti, non chi legge la domanda.
 */
export function nomeProprio(originale: string): string | undefined {
  const trovato = originale.match(
    /\b(?:di|del|dello|della|dal|dalla|da|per|con)\s+(?:dott(?:\.|or|oressa)?\s+|dr\.?\s+)?([A-Z][a-zà-ú]{2,})\b/,
  );
  if (trovato) return trovato[1];

  // "il dottor Rossi", senza preposizione davanti.
  const conTitolo = originale.match(/\b(?:dott(?:\.|or|oressa)?|dr\.?)\s+([A-Z][a-zà-ú]{2,})\b/);
  return conTitolo?.[1];
}

/* ── L'interrogazione ─────────────────────────────────────────────── */

/**
 * Che cosa chiede questa domanda, in forma di interrogazione.
 *
 * Null quando non si riconosce una misura: senza sapere *che cosa* si
 * misura non c'è niente da calcolare, e tirare a indovinare sarebbe
 * peggio che passare la mano a un altro modo di rispondere.
 */
export function estraiInterrogazione(
  domanda: string,
  oggi: string,
): Interrogazione | null {
  const t = normalizzaDomanda(domanda);
  if (t.length < 2) return null;

  /*
   * "Quanto costa la visita nutrizionale" non è una misura: è un prezzo,
   * e i prezzi stanno in knowledge base. Senza questa uscita la domanda
   * diventerebbe "visite di nutrizione", che è una risposta giusta a una
   * domanda mai fatta.
   */
  if (/\b(costa|costano|prezz|tariff|listino|quanto viene)/.test(t)) return null;

  /* ── La misura ──────────────────────────────────────────────── */
  let misura: Misura | null = null;
  for (const candidata of MISURE) {
    if (candidata.parole.some((p) => contiene(t, p))) {
      misura = candidata.id;
      break;
    }
  }
  if (!misura) return null;

  /* ── Il raggruppamento ──────────────────────────────────────── */
  let raggruppa: Dimensione | undefined;
  const perQualcosa = t.match(/\b(?:per|a|ad|suddivis[oi] per|diviso per|distribuit[oi] per)\s+([a-z']+)/g);
  for (const frammento of perQualcosa ?? []) {
    const dimensione = DIMENSIONI.find((d) => d.parole.some((p) => contiene(frammento, p)));
    if (dimensione) {
      raggruppa = dimensione.id;
      break;
    }
  }

  // "Da quale canale", "quale servizio", "chi": una domanda che chiede di
  // scegliere fra i membri di una dimensione la sta raggruppando.
  if (!raggruppa) {
    const qualeCosa = t.match(/\b(?:da |in |su )?qual[ei]\s+([a-z']+)/);
    if (qualeCosa) {
      const dimensione = DIMENSIONI.find((d) => d.parole.some((p) => contiene(qualeCosa[1], p)));
      if (dimensione) raggruppa = dimensione.id;
    } else if (/^chi\b/.test(t) || /\bchi (?:sono|e|ha|fa|lavora)\b/.test(t)) {
      raggruppa = "professionista";
    }
  }

  /* ── I filtri ───────────────────────────────────────────────── */
  const filtri: Filtro[] = [];

  for (const [chiave, valore] of Object.entries(VALORI_DISCIPLINA)) {
    if (contiene(t, chiave)) {
      filtri.push({ dimensione: "disciplina", valore });
      break;
    }
  }

  for (const [chiave, valore] of Object.entries(VALORI_CANALE)) {
    if (contiene(t, chiave)) {
      filtri.push({ dimensione: "canale", valore });
      break;
    }
  }

  const nome = nomeProprio(domanda);
  if (nome) filtri.push({ dimensione: "professionista", valore: nome });

  /* ── Classifica ─────────────────────────────────────────────── */
  let ordina: "alto" | "basso" | undefined;
  // Radici senza ancora finale: "redditizio", "migliore", "primi" devono
  // poter continuare, o la classifica non si riconosce.
  if (/\b(pi[uù] alt|maggior|miglior|top|di pi[uù]|pi[uù] redditiz|meglio|primi|prime)/.test(t)) {
    ordina = "alto";
  } else if (/\b(pi[uù] bass|minor|peggio|meno|ultim)/.test(t)) {
    ordina = "basso";
  } else if (/\bpi[uù]\b/.test(t)) {
    // "Più lead", "più visite": un "più" da solo, senza un "meno" intorno,
    // chiede il primo della classifica.
    ordina = "alto";
  }

  // Una classifica senza un raggruppamento esplicito ne suppone uno:
  // "il servizio più redditizio" è margine per servizio.
  if (ordina && !raggruppa) {
    const dimensione = DIMENSIONI.find((d) => d.parole.some((p) => contiene(t, p)));
    if (dimensione) raggruppa = dimensione.id;
  }

  /* ── Quanti ─────────────────────────────────────────────────── */
  let limite: number | undefined;
  const cifra = t.match(/\b(?:i|le|i primi|le prime|top)?\s*(\d{1,2})\s+(?:migliori|peggiori|servizi|professionist\w*|campagne|canali)/);
  if (cifra) limite = Number(cifra[1]);
  else {
    const aParole = t.match(
      /\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s+(?:migliori|peggiori|servizi|professionist\w*|campagne|canali)/,
    );
    if (aParole) limite = NUMERI_A_PAROLE[aParole[1]];
  }

  return {
    misura,
    raggruppa,
    filtri,
    periodo: periodoDellaDomanda(t, oggi),
    ordina,
    limite,
    spiegazione: /\b(perch|come mai|cosa ha causato|da cosa dipende|spiegami|motivo)/.test(t),
  };
}

/* ── Perché un numero si è mosso ──────────────────────────────────── */

export interface RigaConfronto {
  chiave: string;
  etichetta: string;
  attuale: number;
  precedente: number;
}

export interface Contributo {
  etichetta: string;
  delta: number;
  /** Quanta parte della variazione totale spiega, 0–1. */
  quota: number;
  direzione: "su" | "giu";
}

/**
 * Da che cosa dipende una variazione.
 *
 * "Perché il fatturato è sceso?" non si risponde con un'opinione: si
 * risponde scomponendo la differenza fra i due periodi e ordinando chi
 * l'ha causata. È aritmetica, e proprio per questo è una risposta di cui
 * ci si può fidare — non spiega *le ragioni umane* del calo, spiega dove
 * il calo è successo, che è la domanda a cui serve rispondere prima.
 *
 * Si restituiscono le voci che spiegano insieme almeno l'ottanta per
 * cento della variazione: le altre sono rumore, ed elencarle nasconde
 * quelle che contano.
 */
export function scomponiVariazione(
  righe: readonly RigaConfronto[],
  copertura = 0.8,
): { totale: number; contributi: Contributo[] } {
  const totale = righe.reduce((s, r) => s + (r.attuale - r.precedente), 0);
  if (righe.length === 0 || totale === 0) return { totale, contributi: [] };

  const ordinate = righe
    .map((r) => ({
      etichetta: r.etichetta,
      delta: r.attuale - r.precedente,
    }))
    .filter((r) => r.delta !== 0)
    // Prima chi ha spinto nella stessa direzione del totale, e di più.
    .sort((a, b) => {
      const versoTotale = Math.sign(totale);
      return b.delta * versoTotale - a.delta * versoTotale;
    });

  const contributi: Contributo[] = [];
  let spiegato = 0;

  for (const riga of ordinate) {
    const quota = riga.delta / totale;
    contributi.push({
      etichetta: riga.etichetta,
      delta: riga.delta,
      quota,
      direzione: riga.delta > 0 ? "su" : "giu",
    });

    if (quota > 0) spiegato += quota;
    // Con copertura piena si vuole tutta la scomposizione, chi va contro
    // corrente compreso; sotto, ci si ferma appena il grosso e' spiegato.
    if (copertura < 1 && spiegato >= copertura) break;
  }

  return { totale, contributi };
}
