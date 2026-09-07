"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { registraSecondoFattore } from "@/lib/sicurezza/azioni";
import { cx } from "@/components/ui/primitives";

/**
 * Il codice a sei cifre, e nient'altro.
 *
 * Client perché la sfida e la verifica sono due chiamate legate da un
 * `challengeId` che vive fra loro: farle con azioni server vorrebbe dire
 * tenere quell'identificativo da qualche parte fra due richieste, cioè
 * inventare uno stato dove la libreria ne ha già uno.
 *
 * Due dettagli che sembrano piccoli e non lo sono. **L'invio parte da
 * solo alla sesta cifra**: chi arriva qui ha già il telefono in mano e
 * il codice scade in trenta secondi, e un pulsante in più è mezzo
 * secondo speso su una scadenza che corre. E **il campo non si svuota
 * dopo un errore**: quasi sempre è una cifra sbagliata su sei, e
 * ricominciare da capo per correggerne una è la piccola crudeltà che
 * fa disattivare l'MFA.
 */
export function SfidaSecondoFattore({ destinazione }: { destinazione: string }) {
  const [codice, setCodice] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    campo.current?.focus();
  }, []);

  async function verifica(valore: string) {
    setInCorso(true);
    setErrore(null);

    const supabase = createSupabaseBrowserClient();

    const { data: fattori, error: erroreFattori } = await supabase.auth.mfa.listFactors();
    const fattore = (fattori?.totp ?? []).find((f) => f.status === "verified");

    if (erroreFattori || !fattore) {
      setInCorso(false);
      setErrore("Nessun secondo fattore attivo su questo account.");
      return;
    }

    const { data: sfida, error: erroreSfida } = await supabase.auth.mfa.challenge({
      factorId: fattore.id,
    });

    if (erroreSfida || !sfida) {
      setInCorso(false);
      setErrore("Non è stato possibile avviare la verifica. Riprova.");
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: fattore.id,
      challengeId: sfida.id,
      code: valore,
    });

    if (error) {
      setInCorso(false);
      setErrore(
        "Il codice non è valido. Se continua, controlla che l'orario del telefono sia esatto.",
      );
      // Un codice sbagliato di seguito a un accesso riuscito è il
      // segnale che qualcuno ha la password e non il telefono: è
      // esattamente la riga che si va a cercare dopo.
      void registraSecondoFattore(false);
      campo.current?.select();
      return;
    }

    void registraSecondoFattore(true);

    /*
     * `refresh()` prima di `replace()`.
     *
     * La verifica emette un token nuovo con `aal2`, ma i componenti
     * server già renderizzati in cache portano ancora il vecchio: senza
     * il refresh, la pagina di destinazione rimanderebbe qui, e si
     * girerebbe in tondo con il codice giusto in mano.
     */
    router.refresh();
    router.replace(destinazione);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!inCorso && codice.length === 6) void verifica(codice);
      }}
    >
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
          Codice a sei cifre
        </span>
        <input
          ref={campo}
          value={codice}
          onChange={(e) => {
            const pulito = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCodice(pulito);
            if (pulito.length === 6 && !inCorso) void verifica(pulito);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          disabled={inCorso}
          aria-invalid={errore !== null}
          className={cx(
            "mt-2 w-full rounded-xl bg-bone-50 px-4 py-3 text-center font-display",
            "text-[28px] tracking-[0.4em] text-ink-900 ring-1 tnum",
            "placeholder:text-ink-300 focus:outline-none focus:ring-2 disabled:opacity-60",
            errore ? "ring-signal-alert focus:ring-signal-alert" : "ring-bone-200 focus:ring-brand-500",
          )}
        />
      </label>

      {errore ? (
        <p role="alert" className="mt-2 text-sm leading-relaxed text-signal-alert">
          {errore}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={inCorso || codice.length < 6}
        className="mt-4 w-full rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
      >
        {inCorso ? "Verifica…" : "Entra"}
      </button>
    </form>
  );
}
