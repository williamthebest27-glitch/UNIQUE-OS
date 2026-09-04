"use client";

import { useActionState, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";
import type { EsitoPaziente } from "@/lib/patient/actions";

/**
 * Un modulo della Patient App.
 *
 * Quello che ogni modulo ha in comune: il bottone che si spegne mentre
 * salva, e l'esito sotto, in una frase. Nessuna finestra modale, nessun
 * avviso che sparisce prima di essere letto — chi compila un questionario
 * clinico deve poter rileggere cosa è successo.
 */

export function Bottone({
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "quieto" | "chiaro";
}) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-medium transition-colors disabled:opacity-40",
        variante === "primario" && "bg-ink-900 text-bone-50 hover:bg-ink-800",
        variante === "quieto" && "ring-1 ring-bone-300 text-ink-700 hover:bg-bone-100",
        variante === "chiaro" && "bg-brand-50 text-brand-700 hover:bg-brand-100",
        className,
      )}
    />
  );
}

export function Modulo({
  action,
  invio,
  variante = "primario",
  className,
  azioniExtra,
  children,
}: {
  action: (prev: EsitoPaziente, formData: FormData) => Promise<EsitoPaziente>;
  invio: string;
  variante?: "primario" | "quieto" | "chiaro";
  className?: string;
  /** Bottoni aggiuntivi, ad esempio «Salva e continua dopo». */
  azioniExtra?: ReactNode;
  children: ReactNode;
}) {
  const [stato, agisci, inCorso] = useActionState(action, null);

  return (
    <form action={agisci} className={className}>
      {children}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Bottone type="submit" variante={variante} disabled={inCorso}>
          {inCorso ? "Un attimo…" : invio}
        </Bottone>
        {azioniExtra}
        {stato ? (
          <p
            role="status"
            className={cx(
              "text-sm",
              stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
            )}
          >
            {stato.messaggio}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Un interruttore che si salva da solo.
 *
 * Per i consensi e le preferenze: un bottone «Salva» sotto a una fila di
 * spunte fa dimenticare a metà delle persone di premerlo, e un consenso
 * dimenticato è un consenso non dato.
 */
export function Interruttore({
  action,
  attivo,
  campi,
  etichetta,
  spiegazione,
  bloccato,
}: {
  action: (prev: EsitoPaziente, formData: FormData) => Promise<EsitoPaziente>;
  attivo: boolean;
  /** Campi nascosti che identificano cosa si sta cambiando. */
  campi: Record<string, string>;
  etichetta: string;
  spiegazione?: string;
  /** Quando è obbligatorio: si può dare, non togliere da qui. */
  bloccato?: boolean;
}) {
  const [stato, agisci, inCorso] = useActionState(action, null);

  return (
    <form action={agisci} className="flex items-start gap-4 px-6 py-4">
      {Object.entries(campi).map(([nome, valore]) => (
        <input key={nome} type="hidden" name={nome} value={valore} />
      ))}
      <input type="hidden" name="concesso" value={attivo ? "false" : "true"} />

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink-900">{etichetta}</p>
        {spiegazione ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{spiegazione}</p>
        ) : null}
        {stato ? (
          <p
            role="status"
            className={cx(
              "mt-1.5 text-sm",
              stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
            )}
          >
            {stato.messaggio}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={inCorso || (bloccato && attivo)}
        role="switch"
        aria-checked={attivo}
        aria-label={etichetta}
        title={bloccato && attivo ? "Necessario per usare Unique OS" : undefined}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          attivo ? "bg-brand-600" : "bg-bone-300",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[var(--ease-out-expo)]",
            attivo ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </form>
  );
}
