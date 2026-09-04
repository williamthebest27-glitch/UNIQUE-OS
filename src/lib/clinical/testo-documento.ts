import "server-only";

/**
 * Il testo dentro un documento.
 *
 * Un referto in PDF non è un'immagine di parole: quasi sempre è testo, e
 * il testo si può leggere senza chiedere niente a nessuno. Quello che
 * serve è ricostruire le righe, perché un PDF non le ha — ha frammenti
 * con una posizione, e la riga è un'informazione che si ricava dalla
 * coordinata verticale.
 *
 * Senza questa ricostruzione l'intero referto arriva come una riga sola,
 * e "Glicemia 102 Colesterolo LDL 142" diventa indistinguibile da una
 * tabella. Con la ricostruzione, ogni esame torna sulla sua riga con il
 * suo valore accanto.
 *
 * Un documento scansionato è invece davvero un'immagine, e qui non c'è
 * riconoscimento ottico. Si dichiara, non si tenta: un referto letto male
 * è peggio di un referto non letto.
 */

export interface TestoDocumento {
  testo: string;
  leggibile: boolean;
  /** Perché non è leggibile, quando non lo è. In italiano, per chi lo vedrà. */
  motivo?: string;
  pagine: number;
}

/** Tolleranza verticale entro cui due frammenti stanno sulla stessa riga. */
const STESSA_RIGA = 2.5;

async function daPdf(dati: Uint8Array): Promise<TestoDocumento> {
  // Import dinamico: la libreria è pesante e serve solo quando arriva un
  // PDF, non a ogni richiesta dell'applicazione.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const documento = await getDocument({
    data: dati,
    // Niente rete e niente font di sistema: qui si legge del testo, non
    // si rende una pagina.
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  const righe: string[] = [];

  for (let p = 1; p <= documento.numPages; p += 1) {
    const pagina = await documento.getPage(p);
    const contenuto = await pagina.getTextContent();

    // Raggruppa per coordinata verticale: è la riga.
    const perRiga = new Map<number, { x: number; testo: string }[]>();

    for (const elemento of contenuto.items) {
      if (!("str" in elemento) || elemento.str.trim().length === 0) continue;

      const y = Math.round((elemento.transform[5] as number) / STESSA_RIGA) * STESSA_RIGA;
      const x = elemento.transform[4] as number;
      perRiga.set(y, [...(perRiga.get(y) ?? []), { x, testo: elemento.str }]);
    }

    // Dall'alto verso il basso: nel PDF la y cresce salendo.
    const ordinate = [...perRiga.entries()].sort((a, b) => b[0] - a[0]);

    for (const [, frammenti] of ordinate) {
      const riga = frammenti
        .sort((a, b) => a.x - b.x)
        .map((f) => f.testo)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (riga.length > 0) righe.push(riga);
    }
  }

  const testo = righe.join("\n");

  return {
    testo,
    // Un PDF scansionato ha pagine e nessun testo: è la firma
    // inconfondibile di un'immagine dentro un contenitore.
    leggibile: testo.trim().length > 0,
    motivo:
      testo.trim().length > 0
        ? undefined
        : "Il PDF non contiene testo: è una scansione. Serve un riconoscimento ottico, che il motore proprietario non ha.",
    pagine: documento.numPages,
  };
}

/**
 * Il testo di un documento, qualunque cosa sia arrivata.
 *
 * Non solleva mai per un formato che non sa leggere: restituisce
 * `leggibile: false` e il motivo. Chi ha caricato un referto deve sapere
 * perché non è stato analizzato, e il documento resta comunque in
 * cartella.
 */
export async function testoDaDocumento(
  dati: Uint8Array,
  mimeType: string | null,
): Promise<TestoDocumento> {
  const tipo = (mimeType ?? "").toLowerCase();

  if (tipo.includes("pdf")) {
    try {
      return await daPdf(dati);
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      return {
        testo: "",
        leggibile: false,
        motivo: `PDF non leggibile: ${messaggio}`,
        pagine: 0,
      };
    }
  }

  if (tipo.startsWith("text/") || tipo.includes("csv") || tipo.includes("json")) {
    return {
      testo: new TextDecoder("utf-8").decode(dati),
      leggibile: true,
      pagine: 1,
    };
  }

  if (tipo.startsWith("image/")) {
    return {
      testo: "",
      leggibile: false,
      motivo:
        "È un'immagine: leggerla richiede un riconoscimento ottico o un modello. Il documento resta in cartella e può analizzarlo un professionista.",
      pagine: 1,
    };
  }

  return {
    testo: "",
    leggibile: false,
    motivo: `Formato non riconosciuto (${mimeType ?? "sconosciuto"}).`,
    pagine: 0,
  };
}
