/**
 * Un lettore di XML ridotto all'osso, per i documenti Office.
 *
 * **Cosa non fa, e perché va bene.** Non risolve entità esterne, non
 * segue DTD, non valida niente. Su un file caricato da un paziente
 * questa non è una limitazione: è la difesa. Un lettore XML completo
 * espande le entità dichiarate nel documento, ed è esattamente il
 * meccanismo con cui si costruisce un attacco che fa leggere al server
 * un file arbitrario o gli fa consumare tutta la memoria. Qui le entità
 * riconosciute sono cinque, sono scritte in questo file, e nessun'altra
 * viene espansa.
 *
 * Quello che fa è quanto serve a un OOXML: un albero di nodi con nome,
 * attributi e figli, più due funzioni per girarlo.
 */

export interface Nodo {
  nome: string;
  /** Il nome senza prefisso di namespace: `w:p` diventa `p`. */
  locale: string;
  attributi: Record<string, string>;
  figli: Nodo[];
  /** Il testo diretto di questo nodo, senza quello dei figli. */
  testo: string;
}

const ENTITA: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Le cinque entità di XML, più i riferimenti numerici.
 *
 * I numerici si espandono perché Word li usa per i caratteri fuori
 * ASCII e non c'è modo di leggere un referto italiano senza. Sono
 * innocui: un numero non può puntare a un file.
 */
export function decodificaEntita(testo: string): string {
  if (!testo.includes("&")) return testo;

  return testo.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (intero, corpo: string) => {
    if (corpo.startsWith("#")) {
      const codice = corpo.startsWith("#x") || corpo.startsWith("#X")
        ? Number.parseInt(corpo.slice(2), 16)
        : Number.parseInt(corpo.slice(1), 10);
      // Un codice fuori dall'intervallo Unicode resta come sta: meglio
      // vedere `&#999999;` in una cella che far saltare la lettura.
      if (Number.isFinite(codice) && codice > 0 && codice <= 0x10ffff) {
        try {
          return String.fromCodePoint(codice);
        } catch {
          return intero;
        }
      }
      return intero;
    }
    return ENTITA[corpo] ?? intero;
  });
}

function nomeLocale(nome: string): string {
  const duePunti = nome.indexOf(":");
  return duePunti < 0 ? nome : nome.slice(duePunti + 1);
}

function leggiAttributi(grezzi: string): Record<string, string> {
  const attributi: Record<string, string> = {};
  const regex = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;

  let trovato: RegExpExecArray | null;
  while ((trovato = regex.exec(grezzi)) !== null) {
    const chiave = trovato[1] ?? trovato[3];
    const valore = trovato[2] ?? trovato[4];
    attributi[chiave] = decodificaEntita(valore);
  }

  return attributi;
}

/**
 * Trasforma un XML in un albero.
 *
 * Un documento malformato non solleva: si chiude ciò che è rimasto
 * aperto e si restituisce quel che si è capito. Un `.docx` scritto male
 * da un gestionale di laboratorio è un caso frequente, e leggerne metà è
 * meglio che rifiutarlo intero.
 */
export function leggiXml(sorgente: string): Nodo {
  const radice: Nodo = { nome: "#root", locale: "#root", attributi: {}, figli: [], testo: "" };
  const pila: Nodo[] = [radice];

  // Salta prologo, commenti, DOCTYPE e istruzioni di elaborazione. Il
  // DOCTYPE è saltato *e non letto*: è lì che vivrebbero le entità
  // pericolose, e questo lettore non le conosce.
  const senzaRumore = sorgente
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?[^>]*>/gi, "");

  const tag = /<([/!]?)([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let posizione = 0;
  let trovato: RegExpExecArray | null;

  while ((trovato = tag.exec(senzaRumore)) !== null) {
    const [intero, chiusura, nome, attributi, autochiusura] = trovato;

    // Il testo fra il tag precedente e questo appartiene al nodo aperto.
    const fra = senzaRumore.slice(posizione, trovato.index);
    if (fra.length > 0) {
      pila[pila.length - 1].testo += decodificaEntita(fra);
    }
    posizione = trovato.index + intero.length;

    if (chiusura === "!") continue; // CDATA e simili: ignorati

    if (chiusura === "/") {
      // Si chiude solo se il nome corrisponde a qualcosa di aperto:
      // un tag di chiusura orfano, altrimenti, svuoterebbe la pila.
      for (let i = pila.length - 1; i > 0; i -= 1) {
        if (pila[i].nome === nome) {
          pila.length = i;
          break;
        }
      }
      continue;
    }

    const nodo: Nodo = {
      nome,
      locale: nomeLocale(nome),
      attributi: attributi.trim() ? leggiAttributi(attributi) : {},
      figli: [],
      testo: "",
    };

    pila[pila.length - 1].figli.push(nodo);
    if (autochiusura !== "/") pila.push(nodo);
  }

  return radice;
}

/* ── Girare l'albero ──────────────────────────────────────────────── */

/** Tutti i discendenti con quel nome locale, in ordine di documento. */
export function tutti(nodo: Nodo, locale: string): Nodo[] {
  const trovati: Nodo[] = [];

  const scendi = (n: Nodo) => {
    for (const figlio of n.figli) {
      if (figlio.locale === locale) trovati.push(figlio);
      scendi(figlio);
    }
  };

  scendi(nodo);
  return trovati;
}

/** Il primo discendente con quel nome locale, o null. */
export function primo(nodo: Nodo, locale: string): Nodo | null {
  for (const figlio of nodo.figli) {
    if (figlio.locale === locale) return figlio;
    const dentro = primo(figlio, locale);
    if (dentro) return dentro;
  }
  return null;
}

/** I figli diretti con quel nome locale. Non scende oltre il primo livello. */
export function figli(nodo: Nodo, locale: string): Nodo[] {
  return nodo.figli.filter((f) => f.locale === locale);
}

/**
 * Tutto il testo dentro un nodo, figli compresi.
 *
 * `separatore` esiste per le tabelle: unire due celle senza niente in
 * mezzo produrrebbe "Glicemia102", e nessun lettore di referti se ne
 * riprenderebbe.
 */
export function testoDi(nodo: Nodo, separatore = ""): string {
  const pezzi: string[] = [];

  const raccogli = (n: Nodo) => {
    if (n.testo) pezzi.push(n.testo);
    for (const figlio of n.figli) raccogli(figlio);
  };

  raccogli(nodo);
  return pezzi.join(separatore);
}

/** Un attributo, cercato per nome locale così da ignorare il prefisso. */
export function attributo(nodo: Nodo, locale: string): string | null {
  for (const [chiave, valore] of Object.entries(nodo.attributi)) {
    if (nomeLocale(chiave) === locale) return valore;
  }
  return null;
}
