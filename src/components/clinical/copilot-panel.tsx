"use client";

import { useActionState } from "react";
import { chiediAlCopilot } from "@/lib/clinical/actions";
import {
  DOMANDE_RAPIDE,
  statoCopilotIniziale,
  type FonteRisposta,
} from "@/lib/clinical/state";
import { Badge, Card, CardHeader, SparkIcon, cx } from "@/components/ui/primitives";

/**
 * Il copilot dentro la cartella.
 *
 * Le domande pronte sono pulsanti di invio, non riempitivi del campo di
 * testo: un clic e la risposta arriva. È il caso d'uso vero — il
 * professionista ha il paziente fuori dalla porta.
 */

function Fonti({ fonti }: { fonti: FonteRisposta[] }) {
  if (fonti.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-bone-50 px-4 py-3 ring-1 ring-bone-200">
      <h4 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-500">
        Da questi dati
      </h4>
      <ul className="mt-2 space-y-1">
        {fonti.map((fonte, i) => (
          <li key={`${fonte.label}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-[11px] uppercase tracking-[0.06em] text-ink-300">
              {fonte.kind}
            </span>
            <span className="text-ink-700">{fonte.label}</span>
            {fonte.date ? (
              <span className="text-xs text-ink-400 tnum">{fonte.date}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CopilotPanel({
  patientId,
  disabled,
}: {
  patientId: string;
  disabled?: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(chiediAlCopilot, statoCopilotIniziale);

  return (
    <Card>
      <CardHeader
        title="Copilot clinico"
        hint="Risponde solo sui dati in cartella, e dichiara sempre da dove viene la risposta."
        action={<SparkIcon className="h-4 w-4 text-gold-500" />}
      />

      <form action={azione} className="px-6 pb-6 pt-3">
        <input type="hidden" name="patientId" value={patientId} />

        <textarea
          name="question"
          rows={2}
          disabled={disabled || inCorso}
          placeholder="Chiedi qualcosa su questo paziente…"
          className="w-full resize-y rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-jade-500 disabled:opacity-60"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={disabled || inCorso}
            className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-60"
          >
            {inCorso ? "Sto leggendo la cartella…" : "Chiedi"}
          </button>
        </div>

        <div className="mt-4">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-400">
            Domande rapide
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DOMANDE_RAPIDE.map((domanda) => (
              <button
                key={domanda}
                type="submit"
                name="preset"
                value={domanda}
                disabled={disabled || inCorso}
                className={cx(
                  "rounded-full bg-bone-100 px-3 py-1.5 text-xs text-ink-600",
                  "ring-1 ring-bone-200 transition-colors",
                  "hover:bg-jade-50 hover:text-jade-700 hover:ring-jade-100",
                  "disabled:opacity-50",
                )}
              >
                {domanda}
              </button>
            ))}
          </div>
        </div>

        {disabled ? (
          <p className="mt-4 text-xs text-ink-400">
            ANTHROPIC_API_KEY non è impostata: il copilot è spento.
          </p>
        ) : null}

        {stato.esito === "errore" ? (
          <p role="alert" className="mt-4 rounded-xl bg-[#fbf1ee] px-3.5 py-3 text-sm text-signal-alert">
            {stato.messaggio}
          </p>
        ) : null}

        {stato.esito === "ok" ? (
          <div className="mt-5 border-t border-bone-200 pt-5">
            <p className="text-sm font-medium text-ink-500">{stato.domanda}</p>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-900">
              {stato.risposta}
            </p>
            <Fonti fonti={stato.fonti ?? []} />
            {(stato.fonti ?? []).length === 0 ? (
              <p className="mt-3">
                <Badge tone="attention">Nessuna fonte dichiarata</Badge>
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </Card>
  );
}
