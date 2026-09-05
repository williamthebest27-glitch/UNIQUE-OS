import { Contenitore, sembraCfb } from "./cfb.ts";
import { numeroDaCella } from "./tabelle.ts";
import type { Blocco, ContenutoEstratto, Tabella } from "./tipi.ts";
import { Archivio } from "./zip.ts";
import { attributo, figli, leggiXml, primo, testoDi, type Nodo } from "./xml.ts";

/**
 * Leggere un documento Word.
 *
 * Due formati diversi con lo stesso nome. Il moderno — `.docx` — è un
 * archivio di XML, e leggerlo è girare un albero. L'antico — `.doc` — è
 * un file binario del 1997, e leggerlo è un lavoro di archeologia che
 * vale comunque la pena fare: un laboratorio con un gestionale di
 * quindici anni fa esporta ancora quello, e rifiutarlo significa
 * rifiutare i referti dei suoi pazienti.
 *
 * Quello che si estrae non è "il testo": sono **titoli, paragrafi,
 * elenchi e tabelle**, distinti fra loro. La differenza conta perché un
 * referto specialistico usa i titoli per separare anamnesi, esame
 * obiettivo e conclusioni, e appiattirli in un blocco unico
 * renderebbe indistinguibile una diagnosi da un antefatto.
 */

/* ── DOCX ─────────────────────────────────────────────────────────── */

/**
 * Il testo di un paragrafo, ricomposto dai suoi frammenti.
 *
 * Word spezza una frase in `<w:r>` ogni volta che cambia qualcosa nella
 * formattazione, e "Vitamina **D**" sono tre frammenti. Si concatenano
 * senza separatore, perché sono lettere della stessa parola. Le
 * tabulazioni e gli a capo interni diventano spazi: sono separatori di
 * colonna, e servono a non incollare un valore alla sua etichetta.
 */
function testoParagrafo(paragrafo: Nodo): string {
  const pezzi: string[] = [];

  const scendi = (n: Nodo) => {
    for (const figlio of n.figli) {
      if (figlio.locale === "t") {
        pezzi.push(figlio.testo);
      } else if (figlio.locale === "tab") {
        pezzi.push("\t");
      } else if (figlio.locale === "br" || figlio.locale === "cr") {
        pezzi.push(" ");
      } else if (figlio.locale === "delText") {
        // Testo cancellato con le revisioni attive: non fa parte del
        // documento. Includerlo rimetterebbe in cartella un valore che
        // qualcuno aveva corretto.
        continue;
      } else {
        scendi(figlio);
      }
    }
  };

  scendi(paragrafo);
  return pezzi.join("").replace(/[ \t]+/g, " ").trim();
}

/** Il livello di titolo di un paragrafo, se ne ha uno. */
function livelloTitolo(paragrafo: Nodo): number | null {
  const proprieta = figli(paragrafo, "pPr")[0];
  if (!proprieta) return null;

  const stile = figli(proprieta, "pStyle")[0];
  const nome = stile ? attributo(stile, "val") : null;
  if (!nome) return null;

  // Word scrive `Heading1` in inglese e `Titolo1` in italiano, e i
  // documenti generati da altri software usano `heading 1`.
  const trovato = /^(?:heading|titolo)\s*([1-9])$/i.exec(nome.trim());
  if (trovato) return Number(trovato[1]);

  // `Title` e `Subtitle` non hanno numero ma sono titoli a tutti gli effetti.
  if (/^(title|titolo)$/i.test(nome.trim())) return 1;
  if (/^(subtitle|sottotitolo)$/i.test(nome.trim())) return 2;

  return null;
}

function eElenco(paragrafo: Nodo): boolean {
  const proprieta = figli(paragrafo, "pPr")[0];
  if (!proprieta) return false;
  if (figli(proprieta, "numPr").length > 0) return true;

  const stile = figli(proprieta, "pStyle")[0];
  const nome = stile ? attributo(stile, "val") : null;
  return nome !== null && /list|elenco|bullet|punt/i.test(nome);
}

/** Una tabella di Word, riga per riga. */
function tabellaDocx(nodo: Nodo): Tabella | null {
  const righeXml = figli(nodo, "tr");
  if (righeXml.length === 0) return null;

  const griglia = righeXml.map((riga) =>
    figli(riga, "tc").map((cella) => {
      // Le celle contengono paragrafi: uniti con uno spazio, perché una
      // cella su due righe è una frase sola, non due dati.
      const testo = figli(cella, "p").map(testoParagrafo).filter(Boolean).join(" ").trim();
      return { testo, numero: numeroDaCella(testo) };
    }),
  );

  const nonVuote = griglia.filter((r) => r.some((c) => c.testo.length > 0));
  if (nonVuote.length === 0) return null;

  // La prima riga è l'intestazione se non contiene numeri: su un referto
  // è "Esame | Risultato | Valori di riferimento", e sono parole.
  const prima = nonVuote[0];
  const primaEIntestazione = prima.every((c) => c.numero === null) && prima.some((c) => c.testo);

  return {
    origine: "word",
    nome: null,
    pagina: null,
    intestazioni: primaEIntestazione ? prima.map((c) => c.testo) : [],
    righe: primaEIntestazione ? nonVuote.slice(1) : nonVuote,
    confidenza: primaEIntestazione ? 0.95 : 0.8,
  };
}

/** I metadati che Word scrive in `docProps/core.xml`. */
function metadatiDocx(archivio: Archivio): Record<string, string> {
  const grezzo = archivio.testo("docProps/core.xml");
  if (!grezzo) return {};

  const albero = leggiXml(grezzo);
  const metadati: Record<string, string> = {};

  const campi: [string, string][] = [
    ["title", "titolo"],
    ["creator", "autore"],
    ["subject", "oggetto"],
    ["created", "creato"],
    ["modified", "modificato"],
  ];

  for (const [locale, nostro] of campi) {
    const nodo = primo(albero, locale);
    const valore = nodo ? testoDi(nodo).trim() : "";
    if (valore) metadati[nostro] = valore;
  }

  return metadati;
}

/**
 * Legge un `.docx`.
 *
 * L'ordine dei blocchi è quello del documento, e non è un dettaglio: in
 * un referto specialistico il paragrafo sotto "Conclusioni" è la
 * conclusione, e lo si sa **solo** dalla posizione. Per questo si scorre
 * il corpo in ordine invece di raccogliere prima tutti i paragrafi e poi
 * tutte le tabelle.
 */
export function leggiDocx(dati: Uint8Array): ContenutoEstratto {
  let archivio: Archivio;
  try {
    archivio = new Archivio(dati);
  } catch (errore) {
    return vuoto("docx", `Il file non è un documento Word valido: ${messaggio(errore)}`);
  }

  const grezzo = archivio.testo("word/document.xml");
  if (!grezzo) {
    return vuoto("docx", "Manca il corpo del documento: l'archivio è incompleto o corrotto.");
  }

  const albero = leggiXml(grezzo);
  const corpo = primo(albero, "body");
  if (!corpo) return vuoto("docx", "Il documento Word non ha un corpo leggibile.");

  const blocchi: Blocco[] = [];
  const tabelle: Tabella[] = [];
  const righe: string[] = [];

  // Solo i figli diretti del corpo: i paragrafi dentro le tabelle li
  // legge `tabellaDocx`, e raccoglierli anche qui li duplicherebbe.
  for (const nodo of corpo.figli) {
    if (nodo.locale === "p") {
      const testo = testoParagrafo(nodo);
      if (!testo) continue;

      const livello = livelloTitolo(nodo);
      blocchi.push({
        tipo: livello !== null ? "titolo" : eElenco(nodo) ? "elenco" : "paragrafo",
        testo,
        livello: livello ?? undefined,
        pagina: null,
      });
      righe.push(testo);
      continue;
    }

    if (nodo.locale === "tbl") {
      const tabella = tabellaDocx(nodo);
      if (!tabella) continue;
      tabelle.push(tabella);

      // La tabella entra anche nel testo, riga per riga con le celle
      // separate da spazi: è la forma su cui lavora il lettore di
      // referti, che cerca esame e valore sulla stessa riga.
      if (tabella.intestazioni.length > 0) {
        const intestazione = tabella.intestazioni.join("  ");
        righe.push(intestazione);
        blocchi.push({ tipo: "riga-tabella", testo: intestazione, pagina: null });
      }
      for (const riga of tabella.righe) {
        const testo = riga.map((c) => c.testo).join("  ").trim();
        if (!testo) continue;
        righe.push(testo);
        blocchi.push({ tipo: "riga-tabella", testo, pagina: null });
      }
    }
  }

  const testo = righe.join("\n");

  return {
    formato: "docx",
    leggibile: testo.trim().length > 0,
    motivo:
      testo.trim().length > 0
        ? undefined
        : "Il documento Word non contiene testo: forse è fatto di immagini incollate.",
    testo,
    blocchi,
    tabelle,
    // Word non espone la paginazione nel file: è il risultato
    // dell'impaginazione, e la calcola il programma che lo apre.
    pagine: 1,
    via: "nativo",
    metadati: metadatiDocx(archivio),
    fiduciaTesto: 1,
  };
}

/* ── DOC (Word 97-2003) ───────────────────────────────────────────── */

/**
 * Il testo di un `.doc`, ricostruito dalla tabella dei pezzi.
 *
 * Word 97 non tiene il testo in un blocco continuo. Lo tiene a pezzi
 * sparsi nel flusso, e una tabella — la *piece table* — dice quale pezzo
 * viene dove. Ogni pezzo dichiara anche come è codificato: compresso in
 * un byte per carattere (Windows-1252) oppure in UTF-16.
 *
 * Chi salta la tabella e legge il flusso dall'inizio alla fine ottiene
 * il testo mescolato alle revisioni cancellate e ai frammenti di lavoro
 * che Word non ha ripulito. Su un referto, significherebbe leggere
 * valori corretti da qualcuno come se fossero ancora validi.
 */
function testoDaDoc(contenitore: Contenitore): string | null {
  const documento = contenitore.flusso("WordDocument");
  if (!documento || documento.length < 0x0200) return null;

  const u16 = (d: Uint8Array, i: number) => d[i] | (d[i + 1] << 8);
  const u32 = (d: Uint8Array, i: number) =>
    (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;

  // Il bit 9 dei flag dice quale dei due flussi di tabella è quello buono.
  const flag = u16(documento, 0x000a);
  const nomeTabella = (flag & 0x0200) !== 0 ? "1Table" : "0Table";
  const tabella = contenitore.flusso(nomeTabella) ?? contenitore.flusso("1Table") ?? contenitore.flusso("0Table");
  if (!tabella) return null;

  const inizioClx = u32(documento, 0x01a2);
  const lunghezzaClx = u32(documento, 0x01a6);
  if (lunghezzaClx === 0 || inizioClx + lunghezzaClx > tabella.length) return null;

  const clx = tabella.subarray(inizioClx, inizioClx + lunghezzaClx);

  // Il Clx è una sequenza di blocchi: 0x01 sono proprietà di
  // formattazione da saltare, 0x02 è la tabella dei pezzi.
  let p = 0;
  let pezzi: Uint8Array | null = null;

  while (p < clx.length) {
    const tipo = clx[p];
    if (tipo === 0x01) {
      const quanti = u16(clx, p + 1);
      p += 3 + quanti;
      continue;
    }
    if (tipo === 0x02) {
      const quanti = u32(clx, p + 1);
      pezzi = clx.subarray(p + 5, p + 5 + quanti);
      break;
    }
    break; // byte inatteso: meglio fermarsi che leggere a caso
  }

  if (!pezzi || pezzi.length < 4) return null;

  // La struttura: (n+1) posizioni da 4 byte, poi n descrittori da 8.
  const quantiPezzi = Math.floor((pezzi.length - 4) / 12);
  if (quantiPezzi <= 0) return null;

  const inizioDescrittori = (quantiPezzi + 1) * 4;
  const parti: string[] = [];

  for (let i = 0; i < quantiPezzi; i += 1) {
    const daCarattere = u32(pezzi, i * 4);
    const aCarattere = u32(pezzi, (i + 1) * 4);
    const quantiCaratteri = aCarattere - daCarattere;
    if (quantiCaratteri <= 0 || quantiCaratteri > 10_000_000) continue;

    const descrittore = inizioDescrittori + i * 8;
    if (descrittore + 8 > pezzi.length) break;

    const posizione = u32(pezzi, descrittore + 2);

    // Bit 30 acceso: il pezzo è compresso a un byte per carattere, e la
    // posizione vera è metà di quella dichiarata.
    const compresso = (posizione & 0x4000_0000) !== 0;
    const offset = compresso ? (posizione & ~0x4000_0000) / 2 : posizione;

    if (compresso) {
      const fetta = documento.subarray(offset, offset + quantiCaratteri);
      parti.push(daWindows1252(fetta));
    } else {
      const fetta = documento.subarray(offset, offset + quantiCaratteri * 2);
      let s = "";
      for (let k = 0; k + 1 < fetta.length; k += 2) s += String.fromCharCode(u16(fetta, k));
      parti.push(s);
    }
  }

  return parti.join("");
}

/**
 * Windows-1252, la codifica dei `.doc` italiani.
 *
 * Differisce da Latin-1 solo nella fascia 0x80-0x9F, ed è lì che vivono
 * le virgolette tipografiche e il trattino lungo: senza la mappa, un
 * referto si riempie di caratteri sbagliati proprio nella punteggiatura.
 */
const ALTA_1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…",
  0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š",
  0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’",
  0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ",
  0x9e: "ž", 0x9f: "Ÿ",
};

function daWindows1252(byte: Uint8Array): string {
  let out = "";
  for (const b of byte) {
    out += b >= 0x80 && b <= 0x9f ? (ALTA_1252[b] ?? " ") : String.fromCharCode(b);
  }
  return out;
}

/**
 * I caratteri di controllo che Word usa come marcatori.
 *
 * 0x07 separa le celle di una tabella e chiude le righe; 0x0d chiude un
 * paragrafo; 0x0b è un a capo forzato. Tradurli — invece di scartarli —
 * è ciò che permette a una tabella di un `.doc` di arrivare al lettore
 * di referti con le colonne ancora separate.
 */
function ripulisciDoc(grezzo: string): string[] {
  return (
    grezzo
      // 0x07 chiude una cella o una riga di tabella, 0x0b è un a capo
      // forzato, 0x0c un salto pagina: diventano separatori di colonna.
      .replace(/[\u0007\u000b\u000c\u001e]/g, "\t")
      // 0x13…0x14…0x15 racchiude un codice di campo — la formula che
      // genera un numero di pagina o una data. Non è testo del referto.
      .replace(/\u0013[^\u0014\u0015]*[\u0014\u0015]/g, "")
      // Ogni altro codice di controllo diventa spazio: sono marcatori di
      // Word, e lasciarli dentro attaccherebbe fra loro parole distinte.
      .replace(/[\u0001-\u0006\u0008\u000e-\u001f]/g, " ")
      .split(/[\r\n]+/)
      .map((r) => r.replace(/\t+/g, "  ").replace(/ {3,}/g, "  ").trim())
      .filter((r) => r.length > 0)
  );
}

export function leggiDoc(dati: Uint8Array): ContenutoEstratto {
  if (!sembraCfb(dati)) {
    return vuoto("doc", "Il file non è un documento Word 97-2003.");
  }

  let grezzo: string | null = null;

  try {
    grezzo = testoDaDoc(new Contenitore(dati));
  } catch (errore) {
    return vuoto("doc", `Documento Word 97-2003 non leggibile: ${messaggio(errore)}`);
  }

  if (grezzo === null) {
    return vuoto(
      "doc",
      "Non sono riuscito a ricostruire il testo di questo Word 97-2003. Riesportalo in .docx o in PDF.",
    );
  }

  const righe = ripulisciDoc(grezzo);
  const testo = righe.join("\n");

  return {
    formato: "doc",
    leggibile: testo.trim().length > 0,
    motivo: testo.trim().length > 0 ? undefined : "Il documento non contiene testo.",
    testo,
    // Il formato binario non distingue titoli da paragrafi senza leggere
    // anche le proprietà di formattazione, che è un secondo lavoro di
    // archeologia. Si dichiarano righe, che è la verità.
    blocchi: righe.map((r) => ({ tipo: "paragrafo" as const, testo: r, pagina: null })),
    // Le tabelle nel `.doc` si riconoscono dai separatori di cella, che
    // `ripulisciDoc` ha già trasformato in spazi doppi: il
    // riconoscitore di tabelle a valle le ritrova da lì.
    tabelle: [],
    pagine: 1,
    via: "nativo",
    metadati: {},
    // Più bassa di un `.docx`: la ricostruzione è fedele ma il formato
    // non lascia verificare niente, e vale la pena dirlo a chi rivede.
    fiduciaTesto: 0.9,
  };
}

/* ── Servizio ─────────────────────────────────────────────────────── */

function messaggio(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}

function vuoto(formato: "doc" | "docx", motivo: string): ContenutoEstratto {
  return {
    formato,
    leggibile: false,
    motivo,
    testo: "",
    blocchi: [],
    tabelle: [],
    pagine: 0,
    via: "nativo",
    metadati: {},
    fiduciaTesto: 0,
  };
}
