"use client";

import { useActionState, type ReactNode } from "react";
import { Bottone } from "@/components/control/primitives";
import type { EsitoGestione } from "@/lib/gestione/state";

/**
 * Un modulo del gestionale.
 *
 * I campi li decide chi lo usa; qui c'è quello che ogni modulo del banco
 * ha in comune: il bottone che si spegne mentre si salva, e la frase di
 * esito sotto — verde se è andata, ambra se no. Nessuna finestra
 * modale, nessun toast che sparisce prima di essere letto.
 */
export function ModuloAzione({
  action,
  invio,
  variante = "primario",
  className,
  children,
}: {
  action: (prev: EsitoGestione, formData: FormData) => Promise<EsitoGestione>;
  invio: string;
  variante?: "primario" | "quieto" | "pericolo";
  className?: string;
  children: ReactNode;
}) {
  const [stato, agisci, inCorso] = useActionState(action, null);

  return (
    <form action={agisci} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Bottone type="submit" variante={variante} disabled={inCorso}>
          {inCorso ? "Un attimo…" : invio}
        </Bottone>
        {stato ? (
          <p
            role="status"
            className={stato.esito === "ok" ? "text-sm text-brand-300" : "text-sm text-gold-300"}
          >
            {stato.messaggio}
          </p>
        ) : null}
      </div>
    </form>
  );
}
