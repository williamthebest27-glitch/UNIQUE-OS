/**
 * Il contenitore dei documenti Office fino al 2003.
 *
 * Un `.doc` o un `.xls` non è un file: è un piccolo file system dentro un
 * file. Ha settori di dimensione fissa, una tabella di allocazione che
 * dice quale settore segue quale — le catene sono la stessa idea della
 * FAT dei floppy disk, e il nome non è una coincidenza — e una directory
 * con i nomi dei flussi contenuti.
 *
 * Serve a leggere i formati che i laboratori italiani ancora esportano.
 * Un gestionale di analisi comprato nel 2009 esporta `.xls`, non `.xlsx`,
 * e rifiutarlo vorrebbe dire rifiutare i referti di chi lo usa.
 *
 * Due dettagli che rendono il formato meno ovvio di quanto sembri:
 *
 *   I flussi **piccoli** — sotto i 4096 byte — non stanno nei settori
 *   normali. Stanno dentro un flusso apposito, diviso in mini-settori da
 *   64 byte, con una sua tabella di allocazione. Chi lo ignora legge
 *   spazzatura da metà dei flussi di un `.xls`.
 *
 *   La FAT stessa è troppo grande per stare nell'intestazione: i primi
 *   109 settori sono elencati lì, il resto in una catena di settori DIFAT.
 */

const FIRMA = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Marcatori di fine catena e di settore speciale. */
const FINE_CATENA = 0xfffffffe;
const SETTORE_LIBERO = 0xffffffff;

export class CfbNonValido extends Error {
  constructor(motivo: string) {
    super(`Documento Office non leggibile: ${motivo}`);
    this.name = "CfbNonValido";
  }
}

export interface VoceDirectory {
  nome: string;
  /** 1 = archivio (cartella), 2 = flusso (file), 5 = radice. */
  tipo: number;
  settoreIniziale: number;
  dimensione: number;
}

function u16(d: Uint8Array, i: number): number {
  return d[i] | (d[i + 1] << 8);
}

function u32(d: Uint8Array, i: number): number {
  return (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;
}

export function sembraCfb(dati: Uint8Array): boolean {
  if (dati.length < 512) return false;
  return FIRMA.every((b, i) => dati[i] === b);
}

/**
 * Un contenitore aperto: la directory è già letta, i flussi si prendono
 * per nome.
 */
export class Contenitore {
  private readonly dati: Uint8Array;
  private readonly dimensioneSettore: number;
  private readonly dimensioneMiniSettore: number;
  private readonly sogliaMini: number;
  private readonly fat: number[];
  private readonly miniFat: number[];
  private readonly voci: VoceDirectory[];
  private readonly miniFlusso: Uint8Array;

  // I campi si dichiarano per esteso invece di usare le proprietà di
  // parametro: il test runner di Node esegue TypeScript togliendo i tipi
  // senza compilarlo, e quella scorciatoia di sintassi è l'unica che non
  // sopravvive al passaggio.
  constructor(dati: Uint8Array) {
    this.dati = dati;
    if (!sembraCfb(dati)) throw new CfbNonValido("firma assente");

    this.dimensioneSettore = 1 << u16(dati, 30);
    this.dimensioneMiniSettore = 1 << u16(dati, 32);
    this.sogliaMini = u32(dati, 56);

    if (this.dimensioneSettore < 128 || this.dimensioneSettore > 1 << 20) {
      throw new CfbNonValido("dimensione dei settori fuori scala");
    }

    this.fat = this.leggiFat();

    const primoDirectory = u32(dati, 48);
    this.voci = this.leggiDirectory(primoDirectory);

    // Il mini-flusso è il contenuto della voce radice, e la sua tabella
    // di allocazione sta in una catena a parte.
    const radice = this.voci.find((v) => v.tipo === 5);
    this.miniFat = this.catenaVerso(u32(dati, 60)).flatMap((s) => this.numeriDelSettore(s));
    this.miniFlusso = radice
      ? this.concatena(this.catenaVerso(radice.settoreIniziale), radice.dimensione)
      : new Uint8Array(0);
  }

  /* ── Settori ────────────────────────────────────────────────────── */

  private inizioSettore(numero: number): number {
    // Il settore 0 comincia subito dopo l'intestazione, che è lunga
    // quanto un settore quando i settori sono da 512 byte.
    return 512 + numero * this.dimensioneSettore;
  }

  private settore(numero: number): Uint8Array {
    const da = this.inizioSettore(numero);
    return this.dati.subarray(da, da + this.dimensioneSettore);
  }

  private numeriDelSettore(numero: number): number[] {
    const s = this.settore(numero);
    const out: number[] = [];
    for (let i = 0; i + 4 <= s.length; i += 4) out.push(u32(s, i));
    return out;
  }

  /** La tabella di allocazione, ricomposta dai suoi pezzi. */
  private leggiFat(): number[] {
    const settoriFat: number[] = [];

    // I primi 109 riferimenti stanno nell'intestazione.
    for (let i = 0; i < 109; i += 1) {
      const numero = u32(this.dati, 76 + i * 4);
      if (numero === SETTORE_LIBERO || numero === FINE_CATENA) break;
      settoriFat.push(numero);
    }

    // Il resto in una catena di settori DIFAT, ciascuno dei quali finisce
    // con il puntatore al successivo.
    let difat = u32(this.dati, 68);
    let quanti = u32(this.dati, 72);
    const perSettore = this.dimensioneSettore / 4;
    // Il contatore dichiarato può mentire su un file corrotto: il limite
    // vero è che non si può leggere più DIFAT dei settori che esistono.
    const massimo = Math.ceil(this.dati.length / this.dimensioneSettore) + 1;

    while (difat !== FINE_CATENA && difat !== SETTORE_LIBERO && quanti > 0 && quanti < massimo) {
      const numeri = this.numeriDelSettore(difat);
      for (let i = 0; i < perSettore - 1; i += 1) {
        const numero = numeri[i];
        if (numero === SETTORE_LIBERO || numero === FINE_CATENA) break;
        settoriFat.push(numero);
      }
      difat = numeri[perSettore - 1];
      quanti -= 1;
    }

    return settoriFat.flatMap((s) => this.numeriDelSettore(s));
  }

  /**
   * La catena dei settori di un flusso, dal primo alla fine.
   *
   * Il contatore di sicurezza non è pignoleria: un file corrotto — o
   * costruito apposta — può avere una catena che punta a se stessa, e
   * senza il limite questa funzione non tornerebbe mai.
   */
  private catenaVerso(primo: number): number[] {
    const catena: number[] = [];
    const massimo = this.fat.length + 1;
    let corrente = primo;

    while (
      corrente !== FINE_CATENA &&
      corrente !== SETTORE_LIBERO &&
      corrente >= 0 &&
      corrente < this.fat.length &&
      catena.length < massimo
    ) {
      catena.push(corrente);
      corrente = this.fat[corrente];
    }

    return catena;
  }

  private catenaMini(primo: number): number[] {
    const catena: number[] = [];
    const massimo = this.miniFat.length + 1;
    let corrente = primo;

    while (
      corrente !== FINE_CATENA &&
      corrente !== SETTORE_LIBERO &&
      corrente >= 0 &&
      corrente < this.miniFat.length &&
      catena.length < massimo
    ) {
      catena.push(corrente);
      corrente = this.miniFat[corrente];
    }

    return catena;
  }

  private concatena(settori: number[], dimensione: number): Uint8Array {
    const out = new Uint8Array(Math.min(dimensione, settori.length * this.dimensioneSettore));
    let scritti = 0;

    for (const numero of settori) {
      if (scritti >= out.length) break;
      const pezzo = this.settore(numero);
      const quanti = Math.min(pezzo.length, out.length - scritti);
      out.set(pezzo.subarray(0, quanti), scritti);
      scritti += quanti;
    }

    return out;
  }

  private concatenaMini(settori: number[], dimensione: number): Uint8Array {
    const out = new Uint8Array(Math.min(dimensione, settori.length * this.dimensioneMiniSettore));
    let scritti = 0;

    for (const numero of settori) {
      if (scritti >= out.length) break;
      const da = numero * this.dimensioneMiniSettore;
      const pezzo = this.miniFlusso.subarray(da, da + this.dimensioneMiniSettore);
      const quanti = Math.min(pezzo.length, out.length - scritti);
      out.set(pezzo.subarray(0, quanti), scritti);
      scritti += quanti;
    }

    return out;
  }

  /* ── Directory ──────────────────────────────────────────────────── */

  private leggiDirectory(primo: number): VoceDirectory[] {
    const grezzo = this.concatena(this.catenaVerso(primo), Number.MAX_SAFE_INTEGER);
    const voci: VoceDirectory[] = [];

    for (let p = 0; p + 128 <= grezzo.length; p += 128) {
      const tipo = grezzo[p + 66];
      if (tipo === 0) continue; // voce non usata

      // Il nome è UTF-16 little endian, e la lunghezza dichiarata
      // include il terminatore.
      const byteNome = u16(grezzo, p + 64);
      const quanti = Math.max(0, Math.min(byteNome, 64) - 2);
      let nome = "";
      for (let i = 0; i < quanti; i += 2) {
        const codice = u16(grezzo, p + i);
        if (codice === 0) break;
        nome += String.fromCharCode(codice);
      }

      voci.push({
        nome,
        tipo,
        settoreIniziale: u32(grezzo, p + 116),
        // La dimensione è a 64 bit, ma la parte alta è zero per
        // qualunque documento reale.
        dimensione: u32(grezzo, p + 120),
      });
    }

    return voci;
  }

  /* ── Interfaccia ────────────────────────────────────────────────── */

  nomi(): string[] {
    return this.voci.filter((v) => v.tipo === 2).map((v) => v.nome);
  }

  /**
   * Il contenuto di un flusso.
   *
   * Qui si decide fra settori normali e mini-settori: sotto la soglia il
   * flusso vive dentro il mini-flusso della radice, e leggerlo dai
   * settori normali darebbe byte di un altro flusso.
   */
  flusso(nome: string): Uint8Array | null {
    const voce = this.voci.find((v) => v.tipo === 2 && v.nome === nome);
    if (!voce) return null;

    return voce.dimensione < this.sogliaMini
      ? this.concatenaMini(this.catenaMini(voce.settoreIniziale), voce.dimensione)
      : this.concatena(this.catenaVerso(voce.settoreIniziale), voce.dimensione);
  }

  /** Il primo flusso il cui nome soddisfa il criterio. */
  cerca(criterio: (nome: string) => boolean): Uint8Array | null {
    const voce = this.voci.find((v) => v.tipo === 2 && criterio(v.nome));
    return voce ? this.flusso(voce.nome) : null;
  }
}
