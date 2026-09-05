import { createHash } from "node:crypto";

/**
 * L'identità di un file: il suo contenuto, non il suo nome.
 *
 * Serve a riconoscere i duplicati, ed è l'unico modo che funziona. Il
 * nome no: lo stesso referto arriva come `analisi.pdf` dal paziente e
 * come `Rossi_Mario_12032026.pdf` dal laboratorio. La dimensione
 * nemmeno: due PDF diversi di 340 KB esistono. Il contenuto, byte per
 * byte, è l'unica cosa che due copie dello stesso documento hanno per
 * forza in comune.
 *
 * SHA-256 e non qualcosa di più veloce perché una collisione qui non
 * sarebbe un fastidio: sarebbe un referto scambiato per un altro,
 * silenziosamente, con il secondo che non viene analizzato perché il
 * sistema crede di averlo già visto.
 */
export function improntaDi(dati: Uint8Array): string {
  return createHash("sha256").update(dati).digest("hex");
}

/**
 * Cosa fare di un duplicato.
 *
 * Non si rifiuta il caricamento e non si cancella niente. Un paziente
 * che ricarica lo stesso referto lo fa quasi sempre perché non è sicuro
 * che il primo sia arrivato, e dirgli «l'hai già caricato» quando la
 * schermata precedente non glielo aveva confermato è il modo di far
 * perdere fiducia in un sistema.
 *
 * Si registra il file, si segnala il duplicato, e **non si rifà
 * l'analisi**: quella è già stata fatta e il risultato sarebbe identico.
 * Poi decide una persona.
 */
export interface EsitoDuplicato {
  duplicato: boolean;
  /** Il documento già in cartella con lo stesso contenuto. */
  documentoEsistente?: {
    id: string;
    titolo: string;
    caricatoIl: string;
    stessoPaziente: boolean;
  };
}
