"use client";

import { useActionState } from "react";
import { apriFiloClinico, rispondiAlPaziente } from "@/lib/clinical/messaggi-actions";
import { statoTestoIniziale } from "@/lib/clinical/state";
import { cx } from "@/components/ui/primitives";

/**
 * Scrivere a un paziente.
 *
 * Due moduli, e la differenza fra loro non è la lunghezza: aprire una
 * conversazione richiede di **scegliere la categoria**, rispondere no —
 * la categoria del filo è già decisa e cambiarla a metà cambierebbe chi
 * legge le righe già scritte.
 */

function Esito({ stato }: { stato: { esito: string; messaggio?: string } }) {
  if (stato.esito === "iniziale") return null;

  return (
    <p
      role="status"
      className={cx(
        "mt-2 text-sm leading-relaxed",
        stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
      )}
    >
      {stato.messaggio}
    </p>
  );
}

const CAMPO =
  "w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

export function ApriFilo({ patientId }: { patientId: string }) {
  const [stato, azione, inCorso] = useActionState(apriFiloClinico, statoTestoIniziale);

  return (
    <form action={azione} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />

      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
          Oggetto
        </span>
        <input
          name="oggetto"
          disabled={inCorso}
          placeholder="Esito degli esami di settembre"
          className={cx(CAMPO, "mt-1.5")}
        />
      </label>

      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
          Messaggio
        </span>
        <textarea
          name="corpo"
          rows={4}
          disabled={inCorso}
          placeholder="Scrivi al paziente…"
          className={cx(CAMPO, "mt-1.5 resize-y")}
        />
      </label>

      <fieldset>
        <legend className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
          Chi lo legge
        </legend>
        <div className="mt-2 space-y-1.5">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="categoria"
              value="clinical"
              defaultChecked
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-ink-900">Clinico</span>
              <span className="block text-xs text-ink-400">
                Il paziente e il suo care team. La reception non lo vede.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="categoria"
              value="administrative"
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-ink-900">Amministrativo</span>
              <span className="block text-xs text-ink-400">
                Anche la reception, che è chi risponde di appuntamenti e fatture.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={inCorso}
        className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
      >
        {inCorso ? "Invio…" : "Apri la conversazione"}
      </button>

      <Esito stato={stato} />
    </form>
  );
}

export function Rispondi({
  threadId,
  patientId,
  chiuso,
}: {
  threadId: string;
  patientId: string;
  chiuso: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(rispondiAlPaziente, statoTestoIniziale);

  if (chiuso) {
    return (
      <p className="text-sm text-ink-400">
        Questa conversazione è chiusa. Riaprila per poter rispondere.
      </p>
    );
  }

  return (
    <form action={azione}>
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="patientId" value={patientId} />

      <label className="block">
        <span className="sr-only">Risposta</span>
        <textarea
          name="corpo"
          rows={3}
          disabled={inCorso}
          placeholder="Rispondi al paziente…"
          className={cx(CAMPO, "resize-y")}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={inCorso}
          className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {inCorso ? "Invio…" : "Rispondi"}
        </button>
        <span className="text-xs text-ink-400">
          Rispondere segna letto tutto il filo.
        </span>
      </div>

      <Esito stato={stato} />
    </form>
  );
}
