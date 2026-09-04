"use client";

import { useActionState } from "react";
import { controllaContenutoAction } from "@/lib/brain/content-actions";
import { AreaTesto, Bottone, Campo, Scelta, Stato } from "@/components/control/primitives";

/**
 * Il controllo di conformità, su un testo qualunque.
 *
 * Serve al testo scritto da una persona quanto a quello uscito da un
 * modello — e nel secondo caso serve di più: un modello a cui è stato
 * detto di non promettere guarigioni non le promette *quasi* sempre, e
 * "quasi" è la parola su cui si costruiscono i guai.
 */

type Stato0 = { esito: "iniziale" };
type Risultato =
  | Stato0
  | { esito: "vuoto" }
  | {
      esito: "fatto";
      segnalazioni: { gravita: "blocco" | "attenzione"; regola: string; estratto: string; perche: string }[];
      pubblicabile: boolean;
      caratteri: number;
    };

const INIZIALE: Stato0 = { esito: "iniziale" };

export function ControlloContenuto({ formati }: { formati: [string, string][] }) {
  const [stato, azione, inCorso] = useActionState<Risultato, FormData>(
    controllaContenutoAction as never,
    INIZIALE,
  );

  return (
    <div className="space-y-5 px-5 pb-5 pt-2">
      <form action={azione} className="space-y-4">
        <Campo
          label="Il testo da controllare"
          hint="Incollalo così com'è: didascalia, script, email, pagina."
        >
          <AreaTesto
            name="testo"
            required
            placeholder="Il tuo corpo ti manda segnali che un check-up standard non misura…"
          />
        </Campo>

        <Campo label="Formato" hint="Serve solo per il controllo di lunghezza.">
          <Scelta name="formato" defaultValue="">
            <option value="">Non specificato</option>
            {formati.map(([valore, etichetta]) => (
              <option key={valore} value={valore}>
                {etichetta}
              </option>
            ))}
          </Scelta>
        </Campo>

        <Bottone type="submit" disabled={inCorso}>
          {inCorso ? "Controllo…" : "Controlla"}
        </Bottone>
      </form>

      {stato.esito === "vuoto" ? (
        <p className="text-sm text-bone-50/45">Serve un testo un po’ più lungo.</p>
      ) : null}

      {stato.esito === "fatto" ? (
        <div className="space-y-3 border-t border-white/[0.07] pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Stato tono={stato.pubblicabile ? "buono" : "avviso"}>
              {stato.pubblicabile ? "Nessun blocco" : "Da correggere"}
            </Stato>
            <span className="text-xs text-bone-50/35">
              {stato.caratteri} caratteri ·{" "}
              {stato.segnalazioni.length === 0
                ? "nessuna segnalazione"
                : `${stato.segnalazioni.length} segnalazioni`}
            </span>
          </div>

          {stato.segnalazioni.length === 0 ? (
            <p className="text-sm text-bone-50/60">
              Il testo rispetta le regole del brand book. Resta la rilettura di un
              medico su tutto ciò che sfiora la salute: quella nessun controllo la
              sostituisce.
            </p>
          ) : (
            <ul className="space-y-3">
              {stato.segnalazioni.map((s, i) => (
                <li key={i} className="border-l-2 border-white/10 pl-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Stato tono={s.gravita === "blocco" ? "avviso" : "neutro"}>
                      {s.gravita === "blocco" ? "Blocco" : "Attenzione"}
                    </Stato>
                    <span className="text-[15px] text-bone-50">{s.regola}</span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-bone-50/50">“{s.estratto}”</p>
                  <p className="mt-1 text-sm text-bone-50/55">{s.perche}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
