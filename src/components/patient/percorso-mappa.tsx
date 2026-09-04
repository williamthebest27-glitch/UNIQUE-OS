import type { JourneyResult, JourneyStage } from "@/lib/journey/stages";
import { STAGE_LABELS } from "@/lib/journey/stages";
import { Card, CardHeader, cx } from "@/components/ui/primitives";

/**
 * Dove sei nel percorso.
 *
 * Le fasi sono le stesse che vede la direzione nel CRM, calcolate dalla
 * stessa funzione: **il paziente e la clinica guardano lo stesso
 * percorso.** Non è un dettaglio implementativo — è la ragione per cui
 * quello che il paziente legge qui non può contraddire quello che gli
 * dicono al telefono.
 *
 * Le due uscite laterali del modello — *inattivo* e *perso* — non si
 * mostrano al paziente: "sei fermo da sei mesi" è una cosa che si dice
 * di persona, non con una barra di avanzamento.
 */

const TAPPE: JourneyStage[] = [
  "lead",
  "first_visit_booked",
  "score_done",
  "plan_proposed",
  "membership_active",
  "program_active",
  "reassessment_due",
  "retention",
];

/** Come si legge una tappa dal punto di vista di chi la sta vivendo. */
const ETICHETTE_PAZIENTE: Partial<Record<JourneyStage, string>> = {
  lead: "Primo contatto",
  first_visit_booked: "Prima visita",
  score_done: "Longevity Score",
  plan_proposed: "Il tuo piano",
  membership_active: "Membership",
  program_active: "Percorso in corso",
  reassessment_due: "Rivalutazione",
  retention: "Mantenimento",
};

function etichetta(fase: JourneyStage): string {
  return ETICHETTE_PAZIENTE[fase] ?? STAGE_LABELS[fase];
}

export function PercorsoMappa({
  fase,
  giorno,
  giorniTotali,
}: {
  fase: JourneyResult;
  /** Giorno del percorso in corso, se ce n'è uno. */
  giorno?: number | null;
  giorniTotali?: number | null;
}) {
  const indice = TAPPE.indexOf(fase.stage);
  // Fuori percorso — inattivo, perso — la mappa non si disegna a metà:
  // si mostra la prima tappa come corrente e nient'altro.
  const corrente = indice >= 0 ? indice : 0;

  const percentuale =
    giorno !== null && giorno !== undefined && giorniTotali
      ? Math.min(100, Math.max(0, (giorno / giorniTotali) * 100))
      : null;

  return (
    <Card>
      <CardHeader title="Il tuo percorso" hint={fase.reason} />

      <div className="px-6 pb-6 pt-3">
        {percentuale !== null ? (
          <div className="mb-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[22px] leading-none text-ink-900 tnum">
                Giorno {giorno} <span className="text-ink-300">di {giorniTotali}</span>
              </span>
              <span className="text-sm text-ink-400 tnum">{Math.round(percentuale)}%</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-bone-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-[1.4s] ease-[var(--ease-out-expo)]"
                style={{ width: `${percentuale}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Su schermo largo la mappa è orizzontale, su telefono verticale:
            otto tappe in fila su 375 pixel sarebbero otto puntini muti. */}
        <ol className="space-y-0 sm:flex sm:space-y-0">
          {TAPPE.map((tappa, i) => {
            const fatta = i < corrente;
            const qui = i === corrente;

            return (
              <li
                key={tappa}
                aria-current={qui ? "step" : undefined}
                className="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:gap-0 sm:pb-0"
              >
                {/* Il filo che unisce le tappe. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute left-[5px] top-4 h-full w-px sm:left-auto sm:top-[5px] sm:h-px sm:w-full",
                    i === TAPPE.length - 1 && "hidden",
                    fatta ? "bg-brand-300" : "bg-bone-200",
                  )}
                />

                <span
                  aria-hidden="true"
                  className={cx(
                    "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white sm:mt-0",
                    qui ? "bg-brand-600" : fatta ? "bg-brand-300" : "bg-bone-300",
                  )}
                />

                <span className="sm:mt-3 sm:pr-3">
                  <span
                    className={cx(
                      "block text-[13px] leading-snug",
                      qui ? "font-semibold text-ink-900" : fatta ? "text-ink-500" : "text-ink-300",
                    )}
                  >
                    {etichetta(tappa)}
                  </span>
                  {qui ? (
                    <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-[0.09em] text-brand-600">
                      Sei qui
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
