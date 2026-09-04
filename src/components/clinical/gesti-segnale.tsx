"use client";

import { useActionState, useState } from "react";
import { NavLink } from "@/components/shell/nav-link";
import { accettaSegnale, mettiATacere } from "@/lib/clinical/attenzione-actions";
import { statoTestoIniziale } from "@/lib/clinical/state";
import { cx } from "@/components/ui/primitives";
import { VerboQuieto } from "@/components/clinical/command-center";
import type { SegnaleAttenzione } from "@/lib/clinical/attenzione";

/**
 * I tre gesti su un suggerimento.
 *
 * L'asimmetria fra loro è voluta e va guardata, perché è dove sta il
 * confine fra un sistema che propone e uno che decide:
 *
 *   **Vai** è un collegamento. Porta dove il lavoro si fa davvero — la
 *   coda delle revisioni, la cartella, la visita — e non cambia niente
 *   per conto di nessuno.
 *
 *   **Accetta** apre un modulo con dentro il titolo già scritto, e lo
 *   lascia modificare. Non è un pulsante che crea il task del motore
 *   così com'è: è il motore che porta una bozza e la persona che firma.
 *   Sono la stessa riga di database e due gesti diversi, ed è il
 *   secondo quello che conta.
 *
 *   **Rimanda** chiede per quanto e perché. Un «ignora» secco sarebbe
 *   più comodo, e fra un mese nessuno saprebbe più cosa è stato messo
 *   via né da chi.
 *
 * Nessuno dei tre esegue un atto clinico. Il motore non approva un
 * valore, non scrive in cartella, non manda niente a nessuno: prepara
 * lavoro per una persona, e la persona lo firma.
 */

function Esito({ stato }: { stato: { esito: string; messaggio?: string } }) {
  if (stato.esito === "iniziale") return null;

  return (
    <p
      role="status"
      className={cx(
        "mt-2 text-xs leading-relaxed",
        stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
      )}
    >
      {stato.messaggio}
    </p>
  );
}

export function GestiSegnale({ segnale }: { segnale: SegnaleAttenzione }) {
  const [modulo, setModulo] = useState<"chiuso" | "accetta" | "rimanda">("chiuso");

  const [statoTask, azioneTask, taskInCorso] = useActionState(
    accettaSegnale,
    statoTestoIniziale,
  );
  const [statoSilenzio, azioneSilenzio, silenzioInCorso] = useActionState(
    mettiATacere,
    statoTestoIniziale,
  );

  // Una volta creato il task, il modulo si chiude da sé: lasciarlo
  // aperto inviterebbe a crearne un secondo identico.
  const fatto = statoTask.esito === "ok" || statoSilenzio.esito === "ok";

  return (
    <div className="mt-3">
      {!fatto ? (
        <div className="flex flex-wrap items-center gap-2">
          {segnale.azione ? (
            <NavLink
              href={segnale.azione.href}
              className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
            >
              {segnale.azione.label}
            </NavLink>
          ) : null}

          <VerboQuieto
            type="button"
            onClick={() => setModulo(modulo === "accetta" ? "chiuso" : "accetta")}
            aria-expanded={modulo === "accetta"}
          >
            Accetta come task
          </VerboQuieto>

          <VerboQuieto
            type="button"
            tono="rifiuto"
            onClick={() => setModulo(modulo === "rimanda" ? "chiuso" : "rimanda")}
            aria-expanded={modulo === "rimanda"}
          >
            Rimanda
          </VerboQuieto>
        </div>
      ) : null}

      {/* ── Accetta, con la bozza già scritta ─────────────────── */}
      {modulo === "accetta" && !fatto ? (
        <form action={azioneTask} className="mt-3 rounded-xl bg-bone-50 p-3.5 ring-1 ring-bone-200">
          <input type="hidden" name="patientId" value={segnale.patientId ?? ""} />
          <input type="hidden" name="priorita" value={segnale.priorita} />
          <input
            type="hidden"
            name="dettaglio"
            value={segnale.motivo.join(" ")}
          />

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              Cosa c&apos;è da fare
            </span>
            <input
              name="titolo"
              defaultValue={
                segnale.patientName
                  ? `${segnale.titolo} — ${segnale.patientName}`
                  : segnale.titolo
              }
              className="mt-1.5 w-full rounded-lg bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              Entro il
            </span>
            <input
              type="date"
              name="scadenza"
              className="mt-1.5 w-full rounded-lg bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-brand-500 sm:w-48"
            />
          </label>

          <p className="mt-2 text-xs text-ink-400">
            Viene assegnato a te. I fatti che hanno acceso il segnale restano
            scritti nel dettaglio.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={taskInCorso}
              className="rounded-lg bg-ink-900 px-3.5 py-1.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
            >
              {taskInCorso ? "Creo…" : "Crea il task"}
            </button>
            <VerboQuieto type="button" onClick={() => setModulo("chiuso")}>
              Annulla
            </VerboQuieto>
          </div>

          <Esito stato={statoTask} />
        </form>
      ) : null}

      {/* ── Rimanda ───────────────────────────────────────────── */}
      {modulo === "rimanda" && !fatto ? (
        <form
          action={azioneSilenzio}
          className="mt-3 rounded-xl bg-bone-50 p-3.5 ring-1 ring-bone-200"
        >
          <input type="hidden" name="signalId" value={segnale.id} />
          <input type="hidden" name="patientId" value={segnale.patientId ?? ""} />

          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                Per quanto
              </span>
              <select
                name="giorni"
                defaultValue="7"
                className="mt-1.5 block rounded-lg bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-brand-500"
              >
                <option value="1">Fino a domani</option>
                <option value="7">Una settimana</option>
                <option value="30">Un mese</option>
              </select>
            </label>

            <label className="block min-w-0 flex-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                Perché
              </span>
              <input
                name="motivo"
                placeholder="Ne ho già parlato in visita"
                className="mt-1.5 w-full rounded-lg bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-ink-400">
            Sparisce dalla tua coda, non dalla cartella. Il fatto resta e torna.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={silenzioInCorso}
              className="rounded-lg px-3.5 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-white disabled:opacity-50"
            >
              {silenzioInCorso ? "Rimando…" : "Rimanda"}
            </button>
            <VerboQuieto type="button" onClick={() => setModulo("chiuso")}>
              Annulla
            </VerboQuieto>
          </div>

          <Esito stato={statoSilenzio} />
        </form>
      ) : null}

      {fatto ? (
        <div className="mt-1">
          <Esito stato={statoTask.esito !== "iniziale" ? statoTask : statoSilenzio} />
        </div>
      ) : null}
    </div>
  );
}
