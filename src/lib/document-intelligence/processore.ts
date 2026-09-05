import { estraiDatiClinici, type ContestoEstrazione } from "./estrattore-medico.ts";
import type {
  Avvertenza,
  ContenutoEstratto,
  DocumentoStrutturato,
  Formato,
} from "./tipi.ts";

/**
 * La pipeline, dal contenuto letto al JSON strutturato.
 *
 * Riceve un `ContenutoEstratto` — testo, blocchi e tabelle, chiunque
 * l'abbia prodotto — e restituisce il documento strutturato che il
 * Brain riceverà.
 *
 * **Perché non legge lui il file.** Aprire un PDF richiede `pdfjs`,
 * l'OCR richiede la rete o un pacchetto opzionale: sono cose che
 * funzionano solo sul server e che non si possono provare in un test
 * senza montarci attorno mezza infrastruttura. Qui dentro non c'è nulla
 * di tutto ciò — solo la trasformazione da testo a dati — e questo è
 * ciò che rende testabile la parte che decide cosa entra in una
 * cartella clinica. La lettura dei file sta in `lettore.ts`.
 *
 * L'ordine è quello della visione, e ogni fase è una funzione separata
 * perché ognuna deve poter essere sostituita da sola.
 */

export interface DatiFile {
  nomeFile: string;
  formato: Formato;
  mime: string | null;
  dimensioneByte: number;
  impronta: string;
  /** L'id in cartella, quando il documento è già stato registrato. */
  documentId?: string | null;
  caricatoIl?: string;
}

export interface OpzioniProcessore extends ContestoEstrazione {
  /** Il nome del paziente in cartella, per confrontarlo con quello sul documento. */
  nomePazienteInCartella?: string | null;
  /** Vero se un documento con la stessa impronta è già in cartella. */
  duplicatoDi?: { id: string; titolo: string } | null;
}

/**
 * Sotto questa confidenza un valore non entra in cartella da solo.
 *
 * È deliberatamente allineata a `AUTO_APPLY_MIN_CONFIDENCE` di
 * `lib/brain/validation.ts`, che è la soglia che il motore clinico già
 * usa: due soglie diverse per la stessa decisione sarebbero due
 * politiche diverse scritte in due file, e prima o poi divergono.
 */
export const CONFIDENZA_MINIMA_AUTOMATICA = 0.85;

/** Sotto questa, il dato non si usa affatto senza una verifica. */
export const CONFIDENZA_INUTILIZZABILE = 0.5;

export function processa(
  contenuto: ContenutoEstratto,
  file: DatiFile,
  opzioni: OpzioniProcessore,
): DocumentoStrutturato {
  const avvertenze: Avvertenza[] = [];

  // ── Il documento non si è potuto leggere ────────────────────────
  // Non è un errore da sollevare: è un esito. Il file resta in
  // cartella, l'avvertenza dice perché, e lo guarderà una persona.
  if (!contenuto.leggibile) {
    avvertenze.push({
      codice: contenuto.via === "ocr" ? "ocr-fallito" : "documento-illeggibile",
      messaggio:
        contenuto.motivo ??
        "Non sono riuscito a leggere il contenuto del documento. Resta in cartella per un professionista.",
    });

    return vuoto(file, contenuto, avvertenze, opzioni);
  }

  if (contenuto.testo.trim().length === 0) {
    avvertenze.push({
      codice: "documento-vuoto",
      messaggio: "Il documento non contiene testo.",
    });
    return vuoto(file, contenuto, avvertenze, opzioni);
  }

  // ── Estrazione ──────────────────────────────────────────────────
  const esito = estraiDatiClinici(contenuto, opzioni);
  avvertenze.push(...esito.avvertenze);

  if (contenuto.motivo && contenuto.via !== "ocr") {
    // Un PDF letto solo in parte — alcune pagine scansionate — è
    // leggibile ma incompleto, e chi lo rivede deve saperlo.
    avvertenze.push({ codice: "formato-parziale", messaggio: contenuto.motivo });
  }

  if (contenuto.via === "ocr" && contenuto.fiduciaTesto < 0.8) {
    avvertenze.push({
      codice: "confidenza-bassa",
      messaggio: `Il riconoscimento ottico ha letto il documento con una fiducia del ${Math.round(contenuto.fiduciaTesto * 100)}%: i valori vanno confrontati con l'originale.`,
    });
  }

  // ── Il documento è di questo paziente? ──────────────────────────
  const nomeSulDocumento = esito.paziente.nome;
  const nomeInCartella = opzioni.nomePazienteInCartella;

  if (nomeSulDocumento && nomeInCartella && !nomiCompatibili(nomeSulDocumento, nomeInCartella)) {
    avvertenze.push({
      codice: "paziente-non-corrispondente",
      messaggio: `Il documento è intestato a «${nomeSulDocumento}», la cartella è di «${nomeInCartella}». Va verificato prima di considerarlo valido.`,
    });
  }

  // ── Duplicato ───────────────────────────────────────────────────
  if (opzioni.duplicatoDi) {
    avvertenze.push({
      codice: "duplicato",
      messaggio: `Documento identico a «${opzioni.duplicatoDi.titolo}», già in cartella. L'analisi non è stata rifatta.`,
    });
  }

  // ── Confidenza complessiva e revisione ──────────────────────────
  const confidenza = confidenzaComplessiva(esito.biomarcatori, contenuto.fiduciaTesto);
  const richiedeRevisione = decideRevisione(esito.biomarcatori, avvertenze, confidenza);

  return {
    documento: {
      id: file.documentId ?? null,
      nome_file: file.nomeFile,
      formato: file.formato,
      mime: file.mime,
      dimensione_byte: file.dimensioneByte,
      impronta: file.impronta,
      pagine: contenuto.pagine,
      caricato_il: file.caricatoIl ?? new Date().toISOString(),
    },
    paziente: {
      nome: esito.paziente.nome,
      data_nascita: esito.paziente.dataNascita,
      confidenza: esito.paziente.confidenza,
    },
    tipo_documento: esito.tipoDocumento,
    data_documento: esito.dataDocumento,
    laboratorio: esito.laboratorio,
    biomarcatori: ordina(esito.biomarcatori),
    farmaci: esito.farmaci,
    integratori: esito.integratori,
    note_cliniche: esito.note,
    tabelle: contenuto.tabelle,
    avvertenze,
    // Il testo si conserva per intero, entro un limite: è la prova di
    // cosa il motore aveva davanti quando ha proposto quei valori, e
    // senza di essa una proposta sbagliata non è ricostruibile.
    testo_estratto: contenuto.testo.slice(0, 200_000),
    lettura: {
      via: contenuto.via,
      motoreOcr: contenuto.motoreOcr,
      fiduciaTesto: contenuto.fiduciaTesto,
    },
    richiede_revisione_umana: richiedeRevisione,
    confidenza_complessiva: confidenza,
  };
}

/* ── Le decisioni ─────────────────────────────────────────────────── */

/**
 * Quanto ci si fida di questo documento nel suo insieme.
 *
 * Non è la media delle confidenze: è la **mediana**, moltiplicata per la
 * fiducia nella lettura del testo. La media si lascia trascinare da un
 * valore letto malissimo su venti letti bene, e da uno letto benissimo
 * su venti letti male: la mediana descrive com'è andata di solito, che è
 * la domanda vera.
 */
export function confidenzaComplessiva(
  biomarcatori: { confidenza: number }[],
  fiduciaTesto: number,
): number {
  if (biomarcatori.length === 0) return Number(fiduciaTesto.toFixed(3));

  const ordinate = biomarcatori.map((b) => b.confidenza).sort((a, b) => a - b);
  const mezzo = Math.floor(ordinate.length / 2);
  const mediana =
    ordinate.length % 2 === 0
      ? (ordinate[mezzo - 1] + ordinate[mezzo]) / 2
      : ordinate[mezzo];

  return Number((mediana * fiduciaTesto).toFixed(3));
}

/**
 * Se questo documento deve passare da una persona.
 *
 * Le tre ragioni sono indipendenti e ognuna basta da sola. Nessuna
 * riguarda «quanto è grave il paziente»: riguardano tutte **quanto il
 * sistema è sicuro di aver capito**. La gravità la valuta un medico, ed
 * è precisamente il motivo per cui il documento gli arriva.
 */
export function decideRevisione(
  biomarcatori: { richiedeVerifica: boolean }[],
  avvertenze: Avvertenza[],
  confidenza: number,
): boolean {
  if (biomarcatori.some((b) => b.richiedeVerifica)) return true;
  if (confidenza < CONFIDENZA_MINIMA_AUTOMATICA) return true;

  const gravi: Avvertenza["codice"][] = [
    "paziente-non-corrispondente",
    "ocr-fallito",
    "valore-illeggibile",
    "documento-illeggibile",
  ];

  return avvertenze.some((a) => gravi.includes(a.codice));
}

/**
 * L'ordine in cui i valori si mostrano.
 *
 * Prima ciò che è fuori norma, poi il resto per categoria. Un referto ha
 * quaranta righe e tre che contano: metterle in fondo perché
 * l'alfabeto lo vuole significa farle leggere per ultime, o non farle
 * leggere.
 */
const PESO_STATO: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  LOW: 1,
  BORDERLINE: 2,
  UNKNOWN: 3,
  OPTIMAL: 4,
  NORMAL: 4,
};

function ordina<T extends { stato: string; categoria: string; display_name: string }>(
  biomarcatori: T[],
): T[] {
  return [...biomarcatori].sort((a, b) => {
    const peso = (PESO_STATO[a.stato] ?? 5) - (PESO_STATO[b.stato] ?? 5);
    if (peso !== 0) return peso;
    if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
    return a.display_name.localeCompare(b.display_name, "it");
  });
}

/**
 * Due nomi che potrebbero essere la stessa persona.
 *
 * Il confronto è volutamente permissivo: sui referti l'ordine di nome e
 * cognome cambia, i secondi nomi compaiono e spariscono, e gli accenti
 * si perdono nell'OCR. Un confronto rigido produrrebbe un allarme su
 * quasi ogni documento, e un allarme che scatta sempre non lo legge
 * più nessuno.
 *
 * Basta quindi che un cognome combaci. Serve a intercettare il caso
 * vero — un referto caricato nella cartella sbagliata — non a fare
 * identificazione anagrafica, che non è compito di questo modulo.
 */
export function nomiCompatibili(unoGrezzo: string, altroGrezzo: string): boolean {
  const pezzi = (grezzo: string) =>
    grezzo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[\s,]+/)
      .filter((p) => p.length >= 3);

  const uno = pezzi(unoGrezzo);
  const altro = pezzi(altroGrezzo);
  if (uno.length === 0 || altro.length === 0) return true;

  return uno.some((p) => altro.includes(p));
}

/* ── Il documento che non si è letto ──────────────────────────────── */

function vuoto(
  file: DatiFile,
  contenuto: ContenutoEstratto,
  avvertenze: Avvertenza[],
  opzioni: OpzioniProcessore,
): DocumentoStrutturato {
  if (opzioni.duplicatoDi) {
    avvertenze.push({
      codice: "duplicato",
      messaggio: `Documento identico a «${opzioni.duplicatoDi.titolo}», già in cartella.`,
    });
  }

  return {
    documento: {
      id: file.documentId ?? null,
      nome_file: file.nomeFile,
      formato: file.formato,
      mime: file.mime,
      dimensione_byte: file.dimensioneByte,
      impronta: file.impronta,
      pagine: contenuto.pagine,
      caricato_il: file.caricatoIl ?? new Date().toISOString(),
    },
    paziente: { nome: null, data_nascita: null, confidenza: 0 },
    tipo_documento: "UNKNOWN",
    data_documento: null,
    laboratorio: null,
    biomarcatori: [],
    farmaci: [],
    integratori: [],
    note_cliniche: [],
    tabelle: [],
    avvertenze,
    testo_estratto: "",
    lettura: {
      via: contenuto.via,
      motoreOcr: contenuto.motoreOcr,
      fiduciaTesto: contenuto.fiduciaTesto,
    },
    // Un documento che non si è letto va sempre da una persona: è
    // l'unico modo perché non si perda.
    richiede_revisione_umana: true,
    confidenza_complessiva: 0,
  };
}
