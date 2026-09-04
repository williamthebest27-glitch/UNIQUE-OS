/**
 * Capire che cosa è stato chiesto, senza un modello linguistico.
 *
 * L'intuizione che rende possibile tutto questo: in una control room le
 * domande non sono infinite. "Come sta andando", "quanto abbiamo speso",
 * "quale campagna porta i pazienti migliori", "chi non viene da tre
 * mesi", "quanto costa lo Score". Sono venti domande, poste in cento modi
 * diversi — ed è la seconda parte a essere difficile, non la prima.
 *
 * Qui si risolve la seconda parte: normalizzazione, sinonimi, e un
 * punteggio che sceglie l'intento più specifico fra quelli compatibili.
 * La prima parte — la risposta — la danno i motori di calcolo che già
 * esistono, e la danno con numeri veri.
 *
 * Nessun import, nessuna rete, nessun costo per domanda. E un pregio che
 * un modello non ha: **si può testare**. Un intento riconosciuto male è
 * un caso di prova, non una supposizione sul comportamento di un modello.
 */

export type IdIntento =
  | "andamento"
  | "fatturato"
  | "campagne_qualita"
  | "campagne_costose"
  | "spesa_marketing"
  | "contenuti"
  | "pazienti_fermi"
  | "membership"
  | "capacita"
  | "task"
  | "conoscenza"
  | "eventi"
  | "conversione"
  | "prepara_riattivazione"
  | "aiuto";

export interface Intento {
  id: IdIntento;
  /** Quanto la domanda somigliava a questo intento: serve solo a scegliere. */
  punteggio: number;
  parametri: Parametri;
}

export interface Parametri {
  /** Mese in formato YYYY-MM, quando la domanda ne nomina uno. */
  periodo?: string;
  /** Giorni di silenzio, per le domande sui pazienti fermi. */
  giorni?: number;
  /** Che cosa conta come segno di vita. */
  criterio?: "visite" | "crediti";
  /** Il testo da cercare in knowledge base. */
  ricerca?: string;
}

/* ── Normalizzazione ──────────────────────────────────────────────── */

/**
 * Toglie di mezzo tutto ciò che non cambia il significato.
 *
 * Accenti compresi: chi scrive di fretta in una control room scrive
 * "capacita" e "perche", e una ricerca che non li riconosce è una ricerca
 * che sbaglia sulle domande più frequenti.
 */
export function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Il tempo ─────────────────────────────────────────────────────── */

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function meseIndietro(oggi: string, quanti: number): string {
  const [anno, mese] = oggi.split("-").map(Number);
  const totale = anno * 12 + (mese - 1) - quanti;
  return `${Math.floor(totale / 12)}-${String((totale % 12) + 1).padStart(2, "0")}`;
}

/**
 * Il periodo nominato nella domanda, se ce n'è uno.
 *
 * "Il mese scorso" e "ad agosto" sono la stessa domanda posta da due
 * persone diverse. Senza indicazioni si intende il mese in corso, che è
 * quasi sempre ciò che si vuole sapere.
 */
export function estraiPeriodo(testo: string, oggi: string): string | undefined {
  const t = normalizza(testo);

  if (/\b(mese scorso|scorso mese|mese precedente)\b/.test(t)) return meseIndietro(oggi, 1);
  if (/\b(due mesi fa)\b/.test(t)) return meseIndietro(oggi, 2);
  if (/\b(questo mese|mese corrente|adesso|ora|oggi)\b/.test(t)) return oggi.slice(0, 7);

  const esplicito = t.match(/\b(20\d{2})[- /](0?[1-9]|1[0-2])\b/);
  if (esplicito) {
    return `${esplicito[1]}-${String(Number(esplicito[2])).padStart(2, "0")}`;
  }

  for (let i = 0; i < MESI.length; i += 1) {
    if (!new RegExp(`\\b${MESI[i]}\\b`).test(t)) continue;

    const conAnno = t.match(new RegExp(`${MESI[i]}\\s+(20\\d{2})`));
    if (conAnno) return `${conAnno[1]}-${String(i + 1).padStart(2, "0")}`;

    // Senza anno si intende l'ultima volta che quel mese è passato: a
    // marzo, "dicembre" è quello dell'anno prima, non quello che verrà.
    const [anno, mese] = oggi.split("-").map(Number);
    const annoScelto = i + 1 > mese ? anno - 1 : anno;
    return `${annoScelto}-${String(i + 1).padStart(2, "0")}`;
  }

  return undefined;
}

export function estraiGiorni(testo: string): number | undefined {
  const t = normalizza(testo);
  const diretto = t.match(/\b(\d{1,3})\s*(giorni|gg)\b/);
  if (diretto) return Number(diretto[1]);

  const mesi = t.match(/\b(\d{1,2})\s*mesi\b/);
  if (mesi) return Number(mesi[1]) * 30;

  if (/\bun mese\b/.test(t)) return 30;
  if (/\btre mesi|trimestre\b/.test(t)) return 90;
  if (/\bsei mesi|semestre\b/.test(t)) return 180;
  return undefined;
}

/* ── Il catalogo ──────────────────────────────────────────────────── */

interface Regola {
  id: IdIntento;
  /**
   * Gruppi di sinonimi: **tutti** i gruppi devono trovare almeno una
   * parola. Un gruppo solo è una domanda generica, tre gruppi sono una
   * domanda precisa — e più gruppi trova, più l'intento è specifico.
   */
  gruppi: string[][];
  /** Alza il punteggio a parità di gruppi: per gli intenti più precisi. */
  peso?: number;
}

const REGOLE: Regola[] = [
  {
    id: "campagne_qualita",
    gruppi: [
      ["campagna", "campagne", "adv", "advertising", "inserzion"],
      [
        "migliori", "meglio", "qualita", "valore", "ltv", "redditiz", "convertono",
        "membership", "membri", "genera", "generano", "porta", "portano", "produce",
      ],
    ],
    peso: 2,
  },
  {
    id: "campagne_costose",
    gruppi: [
      ["campagna", "campagne", "cpl", "costo per lead"],
      ["costos", "cara", "care", "troppo", "sopra", "fuori media", "peggior", "spreca"],
    ],
    peso: 2,
  },
  {
    id: "spesa_marketing",
    gruppi: [
      ["speso", "spesa", "spendiamo", "budget", "investito", "costo"],
      ["marketing", "campagne", "campagna", "meta", "google", "pubblicita", "adv", "ads"],
    ],
    peso: 2,
  },
  /*
   * "Quanto abbiamo speso questo mese?" — senza dire in cosa.
   *
   * In una control room quella domanda è quasi sempre sulla pubblicità:
   * è l'unica voce di spesa che si guarda giorno per giorno. Vale meno
   * della versione che nomina le campagne, così quando il contesto c'è
   * vince quella; e "costa" non entra in questo elenco, o "quanto costa
   * lo Score" finirebbe qui invece che in knowledge base.
   */
  {
    id: "spesa_marketing",
    gruppi: [["speso", "spendiamo", "spendendo", "spesa", "investito"]],
    peso: 0,
  },
  {
    id: "contenuti",
    gruppi: [
      ["contenut", "video", "reel", "carosell", "post", "creativit"],
      ["convert", "funzion", "performa", "migliori", "meglio", "risultati"],
    ],
    peso: 2,
  },
  {
    id: "pazienti_fermi",
    gruppi: [
      [
        "inattiv", "ferm", "sparit", "non vengono", "non viene", "non usano",
        "non utilizzano", "riattiv", "dormient", "persi", "abbandonat",
      ],
    ],
    peso: 2,
  },
  /*
   * Chiedere di fare, non di sapere.
   *
   * "Chi non viene da tre mesi" e "preparami i contatti per chi non
   * viene da tre mesi" sono due domande diverse: la prima si risponde,
   * la seconda si prepara e si fa autorizzare. Il verbo all'imperativo e'
   * l'unica cosa che le distingue, ed e' abbastanza.
   */
  {
    id: "prepara_riattivazione",
    gruppi: [
      ["prepara", "preparami", "predisponi", "crea", "imposta", "organizza"],
      ["riattiv", "contatt", "richiam", "recuper"],
    ],
    peso: 3,
  },
  {
    id: "conversione",
    gruppi: [["conversione", "convertono", "conversion", "imbuto", "funnel"]],
    peso: 1,
  },
  /*
   * "Cosa dice la procedura di disdetta?" non è una domanda sulle
   * disdette.
   *
   * Le parole che nominano un documento — procedura, protocollo, policy,
   * listino — dicono *dove* sta la risposta, e questo conta più
   * dell'argomento di cui parla. Senza questa regola la domanda finiva
   * fra i numeri delle membership, perché "disdetta" pesava quanto
   * "procedura".
   */
  {
    id: "conoscenza",
    gruppi: [
      [
        "procedura", "protocollo", "policy", "regolamento", "linee guida",
        "brand book", "faq", "listino", "come si fa", "cosa dice",
      ],
    ],
    peso: 3,
  },
  {
    id: "membership",
    gruppi: [["membership", "membri", "abbonament", "rinnovi", "churn", "disdett"]],
    peso: 1,
  },
  {
    id: "capacita",
    gruppi: [
      ["capacita", "saturazione", "collo di bottiglia", "quanto possiamo", "agenda piena", "occupazione"],
    ],
    peso: 1,
  },
  {
    id: "task",
    gruppi: [["task", "attivita", "da fare", "in sospeso", "arretrat"]],
    peso: 1,
  },
  {
    id: "eventi",
    gruppi: [["cosa e successo", "cosa succede", "eventi", "novita", "ultimi giorni", "ultima settimana"]],
    peso: 1,
  },
  {
    id: "fatturato",
    gruppi: [
      ["fatturato", "incass", "ricav", "revenue", "guadagn", "quanto abbiamo fatto", "quanto fatturiamo"],
    ],
    peso: 1,
  },
  {
    id: "conoscenza",
    gruppi: [
      ["prezzo", "prezzi", "costa", "quanto costa", "listino", "tariffa", "procedura", "regola", "policy", "come si fa", "faq"],
    ],
    peso: 1,
  },
  {
    id: "andamento",
    gruppi: [
      [
        "come sta andando", "come va", "come siamo messi", "andamento", "situazione",
        "riassunto", "riepilogo", "sintesi", "panoramica", "come e andato",
      ],
    ],
    peso: 1,
  },
  {
    id: "aiuto",
    gruppi: [["aiuto", "cosa sai fare", "cosa puoi", "help", "come funzioni", "domande"]],
    peso: 3,
  },
];

/**
 * Corrispondenza a inizio di parola, non ovunque.
 *
 * Cercare "ferm" dentro la stringa troverebbe anche "conferma", e
 * "quante conferme oggi?" diventerebbe una domanda sui pazienti fermi.
 * Ancorando all'inizio di parola, le radici brevi restano utilizzabili:
 * "sparit" prende sparito e spariti, "inattiv" prende inattivo e
 * inattivi, e nessuna delle due prende qualcos'altro.
 */
const ANCORE = new Map<string, RegExp>();

function contiene(testo: string, parola: string): boolean {
  let regola = ANCORE.get(parola);
  if (!regola) {
    // Le parole del catalogo sono scritte a mano e non contengono
    // metacaratteri: basta ancorarle all'inizio di parola.
    regola = new RegExp(`\\b${parola}`);
    ANCORE.set(parola, regola);
  }
  return regola.test(testo);
}

/**
 * L'intento di una domanda, o null se non se ne riconosce nessuno.
 *
 * Null è una risposta legittima e importante: meglio dire "non ho capito,
 * ecco cosa so rispondere" che indovinare. Un motore che indovina è un
 * motore di cui non ci si fida al terzo errore.
 */
export function riconosciIntento(
  domanda: string,
  oggi = new Date().toISOString().slice(0, 10),
): Intento | null {
  const t = normalizza(domanda);
  if (t.length < 2) return null;

  let migliore: Intento | null = null;

  for (const regola of REGOLE) {
    let gruppiTrovati = 0;
    for (const gruppo of regola.gruppi) {
      if (gruppo.some((parola) => contiene(t, parola))) gruppiTrovati += 1;
    }

    // Servono tutti i gruppi: "campagne" da solo non è "quale campagna
    // porta i pazienti migliori", ed è giusto che non lo diventi.
    if (gruppiTrovati < regola.gruppi.length) continue;

    const punteggio = gruppiTrovati * 10 + (regola.peso ?? 0);
    if (!migliore || punteggio > migliore.punteggio) {
      migliore = { id: regola.id, punteggio, parametri: {} };
    }
  }

  if (!migliore) return null;

  const parametri: Parametri = {};

  const periodo = estraiPeriodo(domanda, oggi);
  if (periodo) parametri.periodo = periodo;

  const giorni = estraiGiorni(domanda);
  if (giorni) parametri.giorni = giorni;

  if (migliore.id === "pazienti_fermi" || migliore.id === "prepara_riattivazione") {
    parametri.criterio = /credit|membership|abbonament/.test(t) ? "crediti" : "visite";
    parametri.giorni = parametri.giorni ?? 60;
  }

  if (migliore.id === "conoscenza") {
    // Le parole della domanda meno quelle che la introducono: ciò che
    // resta è quasi sempre l'argomento.
    parametri.ricerca = t
      .replace(
        /\b(quanto|quale|qual|come|dove|quando|perche|costa|costano|prezzo|prezzi|il|lo|la|i|gli|le|un|una|di|del|della|per|che|e|si|fa|mi|dici|dimmi|sai)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  return { ...migliore, parametri };
}

/** Le domande che il motore proprietario sa rispondere, per chi non lo sa. */
export const DOMANDE_ESEMPIO: string[] = [
  "Come sta andando Unique questo mese?",
  "Quanto abbiamo fatturato a settembre?",
  "Quanto abbiamo speso in campagne questo mese?",
  "Quale campagna porta i pazienti migliori?",
  "Ci sono campagne che costano troppo?",
  "Quali contenuti stanno convertendo?",
  "Chi non viene da più di 90 giorni?",
  "Quali membri non usano i crediti da 60 giorni?",
  "Come siamo messi a capacità?",
  "Quanto costa il Longevity Score?",
  "Cosa è successo negli ultimi sette giorni?",
  "Quali task sono in sospeso?",
  "Preparami i contatti per chi non usa i crediti da 90 giorni",
];
