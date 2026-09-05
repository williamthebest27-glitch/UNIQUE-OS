import "server-only";
import { tabellaDaPagina, type Frammento, type RigaPosizionata } from "./tabelle.ts";
import type { Blocco, ContenutoEstratto, Tabella } from "./tipi.ts";

/**
 * Leggere un PDF conservando la geometria.
 *
 * `lib/clinical/testo-documento.ts` fa già la cosa essenziale:
 * ricostruisce le righe dalla coordinata verticale dei frammenti, perché
 * un PDF non ha righe. Questo lettore fa un passo in più e **tiene anche
 * la coordinata orizzontale**, che è ciò che permette di riconoscere le
 * colonne.
 *
 * La differenza si vede su una riga sola. "Ferritina 210 ng/mL 30 - 400"
 * ha quattro numeri: senza le colonne bisogna indovinare quale sia il
 * risultato, tagliando la riga al primo marcatore di riferimento e
 * sperando che il laboratorio ne usi uno previsto. Con le colonne il
 * risultato è quello nella colonna dei risultati, sempre — anche quando
 * l'intestazione è scritta in un modo che nessuna espressione regolare
 * aveva previsto.
 *
 * Il lettore esistente resta dov'è e continua a servire il motore
 * clinico. Questo non lo sostituisce: gli sta accanto, e serve al modulo
 * che ha bisogno delle tabelle.
 */

/** Tolleranza verticale entro cui due frammenti stanno sulla stessa riga. */
const STESSA_RIGA = 2.5;

/**
 * Quanto testo deve avere una pagina per non essere considerata una
 * scansione.
 *
 * Un PDF prodotto da uno scanner non ha zero caratteri: ha l'intestazione
 * del software che l'ha creato, a volte un numero di pagina. Sotto questa
 * soglia il testo che c'è non è il referto — è la cornice — e conviene
 * trattare la pagina come un'immagine.
 */
const MINIMO_CARATTERI_PAGINA = 40;

export interface PaginaPdf {
  numero: number;
  righe: RigaPosizionata[];
  /** Quanti caratteri di testo vero ha la pagina. */
  caratteri: number;
}

export interface LetturaPdf extends ContenutoEstratto {
  /** Le pagine senza testo: sono immagini, e servirebbe un OCR. */
  pagineScansionate: number[];
  /** Le pagine con le loro righe posizionate, per chi deve rileggerle. */
  pagine_dettaglio: PaginaPdf[];
}

/**
 * Estrae righe e posizioni da un PDF.
 *
 * Non solleva per un PDF cifrato o corrotto: restituisce `leggibile:
 * false` con il motivo. Un referto protetto da password è un caso reale
 * — certi laboratori li mandano così — e chi l'ha caricato deve leggere
 * *perché* non è stato analizzato, non una pagina di errore.
 */
export async function leggiPdf(dati: Uint8Array): Promise<LetturaPdf> {
  let documento: Awaited<ReturnType<typeof apri>>;

  try {
    documento = await apri(dati);
  } catch (errore) {
    const motivo = spiegaErrore(errore);
    return {
      ...vuoto(),
      motivo,
    };
  }

  const pagine: PaginaPdf[] = [];
  const tabelle: Tabella[] = [];
  const blocchi: Blocco[] = [];
  const righeTesto: string[] = [];
  const pagineScansionate: number[] = [];

  for (let p = 1; p <= documento.numPages; p += 1) {
    const pagina = await documento.getPage(p);
    const contenuto = await pagina.getTextContent();

    // Raggruppa per coordinata verticale: è la riga.
    const perRiga = new Map<number, Frammento[]>();

    for (const elemento of contenuto.items) {
      if (!("str" in elemento)) continue;
      const testo = elemento.str;
      if (testo.trim().length === 0) continue;

      const transform = elemento.transform as number[];
      const y = Math.round(transform[5] / STESSA_RIGA) * STESSA_RIGA;
      const x = transform[4];
      const larghezza = ("width" in elemento ? (elemento.width as number) : 0) || 0;

      perRiga.set(y, [...(perRiga.get(y) ?? []), { x, larghezza, testo }]);
    }

    // Dall'alto verso il basso: nel PDF la y cresce salendo.
    const righe: RigaPosizionata[] = [...perRiga.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, frammenti]) => ({
        pagina: p,
        y,
        frammenti: frammenti.sort((a, b) => a.x - b.x),
      }));

    const caratteri = righe.reduce(
      (n, riga) => n + riga.frammenti.reduce((m, f) => m + f.testo.trim().length, 0),
      0,
    );

    pagine.push({ numero: p, righe, caratteri });
    if (caratteri < MINIMO_CARATTERI_PAGINA) pagineScansionate.push(p);

    // ── Le righe come testo ───────────────────────────────────────
    for (const riga of righe) {
      const testo = componiRiga(riga);
      if (testo.length === 0) continue;
      righeTesto.push(testo);
      blocchi.push({ tipo: "riga-tabella", testo, pagina: p });
    }

    // ── La tabella, se c'è ────────────────────────────────────────
    const tabella = tabellaDaPagina(righe, p);
    if (tabella) tabelle.push(tabella);
  }

  const testo = righeTesto.join("\n");
  const tutteScansionate = pagineScansionate.length === documento.numPages;

  return {
    formato: "pdf",
    leggibile: testo.trim().length > 0,
    motivo: tutteScansionate
      ? "Il PDF non contiene testo: è una scansione. Serve un riconoscimento ottico."
      : pagineScansionate.length > 0
        ? `Le pagine ${pagineScansionate.join(", ")} sono immagini: il testo che contengono non è stato letto.`
        : undefined,
    testo,
    blocchi,
    tabelle,
    pagine: documento.numPages,
    via: "nativo",
    metadati: await metadatiDi(documento),
    // Il testo di un PDF nativo sono i caratteri che il file dichiara:
    // non c'è nessuna lettura da mettere in dubbio.
    fiduciaTesto: 1,
    pagineScansionate,
    pagine_dettaglio: pagine,
  };
}

/**
 * Le righe di un PDF, con le celle separate da spazi doppi.
 *
 * Il doppio spazio non è estetico: è il segnale che il riconoscitore di
 * tabelle su testo semplice cerca, e distingue "Colesterolo LDL" — due
 * parole di un nome — da "LDL  142" — un nome e il suo valore. La soglia
 * è la larghezza di un carattere e mezzo, che è più di uno spazio
 * normale e meno di una tabulazione.
 */
function componiRiga(riga: RigaPosizionata): string {
  const pezzi: string[] = [];
  let precedenteFine = -1;

  for (const frammento of riga.frammenti) {
    const testo = frammento.testo.replace(/\s+/g, " ").trim();
    if (testo.length === 0) continue;

    if (precedenteFine >= 0) {
      const salto = frammento.x - precedenteFine;
      // Una stima grossolana della larghezza di un carattere: basta a
      // distinguere uno spazio da una colonna.
      const larghezzaCarattere = frammento.larghezza / Math.max(1, testo.length);
      pezzi.push(salto > larghezzaCarattere * 1.5 ? "  " : " ");
    }

    pezzi.push(testo);
    precedenteFine = frammento.x + frammento.larghezza;
  }

  return pezzi.join("").replace(/ {3,}/g, "  ").trim();
}

async function apri(dati: Uint8Array) {
  // Import dinamico: la libreria è pesante e serve solo quando arriva un
  // PDF, non a ogni richiesta dell'applicazione.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  return getDocument({
    data: dati,
    // Niente rete e niente font di sistema: qui si legge del testo, non
    // si rende una pagina. È anche ciò che impedisce a un PDF caricato da
    // un paziente di far partire una richiesta dal nostro server.
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
}

async function metadatiDi(documento: Awaited<ReturnType<typeof apri>>): Promise<Record<string, string>> {
  try {
    const { info } = await documento.getMetadata();
    const dati = info as Record<string, unknown>;
    const metadati: Record<string, string> = {};

    const campi: [string, string][] = [
      ["Title", "titolo"],
      ["Author", "autore"],
      ["Producer", "prodotto-da"],
      ["Creator", "creato-con"],
      ["CreationDate", "creato"],
    ];

    for (const [chiave, nostro] of campi) {
      const valore = dati[chiave];
      if (typeof valore === "string" && valore.trim()) metadati[nostro] = valore.trim();
    }

    return metadati;
  } catch {
    // I metadati sono un di più: un PDF che non li espone si legge lo stesso.
    return {};
  }
}

/**
 * Perché un PDF non si è aperto, detto a chi l'ha caricato.
 *
 * Il messaggio di pdf.js è in inglese e parla di strutture interne. Chi
 * ha caricato un referto protetto da password deve leggere che serve la
 * password, non `PasswordException`.
 */
function spiegaErrore(errore: unknown): string {
  const messaggio = errore instanceof Error ? errore.message : String(errore);
  const nome = errore instanceof Error ? errore.name : "";

  if (nome === "PasswordException" || /password/i.test(messaggio)) {
    return "Il PDF è protetto da password. Salvalo senza protezione e ricaricalo.";
  }
  if (/invalid.*pdf|structure/i.test(messaggio)) {
    return "Il PDF è danneggiato e non si apre. Prova a riscaricarlo dal laboratorio.";
  }

  return `PDF non leggibile: ${messaggio}`;
}

function vuoto(): LetturaPdf {
  return {
    formato: "pdf",
    leggibile: false,
    testo: "",
    blocchi: [],
    tabelle: [],
    pagine: 0,
    via: "nativo",
    metadati: {},
    fiduciaTesto: 0,
    pagineScansionate: [],
    pagine_dettaglio: [],
  };
}

/** Vero se il PDF è una scansione: pagine senza testo utile. */
export function eScansione(lettura: LetturaPdf): boolean {
  return lettura.pagine > 0 && lettura.pagineScansionate.length === lettura.pagine;
}
