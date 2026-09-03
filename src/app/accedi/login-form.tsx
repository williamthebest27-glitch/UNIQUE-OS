"use client";

import { useActionState } from "react";
import { richiediAccesso } from "@/lib/auth-actions";
import { statoAccessoIniziale } from "@/lib/auth-state";

export function LoginForm({ next }: { next?: string }) {
  const [stato, azione, inCorso] = useActionState(
    richiediAccesso,
    statoAccessoIniziale,
  );

  if (stato.esito === "inviato") {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-brand-600">
            <path
              d="m4.5 12.5 5 5 10-11"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 className="mt-5 font-display text-[22px] text-ink-900">
          Controlla la tua posta
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Abbiamo inviato un link di accesso a{" "}
          <span className="font-medium text-ink-800">{stato.email}</span>.
          Il collegamento resta valido per un’ora.
        </p>
      </div>
    );
  }

  return (
    <form action={azione} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label
          htmlFor="email"
          className="block text-[13px] font-medium text-ink-700"
        >
          Indirizzo email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={stato.email}
          aria-invalid={stato.esito === "errore" || undefined}
          aria-describedby={stato.esito === "errore" ? "errore-accesso" : undefined}
          className="mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 transition-shadow placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
          placeholder="nome@esempio.it"
        />
      </div>

      {stato.esito === "errore" && stato.messaggio ? (
        <p id="errore-accesso" role="alert" className="text-sm text-signal-alert">
          {stato.messaggio}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={inCorso}
        className="w-full rounded-xl bg-brand-700 px-4 py-2.5 text-[15px] font-medium text-bone-50 transition-colors hover:bg-brand-900 disabled:opacity-60"
      >
        {inCorso ? "Invio in corso…" : "Invia il link di accesso"}
      </button>
    </form>
  );
}
