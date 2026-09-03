"use client";

import { useActionState, useRef } from "react";
import { caricaDocumento } from "@/lib/documents/actions";
import {
  ACCEPT_ATTRIBUTE,
  DIMENSIONE_MASSIMA_BYTE,
  statoUploadIniziale,
} from "@/lib/documents/state";
import { cx } from "@/components/ui/primitives";

const CATEGORIE = [
  ["other", "Non lo so / altro"],
  ["lab_report", "Esame di laboratorio"],
  ["imaging", "Diagnostica per immagini"],
  ["prescription", "Prescrizione"],
  ["care_plan", "Piano di cura"],
  ["consent", "Consenso"],
] as const;

/**
 * Caricamento di un referto.
 *
 * La categoria è facoltativa e parte da "non lo so": il motore la
 * riconosce da solo, e chiederla al paziente sarebbe scaricare su di lui
 * un lavoro che il sistema sa fare.
 */
export function UploadForm({ patientId }: { patientId?: string }) {
  const [stato, azione, inCorso] = useActionState(caricaDocumento, statoUploadIniziale);
  const formRef = useRef<HTMLFormElement>(null);

  if (stato.esito === "ok" && formRef.current && !inCorso) {
    formRef.current.reset();
  }

  return (
    <form ref={formRef} action={azione} className="space-y-3">
      {patientId ? <input type="hidden" name="patientId" value={patientId} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="file" className="block text-[13px] font-medium text-ink-700">
            File
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={ACCEPT_ATTRIBUTE}
            className={cx(
              "mt-1.5 w-full rounded-xl bg-bone-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-bone-200",
              "file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-1.5",
              "file:text-xs file:font-medium file:text-bone-50 hover:file:bg-ink-800",
            )}
          />
        </div>

        <div>
          <label htmlFor="kind" className="block text-[13px] font-medium text-ink-700">
            Categoria
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue="other"
            className="mt-1.5 w-full rounded-xl bg-bone-50 px-3 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-jade-500"
          >
            {CATEGORIE.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="title" className="block text-[13px] font-medium text-ink-700">
          Titolo <span className="font-normal text-ink-400">(facoltativo)</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          placeholder="Se lo lasci vuoto usiamo il nome del file"
          className="mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-jade-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={inCorso}
          className="rounded-xl bg-jade-700 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-jade-900 disabled:opacity-60"
        >
          {inCorso ? "Caricamento e analisi…" : "Carica documento"}
        </button>
        <span className="text-xs text-ink-400">
          PDF o immagine, fino a {Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB
        </span>
      </div>

      {stato.esito !== "iniziale" && stato.messaggio ? (
        <p
          role="status"
          className={cx(
            "rounded-xl px-3.5 py-3 text-sm",
            stato.esito === "ok"
              ? "bg-jade-50 text-jade-700"
              : "bg-[#fbf1ee] text-signal-alert",
          )}
        >
          {stato.messaggio}
          {stato.dettaglio ? (
            <span className="mt-1 block text-ink-500">{stato.dettaglio}</span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
