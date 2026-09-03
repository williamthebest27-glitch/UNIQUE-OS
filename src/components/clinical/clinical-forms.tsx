"use client";

import { useActionState } from "react";
import { correggiCrediti, proponiStep, salvaNota } from "@/lib/clinical/actions";
import { statoTestoIniziale, type StatoTesto } from "@/lib/clinical/state";
import { cx } from "@/components/ui/primitives";

function Esito({ stato }: { stato: StatoTesto }) {
  if (stato.esito === "iniziale" || !stato.messaggio) return null;

  return (
    <p
      role="status"
      className={cx(
        "mt-3 rounded-xl px-3.5 py-2.5 text-sm",
        stato.esito === "ok"
          ? "bg-jade-50 text-jade-700"
          : "bg-[#fbf1ee] text-signal-alert",
      )}
    >
      {stato.messaggio}
    </p>
  );
}

const CAMPO =
  "w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-jade-500";

/**
 * Nota o valutazione.
 *
 * La condivisione col paziente è una spunta, spenta di default: si
 * condivide per scelta, non per svista. Ciò che un professionista scrive
 * per i colleghi ha un registro diverso da ciò che scrive al paziente.
 */
export function NoteForm({ patientId }: { patientId: string }) {
  const [stato, azione, inCorso] = useActionState(salvaNota, statoTestoIniziale);

  return (
    <form action={azione} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input name="title" placeholder="Titolo (facoltativo)" className={CAMPO} />
        <select name="kind" defaultValue="note" className={CAMPO}>
          <option value="note">Nota</option>
          <option value="assessment">Valutazione</option>
          <option value="visit_summary">Sintesi di visita</option>
        </select>
      </div>

      <textarea
        name="body"
        rows={4}
        required
        placeholder="Osservazioni, valutazione, indicazioni…"
        className={cx(CAMPO, "resize-y")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            name="visible"
            className="h-4 w-4 rounded border-bone-300 text-jade-700 focus:ring-jade-500"
          />
          Rendila visibile al paziente
        </label>

        <button
          type="submit"
          disabled={inCorso}
          className="rounded-xl bg-jade-700 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-jade-900 disabled:opacity-60"
        >
          {inCorso ? "Salvataggio…" : "Salva"}
        </button>
      </div>

      <Esito stato={stato} />
    </form>
  );
}

/**
 * Correzione manuale dei crediti.
 *
 * Il motivo è obbligatorio: una correzione senza spiegazione è un buco
 * nel registro, e il registro è l'unica storia che resta.
 */
export function CreditAdjustmentForm({ patientId }: { patientId: string }) {
  const [stato, azione, inCorso] = useActionState(correggiCrediti, statoTestoIniziale);

  return (
    <form action={azione} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder="+2 o −1"
          className={cx(CAMPO, "tnum")}
        />
        <input
          name="reason"
          required
          minLength={3}
          placeholder="Motivo della correzione"
          className={CAMPO}
        />
      </div>

      <button
        type="submit"
        disabled={inCorso}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 ring-1 ring-bone-200 transition-colors hover:text-jade-700 disabled:opacity-60"
      >
        {inCorso ? "Registro…" : "Registra la correzione"}
      </button>

      <Esito stato={stato} />
    </form>
  );
}

/**
 * Proposta di un nuovo step del percorso.
 *
 * Chiunque nel care team può proporre; la decisione resta al medico o alla
 * direzione. È la Row Level Security a imporlo, non questo form.
 */
export function StepProposalForm({ patientId }: { patientId: string }) {
  const [stato, azione, inCorso] = useActionState(proponiStep, statoTestoIniziale);

  return (
    <form action={azione} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />

      <input
        name="title"
        required
        placeholder="Es. Aggiungere due sedute di osteopatia"
        className={CAMPO}
      />
      <textarea
        name="description"
        rows={3}
        placeholder="Perché, e cosa dovrebbe cambiare nel percorso"
        className={cx(CAMPO, "resize-y")}
      />

      <button
        type="submit"
        disabled={inCorso}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 ring-1 ring-bone-200 transition-colors hover:text-jade-700 disabled:opacity-60"
      >
        {inCorso ? "Invio…" : "Proponi lo step"}
      </button>

      <Esito stato={stato} />
    </form>
  );
}
