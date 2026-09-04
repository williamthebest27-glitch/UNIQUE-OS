"use client";

import { useActionState } from "react";
import { impostaPassword } from "@/lib/auth-actions";
import { PASSWORD_MINIMA, statoPasswordIniziale } from "@/lib/auth-state";

/**
 * Scegliere la password.
 *
 * Non si chiede quella vecchia: a dimostrare l'identità è la sessione,
 * aperta dal collegamento ricevuto via email. Chiederla in più darebbe
 * l'impressione di un controllo che non c'è — chi arriva qui dal link una
 * password vecchia potrebbe non averla mai avuta.
 */
const CAMPO =
  "mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "transition-shadow placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500";

const ETICHETTA = "block text-[13px] font-medium text-ink-700";

export function PasswordForm() {
  const [stato, azione, inCorso] = useActionState(impostaPassword, statoPasswordIniziale);

  return (
    <form action={azione} className="space-y-4">
      <div>
        <label htmlFor="password" className={ETICHETTA}>
          Nuova password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MINIMA}
          required
          aria-invalid={stato.esito === "errore" || undefined}
          aria-describedby="regola-password"
          className={CAMPO}
        />
        <p id="regola-password" className="mt-1.5 text-xs leading-relaxed text-ink-400">
          Almeno {PASSWORD_MINIMA} caratteri. Una frase che ricordi è più robusta
          di una parola con i numeri dentro.
        </p>
      </div>

      <div>
        <label htmlFor="conferma" className={ETICHETTA}>
          Ripetila
        </label>
        <input
          id="conferma"
          name="conferma"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MINIMA}
          required
          className={CAMPO}
        />
      </div>

      {stato.esito === "errore" && stato.messaggio ? (
        <p role="alert" className="text-sm text-signal-alert">
          {stato.messaggio}
          {stato.codice ? (
            <span className="mt-1 block text-xs text-ink-400">codice: {stato.codice}</span>
          ) : null}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={inCorso}
        className="w-full rounded-xl bg-brand-700 px-4 py-2.5 text-[15px] font-medium text-bone-50 transition-colors hover:bg-brand-900 disabled:opacity-60"
      >
        {inCorso ? "Salvataggio…" : "Salva e entra"}
      </button>
    </form>
  );
}
