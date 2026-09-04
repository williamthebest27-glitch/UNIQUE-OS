import { formatEuro, formatPercent } from "../format.ts";

/**
 * Comporre la risposta, senza un modello linguistico.
 *
 * Un modello scrive bene e ogni tanto inventa. Qui succede il contrario:
 * le frasi sono meno varie, e non c'è modo che compaia un numero che il
 * database non ha prodotto. Per una control room è lo scambio giusto —
 * chi legge sta per decidere qualcosa, e una cifra plausibile ma falsa
 * costa più di una frase piatta.
 *
 * Tre regole attraversano tutto il file:
 *
 * **Prima il numero, poi il senso.** "Fatturato 21.430 €, +12% sul mese
 * scorso" e poi cosa significa. Mai il contrario.
 *
 * **Null non è zero.** Un costo per lead non calcolabile si dice, non si
 * arrotonda a zero. Zero vorrebbe dire gratis.
 *
 * **Ciò che manca si dichiara.** "Non ho i costi di struttura" è una
 * risposta utile; un margine calcolato senza i costi di struttura è un
 * danno.
 */

export interface RispostaComposta {
  testo: string;
  /** Da dove vengono i numeri: compare sotto la risposta, come per gli strumenti. */
  fonti: string[];
}

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** "settembre 2026", da "2026-09". */
export function nomeMese(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return `${MESI[mese - 1]} ${anno}`;
}

/** "a settembre" se è il mese in corso, "a settembre 2026" altrimenti. */
export function frasePeriodo(periodo: string, oggi: string): string {
  return periodo === oggi.slice(0, 7) ? "questo mese" : `a ${nomeMese(periodo)}`;
}

export function numero(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** "12 visite" / "una visita" / "nessuna visita". */
export function conta(n: number, singolare: string, plurale: string, femminile = false): string {
  if (n === 0) return `${femminile ? "nessuna" : "nessun"} ${singolare}`;
  if (n === 1) return `${femminile ? "una" : "un"} ${singolare}`;
  return `${numero(n)} ${plurale}`;
}

/** "a, b e c". */
export function elenco(voci: string[]): string {
  if (voci.length === 0) return "";
  if (voci.length === 1) return voci[0];
  return `${voci.slice(0, -1).join(", ")} e ${voci.at(-1)}`;
}

export interface Variazione {
  testo: string;
  direzione: "su" | "giu" | "piatta" | "ignota";
}

/**
 * Il confronto con il periodo precedente.
 *
 * Sotto il cinque per cento si dice "in linea": una differenza più
 * piccola del rumore di un mese corto non è una tendenza, e presentarla
 * come tale porta a decidere su niente.
 */
export function variazione(attuale: number, precedente: number | null): Variazione {
  if (precedente === null || precedente === 0) {
    return { testo: "non confrontabile con il mese precedente", direzione: "ignota" };
  }

  const delta = (attuale - precedente) / precedente;

  if (Math.abs(delta) < 0.05) {
    return { testo: "in linea con il mese precedente", direzione: "piatta" };
  }

  return {
    testo: `${delta > 0 ? "+" : "−"}${formatPercent(Math.abs(delta))} sul mese precedente`,
    direzione: delta > 0 ? "su" : "giu",
  };
}

/* ── Andamento ────────────────────────────────────────────────────── */

export interface DatiAndamento {
  periodo: string;
  oggi: string;
  fatturatoCents: number;
  fatturatoPrecedenteCents: number | null;
  visite: number;
  nuoviPazienti: number;
  nuoviMembri: number;
  churn: number;
  lead: number;
  conversione: number;
  margineCents: number;
  margineQuota: number;
  compensiDaLiquidareCents: number;
  collo: { professionista: string; saturazione: number } | null;
  pagamentiFalliti: number;
  proposteInAttesa: number;
}

export function componiAndamento(d: DatiAndamento): RispostaComposta {
  const quando = frasePeriodo(d.periodo, d.oggi);
  const v = variazione(d.fatturatoCents, d.fatturatoPrecedenteCents);

  const righe: string[] = [];

  righe.push(
    `${quando === "questo mese" ? "Questo mese" : `${quando[0].toUpperCase()}${quando.slice(1)}`}: ` +
      `${formatEuro(d.fatturatoCents)} incassati, ${v.testo}. ` +
      `${conta(d.visite, "visita svolta", "visite svolte", true)}, ` +
      `${conta(d.nuoviPazienti, "nuovo paziente", "nuovi pazienti")} e ` +
      `${conta(d.nuoviMembri, "nuova membership", "nuove membership", true)}.`,
  );

  const secondo: string[] = [];
  secondo.push(
    `${conta(d.lead, "lead", "lead")}, con una conversione del ${formatPercent(d.conversione)}`,
  );
  if (d.churn > 0) secondo.push(`${conta(d.churn, "disdetta", "disdette", true)}`);
  secondo.push(`margine ${formatEuro(d.margineCents)} (${formatPercent(d.margineQuota)} del lordo)`);
  righe.push(`${elenco(secondo)}.`);

  const attenzione: string[] = [];
  if (d.collo && d.collo.saturazione > 0.85) {
    attenzione.push(
      `${d.collo.professionista} è al ${formatPercent(d.collo.saturazione)} della capacità: è il collo di bottiglia`,
    );
  }
  if (d.pagamentiFalliti > 0) {
    attenzione.push(
      `${conta(d.pagamentiFalliti, "pagamento fallito", "pagamenti falliti")} da recuperare`,
    );
  }
  if (d.proposteInAttesa > 0) {
    attenzione.push(
      `${conta(d.proposteInAttesa, "proposta in attesa", "proposte in attesa", true)} di autorizzazione`,
    );
  }
  if (d.compensiDaLiquidareCents > 0) {
    attenzione.push(`${formatEuro(d.compensiDaLiquidareCents)} di compensi da liquidare`);
  }

  righe.push(
    attenzione.length > 0
      ? `Da guardare: ${elenco(attenzione)}.`
      : "Niente che richieda attenzione oggi.",
  );

  // Il margine non è il profitto, e chi legge deve saperlo prima di
  // usarlo per decidere.
  righe.push(
    "Il margine è al netto di materiali e compensi, non dei costi di struttura: quelli il sistema non li conosce.",
  );

  return {
    testo: righe.join("\n\n"),
    fonti: [
      `Control Center · ${nomeMese(d.periodo)}`,
      "Motore di unit economics",
      d.collo ? "Motore di capacità" : "",
    ].filter(Boolean),
  };
}

/* ── Marketing ────────────────────────────────────────────────────── */

export interface DatiSpesa {
  periodo: string;
  oggi: string;
  spesaCents: number;
  lead: number;
  pazienti: number;
  cplCents: number | null;
  cacCents: number | null;
  roas: number | null;
  ricavoCents: number;
  campagneAttive: number;
}

export function componiSpesa(d: DatiSpesa): RispostaComposta {
  if (d.campagneAttive === 0) {
    return {
      testo: `Nessuna campagna ha speso ${frasePeriodo(d.periodo, d.oggi)}. Se stai investendo su Meta o Google, la spesa non sta arrivando nel sistema: si importa dall'endpoint di integrazione o si inserisce a mano.`,
      fonti: [`Campagne · ${nomeMese(d.periodo)}`],
    };
  }

  const righe = [
    `${formatEuro(d.spesaCents)} ${frasePeriodo(d.periodo, d.oggi)}, su ${conta(d.campagneAttive, "campagna", "campagne", true)}.`,
    `Hanno prodotto ${conta(d.lead, "lead", "lead")} e ${conta(d.pazienti, "paziente", "pazienti")}: ` +
      `${d.cplCents === null ? "il costo per lead non è ancora calcolabile" : `costo per lead ${formatEuro(d.cplCents)}`}, ` +
      `${d.cacCents === null ? "e nemmeno il costo per paziente" : `costo per paziente ${formatEuro(d.cacCents)}`}.`,
  ];

  if (d.roas !== null) {
    righe.push(
      `Il valore generato da quei lead è ${formatEuro(d.ricavoCents)}: ${numero(d.roas)}× la spesa. ` +
        "Attenzione a come si legge — la spesa è del periodo, il valore è tutto quello che quei lead hanno prodotto, anche dopo.",
    );
  }

  return { testo: righe.join("\n\n"), fonti: [`Campagne e attribuzione · ${nomeMese(d.periodo)}`] };
}

export interface RigaCampagna {
  nome: string;
  canale: string;
  pazienti: number;
  valoreMedioCents: number;
  tassoMembership: number | null;
  cplCents: number | null;
  spesaCents: number;
}

export function componiCampagneQualita(
  campagne: RigaCampagna[],
  periodo: string,
  oggi: string,
): RispostaComposta {
  if (campagne.length === 0) {
    return {
      testo:
        `Nessuna campagna ha ancora portato abbastanza pazienti per dirlo ${frasePeriodo(periodo, oggi)}. ` +
        "Serve qualche conversione in più: su due o tre pazienti la differenza fra una campagna e l'altra è caso, non qualità.",
      fonti: [`Attribuzione · ${nomeMese(periodo)}`],
    };
  }

  const prima = campagne[0];
  const righe = [
    `**${prima.nome}** (${prima.canale}): ${formatEuro(prima.valoreMedioCents)} di valore medio per paziente, ` +
      `su ${conta(prima.pazienti, "paziente", "pazienti")}` +
      `${prima.tassoMembership !== null ? `, e ${formatPercent(prima.tassoMembership)} di loro diventa membro` : ""}.`,
  ];

  if (campagne.length > 1) {
    righe.push(
      "Dietro: " +
        elenco(
          campagne
            .slice(1, 4)
            .map(
              (c) =>
                `${c.nome} (${formatEuro(c.valoreMedioCents)} per paziente, ${c.pazienti})`,
            ),
        ) +
        ".",
    );
  }

  righe.push(
    "La classifica è per valore generato per paziente, non per numero di lead: quella premierebbe chi compra traffico a poco prezzo.",
  );

  return { testo: righe.join("\n\n"), fonti: [`Attribuzione al primo contatto · ${nomeMese(periodo)}`] };
}

export interface RigaScostamento {
  nome: string;
  cplCents: number;
  scarto: number;
}

export function componiCampagneCostose(
  fuori: RigaScostamento[],
  mediaCents: number | null,
  periodo: string,
  oggi: string,
): RispostaComposta {
  if (fuori.length === 0) {
    return {
      testo:
        `Nessuna campagna è sopra la media in modo significativo ${frasePeriodo(periodo, oggi)}` +
        `${mediaCents !== null ? `: il costo per lead medio è ${formatEuro(mediaCents)}` : ""}. ` +
        "Sotto i cinque lead una campagna non viene confrontata: a quei numeri il costo per lead è rumore.",
      fonti: [`Campagne · ${nomeMese(periodo)}`],
    };
  }

  const righe = fuori.map(
    (c) =>
      `**${c.nome}**: ${formatEuro(c.cplCents)} per lead, ${formatPercent(c.scarto)} sopra la media` +
      `${mediaCents !== null ? ` di ${formatEuro(mediaCents)}` : ""}.`,
  );

  righe.push(
    "La media è pesata sulla spesa, non sulle campagne: altrimenti quella da cinquanta euro conterebbe quanto quella da cinquemila.",
  );

  return { testo: righe.join("\n\n"), fonti: [`Campagne · ${nomeMese(periodo)}`] };
}

export interface RigaContenuto {
  titolo: string;
  formato: string;
  angolo: string | null;
  lead: number;
  leadPerMille: number | null;
  engagement: number | null;
}

export function componiContenuti(
  contenuti: RigaContenuto[],
  ricorrenze: { angoli: [string, number][]; formati: [string, number][] },
): RispostaComposta {
  if (contenuti.length === 0) {
    return {
      testo:
        "Non ho contenuti registrati. Le metriche di Instagram e TikTok non arrivano da sole: finché non c'è un'app approvata, i numeri si inseriscono a mano.",
      fonti: ["Contenuti"],
    };
  }

  const righe = [
    "In ordine di resa:",
    contenuti
      .slice(0, 4)
      .map(
        (c) =>
          `· **${c.titolo}** (${c.formato}${c.angolo ? `, ${c.angolo}` : ""}) — ` +
          `${conta(c.lead, "lead", "lead")}` +
          `${c.leadPerMille !== null ? `, ${numero(c.leadPerMille)} ogni mille visualizzazioni` : ""}` +
          `${c.engagement !== null ? `, ${formatPercent(c.engagement, 1)} di coinvolgimento` : ""}`,
      )
      .join("\n"),
  ];

  if (ricorrenze.angoli.length > 0) {
    righe.push(
      `Fra i migliori ricorre l'angolo ${elenco(ricorrenze.angoli.map(([a, n]) => `${a} (${n} volte)`))}` +
        `${ricorrenze.formati.length > 0 ? `, e il formato ${elenco(ricorrenze.formati.map(([f, n]) => `${f} (${n})`))}` : ""}.`,
    );
  }

  righe.push(
    "Il punteggio pesa il coinvolgimento, ma conta di più chi porta persone: un contenuto salvato da mille e che non fa scrivere nessuno ha fatto metà del suo mestiere.",
  );

  return { testo: righe.join("\n\n"), fonti: ["Contenuti organici"] };
}

/* ── Pazienti ─────────────────────────────────────────────────────── */

export interface DatiPazientiFermi {
  quanti: number;
  giorni: number;
  criterio: "visite" | "crediti";
  esempi: { nome: string; giorni: number | null }[];
}

export function componiPazientiFermi(d: DatiPazientiFermi): RispostaComposta {
  const cosa = d.criterio === "crediti" ? "non utilizza crediti" : "non viene in clinica";

  if (d.quanti === 0) {
    return {
      testo: `Nessun paziente ${cosa} da più di ${d.giorni} giorni.`,
      fonti: ["Visite e movimenti crediti"],
    };
  }

  const righe = [
    `${conta(d.quanti, "paziente", "pazienti")} ${cosa} da più di ${d.giorni} giorni.`,
  ];

  if (d.esempi.length > 0) {
    righe.push(
      "I più fermi: " +
        elenco(
          d.esempi
            .slice(0, 5)
            .map((p) => `${p.nome}${p.giorni !== null ? ` (${p.giorni} giorni)` : ""}`),
        ) +
        ".",
    );
  }

  righe.push(
    "Posso preparare i contatti — uno per persona, assegnati alla reception — ma serve la tua autorizzazione, e non parte comunque nessun messaggio: quelli li manda una persona.",
  );

  return { testo: righe.join("\n\n"), fonti: ["Visite e movimenti crediti"] };
}

/* ── Capacità, task, eventi ───────────────────────────────────────── */

export function componiCapacita(d: {
  collo: { professionista: string; saturazione: number } | null;
  membriAttivi: number;
  margineCrescita: { membriAggiuntivi: number; vincolo: string | null };
}): RispostaComposta {
  if (!d.collo) {
    return {
      testo:
        "Non posso calcolare la saturazione: mancano gli orari dei professionisti. Senza quelli la capacità non è misurabile, e preferisco dirlo che stimarla.",
      fonti: ["Motore di capacità"],
    };
  }

  return {
    testo:
      `${d.collo.professionista} è al ${formatPercent(d.collo.saturazione)} della propria capacità: è il vincolo.\n\n` +
      `Con ${conta(d.membriAttivi, "membro attivo", "membri attivi")}, c'è spazio per ` +
      `${conta(d.margineCrescita.membriAggiuntivi, "membro in più", "membri in più")}` +
      `${d.margineCrescita.vincolo ? ` prima che ${d.margineCrescita.vincolo} diventi il limite` : ""}.`,
    fonti: ["Motore di capacità", "Orari e turni"],
  };
}

export function componiTask(d: {
  aperti: number;
  scaduti: number;
  perOrigine: [string, number][];
}): RispostaComposta {
  if (d.aperti === 0) {
    return { testo: "Nessun task aperto.", fonti: ["Task"] };
  }

  return {
    testo:
      `${conta(d.aperti, "task aperto", "task aperti")}` +
      `${d.scaduti > 0 ? `, di cui ${d.scaduti} oltre la scadenza` : ""}.` +
      (d.perOrigine.length > 0
        ? `\n\nPer origine: ${elenco(d.perOrigine.map(([o, n]) => `${o} (${n})`))}.`
        : ""),
    fonti: ["Task"],
  };
}

export function componiEventi(d: {
  giorni: number;
  totale: number;
  principali: [string, number][];
}): RispostaComposta {
  if (d.totale === 0) {
    return {
      testo: `Nessun evento registrato negli ultimi ${d.giorni} giorni.`,
      fonti: ["Registro eventi"],
    };
  }

  return {
    testo:
      `${conta(d.totale, "evento", "eventi")} negli ultimi ${d.giorni} giorni.\n\n` +
      `I più frequenti: ${elenco(d.principali.map(([nome, n]) => `${nome} (${n})`))}.`,
    fonti: ["Registro eventi"],
  };
}

/* ── Knowledge base ───────────────────────────────────────────────── */

export interface VoceTrovata {
  titolo: string;
  slug: string;
  provenienza: string;
  daRiconfermare: boolean;
  estratto: string;
}

export function componiConoscenza(voci: VoceTrovata[], domanda: string): RispostaComposta {
  if (voci.length === 0) {
    return {
      testo:
        `Non trovo niente in knowledge base su "${domanda}". Se è un'informazione che Unique dovrebbe avere, va scritta: finché non c'è, nessuno può rispondere per conto dell'azienda.`,
      fonti: ["Knowledge base"],
    };
  }

  const prima = voci[0];
  const righe = [
    `**${prima.titolo}** — ${prima.provenienza}${prima.daRiconfermare ? " ⚠" : ""}`,
    prima.estratto,
  ];

  if (prima.daRiconfermare) {
    righe.push(
      "Attenzione: questa voce non viene riconfermata da parecchio. Non è detto che sia sbagliata, ma nessuno oggi la garantisce.",
    );
  }

  if (voci.length > 1) {
    righe.push(`Vedi anche: ${elenco(voci.slice(1, 4).map((v) => v.titolo))}.`);
  }

  return { testo: righe.join("\n\n"), fonti: voci.slice(0, 3).map((v) => `Knowledge base · ${v.slug}`) };
}

/* ── Un'azione preparata ──────────────────────────────────────────── */

/**
 * Che cosa si dice dopo aver preparato un'azione.
 *
 * Tre cose, in quest'ordine: cosa succederebbe, che cosa verrebbe
 * toccato, e che finché nessuno autorizza non succede niente. L'ultima
 * frase non è una cortesia — è la differenza fra un sistema che propone e
 * uno che agisce alle spalle di chi lo usa.
 */
export function componiProposta(d: {
  titolo: string;
  sommario: string;
  impatto: string[];
}): RispostaComposta {
  const righe = [`**${d.titolo}**`, d.sommario];

  if (d.impatto.length > 0) {
    righe.push(`Verrebbero toccati: ${elenco(d.impatto.map((s) => s.toLowerCase()))}.`);
  }

  righe.push(
    "L'ho messa in attesa: la trovi in Approvazioni, con l'anteprima calcolata sui dati di adesso. Finché non autorizzi non succede niente.",
  );

  return { testo: righe.join("\n\n"), fonti: ["Sistema di approvazione"] };
}

/* ── Quando non capisce ───────────────────────────────────────────── */

export function componiNonCapito(esempi: string[]): RispostaComposta {
  return {
    testo:
      "Non ho capito la domanda, e preferisco dirtelo invece di indovinare.\n\n" +
      "Ecco cosa so rispondere leggendo i dati:\n" +
      esempi.map((d) => `· ${d}`).join("\n"),
    fonti: [],
  };
}

export function componiAiuto(esempi: string[]): RispostaComposta {
  return {
    testo:
      "Leggo i dati di Unique e rispondo con i numeri veri: fatturato, visite, membership, campagne, contenuti, capacità, pazienti fermi, task, e la knowledge base per prezzi e procedure. Posso anche preparare azioni — un contatto, un aggiornamento di listino — ma le esegui tu, dopo l'anteprima.\n\n" +
      "Per esempio:\n" +
      esempi.map((d) => `· ${d}`).join("\n"),
    fonti: [],
  };
}
