import { METRIC_DEFINITIONS, type MetricDefinition } from "../score/metrics.ts";
import { normalize } from "../score/engine.ts";

/**
 * Il copilot clinico, senza modello linguistico.
 *
 * Le domande che un professionista fa davanti a una cartella sono poche e
 * si somigliano: cosa è peggiorato, cosa è migliorato, come è andato lo
 * Score, cosa manca, com'è quel valore lì. Sono domande di **confronto**,
 * e un confronto è aritmetica su dati già strutturati — non serve un
 * modello, servono le misure e la curva con cui lo Score le valuta.
 *
 * "Peggiorato" qui ha un significato preciso: il punteggio che quella
 * metrica ottiene sulla propria curva di normalizzazione è sceso. Non è
 * un giudizio clinico ed è importante che non lo sembri — è la stessa
 * curva che alimenta il Longevity Score, quindi almeno è coerente con il
 * resto del sistema, e i suoi limiti sono scritti in
 * `docs/longevity-score.md`.
 *
 * Nessuna diagnosi, nessuna terapia, nessun dosaggio: qui si dice cosa i
 * dati mostrano e cosa merita attenzione. Il confine è lo stesso che
 * aveva il prompt del modello, e qui è codice.
 */

export type IdDomandaCartella =
  | "peggiorati"
  | "migliorati"
  | "confronto"
  | "sintesi"
  | "mancanti"
  | "score"
  | "valore"
  | "aiuto";

export interface DomandaCartella {
  id: IdDomandaCartella;
  /** La metrica nominata nella domanda, quando ce n'è una. */
  metrica?: string;
}

/* ── Riconoscere la domanda ───────────────────────────────────────── */

function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REGOLE: { id: IdDomandaCartella; parole: string[]; peso: number }[] = [
  { id: "peggiorati", parole: ["peggior", "in calo", "sceso", "scesi", "declino", "va peggio"], peso: 3 },
  { id: "migliorati", parole: ["miglior", "in crescita", "salito", "saliti", "va meglio", "progress"], peso: 3 },
  { id: "mancanti", parole: ["manca", "mancano", "mancanti", "non abbiamo", "da richiedere", "copertura", "incompleto"], peso: 3 },
  { id: "confronto", parole: ["confronta", "confronto", "differenza", "rispetto a", "ultimi due", "cambiato"], peso: 2 },
  { id: "sintesi", parole: ["sintesi", "riassum", "riassunto", "prima della visita", "prepara", "panoramica", "situazione"], peso: 2 },
  { id: "score", parole: ["score", "punteggio", "longevity", "pilastr"], peso: 1 },
  { id: "aiuto", parole: ["cosa sai", "cosa puoi", "aiuto", "come funzioni"], peso: 4 },
];

/**
 * Che cosa è stato chiesto sulla cartella.
 *
 * L'ultima possibilità è la più utile in clinica: se la domanda nomina un
 * esame — "com'è l'LDL?", "la glicata?" — è una domanda su quel valore,
 * qualunque sia il verbo intorno.
 */
export function riconosciDomandaCartella(testo: string): DomandaCartella | null {
  const t = normalizza(testo);
  if (t.length < 2) return null;

  let migliore: DomandaCartella | null = null;
  let punteggio = 0;

  for (const regola of REGOLE) {
    if (!regola.parole.some((p) => t.includes(p))) continue;
    if (regola.peso > punteggio) {
      punteggio = regola.peso;
      migliore = { id: regola.id };
    }
  }

  const nominata = metricaNominata(t);
  if (nominata) {
    // "Com'è peggiorata la glicata?" resta una domanda sulla glicata: il
    // valore singolo con il suo storico risponde meglio di un elenco.
    return migliore && migliore.id !== "score"
      ? { id: migliore.id, metrica: nominata }
      : { id: "valore", metrica: nominata };
  }

  return migliore;
}

function metricaNominata(testoNormalizzato: string): string | undefined {
  const candidati = METRIC_DEFINITIONS.flatMap((m) =>
    [...(m.aliases ?? []), m.label].map((alias) => ({ code: m.code, alias: alias.toLowerCase() })),
  )
    .filter((c) => c.alias.length >= 3)
    .sort((a, b) => b.alias.length - a.alias.length);

  return candidati.find((c) => testoNormalizzato.includes(c.alias))?.code;
}

/* ── Confrontare le misure ────────────────────────────────────────── */

export interface MisuraStorica {
  code: string;
  value: number;
  measuredOn: string;
}

export interface Variazione {
  code: string;
  label: string;
  unit: string;
  attuale: number;
  attualeIl: string;
  precedente: number | null;
  precedenteIl: string | null;
  /** Differenza sul valore grezzo. */
  deltaValore: number | null;
  /**
   * Differenza sul punteggio della metrica, 0–100.
   *
   * È questo a dire "migliorato" o "peggiorato", non il valore grezzo:
   * per la glicemia scendere è meglio, per il colesterolo HDL è peggio, e
   * la curva lo sa già.
   */
  deltaPunteggio: number | null;
  direzione: "migliorato" | "peggiorato" | "stabile" | "primo";
  fuoriSoglia: boolean;
}

/** Sotto questa differenza di punteggio non si parla di tendenza. */
export const SOGLIA_VARIAZIONE = 3;

export function confrontaMisure(misure: readonly MisuraStorica[]): Variazione[] {
  const perMetrica = new Map<string, MisuraStorica[]>();
  for (const m of misure) {
    perMetrica.set(m.code, [...(perMetrica.get(m.code) ?? []), m]);
  }

  const variazioni: Variazione[] = [];

  for (const [code, elenco] of perMetrica) {
    const metrica = METRIC_DEFINITIONS.find((d) => d.code === code);
    if (!metrica) continue;

    const ordinate = [...elenco].sort((a, b) => b.measuredOn.localeCompare(a.measuredOn));
    const attuale = ordinate[0];
    const precedente = ordinate[1] ?? null;

    const deltaPunteggio = precedente
      ? Math.round(normalize(metrica, attuale.value) - normalize(metrica, precedente.value))
      : null;

    variazioni.push({
      code,
      label: metrica.label,
      unit: metrica.unit,
      attuale: attuale.value,
      attualeIl: attuale.measuredOn,
      precedente: precedente?.value ?? null,
      precedenteIl: precedente?.measuredOn ?? null,
      deltaValore: precedente ? Number((attuale.value - precedente.value).toFixed(2)) : null,
      deltaPunteggio,
      direzione: direzioneDi(deltaPunteggio),
      fuoriSoglia: metrica.clinicalAlert?.(attuale.value) ?? false,
    });
  }

  return variazioni;
}

function direzioneDi(deltaPunteggio: number | null): Variazione["direzione"] {
  if (deltaPunteggio === null) return "primo";
  if (deltaPunteggio >= SOGLIA_VARIAZIONE) return "migliorato";
  if (deltaPunteggio <= -SOGLIA_VARIAZIONE) return "peggiorato";
  return "stabile";
}

/** Le metriche previste dal catalogo che non hanno nessuna misura. */
export function metricheMancanti(
  misure: readonly MisuraStorica[],
  soloFonte?: MetricDefinition["source"],
): MetricDefinition[] {
  const presenti = new Set(misure.map((m) => m.code));
  return METRIC_DEFINITIONS.filter(
    (m) => !presenti.has(m.code) && (!soloFonte || m.source === soloFonte),
  );
}

/* ── Comporre la risposta ─────────────────────────────────────────── */

export interface RispostaCartella {
  testo: string;
  /** Le misure citate: valore e data, per verificare senza fidarsi. */
  fonti: { kind: string; label: string; date: string | null }[];
}

function citazione(v: Variazione): string {
  const base = `${v.label} ${formattaValore(v.attuale)} ${v.unit} il ${v.attualeIl}`;
  if (v.precedente === null) return `${base} (prima rilevazione)`;
  return `${base}, era ${formattaValore(v.precedente)} il ${v.precedenteIl}`;
}

function formattaValore(v: number): string {
  return v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function fonte(v: Variazione) {
  return {
    kind: "misura",
    label: `${v.label}: ${formattaValore(v.attuale)} ${v.unit}`,
    date: v.attualeIl,
  };
}

export function componiPeggiorati(variazioni: readonly Variazione[]): RispostaCartella {
  const peggiorati = variazioni
    .filter((v) => v.direzione === "peggiorato")
    .sort((a, b) => (a.deltaPunteggio ?? 0) - (b.deltaPunteggio ?? 0));

  const confrontabili = variazioni.filter((v) => v.precedente !== null).length;

  if (confrontabili === 0) {
    return {
      testo:
        "Non ci sono confronti possibili: ogni parametro ha una sola rilevazione. Serve un secondo controllo per parlare di andamento.",
      fonti: [],
    };
  }

  if (peggiorati.length === 0) {
    return {
      testo: `Nessun parametro è peggiorato in modo significativo fra le ultime due rilevazioni, su ${confrontabili} confrontabili.`,
      fonti: [],
    };
  }

  const righe = peggiorati.map(
    (v) =>
      `· ${citazione(v)} — ${Math.abs(v.deltaPunteggio ?? 0)} punti sulla curva${v.fuoriSoglia ? ", **fuori soglia clinica**" : ""}`,
  );

  return {
    testo:
      `${peggiorati.length} ${peggiorati.length === 1 ? "parametro peggiorato" : "parametri peggiorati"}, su ${confrontabili} confrontabili:\n\n` +
      righe.join("\n"),
    fonti: peggiorati.map(fonte),
  };
}

export function componiMigliorati(variazioni: readonly Variazione[]): RispostaCartella {
  const migliorati = variazioni
    .filter((v) => v.direzione === "migliorato")
    .sort((a, b) => (b.deltaPunteggio ?? 0) - (a.deltaPunteggio ?? 0));

  if (migliorati.length === 0) {
    return {
      testo: "Nessun parametro è migliorato in modo significativo fra le ultime due rilevazioni.",
      fonti: [],
    };
  }

  return {
    testo:
      `${migliorati.length} ${migliorati.length === 1 ? "parametro migliorato" : "parametri migliorati"}:\n\n` +
      migliorati
        .map((v) => `· ${citazione(v)} — +${v.deltaPunteggio} punti sulla curva`)
        .join("\n"),
    fonti: migliorati.map(fonte),
  };
}

export function componiConfronto(variazioni: readonly Variazione[]): RispostaCartella {
  const confrontabili = variazioni.filter((v) => v.precedente !== null);

  if (confrontabili.length === 0) {
    return {
      testo: "C'è una sola rilevazione per ogni parametro: non c'è ancora niente da confrontare.",
      fonti: [],
    };
  }

  const mossi = confrontabili
    .filter((v) => v.direzione !== "stabile")
    .sort((a, b) => Math.abs(b.deltaPunteggio ?? 0) - Math.abs(a.deltaPunteggio ?? 0));

  const stabili = confrontabili.length - mossi.length;

  const righe = mossi
    .slice(0, 10)
    .map(
      (v) =>
        `· ${citazione(v)} — ${(v.deltaPunteggio ?? 0) > 0 ? "+" : ""}${v.deltaPunteggio} punti`,
    );

  return {
    testo:
      `Fra le ultime due rilevazioni si sono mossi ${mossi.length} parametri su ${confrontabili.length}` +
      `${stabili > 0 ? `; gli altri ${stabili} sono stabili` : ""}.\n\n` +
      righe.join("\n"),
    fonti: mossi.slice(0, 10).map(fonte),
  };
}

export function componiValore(
  variazione: Variazione | undefined,
  nomeChiesto: string,
): RispostaCartella {
  if (!variazione) {
    return {
      testo: `Non ho nessuna misura di ${nomeChiesto} in cartella. Se l'esame è stato fatto, il referto non è ancora stato caricato o il valore non è stato approvato.`,
      fonti: [],
    };
  }

  const andamento =
    variazione.precedente === null
      ? "È la prima rilevazione: non c'è un andamento da leggere."
      : variazione.direzione === "stabile"
        ? "Stabile rispetto alla rilevazione precedente."
        : `${variazione.direzione === "migliorato" ? "In miglioramento" : "In peggioramento"}: ${Math.abs(variazione.deltaPunteggio ?? 0)} punti sulla curva.`;

  return {
    testo:
      `${citazione(variazione)}.\n\n${andamento}` +
      (variazione.fuoriSoglia
        ? "\n\nIl valore è oltre la soglia di rilevanza clinica: va guardato da un medico."
        : ""),
    fonti: [fonte(variazione)],
  };
}

export interface DatiSintesi {
  score: number | null;
  scoreIl: string | null;
  scorePrecedente: number | null;
  copertura: number | null;
  pilastriDeboli: { label: string; valore: number }[];
  variazioni: readonly Variazione[];
  mancantiDiLaboratorio: number;
  ultimaVisita: { servizio: string; quando: string } | null;
  documentiRecenti: number;
}

export function componiSintesiCartella(d: DatiSintesi): RispostaCartella {
  const righe: string[] = [];

  if (d.score !== null) {
    const delta =
      d.scorePrecedente !== null ? d.score - d.scorePrecedente : null;
    righe.push(
      `Longevity Score ${d.score}${d.scoreIl ? ` al ${d.scoreIl}` : ""}` +
        (delta !== null
          ? `, ${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)} rispetto al precedente`
          : "") +
        (d.copertura !== null
          ? `. Calcolato sul ${Math.round(d.copertura * 100)}% dei parametri previsti`
          : "") +
        ".",
    );
  } else {
    righe.push("Nessun Longevity Score calcolato: mancano i dati per farlo.");
  }

  const peggiorati = d.variazioni.filter((v) => v.direzione === "peggiorato");
  const fuoriSoglia = d.variazioni.filter((v) => v.fuoriSoglia);

  if (fuoriSoglia.length > 0) {
    righe.push(
      `Fuori soglia clinica: ${fuoriSoglia.map((v) => `${v.label} ${formattaValore(v.attuale)} ${v.unit} (${v.attualeIl})`).join(", ")}.`,
    );
  }

  if (peggiorati.length > 0) {
    righe.push(
      `In peggioramento: ${peggiorati.map((v) => `${v.label} da ${formattaValore(v.precedente ?? 0)} a ${formattaValore(v.attuale)}`).join(", ")}.`,
    );
  }

  if (d.pilastriDeboli.length > 0) {
    righe.push(
      `Pilastri più bassi: ${d.pilastriDeboli.map((p) => `${p.label} ${p.valore}`).join(", ")}.`,
    );
  }

  const daVerificare: string[] = [];
  if (d.mancantiDiLaboratorio > 0) {
    daVerificare.push(
      `${d.mancantiDiLaboratorio} parametri di laboratorio previsti non sono mai stati misurati`,
    );
  }
  if (d.ultimaVisita) {
    righe.push(`Ultima visita: ${d.ultimaVisita.servizio}, ${d.ultimaVisita.quando}.`);
  } else {
    daVerificare.push("nessuna visita registrata");
  }
  if (d.documentiRecenti > 0) {
    righe.push(`${d.documentiRecenti} documenti caricati di recente.`);
  }

  if (daVerificare.length > 0) {
    righe.push(`Da verificare: ${daVerificare.join("; ")}.`);
  }

  righe.push(
    "Questa è una lettura dei dati in cartella, non un giudizio clinico: nessuna diagnosi, nessuna indicazione terapeutica.",
  );

  return {
    testo: righe.join("\n\n"),
    fonti: [
      ...(d.score !== null
        ? [{ kind: "punteggio", label: `Longevity Score ${d.score}`, date: d.scoreIl }]
        : []),
      ...fuoriSoglia.map(fonte),
    ],
  };
}

export function componiMancanti(mancanti: readonly MetricDefinition[]): RispostaCartella {
  if (mancanti.length === 0) {
    return { testo: "Tutti i parametri previsti dal catalogo hanno almeno una misura.", fonti: [] };
  }

  const perFonte = new Map<string, string[]>();
  for (const m of mancanti) {
    perFonte.set(m.source, [...(perFonte.get(m.source) ?? []), m.label]);
  }

  const ETICHETTE: Record<string, string> = {
    lab: "esami di laboratorio",
    body_scan: "composizione corporea",
    vitals: "parametri vitali",
    anamnesis: "anamnesi",
    questionnaire: "questionari",
    activity: "attività",
    ecg: "ECG",
    spirometry: "spirometria",
    stress_test: "test da sforzo",
    wearable: "dispositivi indossabili",
    professional: "valutazione professionale",
  };

  return {
    testo:
      `Mancano ${mancanti.length} parametri fra quelli previsti:\n\n` +
      [...perFonte.entries()]
        .map(([fonteId, voci]) => `· ${ETICHETTE[fonteId] ?? fonteId}: ${voci.join(", ")}`)
        .join("\n") +
      "\n\nUn pilastro senza dati sufficienti non viene calcolato: resta non disponibile, e non conta come punteggio basso.",
    fonti: [],
  };
}

export const DOMANDE_CARTELLA: string[] = [
  "Quali parametri sono peggiorati?",
  "Cosa è migliorato dall'ultimo controllo?",
  "Confronta le ultime due rilevazioni",
  "Preparami una sintesi prima della visita",
  "Cosa manca per completare lo Score?",
  "Com'è la glicata?",
];

export function componiAiutoCartella(): RispostaCartella {
  return {
    testo:
      "Leggo la cartella e rispondo confrontando le misure: cosa è peggiorato o migliorato, il confronto fra le ultime due rilevazioni, una sintesi prima della visita, cosa manca allo Score, e il valore di un singolo esame con il suo andamento.\n\n" +
      "Ogni risposta cita valore e data. Non formulo diagnosi né indicazioni terapeutiche.\n\n" +
      DOMANDE_CARTELLA.map((d) => `· ${d}`).join("\n"),
    fonti: [],
  };
}
