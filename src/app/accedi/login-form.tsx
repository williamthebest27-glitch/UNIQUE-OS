"use client";

import { useActionState, useState } from "react";
import {
  accediConPassword,
  richiediAccesso,
  richiediReimpostazione,
} from "@/lib/auth-actions";
import { statoAccessoIniziale } from "@/lib/auth-state";

/**
 * Tre strade per la stessa porta.
 *
 * **Password** — chi entra ogni giorno. È la strada normale, ed è quella
 * che si apre per prima.
 *
 * **Link via email** — chi entra due volte l'anno e non ricorderebbe
 * comunque una password. Resta, e non come ripiego: per un paziente è
 * spesso la strada migliore.
 *
 * **Scegli la password** — la prima volta, e quando non la si ricorda
 * più. Sono lo stesso gesto, e chiamarlo "reimposta" confonderebbe chi
 * una password non l'ha mai avuta.
 */

type Modalita = "password" | "link" | "reimposta";

const CAMPO =
  "mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "transition-shadow placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500";

const ETICHETTA = "block text-[13px] font-medium text-ink-700";

const PRIMARIO =
  "w-full rounded-xl bg-brand-700 px-4 py-2.5 text-[15px] font-medium text-bone-50 " +
  "transition-colors hover:bg-brand-900 disabled:opacity-60";

const QUIETO = "text-[13px] text-ink-400 underline-offset-4 transition-colors hover:text-ink-700 hover:underline";

/** Il riquadro che compare quando un'email è partita davvero. */
function PostaInviata({
  titolo,
  email,
  origine,
  spiegazione,
}: {
  titolo: string;
  email?: string;
  origine?: string;
  spiegazione: string;
}) {
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
      <h2 className="mt-5 font-display text-[22px] text-ink-900">{titolo}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        {spiegazione}{" "}
        {email ? <span className="font-medium text-ink-800">{email}</span> : null}
      </p>

      {/* Dove riporta il link. Se qui comparisse localhost mentre stai
          usando il sito pubblicato, l'email sarebbe inservibile: è il
          guasto più difficile da vedere, e questa riga lo rende ovvio. */}
      {origine ? (
        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          Il link riporta a <span className="font-medium text-ink-500">{origine}</span>
        </p>
      ) : null}
    </div>
  );
}

function Errore({ stato }: { stato: { messaggio?: string; codice?: string } }) {
  if (!stato.messaggio) return null;
  return (
    <p id="errore-accesso" role="alert" className="text-sm text-signal-alert">
      {stato.messaggio}
      {stato.codice ? (
        <span className="mt-1 block text-xs text-ink-400">codice: {stato.codice}</span>
      ) : null}
    </p>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [modalita, setModalita] = useState<Modalita>("password");

  const [statoPassword, azionePassword, inCorsoPassword] = useActionState(
    accediConPassword,
    statoAccessoIniziale,
  );
  const [statoLink, azioneLink, inCorsoLink] = useActionState(
    richiediAccesso,
    statoAccessoIniziale,
  );
  const [statoReset, azioneReset, inCorsoReset] = useActionState(
    richiediReimpostazione,
    statoAccessoIniziale,
  );

  if (statoLink.esito === "inviato") {
    return (
      <PostaInviata
        titolo="Controlla la tua posta"
        spiegazione="Abbiamo inviato un link di accesso a"
        email={statoLink.email}
        origine={statoLink.origine}
      />
    );
  }

  if (statoReset.esito === "reimpostazione") {
    return (
      <PostaInviata
        titolo="Scegli la password dalla posta"
        spiegazione="Se l’indirizzo è registrato, il collegamento per scegliere la password è arrivato a"
        email={statoReset.email}
        origine={statoReset.origine}
      />
    );
  }

  /* ── Password ─────────────────────────────────────────────────── */
  if (modalita === "password") {
    return (
      <div className="space-y-5">
        <form action={azionePassword} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <div>
            <label htmlFor="email" className={ETICHETTA}>
              Indirizzo email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={statoPassword.email}
              aria-invalid={statoPassword.esito === "errore" || undefined}
              className={CAMPO}
              placeholder="nome@esempio.it"
            />
          </div>

          <div>
            <label htmlFor="password" className={ETICHETTA}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={statoPassword.esito === "errore" || undefined}
              aria-describedby={
                statoPassword.esito === "errore" ? "errore-accesso" : undefined
              }
              className={CAMPO}
            />
          </div>

          {statoPassword.esito === "errore" ? <Errore stato={statoPassword} /> : null}

          <button type="submit" disabled={inCorsoPassword} className={PRIMARIO}>
            {inCorsoPassword ? "Accesso in corso…" : "Entra"}
          </button>
        </form>

        <div className="flex flex-col items-center gap-2 border-t border-bone-200/70 pt-4">
          <button type="button" onClick={() => setModalita("reimposta")} className={QUIETO}>
            Non ho una password, o non la ricordo
          </button>
          <button type="button" onClick={() => setModalita("link")} className={QUIETO}>
            Entra con un link via email
          </button>
        </div>
      </div>
    );
  }

  /* ── Link via email ───────────────────────────────────────────── */
  if (modalita === "link") {
    return (
      <div className="space-y-5">
        <form action={azioneLink} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <div>
            <label htmlFor="email-link" className={ETICHETTA}>
              Indirizzo email
            </label>
            <input
              id="email-link"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={statoLink.email}
              aria-invalid={statoLink.esito === "errore" || undefined}
              aria-describedby={statoLink.esito === "errore" ? "errore-accesso" : undefined}
              className={CAMPO}
              placeholder="nome@esempio.it"
            />
          </div>

          {statoLink.esito === "errore" ? <Errore stato={statoLink} /> : null}

          <button type="submit" disabled={inCorsoLink} className={PRIMARIO}>
            {inCorsoLink ? "Invio in corso…" : "Invia il link di accesso"}
          </button>
        </form>

        <div className="flex justify-center border-t border-bone-200/70 pt-4">
          <button type="button" onClick={() => setModalita("password")} className={QUIETO}>
            Torna all’accesso con password
          </button>
        </div>
      </div>
    );
  }

  /* ── Scegli la password ───────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <form action={azioneReset} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-500">
          Ti mandiamo un collegamento per sceglierla. Vale anche la prima volta,
          se una password non l’hai mai avuta.
        </p>

        <div>
          <label htmlFor="email-reset" className={ETICHETTA}>
            Indirizzo email
          </label>
          <input
            id="email-reset"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={statoReset.email}
            aria-invalid={statoReset.esito === "errore" || undefined}
            aria-describedby={statoReset.esito === "errore" ? "errore-accesso" : undefined}
            className={CAMPO}
            placeholder="nome@esempio.it"
          />
        </div>

        {statoReset.esito === "errore" ? <Errore stato={statoReset} /> : null}

        <button type="submit" disabled={inCorsoReset} className={PRIMARIO}>
          {inCorsoReset ? "Invio in corso…" : "Mandami il collegamento"}
        </button>
      </form>

      <div className="flex justify-center border-t border-bone-200/70 pt-4">
        <button type="button" onClick={() => setModalita("password")} className={QUIETO}>
          Torna all’accesso con password
        </button>
      </div>
    </div>
  );
}
