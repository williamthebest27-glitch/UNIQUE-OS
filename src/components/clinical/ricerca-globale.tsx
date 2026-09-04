"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * La ricerca globale.
 *
 * Un `<form method="get">` vero, non un campo che intercetta i tasti e
 * naviga da sé: funziona senza JavaScript, il risultato ha un indirizzo
 * che si può mandare a un collega, e il tasto invio fa quello che fa
 * ovunque. Il JavaScript qui aggiunge una cosa sola — la scorciatoia da
 * tastiera — e se non gira non manca niente.
 *
 * `/` per mettere il cursore qui, `Esc` per uscirne. È la convenzione di
 * ogni strumento che si usa tutto il giorno, e in un command center la
 * differenza fra cercare un paziente in un secondo e in cinque la fa la
 * mano che non lascia la tastiera.
 */
export function RicercaGlobale({
  valoreIniziale = "",
  autoFocus = false,
}: {
  valoreIniziale?: string;
  autoFocus?: boolean;
}) {
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function suTasto(evento: KeyboardEvent) {
      const attivo = document.activeElement;
      const staScrivendo =
        attivo instanceof HTMLInputElement ||
        attivo instanceof HTMLTextAreaElement ||
        attivo instanceof HTMLSelectElement ||
        (attivo instanceof HTMLElement && attivo.isContentEditable);

      if (evento.key === "/" && !staScrivendo) {
        evento.preventDefault();
        campo.current?.focus();
        campo.current?.select();
        return;
      }

      if (evento.key === "Escape" && attivo === campo.current) {
        campo.current?.blur();
      }
    }

    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, []);

  return (
    <form action="/pro/cerca" method="get" role="search" className="relative">
      <label htmlFor="ricerca-globale" className="sr-only">
        Cerca un paziente, un referto, un appuntamento, un task
      </label>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-300"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="m16 16 4 4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <input
        ref={campo}
        id="ricerca-globale"
        name="q"
        type="search"
        autoFocus={autoFocus}
        defaultValue={valoreIniziale}
        placeholder="Cerca un paziente, un referto, un appuntamento, un task…"
        className={cx(
          "w-full rounded-xl bg-white py-3 pl-11 pr-16 text-[15px] text-ink-900",
          "shadow-card ring-1 ring-bone-200 placeholder:text-ink-300",
          "focus:outline-none focus:ring-2 focus:ring-brand-500",
          // Le decorazioni native di `type="search"` cambiano da browser a
          // browser e nessuna di esse combacia con questo campo.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />

      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-bone-200 bg-bone-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-300 sm:block"
      >
        /
      </kbd>
    </form>
  );
}
