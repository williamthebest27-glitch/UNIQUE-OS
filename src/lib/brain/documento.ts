import { vocePerCanonical, type VoceCatalogo } from "../document-intelligence/catalogo.ts";
import { descriviStato } from "../document-intelligence/stato.ts";
import type {
  Biomarcatore,
  DocumentoStrutturato,
  Intervallo,
  StatoValore,
} from "../document-intelligence/tipi.ts";

/**
 * Il Brain sul documento.
 *
 * Riceve i dati strutturati — non il PDF — e li mette in relazione con
 * tre cose: **l'intervallo di riferimento**, **lo storico del paziente**
 * e **l'obiettivo clinico**. È il confronto che la visione chiede:
 * `CURRENT vs PREVIOUS vs TARGET`.
 *
 * ---
 *
 * **Perché deterministico.** È la stessa scelta che il resto del Brain
 * di Unique ha già fatto, e vale qui più che altrove. Un trend è
 * aritmetica: tre numeri e due differenze. Chiedere a un modello
 * linguistico se 18 → 29 → 37 stia migliorando significa introdurre
 * un'incertezza dove non ce n'era nessuna, pagare una chiamata per
 * ottenerla, e — quando un giorno sbaglia — non poter spiegare perché.
 *
 * Il codice qui dentro si può leggere, discutere e correggere da un
 * medico che non programma. Un prompt no.
 *
 * Il modello resta utile dove il codice si ferma: scrivere la sintesi
 * finale in prosa, leggere una conclusione diagnostica scritta a mano.
 * Non è questo file.
 *
 * ---
 *
 * **I cinque livelli restano distinti**, come chiede la visione:
 *
 *   `Osservazione`   — cosa dicono i numeri. Un fatto, con le prove.
 *   `Interpretazione`— cosa potrebbe voler dire. Sempre al condizionale.
 *   `Raccomandazione`— cosa varrebbe la pena guardare. Mai una terapia.
 *   `Revisione`      — la decisione, che è di una persona e sta altrove.
 *
 * Sono campi diversi di tipi diversi, non paragrafi di uno stesso testo:
 * così l'interfaccia non può presentarli come la stessa cosa.
 */

/* ── Andamento nel tempo ──────────────────────────────────────────── */

export const DIREZIONI = [
  "IMPROVING",
  "WORSENING",
  "STABLE",
  "FLUCTUATING",
  "UNKNOWN",
] as const;

export type DirezioneTrend = (typeof DIREZIONI)[number];

export const ETICHETTE_TREND: Record<DirezioneTrend, string> = {
  IMPROVING: "In miglioramento",
  WORSENING: "In peggioramento",
  STABLE: "Stabile",
  FLUCTUATING: "Altalenante",
  UNKNOWN: "Non valutabile",
};

/** Una misura precedente dello stesso biomarcatore. */
export interface MisuraStorica {
  canonical_name: string;
  valore: number;
  unita: string | null;
  data: string;
}

export interface Trend {
  canonical_name: string;
  display_name: string;
  direzione: DirezioneTrend;
  /** I valori in ordine cronologico, il più recente per ultimo. */
  serie: { valore: number; data: string }[];
  /** La differenza fra il primo e l'ultimo. */
  variazione: number | null;
  /** In percentuale sul primo valore, quando ha senso calcolarla. */
  variazionePercentuale: number | null;
  /** Vero se il movimento supera la variabilità attesa dell'esame. */
  significativo: boolean;
  unita: string | null;
}

/**
 * Quanto un esame si muove da solo, fra due prelievi, senza che sia
 * cambiato niente.
 *
 * È la ragione per cui non ogni differenza è un trend. Una glicemia che
 * passa da 88 a 92 non è peggiorata: è lo stesso valore misurato due
 * volte. Dichiarare un peggioramento lì significa insegnare a chi legge
 * che i trend di questo sistema non vogliono dire niente — e da quel
 * momento non guarderà più nemmeno quelli veri.
 *
 * ⚠️ Sono percentuali di lavoro, da confermare con il team medico. Il
 * valore predefinito è volutamente prudente.
 */
const VARIABILITA: Readonly<Record<string, number>> = {
  GLUCOSE_FASTING: 0.07,
  HBA1C: 0.03,
  INSULIN_FASTING: 0.25,
  LDL_CHOLESTEROL: 0.09,
  HDL_CHOLESTEROL: 0.08,
  TRIGLYCERIDES: 0.2,
  CHOLESTEROL_TOTAL: 0.08,
  VITAMIN_D_25OH: 0.12,
  FERRITIN: 0.15,
  TSH: 0.2,
  CRP: 0.4,
  HS_CRP: 0.4,
  ALT: 0.2,
  AST: 0.2,
  GGT: 0.15,
  CREATININE: 0.08,
  TESTOSTERONE_TOTAL: 0.2,
  CORTISOL: 0.3,
  HEMOGLOBIN: 0.04,
  PLATELETS: 0.12,
  WBC: 0.15,
};

const VARIABILITA_PREDEFINITA = 0.15;

/**
 * Quanto un valore dista dal proprio obiettivo.
 *
 * È la funzione che rende generale tutto il resto. Per l'LDL migliorare
 * significa scendere, per l'HDL salire, per il TSH avvicinarsi al mezzo
 * dell'intervallo: tre regole diverse che diventano una sola se invece
 * della direzione si misura **la distanza dall'intervallo obiettivo**.
 *
 * Dentro l'obiettivo la distanza è zero. Fuori, è di quanto si è fuori.
 * Migliorare è ridurre quella distanza — sempre, per ogni esame, senza
 * bisogno di sapere da che parte stia il bene.
 */
export function distanzaDaObiettivo(
  valore: number,
  voce: VoceCatalogo | undefined,
  intervallo: Intervallo,
): number | null {
  // L'obiettivo è la fascia ottimale quando esiste, altrimenti
  // l'intervallo con cui il valore è stato giudicato.
  const [min, max] = voce?.ottimale
    ? voce.ottimale
    : [intervallo.min, intervallo.max];

  if (min === null && max === null) return null;
  if (min !== null && valore < min) return min - valore;
  if (max !== null && valore > max) return valore - max;
  return 0;
}

/**
 * Come si sta muovendo un esame.
 *
 * Servono almeno due misure. Con due si guarda la differenza; con tre o
 * più si guarda anche se il movimento ha una direzione o oscilla — e
 * «altalenante» è un'informazione clinica vera, non un modo di dire che
 * non si è capito.
 */
export function calcolaTrend(
  attuale: Biomarcatore,
  storico: MisuraStorica[],
): Trend {
  const voce = vocePerCanonical(attuale.canonical_name);

  const serie = [
    ...storico
      .filter((m) => m.canonical_name === attuale.canonical_name)
      .map((m) => ({ valore: m.valore, data: m.data })),
    ...(attuale.valore !== null && attuale.data
      ? [{ valore: attuale.valore, data: attuale.data }]
      : attuale.valore !== null
        ? [{ valore: attuale.valore, data: new Date().toISOString().slice(0, 10) }]
        : []),
  ].sort((a, b) => a.data.localeCompare(b.data));

  const base = {
    canonical_name: attuale.canonical_name,
    display_name: attuale.display_name,
    serie,
    unita: attuale.unita,
  };

  if (serie.length < 2) {
    return {
      ...base,
      direzione: "UNKNOWN",
      variazione: null,
      variazionePercentuale: null,
      significativo: false,
    };
  }

  const primo = serie[0];
  const ultimo = serie[serie.length - 1];
  const variazione = Number((ultimo.valore - primo.valore).toFixed(4));
  const variazionePercentuale =
    primo.valore === 0 ? null : Number(((variazione / Math.abs(primo.valore)) * 100).toFixed(1));

  const soglia = VARIABILITA[attuale.canonical_name] ?? VARIABILITA_PREDEFINITA;
  const significativo =
    primo.valore !== 0 && Math.abs(variazione) / Math.abs(primo.valore) > soglia;

  if (!significativo) {
    return { ...base, direzione: "STABLE", variazione, variazionePercentuale, significativo };
  }

  // ── Oscilla o va da qualche parte? ──────────────────────────────
  // Con tre o più misure si contano i cambi di direzione: due passi in
  // avanti e uno indietro non è un trend, è un'oscillazione, e
  // chiamarla miglioramento sarebbe scegliere gli estremi che fanno
  // comodo.
  if (serie.length >= 3) {
    let cambi = 0;
    for (let i = 2; i < serie.length; i += 1) {
      const primaDirezione = Math.sign(serie[i - 1].valore - serie[i - 2].valore);
      const dopoDirezione = Math.sign(serie[i].valore - serie[i - 1].valore);
      if (primaDirezione !== 0 && dopoDirezione !== 0 && primaDirezione !== dopoDirezione) {
        cambi += 1;
      }
    }

    if (cambi >= Math.ceil((serie.length - 2) / 2) && cambi > 0) {
      return {
        ...base,
        direzione: "FLUCTUATING",
        variazione,
        variazionePercentuale,
        significativo,
      };
    }
  }

  // ── Verso l'obiettivo o via da esso ─────────────────────────────
  const distanzaPrima = distanzaDaObiettivo(primo.valore, voce, attuale.intervallo);
  const distanzaDopo = distanzaDaObiettivo(ultimo.valore, voce, attuale.intervallo);

  if (distanzaPrima === null || distanzaDopo === null) {
    // Senza obiettivo non si può dire se un movimento sia un
    // miglioramento. Il movimento c'è ed è significativo: si dichiara
    // quello, e il giudizio lo dà un medico.
    return { ...base, direzione: "UNKNOWN", variazione, variazionePercentuale, significativo };
  }

  if (distanzaDopo < distanzaPrima) {
    return { ...base, direzione: "IMPROVING", variazione, variazionePercentuale, significativo };
  }
  if (distanzaDopo > distanzaPrima) {
    return { ...base, direzione: "WORSENING", variazione, variazionePercentuale, significativo };
  }

  return { ...base, direzione: "STABLE", variazione, variazionePercentuale, significativo };
}

/* ── Intuizioni ───────────────────────────────────────────────────── */

export const GRAVITA = ["INFO", "ATTENZIONE", "RILEVANTE", "CRITICO"] as const;
export type Gravita = (typeof GRAVITA)[number];

export const ETICHETTE_GRAVITA: Record<Gravita, string> = {
  INFO: "Informazione",
  ATTENZIONE: "Da tenere d'occhio",
  RILEVANTE: "Rilevante",
  CRITICO: "Da guardare subito",
};

/**
 * **Un'inferenza del Brain.** Non è un fatto e non è una diagnosi.
 *
 * `prove` non è decorazione: è ciò che rende l'intuizione verificabile
 * in dieci secondi invece che riaprendo il documento. Un supporto
 * decisionale di cui non si vedono le fonti non è un supporto — è
 * un'opinione con l'aria dell'autorevolezza.
 */
export interface Intuizione {
  /** L'osservazione, al presente e senza aggettivi. */
  osservazione: string;
  gravita: Gravita;
  /** I numeri su cui si fonda, così come stanno scritti. */
  prove: string[];
  trend: DirezioneTrend | null;
  confidenza: number;
  /** I biomarcatori toccati, per collegare l'intuizione ai valori. */
  riferimenti: string[];
}

/**
 * **Una possibile lettura clinica.** Sempre al condizionale, sempre
 * separata dall'osservazione che la genera.
 */
export interface Interpretazione {
  intuizione: string;
  /** Cosa *potrebbe* significare. Mai "è", sempre "potrebbe". */
  possibile_lettura: string;
  confidenza: number;
}

/**
 * **Qualcosa che varrebbe la pena guardare.** Non una prescrizione.
 *
 * Il sistema non modifica terapie e non prescrive farmaci: le
 * raccomandazioni che produce sono richieste di attenzione rivolte a un
 * professionista, e il campo `azione` è scritto in modo che non possa
 * essere letto come altro.
 */
export interface Raccomandazione {
  azione: string;
  motivo: string;
  priorita: Gravita;
  riferimenti: string[];
  /** Sempre vero: nessuna raccomandazione di questo motore è esecutiva. */
  richiede_approvazione_clinica: true;
}

/**
 * L'esito completo dell'analisi.
 *
 * La forma è quella che la visione chiede al §29, tradotta: non è testo
 * libero, ed è questo che permette all'interfaccia di distinguere un
 * risultato positivo da uno da rivedere senza leggere una frase.
 */
export interface AnalisiDocumento {
  sintesi: string;
  reperti_positivi: Intuizione[];
  reperti_negativi: Intuizione[];
  aree_da_rivedere: Intuizione[];
  trend: Trend[];
  interpretazioni: Interpretazione[];
  raccomandazioni: Raccomandazione[];
  dati_mancanti: string[];
  confidenza: number;
  richiede_revisione_clinica: boolean;
}

/** Il contesto del paziente. Più se ne sa, meno l'analisi è generica. */
export interface ContestoClinico {
  eta?: number | null;
  sesso?: "M" | "F" | null;
  /** Le misure precedenti, di qualunque documento. */
  storico?: MisuraStorica[];
  /** Gli obiettivi dichiarati dal paziente o dal percorso. */
  obiettivi?: string[];
  /** La terapia in corso già nota alla clinica. */
  terapieInCorso?: string[];
  /** Gli esami che il protocollo della clinica si aspetta di trovare. */
  attesiDalProtocollo?: string[];
}

/* ── L'analisi ────────────────────────────────────────────────────── */

export function analizzaDocumentoStrutturato(
  documento: DocumentoStrutturato,
  contesto: ContestoClinico = {},
): AnalisiDocumento {
  const storico = contesto.storico ?? [];

  const trend = documento.biomarcatori
    .filter((b) => b.valore !== null)
    .map((b) => calcolaTrend(b, storico))
    .filter((t) => t.serie.length >= 2);

  const perTrend = new Map(trend.map((t) => [t.canonical_name, t]));

  const positivi: Intuizione[] = [];
  const negativi: Intuizione[] = [];
  const daRivedere: Intuizione[] = [];
  const interpretazioni: Interpretazione[] = [];
  const raccomandazioni: Raccomandazione[] = [];

  for (const b of documento.biomarcatori) {
    const suo = perTrend.get(b.canonical_name) ?? null;
    const intuizione = intuizioneDa(b, suo);

    // ── Il valore non si è letto ──────────────────────────────────
    if (b.valore === null) {
      daRivedere.push(intuizione);
      raccomandazioni.push({
        azione: `Verificare ${b.display_name} sul documento originale e inserirlo a mano.`,
        motivo: "Il motore non è riuscito a leggere il valore e non lo ha indovinato.",
        priorita: "ATTENZIONE",
        riferimenti: [b.canonical_name],
        richiede_approvazione_clinica: true,
      });
      continue;
    }

    // ── Fuori soglia ──────────────────────────────────────────────
    if (b.stato === "CRITICAL" || b.stato === "HIGH" || b.stato === "LOW") {
      negativi.push(intuizione);

      const lettura = letturaPossibile(b, suo);
      if (lettura) interpretazioni.push(lettura);

      raccomandazioni.push({
        azione: `Rivedere ${b.display_name} nel quadro clinico complessivo del paziente.`,
        motivo: descriviStato(b.stato, b.intervallo, b.unita),
        priorita: b.stato === "CRITICAL" ? "CRITICO" : "RILEVANTE",
        riferimenti: [b.canonical_name],
        richiede_approvazione_clinica: true,
      });
      continue;
    }

    // ── Dentro, ma in movimento ───────────────────────────────────
    if (suo?.direzione === "WORSENING") {
      daRivedere.push(intuizione);
      raccomandazioni.push({
        azione: `Seguire l'andamento di ${b.display_name} al prossimo controllo.`,
        motivo: `Il valore è nell'intervallo ma si sta allontanando dall'obiettivo: ${prosaSerie(suo)}.`,
        priorita: "ATTENZIONE",
        riferimenti: [b.canonical_name],
        richiede_approvazione_clinica: true,
      });
      continue;
    }

    if (suo?.direzione === "IMPROVING" || b.stato === "OPTIMAL") {
      positivi.push(intuizione);
      continue;
    }

    if (b.stato === "BORDERLINE") {
      daRivedere.push(intuizione);
      continue;
    }

    if (b.stato === "UNKNOWN") {
      // Un valore senza riferimento non è né buono né cattivo: è
      // registrato. Metterlo fra i reperti negativi sarebbe un allarme
      // inventato, fra i positivi una rassicurazione inventata.
      daRivedere.push(intuizione);
      continue;
    }

    positivi.push(intuizione);
  }

  // ── Le oscillazioni, che non sono di nessuno dei tre gruppi ─────
  for (const t of trend) {
    if (t.direzione !== "FLUCTUATING") continue;
    if (daRivedere.some((i) => i.riferimenti.includes(t.canonical_name))) continue;
    if (negativi.some((i) => i.riferimenti.includes(t.canonical_name))) continue;

    daRivedere.push({
      osservazione: `${t.display_name} oscilla fra un controllo e l'altro.`,
      gravita: "ATTENZIONE",
      prove: t.serie.map((p) => `${p.valore}${t.unita ? ` ${t.unita}` : ""} (${p.data})`),
      trend: "FLUCTUATING",
      confidenza: 0.8,
      riferimenti: [t.canonical_name],
    });
  }

  // ── Cosa manca ──────────────────────────────────────────────────
  const mancanti = datiMancanti(documento, contesto);

  // ── La sintesi ──────────────────────────────────────────────────
  const sintesi = componiSintesi(documento, positivi, negativi, daRivedere, trend, contesto);

  return {
    sintesi,
    reperti_positivi: positivi,
    reperti_negativi: negativi,
    aree_da_rivedere: daRivedere,
    trend,
    interpretazioni,
    raccomandazioni: ordinaPerPriorita(raccomandazioni),
    dati_mancanti: mancanti,
    confidenza: documento.confidenza_complessiva,
    // Il documento decide, e questo file non lo contraddice: se
    // l'estrazione chiedeva una revisione, il Brain non può assolverla.
    richiede_revisione_clinica:
      documento.richiede_revisione_umana || negativi.length > 0 || mancanti.length > 0,
  };
}

/* ── Le parti ─────────────────────────────────────────────────────── */

function intuizioneDa(b: Biomarcatore, trend: Trend | null): Intuizione {
  const prove: string[] = [];

  if (trend && trend.serie.length >= 2) {
    prove.push(...trend.serie.map((p) => `${p.valore}${b.unita ? ` ${b.unita}` : ""} (${p.data})`));
  } else if (b.valore !== null) {
    prove.push(`${b.valore}${b.unita ? ` ${b.unita}` : ""}`);
  } else {
    prove.push(`«${b.valore_testuale ?? "illeggibile"}» sul documento`);
  }

  // La citazione è sempre l'ultima prova: è la riga del referto, e
  // permette di verificare senza riaprire il file.
  if (b.citazione) prove.push(`riga del documento: «${b.citazione.slice(0, 120)}»`);

  const osservazione =
    b.valore === null
      ? `${b.display_name}: il valore sul documento non è stato letto con sicurezza.`
      : `${b.display_name}: ${b.valore}${b.unita ? ` ${b.unita}` : ""}. ${descriviStato(b.stato, b.intervallo, b.unita)}${
          trend && trend.direzione !== "UNKNOWN" && trend.serie.length >= 2
            ? ` ${prosaTrend(trend)}`
            : ""
        }`;

  return {
    osservazione,
    gravita: gravitaDi(b.stato, trend),
    prove,
    trend: trend?.direzione ?? null,
    confidenza: b.confidenza,
    riferimenti: [b.canonical_name],
  };
}

function gravitaDi(stato: StatoValore, trend: Trend | null): Gravita {
  if (stato === "CRITICAL") return "CRITICO";
  if (stato === "HIGH" || stato === "LOW") return "RILEVANTE";
  if (stato === "BORDERLINE" || trend?.direzione === "WORSENING") return "ATTENZIONE";
  if (stato === "UNKNOWN") return "ATTENZIONE";
  return "INFO";
}

function prosaTrend(trend: Trend): string {
  const quanto =
    trend.variazionePercentuale !== null
      ? ` (${trend.variazionePercentuale > 0 ? "+" : ""}${trend.variazionePercentuale}% dal primo valore)`
      : "";

  switch (trend.direzione) {
    case "IMPROVING":
      return `In miglioramento rispetto ai controlli precedenti${quanto}.`;
    case "WORSENING":
      return `In peggioramento rispetto ai controlli precedenti${quanto}.`;
    case "FLUCTUATING":
      return "Oscilla fra un controllo e l'altro.";
    case "STABLE":
      return "Stabile rispetto ai controlli precedenti.";
    case "UNKNOWN":
      return "";
  }
}

function prosaSerie(trend: Trend): string {
  return trend.serie
    .map((p) => `${p.valore}${trend.unita ? ` ${trend.unita}` : ""} il ${p.data}`)
    .join(", poi ");
}

/**
 * Cosa un valore *potrebbe* voler dire.
 *
 * Tre regole che questa funzione non viola mai:
 *
 *   Non nomina malattie. «Coerente con una carenza» non è una diagnosi;
 *   «il paziente ha una carenza» lo sarebbe.
 *
 *   Non propone terapie. Nemmeno un integratore, nemmeno «valutare una
 *   supplementazione»: è una decisione clinica, e il sistema non la
 *   prende.
 *
 *   Rimanda sempre a un professionista, e il testo lo dice — non lo
 *   lascia dedurre da un'etichetta a piè di pagina.
 */
function letturaPossibile(b: Biomarcatore, trend: Trend | null): Interpretazione | null {
  if (b.valore === null) return null;

  const dove =
    b.intervallo.fonte === "documento"
      ? "rispetto all'intervallo di riferimento del laboratorio"
      : b.intervallo.fonte === "catalogo"
        ? "rispetto al riferimento adottato da Unique"
        : "senza un intervallo di riferimento disponibile";

  const verso =
    b.stato === "LOW" ? "al di sotto" : b.stato === "CRITICAL" ? "oltre la soglia di attenzione" : "al di sopra";

  const andamento =
    trend?.direzione === "WORSENING"
      ? " Il valore si sta allontanando dall'obiettivo rispetto ai controlli precedenti."
      : trend?.direzione === "IMPROVING"
        ? " Il valore si sta avvicinando all'obiettivo rispetto ai controlli precedenti."
        : "";

  return {
    intuizione: `${b.display_name} risulta ${verso} ${dove}.`,
    possibile_lettura: `Potrebbe meritare una valutazione nel contesto clinico complessivo del paziente — anamnesi, terapia in corso, altri parametri correlati.${andamento} La lettura di questo dato spetta al professionista.`,
    confidenza: b.confidenza,
  };
}

/**
 * Cosa il documento non dice, e forse dovrebbe.
 *
 * È una delle informazioni più utili e la meno ovvia da produrre: un
 * referto senza data non si può collocare nel tempo, e un profilo
 * lipidico senza HDL non si può leggere. Segnalare un'assenza è più
 * difficile che commentare una presenza, ed è spesso ciò che sposta la
 * decisione clinica.
 */
function datiMancanti(documento: DocumentoStrutturato, contesto: ContestoClinico): string[] {
  const mancanti: string[] = [];
  const presenti = new Set(documento.biomarcatori.map((b) => b.canonical_name));

  if (!documento.data_documento) {
    mancanti.push("La data dell'esame non è leggibile nel documento.");
  }

  // Gruppi che si leggono insieme: averne uno solo rende l'altro
  // difficile da interpretare.
  const insieme: [string[], string][] = [
    [
      ["LDL_CHOLESTEROL", "HDL_CHOLESTEROL", "TRIGLYCERIDES", "CHOLESTEROL_TOTAL"],
      "Il profilo lipidico è incompleto",
    ],
    [["GLUCOSE_FASTING", "HBA1C"], "Il quadro glicemico è incompleto"],
    [["TSH", "FT4"], "Il quadro tiroideo è incompleto"],
    [["FERRITIN", "IRON_SERUM", "TRANSFERRIN"], "L'assetto marziale è incompleto"],
  ];

  for (const [gruppo, messaggio] of insieme) {
    const trovati = gruppo.filter((c) => presenti.has(c));
    if (trovati.length === 0 || trovati.length === gruppo.length) continue;

    const assenti = gruppo
      .filter((c) => !presenti.has(c))
      .map((c) => vocePerCanonical(c)?.display ?? c);

    mancanti.push(`${messaggio}: manca ${assenti.join(", ")}.`);
  }

  // Ciò che il protocollo della clinica si aspettava e non c'è.
  for (const atteso of contesto.attesiDalProtocollo ?? []) {
    if (presenti.has(atteso)) continue;
    const voce = vocePerCanonical(atteso);
    mancanti.push(
      `${voce?.display ?? atteso}: previsto dal protocollo e non presente in questo documento.`,
    );
  }

  return mancanti;
}

/**
 * La sintesi, scritta a mano.
 *
 * Non la scrive un modello, e non è un limite: una sintesi che dice
 * sempre le stesse cose nello stesso modo si legge in tre secondi
 * perché chi la legge sa già dove guardare. Una sintesi generata è
 * diversa ogni volta, e ogni volta va letta tutta.
 */
function componiSintesi(
  documento: DocumentoStrutturato,
  positivi: Intuizione[],
  negativi: Intuizione[],
  daRivedere: Intuizione[],
  trend: Trend[],
  contesto: ContestoClinico,
): string {
  const quanti = documento.biomarcatori.length;

  if (quanti === 0) {
    return documento.avvertenze.length > 0
      ? `Nessun parametro riconosciuto in questo documento. ${documento.avvertenze[0].messaggio}`
      : "Nessun parametro di laboratorio riconosciuto in questo documento.";
  }

  const parti: string[] = [];

  const quando = documento.data_documento ? ` datati ${documento.data_documento}` : "";
  parti.push(`${quanti} ${quanti === 1 ? "parametro riconosciuto" : "parametri riconosciuti"}${quando}`);

  if (negativi.length > 0) {
    parti.push(
      `${negativi.length} fuori dall'intervallo di riferimento`,
    );
  }
  if (daRivedere.length > 0) parti.push(`${daRivedere.length} da guardare`);
  if (positivi.length > 0 && negativi.length === 0 && daRivedere.length === 0) {
    parti.push("tutti nell'intervallo");
  }

  const migliorati = trend.filter((t) => t.direzione === "IMPROVING");
  const peggiorati = trend.filter((t) => t.direzione === "WORSENING");

  if (migliorati.length > 0) {
    parti.push(
      `in miglioramento: ${migliorati.slice(0, 4).map((t) => t.display_name).join(", ")}`,
    );
  }
  if (peggiorati.length > 0) {
    parti.push(
      `in peggioramento: ${peggiorati.slice(0, 4).map((t) => t.display_name).join(", ")}`,
    );
  }

  let sintesi = `${parti.join("; ")}.`;

  // Il contesto, quando c'è, cambia la lettura: un TSH ai limiti in una
  // persona di trent'anni e in una di ottanta non sono lo stesso dato.
  if (contesto.eta || contesto.obiettivi?.length) {
    const contorno: string[] = [];
    if (contesto.eta) contorno.push(`${contesto.eta} anni`);
    if (contesto.obiettivi?.length) {
      contorno.push(`obiettivi del percorso: ${contesto.obiettivi.slice(0, 3).join(", ")}`);
    }
    sintesi += ` Letto nel contesto del paziente (${contorno.join("; ")}).`;
  }

  if (documento.lettura.via !== "nativo") {
    sintesi += ` Il documento è stato letto con riconoscimento ottico (fiducia ${Math.round(documento.lettura.fiduciaTesto * 100)}%): i valori vanno confrontati con l'originale.`;
  }

  return sintesi;
}

const PESO_PRIORITA: Record<Gravita, number> = {
  CRITICO: 0,
  RILEVANTE: 1,
  ATTENZIONE: 2,
  INFO: 3,
};

function ordinaPerPriorita(raccomandazioni: Raccomandazione[]): Raccomandazione[] {
  return [...raccomandazioni].sort(
    (a, b) => PESO_PRIORITA[a.priorita] - PESO_PRIORITA[b.priorita],
  );
}
