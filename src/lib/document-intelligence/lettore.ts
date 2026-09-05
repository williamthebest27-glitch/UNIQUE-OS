import "server-only";
import { leggiCsv, leggiXls, leggiXlsx } from "./excel.ts";
import { motoreOcrAttivo, riconosciTesto } from "./ocr";
import { eScansione, leggiPdf } from "./pdf";
import { rileva } from "./rilevatore.ts";
import { tabellaDaTestoAllineato } from "./tabelle.ts";
import type { ContenutoEstratto, Formato, Rilevamento } from "./tipi.ts";
import { leggiDoc, leggiDocx } from "./word.ts";

/**
 * Chi apre il file.
 *
 * Un solo punto d'ingresso — `leggiDocumento` — che riconosce il formato
 * e chiama il lettore giusto. Sta separato da `processore.ts` perché è
 * l'unica parte del modulo che ha bisogno del server: `pdfjs` è una
 * libreria Node, l'OCR può richiedere la rete, e il pacchetto di
 * riconoscimento locale è opzionale.
 *
 * Il confine ha un valore pratico: tutto ciò che decide **cosa entra in
 * una cartella clinica** sta dall'altra parte, dove si può provare con
 * un test che non apre nessun file.
 *
 * ---
 *
 * **La regola sull'OCR.** Non si accende mai per un documento che si è
 * già letto. Un PDF con il testo dentro si legge nativamente, punto: il
 * riconoscimento ottico su un documento nativo non aggiungerebbe nulla e
 * introdurrebbe errori dove non ce n'erano. L'OCR serve alle immagini e
 * alle scansioni, e a nient'altro.
 */

export interface EsitoLettura {
  rilevamento: Rilevamento;
  contenuto: ContenutoEstratto;
}

/** Il formato non è fra quelli che il motore sa aprire. */
export class FormatoNonSupportato extends Error {
  readonly dettaglio: string;

  constructor(dettaglio: string) {
    super(dettaglio);
    this.name = "FormatoNonSupportato";
    this.dettaglio = dettaglio;
  }
}

export async function leggiDocumento(
  dati: Uint8Array,
  nomeFile: string,
  mimeDichiarato: string | null,
): Promise<EsitoLettura> {
  const rilevamento = rileva(dati, nomeFile, mimeDichiarato);

  if (!rilevamento.formato) {
    throw new FormatoNonSupportato(
      rilevamento.motivo ?? "Formato del file non riconosciuto.",
    );
  }

  const contenuto = await apri(dati, rilevamento.formato, nomeFile);

  // Un formato dedotto dalla sola estensione ha già una confidenza
  // bassa: se poi il lettore non ha trovato niente, quasi certamente il
  // file non è ciò che il nome dichiara.
  if (rilevamento.confidenza < 0.6 && !contenuto.leggibile) {
    return {
      rilevamento,
      contenuto: {
        ...contenuto,
        motivo: `${contenuto.motivo ?? "Il documento non si è letto."} Il contenuto del file non corrisponde a un ${rilevamento.formato.toUpperCase()}: forse è stato rinominato.`,
      },
    };
  }

  return { rilevamento, contenuto };
}

async function apri(
  dati: Uint8Array,
  formato: Formato,
  nomeFile: string,
): Promise<ContenutoEstratto> {
  switch (formato) {
    case "pdf":
      return apriPdf(dati, nomeFile);

    case "jpeg":
    case "png":
    case "webp":
      return apriImmagine(dati, formato, nomeFile);

    case "docx":
      return conTabelleDedotte(leggiDocx(dati));
    case "doc":
      return conTabelleDedotte(leggiDoc(dati));

    case "xlsx":
      return leggiXlsx(dati);
    case "xls":
      return leggiXls(dati);
    case "csv":
      return leggiCsv(dati);
  }
}

/* ── PDF ──────────────────────────────────────────────────────────── */

/**
 * Un PDF, con l'OCR solo dove serve.
 *
 * Tre casi, e il terzo è quello che rende il modulo utile: un referto di
 * dieci pagine in cui l'ultima è la fotocopia di un esame precedente si
 * legge nativamente per nove e otticamente per una. Prima si sarebbe
 * dichiarato illeggibile o si sarebbe persa la decima.
 */
async function apriPdf(dati: Uint8Array, nomeFile: string): Promise<ContenutoEstratto> {
  const lettura = await leggiPdf(dati);

  // ── Caso 1: PDF nativo ────────────────────────────────────────
  if (lettura.leggibile && lettura.pagineScansionate.length === 0) return lettura;

  // ── Caso 2: scansione integrale ───────────────────────────────
  if (eScansione(lettura) || !lettura.leggibile) {
    const ocr = await riconosciTesto({
      dati,
      mimeType: "application/pdf",
      nomeFile,
    });

    if (!ocr.ok) {
      // Il motivo dell'OCR è più utile di quello del lettore: dice cosa
      // manca — un modello acceso, un pacchetto installato — invece di
      // ripetere che il PDF non ha testo.
      return { ...lettura, motivo: `${lettura.motivo ?? ""} ${ocr.motivo ?? ""}`.trim() };
    }

    const righe = ocr.righe.map((r) => r.testo);

    return {
      formato: "pdf",
      leggibile: true,
      testo: ocr.testo,
      blocchi: righe.map((testo) => ({ tipo: "riga-tabella" as const, testo, pagina: null })),
      tabelle: [tabellaDaTestoAllineato(righe)].filter((t) => t !== null),
      pagine: lettura.pagine,
      via: "ocr",
      motoreOcr: ocr.motore,
      metadati: lettura.metadati,
      fiduciaTesto: ocr.fiducia,
      fiduciaRighe: ocr.righe,
    };
  }

  // ── Caso 3: misto ─────────────────────────────────────────────
  // Il testo nativo si tiene com'è e non si tocca. L'OCR aggiunge in
  // fondo ciò che le pagine-immagine contenevano, dichiarato per quello
  // che è: la fiducia complessiva scende, come è giusto.
  const ocr = await riconosciTesto({ dati, mimeType: "application/pdf", nomeFile });
  if (!ocr.ok) return lettura;

  const righeOcr = ocr.righe.map((r) => r.testo);
  const caratteriNativi = lettura.testo.length;
  const caratteriOcr = ocr.testo.length;
  const totale = caratteriNativi + caratteriOcr;

  return {
    ...lettura,
    testo: `${lettura.testo}\n${ocr.testo}`,
    blocchi: [
      ...lettura.blocchi,
      ...righeOcr.map((testo) => ({ tipo: "riga-tabella" as const, testo, pagina: null })),
    ],
    tabelle: [...lettura.tabelle, tabellaDaTestoAllineato(righeOcr)].filter((t) => t !== null),
    via: "misto",
    motoreOcr: ocr.motore,
    fiduciaRighe: ocr.righe,
    // Media pesata sui caratteri: se nove pagine su dieci sono native,
    // la fiducia resta alta, ed è la verità.
    fiduciaTesto:
      totale === 0 ? 0 : Number(((caratteriNativi + caratteriOcr * ocr.fiducia) / totale).toFixed(3)),
    motivo: undefined,
  };
}

/* ── Immagini ─────────────────────────────────────────────────────── */

/**
 * Una foto di un referto.
 *
 * È il caso che il paziente userà di più: apre l'applicazione dal
 * telefono, fotografa il foglio, carica. Non c'è nessun testo da
 * estrarre — è un'immagine — quindi o c'è un riconoscimento ottico o
 * non c'è lettura, e la seconda si dichiara invece di fingere.
 */
async function apriImmagine(
  dati: Uint8Array,
  formato: Extract<Formato, "jpeg" | "png" | "webp">,
  nomeFile: string,
): Promise<ContenutoEstratto> {
  const mime = formato === "jpeg" ? "image/jpeg" : formato === "png" ? "image/png" : "image/webp";
  const ocr = await riconosciTesto({ dati, mimeType: mime, nomeFile });

  if (!ocr.ok) {
    const stato = await motoreOcrAttivo();
    return {
      formato,
      leggibile: false,
      motivo:
        ocr.motivo ??
        stato.motivo ??
        "Questa immagine non è stata letta: il documento resta in cartella e va guardato da una persona.",
      testo: "",
      blocchi: [],
      tabelle: [],
      pagine: 1,
      via: "ocr",
      metadati: {},
      fiduciaTesto: 0,
    };
  }

  const righe = ocr.righe.map((r) => r.testo);

  return {
    formato,
    leggibile: true,
    testo: ocr.testo,
    blocchi: righe.map((testo) => ({ tipo: "riga-tabella" as const, testo, pagina: 1 })),
    tabelle: [tabellaDaTestoAllineato(righe)].filter((t) => t !== null),
    pagine: 1,
    via: "ocr",
    motoreOcr: ocr.motore,
    metadati: {},
    fiduciaTesto: ocr.fiducia,
    fiduciaRighe: ocr.righe,
  };
}

/* ── Servizio ─────────────────────────────────────────────────────── */

/**
 * Cerca una tabella nel testo di un documento che non ne dichiara.
 *
 * Un `.doc` non espone la struttura delle sue tabelle, e un `.docx` può
 * avere un referto impaginato con le tabulazioni invece che con una
 * tabella vera. In entrambi i casi le colonne ci sono, e riconoscerle
 * dal testo è meglio che ignorarle — con la confidenza bassa che quel
 * riconoscimento merita.
 */
function conTabelleDedotte(contenuto: ContenutoEstratto): ContenutoEstratto {
  if (contenuto.tabelle.length > 0 || !contenuto.leggibile) return contenuto;

  const dedotta = tabellaDaTestoAllineato(contenuto.testo.split(/\r?\n/));
  return dedotta ? { ...contenuto, tabelle: [dedotta] } : contenuto;
}

/**
 * Le fiducie per riga, indicizzate come le vuole l'estrattore.
 *
 * L'estrattore cerca la fiducia della riga da cui viene un valore
 * usando la citazione come chiave. Le citazioni sono troncate a 200
 * caratteri: la chiave si costruisce allo stesso modo, o non
 * combacerebbe mai.
 *
 * Legge da ciò che il lettore ha già prodotto. Rifare il
 * riconoscimento ottico per avere le stesse righe costerebbe una
 * seconda chiamata — e su un documento lungo non è un dettaglio.
 */
export function fiduciaPerRiga(contenuto: ContenutoEstratto): Map<string, number> {
  return new Map((contenuto.fiduciaRighe ?? []).map((r) => [r.testo.slice(0, 200), r.fiducia]));
}
