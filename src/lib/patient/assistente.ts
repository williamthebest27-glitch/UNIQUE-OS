/**
 * Chiedi a Unique.
 *
 * L'assistente del paziente **non è un modello linguistico**. Risponde
 * con lo stesso motore proprietario del Brain della direzione: nessuna
 * chiave, nessuna rete, nessun dato che esce. Con dati sanitari questa
 * non è una preferenza tecnica — ogni domanda mandata a un'API esterna è
 * un trasferimento di dati sanitari da giustificare, e qui non c'è niente
 * da giustificare perché non parte niente.
 *
 * Tre regole, in ordine di importanza.
 *
 * **1. Non interpreta.** Una domanda che chiede se un valore è grave, se
 * bisogna preoccuparsi, che malattia sia o quale farmaco prendere non
 * riceve una risposta: riceve il proprio medico. È il confine fra un'app
 * che informa e una che pratica medicina senza titolo.
 *
 * **2. Non inventa.** Ogni risposta nasce da un fatto presente nel
 * contesto. Se il fatto non c'è, la risposta è che non lo sappiamo — non
 * una frase plausibile.
 *
 * **3. Non indovina.** Una domanda che non rientra in ciò che sa fare
 * ottiene un elenco di ciò che sa fare, non un tentativo.
 */

export interface ContestoPaziente {
  nome: string;
  oggi: string;

  score: number | null;
  scorePrecedente: number | null;
  scoreMisuratoIl: string | null;
  pilastri: { etichetta: string; valore: number | null; delta: number | null }[];

  prossimaVisita: { servizio: string; quando: string; professionista: string | null; luogo: string | null } | null;
  visiteInProgramma: number;

  creditiDisponibili: number;
  creditiPrenotati: number;
  membershipPiano: string | null;
  membershipScadeIl: string | null;

  azioniAperte: { titolo: string; scadeIl: string | null }[];
  questionariDaFare: { titolo: string }[];
  documentiNuovi: number;
  messaggiNonLetti: number;

  /** I parametri che si sono mossi di più, già giudicati dalla curva. */
  progressi: { etichetta: string; valore: string; variazione: string | null; miglioramento: boolean }[];
}

export type CategoriaRisposta =
  | "punteggio"
  | "andamento"
  | "appuntamento"
  | "crediti"
  | "membership"
  | "dafare"
  | "risultati"
  | "questionari"
  | "messaggi"
  | "rinvio_medico"
  | "non_so";

export interface RispostaAssistente {
  categoria: CategoriaRisposta;
  testo: string;
  /** Dove andare a vedere di persona. */
  collegamenti: { href: string; etichetta: string }[];
  /** I dati usati per rispondere: chi legge deve poter verificare. */
  fonti: string[];
}

/* ── Lingua ───────────────────────────────────────────────────────── */

function pulisci(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GIORNI = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Rome",
});

const ORA = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

const DATA_BREVE = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

function quando(iso: string): string {
  return `${GIORNI.format(new Date(iso))} alle ${ORA.format(new Date(iso))}`;
}

function numero(valore: number): string {
  return valore.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/* ── Il confine clinico ───────────────────────────────────────────── */

/**
 * Le domande che non hanno risposta qui.
 *
 * L'elenco è deliberatamente largo: fra rispondere di meno e rispondere
 * a una domanda medica, sbagliare per difetto costa un clic in più e
 * sbagliare per eccesso costa la salute di qualcuno.
 */
const CLINICHE: RegExp[] = [
  /\b(grave|preoccup|allarm|pericol)/,
  /\bcosa (significa|vuol dire|comporta)/,
  /\bche (malatt|patolog|problema ho)/,
  /\bdiagnos/,
  /\b(devo|posso) (prendere|assumere|smettere|sospendere)/,
  /\b(farmac|medicin|terapia|integrator|dosagg|posologia)/,
  /\bsintom/,
  /\bho (il |la |un |una )?[a-z]+ (alto|alta|basso|bassa)/,
  /\b(e|sono) (normale|nella norma|fuori norma|alterat)/,
  /\bcurar/,
  /\brischi(o|are)? (di|per)/,
];

/* ── Le intenzioni ────────────────────────────────────────────────── */

interface Regola {
  categoria: CategoriaRisposta;
  quando: RegExp[];
  rispondi: (c: ContestoPaziente) => RispostaAssistente | null;
}

function risposta(
  categoria: CategoriaRisposta,
  testo: string,
  collegamenti: { href: string; etichetta: string }[],
  fonti: string[],
): RispostaAssistente {
  return { categoria, testo, collegamenti, fonti };
}

const REGOLE: Regola[] = [
  {
    categoria: "punteggio",
    quando: [/\b(punteggio|score|longevity)\b/, /\bcome sto\b/, /\bpilastr/],
    rispondi: (c) => {
      if (c.score === null) {
        return risposta(
          "punteggio",
          "Non hai ancora un Unique Longevity Score: viene calcolato dopo il primo pannello di esami.",
          [{ href: "/appuntamenti", etichetta: "Vedi le disponibilità" }],
          ["nessun punteggio registrato"],
        );
      }

      const delta = c.scorePrecedente === null ? null : c.score - c.scorePrecedente;
      const frase =
        delta === null
          ? `Il tuo Unique Longevity Score è ${numero(c.score)} su 100.`
          : delta === 0
            ? `Il tuo Unique Longevity Score è ${numero(c.score)} su 100, come al controllo precedente.`
            : `Il tuo Unique Longevity Score è ${numero(c.score)} su 100: ${delta > 0 ? "+" : "−"}${numero(Math.abs(delta))} punti rispetto al controllo precedente.`;

      const calcolabili = c.pilastri.filter((p) => p.valore !== null);
      const migliore = [...calcolabili].sort((a, b) => (b.valore ?? 0) - (a.valore ?? 0))[0];
      const peggiore = [...calcolabili].sort((a, b) => (a.valore ?? 0) - (b.valore ?? 0))[0];

      const pilastri =
        migliore && peggiore && migliore.etichetta !== peggiore.etichetta
          ? ` Il pilastro più alto è ${migliore.etichetta} (${numero(migliore.valore ?? 0)}), il più basso ${peggiore.etichetta} (${numero(peggiore.valore ?? 0)}).`
          : "";

      const data = c.scoreMisuratoIl ? ` Rilevato il ${DATA_BREVE.format(new Date(c.scoreMisuratoIl))}.` : "";

      return risposta(
        "punteggio",
        `${frase}${data}${pilastri}`,
        [{ href: "/score", etichetta: "Apri il Longevity Score" }],
        ["punteggio e pilastri dell'ultima rilevazione"],
      );
    },
  },

  {
    categoria: "andamento",
    quando: [
      /\b(miglior|peggior|progress|andament|cambiat|migliorando)/,
      /\bdall ?ultim[oa]/,
      /\bcome (sta )?andando\b/,
    ],
    rispondi: (c) => {
      if (c.progressi.length === 0) {
        return risposta(
          "andamento",
          "Non ho ancora due rilevazioni da confrontare: i progressi compaiono dal secondo controllo in poi.",
          [{ href: "/progressi", etichetta: "Apri i progressi" }],
          ["nessuna serie con almeno due misure"],
        );
      }

      const meglio = c.progressi.filter((p) => p.miglioramento);
      const peggio = c.progressi.filter((p) => !p.miglioramento);

      const parti: string[] = [];
      if (meglio.length > 0) {
        parti.push(
          `In miglioramento: ${meglio.map((p) => `${p.etichetta} ${p.valore}${p.variazione ? ` (${p.variazione})` : ""}`).join(", ")}.`,
        );
      }
      if (peggio.length > 0) {
        parti.push(
          `In peggioramento: ${peggio.map((p) => `${p.etichetta} ${p.valore}${p.variazione ? ` (${p.variazione})` : ""}`).join(", ")}.`,
        );
      }
      parti.push("Che cosa significhino per te lo commenta il tuo medico alla prossima visita.");

      return risposta(
        "andamento",
        parti.join(" "),
        [{ href: "/progressi", etichetta: "Apri i progressi" }],
        [`${c.progressi.length} parametri con almeno due misure`],
      );
    },
  },

  {
    categoria: "appuntamento",
    quando: [/\b(appuntament|visita|visite|prenotaz|quando vengo|prossim[ao] volta)/, /\bagenda\b/],
    rispondi: (c) => {
      if (!c.prossimaVisita) {
        return risposta(
          "appuntamento",
          c.creditiDisponibili > 0
            ? `Non hai visite in programma. Hai ${numero(c.creditiDisponibili)} crediti disponibili: puoi prenotare dalle disponibilità aperte.`
            : "Non hai visite in programma.",
          [{ href: "/appuntamenti", etichetta: "Vedi le disponibilità" }],
          ["nessun appuntamento futuro"],
        );
      }

      const v = c.prossimaVisita;
      const dettagli = [v.professionista ? `con ${v.professionista}` : null, v.luogo].filter(Boolean).join(", ");

      return risposta(
        "appuntamento",
        `Il prossimo appuntamento è ${v.servizio}, ${quando(v.quando)}${dettagli ? `, ${dettagli}` : ""}.${
          c.visiteInProgramma > 1 ? ` In tutto hai ${c.visiteInProgramma} visite in programma.` : ""
        }`,
        [{ href: "/appuntamenti", etichetta: "Apri gli appuntamenti" }],
        ["appuntamenti in programma"],
      );
    },
  },

  {
    categoria: "crediti",
    quando: [/\bcredit/, /\bquanti ne ho\b/],
    rispondi: (c) =>
      risposta(
        "crediti",
        `Hai ${numero(c.creditiDisponibili)} crediti disponibili${
          c.creditiPrenotati > 0
            ? ` e ${numero(c.creditiPrenotati)} prenotati sulle visite che hai già fissato`
            : ""
        }.`,
        [{ href: "/crediti", etichetta: "Vedi i movimenti" }],
        ["saldo dei crediti"],
      ),
  },

  {
    categoria: "membership",
    quando: [/\b(membership|piano|abbonament|rinnov|scaden)/],
    rispondi: (c) => {
      if (!c.membershipPiano) {
        return risposta(
          "membership",
          "Non risulta una membership attiva. La segreteria può attivarne una quando vuoi.",
          [{ href: "/crediti", etichetta: "Apri la membership" }],
          ["nessuna membership attiva"],
        );
      }
      return risposta(
        "membership",
        `Il tuo piano è ${c.membershipPiano}${
          c.membershipScadeIl ? `, in scadenza il ${DATA_BREVE.format(new Date(c.membershipScadeIl))}` : ""
        }.`,
        [{ href: "/crediti", etichetta: "Apri la membership" }],
        ["membership attiva"],
      );
    },
  },

  {
    categoria: "dafare",
    quando: [
      /\b(cosa|che cosa) (devo|dovrei|posso) fare/,
      /\bsu cosa (mi )?concentr/,
      /\b(questa settimana|oggi|adesso)\b.*\bfare\b/,
      /\bprossim[oi] pass/,
      /\bpiano\b/,
    ],
    rispondi: (c) => {
      const pezzi: string[] = [];
      if (c.azioniAperte.length > 0) {
        pezzi.push(
          `Nel tuo piano ci sono ${c.azioniAperte.length} ${c.azioniAperte.length === 1 ? "attività aperta" : "attività aperte"}: ${c.azioniAperte
            .slice(0, 3)
            .map((a) => a.titolo)
            .join("; ")}.`,
        );
      }
      if (c.questionariDaFare.length > 0) {
        pezzi.push(`Hai da completare: ${c.questionariDaFare.map((q) => q.titolo).join(", ")}.`);
      }
      if (c.documentiNuovi > 0) {
        pezzi.push(`Ci sono ${c.documentiNuovi} nuovi documenti che non hai ancora aperto.`);
      }
      if (pezzi.length === 0) {
        return risposta(
          "dafare",
          "Non hai nulla in sospeso in questo momento.",
          [{ href: "/piano", etichetta: "Apri il piano" }],
          ["piano, questionari e documenti"],
        );
      }
      return risposta("dafare", pezzi.join(" "), [{ href: "/piano", etichetta: "Apri il piano" }], [
        "piano, questionari e documenti",
      ]);
    },
  },

  {
    categoria: "risultati",
    quando: [/\b(referto|referti|esami|analisi|risultat|valori|document)/],
    rispondi: (c) =>
      risposta(
        "risultati",
        c.documentiNuovi > 0
          ? `Hai ${c.documentiNuovi} ${c.documentiNuovi === 1 ? "documento nuovo" : "documenti nuovi"} da aprire. I valori vengono letti e validati dal tuo medico prima di entrare nel punteggio.`
          : "Non ci sono documenti nuovi. Trovi tutti i tuoi referti e i valori nell'area risultati.",
        [
          { href: "/risultati", etichetta: "Apri i risultati" },
          { href: "/documenti", etichetta: "Apri i documenti" },
        ],
        ["documenti non ancora aperti"],
      ),
  },

  {
    categoria: "questionari",
    quando: [/\bquestionar/, /\bassessment/, /\bdomande da\b/],
    rispondi: (c) =>
      risposta(
        "questionari",
        c.questionariDaFare.length === 0
          ? "Non hai questionari in sospeso."
          : `Hai ${c.questionariDaFare.length} ${c.questionariDaFare.length === 1 ? "questionario" : "questionari"} da completare: ${c.questionariDaFare.map((q) => q.titolo).join(", ")}.`,
        [{ href: "/questionari", etichetta: "Apri i questionari" }],
        ["questionari assegnati"],
      ),
  },

  {
    categoria: "messaggi",
    quando: [/\bmessagg/, /\bscriver/, /\bcontattar/, /\bsegreteria\b/],
    rispondi: (c) =>
      risposta(
        "messaggi",
        c.messaggiNonLetti > 0
          ? `Hai ${c.messaggiNonLetti} ${c.messaggiNonLetti === 1 ? "messaggio non letto" : "messaggi non letti"}. Puoi rispondere dalla stessa pagina.`
          : "Non hai messaggi da leggere. Da lì puoi scrivere alla clinica quando vuoi.",
        [{ href: "/messaggi", etichetta: "Apri i messaggi" }],
        ["messaggi non letti"],
      ),
  },
];

/* ── L'ingresso ───────────────────────────────────────────────────── */

/** Le domande di esempio, quelle che l'assistente sa davvero reggere. */
export const DOMANDE_ESEMPIO = [
  "Come sto andando?",
  "Qual è il mio Longevity Score?",
  "Quando è il prossimo appuntamento?",
  "Quanti crediti ho?",
  "Cosa devo fare questa settimana?",
  "Che cosa è cambiato dall'ultimo controllo?",
] as const;

export function rispondi(domanda: string, contesto: ContestoPaziente): RispostaAssistente {
  const testo = pulisci(domanda);

  if (testo.length === 0) {
    return risposta("non_so", "Scrivi una domanda e provo a risponderti.", [], []);
  }

  // Il confine clinico si valuta per primo: una domanda che chiede un
  // giudizio medico non deve poter cadere in un'altra regola solo perché
  // contiene la parola "punteggio".
  if (CLINICHE.some((r) => r.test(testo))) {
    return risposta(
      "rinvio_medico",
      "Questa è una domanda per il tuo medico, non per me. Io ti mostro i dati; a interpretarli è chi ti segue. Puoi scrivergli da qui e ti risponde lui.",
      [
        { href: "/messaggi", etichetta: "Scrivi al tuo medico" },
        { href: "/appuntamenti", etichetta: "Prenota una visita" },
      ],
      [],
    );
  }

  for (const regola of REGOLE) {
    if (!regola.quando.some((r) => r.test(testo))) continue;
    const esito = regola.rispondi(contesto);
    if (esito) return esito;
  }

  return risposta(
    "non_so",
    "Non ho abbastanza informazioni per rispondere. Posso dirti il tuo punteggio, come stai andando, quando è il prossimo appuntamento, quanti crediti hai e cosa ti resta da fare.",
    [{ href: "/messaggi", etichetta: "Scrivi alla clinica" }],
    [],
  );
}
