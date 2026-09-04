"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Quando una sezione non si carica.
 *
 * Tre regole, e nessuna è estetica.
 *
 * **Non si mostra l'errore tecnico.** A un paziente, «PGRST301» non dice
 * niente e spaventa; a chi ci lavora arriva comunque, dai log del server.
 *
 * **Si dice cosa non è successo.** «Non siamo riusciti a caricare questa
 * sezione» è diverso da «Qualcosa è andato storto»: la prima esclude che
 * i dati siano andati persi, la seconda lascia il dubbio.
 *
 * **Si offre una via d'uscita che funziona sempre.** Riprova, e se non
 * basta, tornare alla home — che è la pagina con meno dipendenze di
 * tutte.
 */
export default function ErroreSezione({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sul server questo errore è già tracciato con il suo stack. Qui
    // resta il digest, che è l'unico modo per ricollegare la segnalazione
    // di una persona alla riga giusta dei log.
    console.error("Sezione non caricata", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-[28px] leading-tight text-ink-900">
        Non siamo riusciti a caricare questa sezione
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
        I tuoi dati sono al sicuro: è il caricamento che non è andato a buon fine.
        Riprova fra un istante.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-ink-900 px-5 py-3 text-[15px] font-medium text-bone-50 transition-colors hover:bg-ink-800"
        >
          Riprova
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl px-5 py-3 text-[15px] font-medium text-ink-700 ring-1 ring-bone-300 transition-colors hover:bg-bone-100"
        >
          Torna alla home
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-ink-300">
          Se il problema resta, riferisci alla segreteria questo codice:{" "}
          <span className="tnum">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
