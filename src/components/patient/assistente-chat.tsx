"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { chiediAUnique } from "@/lib/patient/actions";
import { DOMANDE_ESEMPIO, type ContestoPaziente, type RispostaAssistente } from "@/lib/patient/assistente";
import { Card, cx } from "@/components/ui/primitives";

/**
 * Chiedi a Unique.
 *
 * La conversazione vive nella pagina e non nel database, di proposito:
 * una domanda su come si sta andando non è un dato clinico da
 * conservare, e conservarla significherebbe doverla proteggere,
 * cancellare, esportare. Chi ricarica ricomincia — ed è giusto così.
 *
 * Sotto ogni risposta restano scritte le fonti: chi legge deve poter
 * verificare da dove viene quello che gli è stato detto.
 */

interface Battuta {
  chi: "paziente" | "unique";
  testo: string;
  risposta?: RispostaAssistente;
}

export function AssistenteChat({ contesto }: { contesto: ContestoPaziente }) {
  const [storia, setStoria] = useState<Battuta[]>([]);
  const [risposta, agisci, inCorso] = useActionState(chiediAUnique, null);
  const ultimaVista = useRef<RispostaAssistente | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fondo = useRef<HTMLDivElement>(null);

  // La risposta arriva dall'azione; la domanda l'abbiamo aggiunta al
  // momento dell'invio. Qui si accodano insieme.
  useEffect(() => {
    if (!risposta || risposta === ultimaVista.current) return;
    ultimaVista.current = risposta;
    setStoria((prima) => [...prima, { chi: "unique", testo: risposta.testo, risposta }]);
  }, [risposta]);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [storia.length, inCorso]);

  /**
   * La domanda si accoda subito, la risposta arriva dopo.
   *
   * Entrambe dentro `startTransition`: l'azione di `useActionState`
   * chiamata a mano, fuori da una transizione, non aggiorna `inCorso` —
   * e senza `inCorso` chi scrive non vede che sta succedendo qualcosa.
   */
  function chiedi(formData: FormData) {
    const domanda = String(formData.get("domanda") ?? "").trim();
    if (!domanda) return;

    startTransition(() => {
      setStoria((prima) => [...prima, { chi: "paziente", testo: domanda }]);
      agisci(formData);
    });

    if (campo.current) campo.current.value = "";
  }

  return (
    <Card className="flex min-h-[60vh] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-6 sm:p-7">
        {storia.length === 0 ? (
          <div>
            <p className="max-w-[54ch] text-[15px] leading-relaxed text-ink-500">
              Rispondo con i tuoi dati e nient&apos;altro. Se un dato non c&apos;è,
              te lo dico invece di inventarlo. Le domande cliniche — cosa
              significa un valore, se devi preoccuparti — le gira al tuo medico,
              perché è lui che può risponderti.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {DOMANDE_ESEMPIO.map((domanda) => (
                <li key={domanda}>
                  <button
                    type="button"
                    onClick={() => {
                      const dati = new FormData();
                      dati.set("domanda", domanda);
                      dati.set("contesto", JSON.stringify(contesto));
                      chiedi(dati);
                    }}
                    className="rounded-full bg-bone-100 px-3.5 py-2 text-[13px] text-ink-700 transition-colors hover:bg-bone-200"
                  >
                    {domanda}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {storia.map((battuta, i) => (
          <div
            key={`${i}-${battuta.testo.slice(0, 12)}`}
            className={cx("flex", battuta.chi === "paziente" ? "justify-end" : "justify-start")}
          >
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                battuta.chi === "paziente"
                  ? "bg-ink-900 text-bone-50"
                  : battuta.risposta?.categoria === "rinvio_medico"
                    ? "bg-gold-100 text-gold-600"
                    : "bg-bone-100 text-ink-900",
              )}
            >
              <p>{battuta.testo}</p>

              {battuta.risposta && battuta.risposta.collegamenti.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {battuta.risposta.collegamenti.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      className="rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink-900 ring-1 ring-bone-200 transition-colors hover:bg-bone-50"
                    >
                      {c.etichetta}
                    </Link>
                  ))}
                </div>
              ) : null}

              {battuta.risposta && battuta.risposta.fonti.length > 0 ? (
                <p className="mt-2.5 text-[11px] text-ink-400">
                  Da: {battuta.risposta.fonti.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        ))}

        {inCorso ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-bone-100 px-4 py-3 text-[15px] text-ink-400">
              Sto guardando…
            </div>
          </div>
        ) : null}

        <div ref={fondo} />
      </div>

      <form action={chiedi} className="flex gap-2 border-t border-bone-200 p-4 sm:p-5">
        <input type="hidden" name="contesto" value={JSON.stringify(contesto)} />
        <input
          ref={campo}
          name="domanda"
          autoComplete="off"
          placeholder="Scrivi la tua domanda…"
          aria-label="La tua domanda"
          className="min-w-0 flex-1 rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
        <button
          type="submit"
          disabled={inCorso}
          className="shrink-0 rounded-xl bg-ink-900 px-5 py-3 text-[15px] font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-40"
        >
          Chiedi
        </button>
      </form>
    </Card>
  );
}
