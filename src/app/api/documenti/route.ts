import { NextResponse, type NextRequest } from "next/server";
import { caricaFile } from "@/lib/documents/caricamento";
import { DIMENSIONE_MASSIMA_BYTE } from "@/lib/documents/state";

/**
 * Il caricamento con la barra di avanzamento.
 *
 * Una server action non può dire a che punto è la trasmissione: il
 * browser manda il corpo e la funzione parte quando è arrivato tutto.
 * Su una fotografia di un referto da otto megabyte fatta col telefono in
 * ascensore, quella differenza è tra una barra che cresce e trenta
 * secondi di schermo fermo — e uno schermo fermo, su un telefono, si
 * chiude.
 *
 * `XMLHttpRequest` invece espone `upload.onprogress`, e questa rotta
 * esiste per riceverlo. Non duplica niente: chiama la stessa
 * `caricaFile` della server action, con gli stessi controlli di accesso
 * e la stessa politica sui duplicati.
 *
 * Il modulo continua a funzionare senza JavaScript: in quel caso il
 * `<form>` passa dalla server action e questa rotta non viene toccata.
 */

export async function POST(request: NextRequest) {
  // Il limite si controlla prima di leggere il corpo: leggerlo per poi
  // rifiutarlo significherebbe aver già trasferito i megabyte.
  const dichiarata = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(dichiarata) && dichiarata > DIMENSIONE_MASSIMA_BYTE + 64 * 1024) {
    return NextResponse.json(
      {
        esito: "errore",
        messaggio: `Il file supera gli ${Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB consentiti.`,
      },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { esito: "errore", messaggio: "Il caricamento si è interrotto. Riprova." },
      { status: 400 },
    );
  }

  try {
    const esito = await caricaFile(formData);
    // L'esito porta già il proprio stato: un formato rifiutato è una
    // risposta valida della funzione, non un errore del server.
    return NextResponse.json(esito, { status: esito.esito === "errore" ? 400 : 200 });
  } catch (errore) {
    // Il messaggio vero resta nei log del server. A chi ha caricato si
    // dice che il file è al sicuro, perché quasi sempre lo è: gli errori
    // che arrivano fin qui sono di lettura, non di conservazione.
    console.error("[documenti] caricamento non riuscito:", errore);
    return NextResponse.json(
      {
        esito: "errore",
        messaggio: "Il caricamento non è riuscito. Riprova, oppure segnalalo alla clinica.",
      },
      { status: 500 },
    );
  }
}
