"use client";

import { useActionState, useState } from "react";
import { revisionaDocumento } from "@/lib/documents/actions";
import { statoRevisioneIniziale } from "@/lib/documents/state";
import {
  ETICHETTE_REVISIONE,
  SPIEGAZIONI_REVISIONE,
  toStatoRevisione,
  tonoRevisione,
  type StatoRevisione,
} from "@/lib/documents/revisione";
import { Badge, cx } from "@/components/ui/primitives";
import { VerboQuieto } from "@/components/clinical/command-center";

/**
 * I due gesti su un referto: letto, e approvato.
 *
 * «Letto» lo può fare chiunque scriva in cartella. «Approvato» richiede
 * un medico, e il pulsante non compare a chi non può premerlo — non per
 * nascondere una funzione, ma perché una promessa che il database poi
 * rifiuta è peggio di un pulsante assente.
 *
 * La regola vera resta quella di Postgres, in `review_document`. Questa
 * è la sua copia per l'interfaccia, e se le due divergessero vince il
 * database: il messaggio d'errore che ne arriva viene mostrato così
 * com'è, perché dice esattamente cosa è mancato.
 */
export function RevisioneReferto({
  documentId,
  patientId,
  stato,
  revisionatoDa,
  puoApprovare,
}: {
  documentId: string;
  patientId: string;
  stato: string;
  revisionatoDa: string | null;
  puoApprovare: boolean;
}) {
  const [esito, azione, inCorso] = useActionState(
    revisionaDocumento,
    statoRevisioneIniziale,
  );
  const [notaAperta, setNotaAperta] = useState(false);

  // Lo stato che arriva dall'azione ha la precedenza finché la pagina
  // non si rigenera: è lo stesso dato, letto un istante prima.
  const corrente: StatoRevisione = toStatoRevisione(esito.stato ?? stato);

  return (
    <div className="flex flex-col items-end gap-2">
      <Badge tone={tonoRevisione(corrente)}>{ETICHETTE_REVISIONE[corrente]}</Badge>

      {revisionatoDa && corrente !== "pending" ? (
        <p className="text-xs text-ink-300">{revisionatoDa}</p>
      ) : null}

      <form action={azione} className="flex flex-wrap justify-end gap-1.5">
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="patientId" value={patientId} />

        {notaAperta ? (
          <input
            name="nota"
            placeholder="Nota di revisione"
            className="w-48 rounded-lg bg-white px-3 py-1.5 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
          />
        ) : null}

        {corrente === "pending" ? (
          <button
            type="submit"
            name="stato"
            value="reviewed"
            disabled={inCorso}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700 disabled:opacity-50"
          >
            Segna letto
          </button>
        ) : null}

        {corrente !== "approved" && puoApprovare ? (
          <button
            type="submit"
            name="stato"
            value="approved"
            disabled={inCorso}
            className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
          >
            Approva
          </button>
        ) : null}

        {corrente !== "pending" ? (
          <button
            type="submit"
            name="stato"
            value="pending"
            disabled={inCorso}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-400 ring-1 ring-bone-200 transition-colors hover:text-signal-alert disabled:opacity-50"
          >
            Rimetti in coda
          </button>
        ) : null}

        {!notaAperta && corrente !== "approved" ? (
          <VerboQuieto type="button" onClick={() => setNotaAperta(true)}>
            + nota
          </VerboQuieto>
        ) : null}
      </form>

      {corrente !== "approved" && !puoApprovare ? (
        <p className="max-w-[15rem] text-right text-xs leading-snug text-ink-300">
          Approvare un referto richiede un medico.
        </p>
      ) : null}

      {esito.esito !== "iniziale" ? (
        <p
          role="status"
          className={cx(
            "max-w-[16rem] text-right text-xs leading-snug",
            esito.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
          )}
        >
          {esito.messaggio}
        </p>
      ) : (
        <p className="max-w-[15rem] text-right text-xs leading-snug text-ink-300">
          {SPIEGAZIONI_REVISIONE[corrente]}
        </p>
      )}
    </div>
  );
}
