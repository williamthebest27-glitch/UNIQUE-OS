import "server-only";
import { leggiReferto } from "@/lib/clinical/lettura-referto";
import { testoDaDocumento } from "@/lib/clinical/testo-documento";
import type { DocumentExtraction } from "@/lib/brain/extraction";

/**
 * L'estrazione senza modello, nella forma che il resto del sistema si
 * aspetta.
 *
 * Restituisce esattamente ciò che restituiva il modello, così che
 * `validateExtraction` — il codice che decide cosa entra da solo e cosa
 * aspetta un medico — non sappia nemmeno chi ha letto il documento. È il
 * punto in cui si vede che l'architettura era giusta fin dall'inizio:
 * l'unico passo affidato al modello era la lettura, e sostituirlo tocca
 * un file solo.
 *
 * Quando il documento non è leggibile — una scansione, un'immagine — non
 * fallisce: torna un'estrazione vuota che dice perché. Il referto resta
 * in cartella e lo guarderà una persona.
 */
export async function estraiSenzaModello(input: {
  dati: Uint8Array;
  mimeType: string | null;
  oggi?: string;
}): Promise<DocumentExtraction & { non_riconosciute: string[] }> {
  const oggi = input.oggi ?? new Date().toISOString().slice(0, 10);
  const documento = await testoDaDocumento(input.dati, input.mimeType);

  if (!documento.leggibile) {
    return {
      document_kind: "other",
      document_date: null,
      measurements: [],
      summary:
        documento.motivo ??
        "Non sono riuscito a leggere il documento: resta in cartella per un professionista.",
      next_steps: [
        "Il documento non è stato analizzato in automatico: va letto da un professionista, oppure ricaricato in un formato con il testo selezionabile.",
      ],
      non_riconosciute: [],
    };
  }

  const esito = leggiReferto(documento.testo, oggi);

  return {
    document_kind: esito.document_kind,
    document_date: esito.document_date,
    measurements: esito.measurements,
    summary: esito.summary,
    next_steps: esito.next_steps,
    non_riconosciute: esito.non_riconosciute,
  };
}
