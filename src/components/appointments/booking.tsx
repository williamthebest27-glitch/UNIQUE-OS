"use client";

import { useActionState } from "react";
import { disdiciAppuntamento, prenotaSlot } from "@/lib/appointments/actions";
import { statoPrenotazioneIniziale } from "@/lib/appointments/state";
import { cancellationNotice } from "@/lib/credits/rules";
import { formatCredits } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

/**
 * Disdetta.
 *
 * L'avviso sull'addebito compare **prima** di confermare. La regola vera
 * la applica il database; qui serve solo che il paziente non la scopra
 * dopo, leggendo il saldo.
 */
export function CancelButton({
  appointmentId,
  startsAt,
  credits,
}: {
  appointmentId: string;
  startsAt: string;
  credits: number;
}) {
  const [stato, azione, inCorso] = useActionState(
    disdiciAppuntamento,
    statoPrenotazioneIniziale,
  );

  if (stato.esito === "ok") {
    return <p className="text-sm text-jade-700">{stato.messaggio}</p>;
  }

  return (
    <form action={azione} className="space-y-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <p className="text-xs text-ink-400">{cancellationNotice(startsAt, credits)}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          name="reason"
          placeholder="Motivo (facoltativo)"
          className="w-44 rounded-lg bg-bone-50 px-3 py-1.5 text-sm ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-jade-500"
        />
        <button
          type="submit"
          disabled={inCorso}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-signal-alert disabled:opacity-60"
        >
          {inCorso ? "…" : "Disdici"}
        </button>
      </div>

      {stato.esito === "errore" ? (
        <p role="alert" className="text-sm text-signal-alert">
          {stato.messaggio}
        </p>
      ) : null}
    </form>
  );
}

/** Prenotazione di uno slot libero. */
export function BookButton({
  slotId,
  credits,
  disabled,
}: {
  slotId: string;
  credits: number;
  disabled?: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(prenotaSlot, statoPrenotazioneIniziale);

  if (stato.esito === "ok") {
    return <span className="text-sm text-jade-700">{stato.messaggio}</span>;
  }

  return (
    <form action={azione} className="text-right">
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        disabled={inCorso || disabled}
        className={cx(
          "rounded-lg bg-jade-700 px-3.5 py-2 text-sm font-medium text-bone-50",
          "transition-colors hover:bg-jade-900 disabled:opacity-50",
        )}
      >
        {inCorso ? "Prenoto…" : `Prenota · ${formatCredits(credits)}`}
      </button>

      {stato.esito === "errore" ? (
        <p role="alert" className="mt-1.5 max-w-[220px] text-xs text-signal-alert">
          {stato.messaggio}
        </p>
      ) : null}
    </form>
  );
}
