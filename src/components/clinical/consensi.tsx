"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { registraConsenso } from "@/lib/clinical/consensi-actions";
import { statoTestoIniziale, type StatoTesto } from "@/lib/clinical/state";
import {
  CONSENSI_OBBLIGATORI,
  ETICHETTE_CONSENSO,
  ORIGINI_CONSENSO,
  type TipoConsenso,
} from "@/lib/clinical/consensi";
import { formatShortDate } from "@/lib/format";
import { Badge, cx } from "@/components/ui/primitives";

/**
 * I consensi di una persona, e il gesto per registrarne uno.
 *
 * Quattro righe fisse, sempre le stesse quattro: un consenso mancante è
 * un'informazione, e mostrare solo quelli concessi lo nasconderebbe
 * dietro un elenco corto che sembra completo.
 *
 * ---
 *
 * **Concedere e revocare hanno lo stesso peso visivo.** La tentazione era
 * fare della revoca un'azione secondaria, piccola e grigia; sarebbe
 * stato un modo di scoraggiarla, e un consenso che si concede facilmente
 * e si revoca a fatica non è un consenso libero. Sono due pulsanti
 * uguali, e quello che compare è quello che cambia lo stato.
 *
 * La versione dell'informativa si chiede sempre. «Ha acconsentito?» non
 * è la domanda utile: lo è «a quale versione», perché è quella che dice
 * se il consenso vale ancora dopo che l'informativa è cambiata.
 */

const CAMPO =
  "w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

const ETICHETTA =
  "block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500";

const QUIETO =
  "rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 " +
  "transition-colors hover:bg-bone-50 hover:text-brand-700 disabled:opacity-50";

export interface ConsensoCorrente {
  tipo: TipoConsenso;
  concesso: boolean;
  versione: string;
  decisoIl: string;
  origine: string;
}

function Esito({ stato }: { stato: StatoTesto }) {
  if (stato.esito === "iniziale") return null;

  return (
    <p
      role="status"
      className={cx(
        "mt-2 text-sm leading-relaxed",
        stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
      )}
    >
      {stato.messaggio}
    </p>
  );
}

export function Consensi({
  pazienteId,
  correnti,
  puoRegistrare,
}: {
  pazienteId: string;
  correnti: ConsensoCorrente[];
  puoRegistrare: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(registraConsenso, statoTestoIniziale);
  const [apri, setApri] = useState<{ tipo: TipoConsenso; concedi: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") {
      setApri(null);
      router.refresh();
    }
  }, [stato, router]);

  const per = new Map(correnti.map((c) => [c.tipo, c]));
  const tipi: TipoConsenso[] = ["privacy_policy", "health_data", "marketing", "research"];

  return (
    <div>
      <ul className="divide-y divide-bone-200/80">
        {tipi.map((tipo) => {
          const c = per.get(tipo);
          const obbligatorio = CONSENSI_OBBLIGATORI.includes(tipo);
          const mancante = c === undefined;

          return (
            <li key={tipo} className="px-6 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">
                    {ETICHETTE_CONSENSO[tipo].titolo}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                    {ETICHETTE_CONSENSO[tipo].spiegazione}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {mancante ? (
                    <Badge tone={obbligatorio ? "attention" : "neutral"}>
                      {obbligatorio ? "Mai raccolto" : "Non richiesto"}
                    </Badge>
                  ) : c.concesso ? (
                    <Badge tone="positive">Concesso</Badge>
                  ) : (
                    <Badge tone="attention">Revocato</Badge>
                  )}
                </div>
              </div>

              {c ? (
                <p className="mt-1.5 text-xs text-ink-300 tnum">
                  {formatShortDate(c.decisoIl)} · versione {c.versione} ·{" "}
                  {ORIGINI_CONSENSO[c.origine] ?? c.origine}
                </p>
              ) : null}

              {puoRegistrare ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* Compare il gesto che cambia lo stato, non entrambi:
                      «concedi» accanto a un consenso già concesso è un
                      pulsante che non fa niente. */}
                  {(!c || !c.concesso) && (
                    <button
                      type="button"
                      onClick={() =>
                        setApri(
                          apri?.tipo === tipo && apri.concedi
                            ? null
                            : { tipo, concedi: true },
                        )
                      }
                      className={cx(
                        QUIETO,
                        apri?.tipo === tipo && apri.concedi && "bg-bone-100 text-brand-700",
                      )}
                    >
                      Registra il consenso
                    </button>
                  )}

                  {c?.concesso ? (
                    <button
                      type="button"
                      onClick={() =>
                        setApri(
                          apri?.tipo === tipo && !apri.concedi
                            ? null
                            : { tipo, concedi: false },
                        )
                      }
                      className={cx(
                        QUIETO,
                        apri?.tipo === tipo && !apri.concedi && "bg-bone-100 text-brand-700",
                      )}
                    >
                      Registra la revoca
                    </button>
                  ) : null}
                </div>
              ) : null}

              {apri?.tipo === tipo ? (
                <form action={azione} className="mt-3 max-w-md space-y-3">
                  <input type="hidden" name="pazienteId" value={pazienteId} />
                  <input type="hidden" name="tipo" value={tipo} />
                  <input
                    type="hidden"
                    name="concesso"
                    value={apri.concedi ? "true" : "false"}
                  />

                  <label className="block">
                    <span className={ETICHETTA}>Versione dell’informativa</span>
                    <input
                      name="versione"
                      defaultValue={c?.versione ?? "v1"}
                      disabled={inCorso}
                      className={cx(CAMPO, "mt-1.5 max-w-[140px]")}
                    />
                    <span className="mt-1 block text-xs leading-relaxed text-ink-400">
                      «Ha acconsentito?» non è la domanda utile: lo è «a quale
                      versione», perché è quella che dice se il consenso vale ancora
                      dopo che l’informativa è cambiata.
                    </span>
                  </label>

                  <fieldset>
                    <legend className={ETICHETTA}>Come è stato raccolto</legend>
                    <div className="mt-2 space-y-1.5">
                      <label className="flex items-center gap-2.5 text-sm">
                        <input
                          type="radio"
                          name="origine"
                          value="clinical"
                          defaultChecked
                          className="accent-brand-600"
                        />
                        A voce, durante la visita
                      </label>
                      <label className="flex items-center gap-2.5 text-sm">
                        <input
                          type="radio"
                          name="origine"
                          value="paper"
                          className="accent-brand-600"
                        />
                        Modulo cartaceo firmato
                      </label>
                    </div>
                  </fieldset>

                  {apri.concedi === false && CONSENSI_OBBLIGATORI.includes(tipo) ? (
                    <p className="rounded-lg bg-[#fdf6e8] px-3 py-2 text-sm leading-relaxed text-signal-attention">
                      Senza questo consenso non si possono conservare referti né
                      calcolare il punteggio. È un diritto della persona: si
                      registra, e le conseguenze si dicono a lei.
                    </p>
                  ) : null}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={inCorso}
                      className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
                    >
                      {inCorso
                        ? "…"
                        : apri.concedi
                          ? "Registra il consenso"
                          : "Registra la revoca"}
                    </button>
                    <button type="button" onClick={() => setApri(null)} className={QUIETO}>
                      Annulla
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="px-6 pb-5">
        <Esito stato={stato} />
        <p className="mt-2 text-xs leading-relaxed text-ink-300">
          Un consenso non si modifica: se ne registra uno nuovo. La tabella è
          append-only, e chi lo registra lascia il proprio nome sulla riga — è la
          sola domanda che si fa quando un consenso viene contestato.
        </p>
      </div>
    </div>
  );
}
