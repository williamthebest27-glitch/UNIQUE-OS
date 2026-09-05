/**
 * Un archivio ZIP costruito a mano, per i test.
 *
 * Serve a provare il lettore di `zip.ts` — e con lui quelli di Word ed
 * Excel — senza tenere file binari nel repository. Un `.xlsx` di prova
 * committato è un file che nessuno rilegge mai e che nessuno sa più come
 * è stato generato; questo si legge, e se un giorno il lettore cambia si
 * capisce subito se il test lo stava provando davvero.
 *
 * Scrive con metodo **stored**, senza compressione: il ZIP resta valido
 * e la funzione resta corta. Il percorso deflate del lettore è provato
 * dai file veri, che è l'unico posto in cui conta davvero.
 */

/** La tabella CRC-32, calcolata una volta sola. */
const TABELLA_CRC = (() => {
  const tabella = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabella[n] = c >>> 0;
  }
  return tabella;
})();

function crc32(dati: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of dati) c = TABELLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function scriviU16(vista: DataView, posizione: number, valore: number): void {
  vista.setUint16(posizione, valore, true);
}

function scriviU32(vista: DataView, posizione: number, valore: number): void {
  vista.setUint32(posizione, valore >>> 0, true);
}

/**
 * Compone un archivio dalle coppie nome/contenuto.
 *
 * Il contenuto può essere testo — il caso normale, dato che dentro un
 * OOXML c'è XML — oppure byte, per provare un file binario.
 */
export function zipDiProva(voci: [nome: string, contenuto: string | Uint8Array][]): Uint8Array {
  const codificatore = new TextEncoder();

  const preparate = voci.map(([nome, contenuto]) => {
    const nomeByte = codificatore.encode(nome);
    const dati = typeof contenuto === "string" ? codificatore.encode(contenuto) : contenuto;
    return { nomeByte, dati, crc: crc32(dati) };
  });

  const dimensioneLocale = preparate.reduce(
    (n, v) => n + 30 + v.nomeByte.length + v.dati.length,
    0,
  );
  const dimensioneDirectory = preparate.reduce((n, v) => n + 46 + v.nomeByte.length, 0);

  const archivio = new Uint8Array(dimensioneLocale + dimensioneDirectory + 22);
  const vista = new DataView(archivio.buffer);

  // ── Le voci ─────────────────────────────────────────────────────
  const offset: number[] = [];
  let p = 0;

  for (const voce of preparate) {
    offset.push(p);

    scriviU32(vista, p, 0x04034b50); // firma locale
    scriviU16(vista, p + 4, 20); // versione minima
    scriviU16(vista, p + 6, 0); // nessun flag
    scriviU16(vista, p + 8, 0); // metodo: stored
    scriviU16(vista, p + 10, 0); // ora
    scriviU16(vista, p + 12, 0); // data
    scriviU32(vista, p + 14, voce.crc);
    scriviU32(vista, p + 18, voce.dati.length);
    scriviU32(vista, p + 22, voce.dati.length);
    scriviU16(vista, p + 26, voce.nomeByte.length);
    scriviU16(vista, p + 28, 0); // nessun campo extra

    archivio.set(voce.nomeByte, p + 30);
    archivio.set(voce.dati, p + 30 + voce.nomeByte.length);

    p += 30 + voce.nomeByte.length + voce.dati.length;
  }

  // ── La directory centrale ───────────────────────────────────────
  const inizioDirectory = p;

  preparate.forEach((voce, indice) => {
    scriviU32(vista, p, 0x02014b50);
    scriviU16(vista, p + 4, 20); // versione di chi ha scritto
    scriviU16(vista, p + 6, 20); // versione minima
    scriviU16(vista, p + 8, 0);
    scriviU16(vista, p + 10, 0); // metodo: stored
    scriviU16(vista, p + 12, 0);
    scriviU16(vista, p + 14, 0);
    scriviU32(vista, p + 16, voce.crc);
    scriviU32(vista, p + 20, voce.dati.length);
    scriviU32(vista, p + 24, voce.dati.length);
    scriviU16(vista, p + 28, voce.nomeByte.length);
    scriviU16(vista, p + 30, 0);
    scriviU16(vista, p + 32, 0); // nessun commento
    scriviU16(vista, p + 34, 0); // disco
    scriviU16(vista, p + 36, 0); // attributi interni
    scriviU32(vista, p + 38, 0); // attributi esterni
    scriviU32(vista, p + 42, offset[indice]);

    archivio.set(voce.nomeByte, p + 46);
    p += 46 + voce.nomeByte.length;
  });

  // ── La fine ─────────────────────────────────────────────────────
  scriviU32(vista, p, 0x06054b50);
  scriviU16(vista, p + 4, 0); // disco
  scriviU16(vista, p + 6, 0); // disco della directory
  scriviU16(vista, p + 8, preparate.length);
  scriviU16(vista, p + 10, preparate.length);
  scriviU32(vista, p + 12, p - inizioDirectory);
  scriviU32(vista, p + 16, inizioDirectory);
  scriviU16(vista, p + 20, 0); // nessun commento

  return archivio;
}
