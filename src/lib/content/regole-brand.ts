/**
 * Il controllo di conformità di un contenuto.
 *
 * Questo è il lavoro che il codice fa **meglio** di un modello, e conviene
 * dirlo chiaramente: un modello a cui si chiede di non promettere
 * guarigioni non lo promette quasi sempre. Un controllo a regole lo
 * verifica tutte le volte, sullo stesso testo dà sempre la stessa
 * risposta, e non si stanca alla ventesima variante di un carosello.
 *
 * In sanità la differenza non è accademica. Un claim di guarigione in un
 * contenuto di una clinica non è una svista di stile: è pubblicità
 * sanitaria ingannevole, e la responsabilità è di chi pubblica.
 *
 * Le regole qui sotto rispecchiano la voce `marketing-linee-guida` della
 * knowledge base, che resta la fonte per le persone. Vivono in codice
 * perché un controllo deve poter essere eseguito, non letto.
 */

export type Gravita = "blocco" | "attenzione";

export interface Segnalazione {
  gravita: Gravita;
  /** Quale regola è stata toccata. */
  regola: string;
  /** Il pezzo di testo che l'ha fatta scattare, per trovarlo subito. */
  estratto: string;
  /** Perché è un problema, in una riga. */
  perche: string;
}

interface Regola {
  nome: string;
  gravita: Gravita;
  schema: RegExp;
  perche: string;
}

/**
 * `blocco` è ciò che non si pubblica: promesse cliniche, confronti con
 * altri centri, urgenza artificiale. `attenzione` è ciò che va guardato:
 * un numero senza fonte può andare benissimo, se la fonte esiste.
 */
const REGOLE: Regola[] = [
  {
    nome: "promessa di guarigione",
    gravita: "blocco",
    schema: /\b(guaris[ce]|guarigione|guarire|cura definitiva|risolve definitivamente|debell)/i,
    perche:
      "Una clinica non promette guarigioni. È pubblicità sanitaria ingannevole, e la responsabilità è di chi pubblica.",
  },
  {
    nome: "prevenzione garantita",
    gravita: "blocco",
    schema: /\b(previen[ei]|prevenzione garantita|eviti(?:\s+\w+)?\s+(?:la|il|le)\s+malattia|zero rischi|senza rischi)/i,
    perche: "Nessun percorso garantisce che una malattia non arrivi. Si può misurare il rischio, non annullarlo.",
  },
  {
    nome: "diagnosi in un contenuto",
    gravita: "blocco",
    schema: /\b(diagnostichiamo|ti diciamo se hai|scopri se hai|diagnosi (?:immediata|in un'ora|rapida))/i,
    perche: "La diagnosi si fa in visita, non in un post. Il brand book lo vieta esplicitamente.",
  },
  {
    nome: "confronto con altri centri",
    gravita: "blocco",
    schema: /\b(a differenza (?:di|degli) altri|meglio (?:di|degli) altri centr|l'unico centro|nessun altro centro|rispetto (?:agli|ad) altri centr)/i,
    perche: "Il brand non si posiziona contro qualcun altro. Anche quando è vero, invecchia male.",
  },
  {
    nome: "urgenza artificiale",
    gravita: "blocco",
    schema: /\b(ultimi posti|solo per oggi|affrettati|scade (?:oggi|stasera)|non perdere questa|posti limitati)/i,
    perche: "L'urgenza inventata è l'opposto del tono di voce: qui si comunica un metodo, non una promozione.",
  },
  {
    nome: "superlativo assoluto",
    gravita: "attenzione",
    schema: /\b(il migliore|la migliore|il più avanzat|rivoluzionari|miracol|straordinari|incredibil)/i,
    perche: "Niente superlativi: il tono di voce è diretto e competente, mai enfatico.",
  },
  {
    nome: "promessa a tempo",
    gravita: "attenzione",
    schema: /\b(?:in|entro)\s+\d+\s*(?:giorni|settimane|mesi)\b[^.]{0,40}\b(?:risultat|perd|miglior|trasform)/i,
    perche: "Un risultato promesso entro una data è una promessa clinica travestita da marketing.",
  },
  {
    nome: "testimonianza clinica",
    gravita: "attenzione",
    schema: /\b(prima e dopo|il caso di [A-Z]|paziente di \d+ anni che)/i,
    perche: "Le testimonianze cliniche di persone riconoscibili non si usano.",
  },
];

/** Le call to action riconoscibili: se ce n'è più d'una, il contenuto ne ha zero. */
const CHIAMATE = [
  /\bprenota\b/i,
  /\bscrivic\w*\b/i,
  /\bchiamac\w*\b/i,
  /\bcompila\b/i,
  /\biscrivit\w*\b/i,
  /\bscopri di più\b/i,
  /\bcontattac\w*\b/i,
  /\bclicca\b/i,
];

export interface ContestoControllo {
  /**
   * I prezzi che possono comparire, in centesimi, presi dal listino in
   * vigore. Un prezzo che non è qui dentro è un prezzo inventato — ed è
   * l'errore più caro che un contenuto possa contenere.
   */
  prezziAmmessiCents?: number[];
  /** Massimo di caratteri sensato per il formato, quando ce n'è uno. */
  massimoCaratteri?: number;
}

export function controllaContenuto(
  testo: string,
  contesto: ContestoControllo = {},
): Segnalazione[] {
  const segnalazioni: Segnalazione[] = [];

  for (const regola of REGOLE) {
    const trovato = testo.match(regola.schema);
    if (!trovato) continue;
    segnalazioni.push({
      gravita: regola.gravita,
      regola: regola.nome,
      estratto: contorno(testo, trovato.index ?? 0, trovato[0].length),
      perche: regola.perche,
    });
  }

  /* ── Una sola call to action ────────────────────────────────── */
  const chiamateTrovate = CHIAMATE.filter((c) => c.test(testo));
  if (chiamateTrovate.length > 1) {
    segnalazioni.push({
      gravita: "attenzione",
      regola: "più di una call to action",
      estratto: chiamateTrovate.map((c) => testo.match(c)?.[0] ?? "").join(", "),
      perche: "Due call to action in un contenuto sono zero: chi legge non sceglie, se ne va.",
    });
  }

  /* ── I prezzi vengono dal listino ───────────────────────────── */
  if (contesto.prezziAmmessiCents) {
    const ammessi = new Set(contesto.prezziAmmessiCents);
    for (const prezzo of testo.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)\s*(?:€|euro)/gi)) {
      const cents = Math.round(
        Number(prezzo[1].replace(/[.\s]/g, "").replace(",", ".")) * 100,
      );
      // I numeri interi senza decimali sono già in euro; qui il valore è
      // stato letto in euro e portato in centesimi.
      if (!ammessi.has(cents)) {
        segnalazioni.push({
          gravita: "blocco",
          regola: "prezzo fuori listino",
          estratto: prezzo[0],
          perche:
            "Questo prezzo non è nel listino in vigore. Un prezzo sbagliato in un contenuto è una promessa commerciale che qualcuno verrà a riscuotere.",
        });
      }
    }
  }

  /* ── Numeri senza fonte ─────────────────────────────────────── */
  for (const percentuale of testo.matchAll(/\b\d{1,3}\s?%/g)) {
    const intorno = contorno(testo, percentuale.index ?? 0, percentuale[0].length, 120);
    if (!/\b(studio|studi|ricerca|fonte|secondo|pubblicat|rivista|jama|lancet|nejm)\b/i.test(intorno)) {
      segnalazioni.push({
        gravita: "attenzione",
        regola: "percentuale senza fonte",
        estratto: percentuale[0],
        perche:
          "Ogni affermazione scientifica deve poter risalire a uno studio citabile. Se la fonte non si trova, si cambia la frase.",
      });
    }
  }

  /* ── Emoji a fine riga ──────────────────────────────────────── */
  const conEmoji = testo
    .split(/\r?\n/)
    .find((r) => /[\p{Extended_Pictographic}]\s*$/u.test(r.trim()) && r.trim().length > 0);
  if (conEmoji) {
    segnalazioni.push({
      gravita: "attenzione",
      regola: "emoji a fine riga",
      estratto: conEmoji.trim().slice(-40),
      perche: "Il tono di voce non usa emoji come punteggiatura.",
    });
  }

  /* ── Lunghezza ──────────────────────────────────────────────── */
  if (contesto.massimoCaratteri && testo.length > contesto.massimoCaratteri) {
    segnalazioni.push({
      gravita: "attenzione",
      regola: "troppo lungo per il formato",
      estratto: `${testo.length} caratteri`,
      perche: `Per questo formato ne bastano ${contesto.massimoCaratteri}: una frase in meno è quasi sempre meglio di una in più.`,
    });
  }

  return segnalazioni;
}

/** Il testo intorno a una corrispondenza, per farla trovare a occhio. */
function contorno(testo: string, indice: number, lunghezza: number, ampiezza = 40): string {
  const da = Math.max(0, indice - ampiezza);
  const a = Math.min(testo.length, indice + lunghezza + ampiezza);
  return `${da > 0 ? "…" : ""}${testo.slice(da, a).trim()}${a < testo.length ? "…" : ""}`;
}

/** Vero se il contenuto può essere pubblicato senza modifiche obbligate. */
export function pubblicabile(segnalazioni: readonly Segnalazione[]): boolean {
  return !segnalazioni.some((s) => s.gravita === "blocco");
}
