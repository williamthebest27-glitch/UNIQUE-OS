import { inflateRawSync } from "node:zlib";

/**
 * Aprire un archivio ZIP, che è la forma di ogni file Office moderno.
 *
 * **Perché scritto invece che installato.** Le librerie che fanno questo
 * sono buone e vecchie, e in un progetto qualunque le si installa senza
 * pensarci. Qui i byte che passano da questa funzione sono referti
 * medici: ogni dipendenza è codice non letto che li tocca, e la
 * superficie di aggiornamento di un pacchetto di terze parti — con i
 * suoi transitivi — è più grande della funzione stessa. Il lavoro vero
 * lo fa `zlib`, che è dentro Node ed è la stessa libreria che userebbe
 * qualunque pacchetto.
 *
 * Si legge la **directory centrale**, non i singoli header locali: è la
 * parte in fondo all'archivio che elenca ogni voce con la sua posizione.
 * Gli header locali possono dichiarare dimensioni a zero e rimandare a un
 * descrittore dopo i dati — succede con gli archivi scritti in streaming,
 * e chi legge solo gli header locali su quei file trova zero byte e non
 * capisce perché.
 */

export interface VoceZip {
  nome: string;
  /** 0 = memorizzato senza compressione, 8 = deflate. Sono gli unici due che Office usa. */
  metodo: number;
  offsetLocale: number;
  dimensioneCompressa: number;
  dimensioneOriginale: number;
}

export class ZipNonValido extends Error {
  constructor(motivo: string) {
    super(`Archivio non leggibile: ${motivo}`);
    this.name = "ZipNonValido";
  }
}

const FINE_DIRECTORY = 0x06054b50; // EOCD
const FINE_DIRECTORY_64 = 0x06064b50; // EOCD a 64 bit
const LOCALIZZATORE_64 = 0x07064b50;
const VOCE_DIRECTORY = 0x02014b50;
const HEADER_LOCALE = 0x04034b50;

function u16(d: Uint8Array, i: number): number {
  return d[i] | (d[i + 1] << 8);
}

function u32(d: Uint8Array, i: number): number {
  // `>>> 0` perché lo shift a 24 in JavaScript lavora con interi con
  // segno: senza, un archivio sopra i due gigabyte darebbe offset negativi.
  return ((d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0);
}

function u64(d: Uint8Array, i: number): number {
  // I ZIP a 64 bit dichiarano interi a otto byte. Number regge fino a
  // 2^53, che per un documento clinico è oltre ogni caso reale.
  return u32(d, i) + u32(d, i + 4) * 0x1_0000_0000;
}

/** Trova la firma di fine directory, cercando dal fondo. */
function trovaFineDirectory(d: Uint8Array): number {
  // Il commento finale può essere lungo fino a 65535 byte: oltre non si
  // cerca, perché oltre non può esserci.
  const minimo = Math.max(0, d.length - 65_557);
  for (let i = d.length - 22; i >= minimo; i -= 1) {
    if (u32(d, i) === FINE_DIRECTORY) return i;
  }
  return -1;
}

/**
 * L'elenco delle voci dell'archivio.
 *
 * Non decomprime niente: legge solo dove sta ciascun file. Su un `.xlsx`
 * di cento fogli serve quasi sempre un foglio solo, e decomprimere tutto
 * per prenderne uno sarebbe lavoro buttato.
 */
export function elencoZip(dati: Uint8Array): VoceZip[] {
  const fine = trovaFineDirectory(dati);
  if (fine < 0) throw new ZipNonValido("manca la directory centrale");

  let quante = u16(dati, fine + 10);
  let inizioDirectory = u32(dati, fine + 16);

  // ── Il caso a 64 bit ────────────────────────────────────────────
  // Quando i campi a 32 bit sono tutti a uno, i valori veri stanno nel
  // record esteso. Rarissimo per un documento Office, ma un archivio con
  // più di 65535 voci esiste, e leggerlo storto darebbe una directory
  // vuota senza dire perché.
  if (quante === 0xffff || inizioDirectory === 0xffff_ffff) {
    const localizzatore = fine - 20;
    if (localizzatore >= 0 && u32(dati, localizzatore) === LOCALIZZATORE_64) {
      const posizione64 = u64(dati, localizzatore + 8);
      if (posizione64 < dati.length && u32(dati, posizione64) === FINE_DIRECTORY_64) {
        quante = u64(dati, posizione64 + 32);
        inizioDirectory = u64(dati, posizione64 + 48);
      }
    }
  }

  const voci: VoceZip[] = [];
  let p = inizioDirectory;

  for (let i = 0; i < quante; i += 1) {
    if (p + 46 > dati.length || u32(dati, p) !== VOCE_DIRECTORY) break;

    const metodo = u16(dati, p + 10);
    const dimensioneCompressa = u32(dati, p + 20);
    const dimensioneOriginale = u32(dati, p + 24);
    const lunghezzaNome = u16(dati, p + 28);
    const lunghezzaExtra = u16(dati, p + 30);
    const lunghezzaCommento = u16(dati, p + 32);
    const offsetLocale = u32(dati, p + 42);

    const nome = new TextDecoder("utf-8").decode(
      dati.subarray(p + 46, p + 46 + lunghezzaNome),
    );

    voci.push({
      nome,
      metodo,
      offsetLocale,
      dimensioneCompressa,
      dimensioneOriginale,
    });

    p += 46 + lunghezzaNome + lunghezzaExtra + lunghezzaCommento;
  }

  return voci;
}

/**
 * Il contenuto di una voce, decompresso.
 *
 * L'header locale si rilegge qui e non si usa quello della directory
 * perché i due possono dichiarare lunghezze diverse per nome ed extra —
 * e i dati cominciano dopo quelli locali, non dopo quelli della directory.
 */
export function leggiVoce(dati: Uint8Array, voce: VoceZip): Uint8Array {
  const p = voce.offsetLocale;
  if (p + 30 > dati.length || u32(dati, p) !== HEADER_LOCALE) {
    throw new ZipNonValido(`intestazione mancante per «${voce.nome}»`);
  }

  const lunghezzaNome = u16(dati, p + 26);
  const lunghezzaExtra = u16(dati, p + 28);
  const inizio = p + 30 + lunghezzaNome + lunghezzaExtra;
  const grezzi = dati.subarray(inizio, inizio + voce.dimensioneCompressa);

  if (voce.metodo === 0) return grezzi;

  if (voce.metodo !== 8) {
    throw new ZipNonValido(
      `«${voce.nome}» usa una compressione che non conosco (metodo ${voce.metodo})`,
    );
  }

  try {
    // `inflateRaw` e non `inflate`: dentro un ZIP il flusso deflate non
    // ha l'intestazione zlib.
    return new Uint8Array(inflateRawSync(grezzi));
  } catch (errore) {
    throw new ZipNonValido(
      `«${voce.nome}» è corrotto: ${errore instanceof Error ? errore.message : String(errore)}`,
    );
  }
}

/**
 * Un archivio già aperto, da cui prendere le voci per nome.
 *
 * È la forma comoda per un OOXML, dove si sa in anticipo cosa cercare:
 * `word/document.xml`, `xl/sharedStrings.xml`.
 */
export class Archivio {
  private readonly dati: Uint8Array;
  private readonly indice: Map<string, VoceZip>;

  // I campi si dichiarano per esteso invece di usare le proprietà di
  // parametro: il test runner di Node esegue TypeScript togliendo i tipi
  // senza compilarlo, e quella scorciatoia di sintassi è l'unica che non
  // sopravvive al passaggio.
  constructor(dati: Uint8Array) {
    this.dati = dati;
    this.indice = new Map(elencoZip(dati).map((v) => [v.nome, v]));
  }

  ha(nome: string): boolean {
    return this.indice.has(nome);
  }

  nomi(): string[] {
    return [...this.indice.keys()];
  }

  /** Il contenuto binario di una voce, o null se non c'è. */
  byte(nome: string): Uint8Array | null {
    const voce = this.indice.get(nome);
    return voce ? leggiVoce(this.dati, voce) : null;
  }

  /** Il contenuto testuale di una voce, o null se non c'è. */
  testo(nome: string): string | null {
    const byte = this.byte(nome);
    return byte ? new TextDecoder("utf-8").decode(byte) : null;
  }

  /** Le voci il cui nome soddisfa un criterio, in ordine alfabetico. */
  cerca(criterio: (nome: string) => boolean): string[] {
    return this.nomi().filter(criterio).sort();
  }
}
