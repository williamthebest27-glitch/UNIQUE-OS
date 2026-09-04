import type { Metadata } from "next";
import { proposteInAttesa, proposteRecenti, type Proposta } from "@/lib/approvals/proposals";
import { decidi, esegui } from "@/lib/brain/founder-actions";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatShortDate, formatTime } from "@/lib/format";
import {
  ETICHETTE_CLASSE,
  ETICHETTE_STATO,
  definizione,
  puoEseguire,
  scaduta,
  type RuoloApp,
} from "@/lib/approvals/policy";
import { Bottone, Panel, Stato, Testo, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Approvazioni" };
export const dynamic = "force-dynamic";

/**
 * PREVIEW → APPROVE → EXECUTE.
 *
 * Tre gesti separati, e la separazione è il punto: approvare non esegue.
 * Fra il sì e l'esecuzione resta il momento in cui si può ancora
 * fermare — e l'esecuzione rilegge lo stato invece di fidarsi
 * dell'anteprima.
 */

function Anteprima({ proposta }: { proposta: Proposta }) {
  const voci = Object.entries(proposta.anteprima);
  if (voci.length === 0) return null;

  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {voci.map(([chiave, valore]) => (
        <div key={chiave} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-[0.07em] text-bone-50/35">
            {chiave.replaceAll("_", " ")}
          </dt>
          <dd className="text-sm text-bone-50/75">
            {typeof valore === "object" && valore !== null ? (
              <pre className="mt-0.5 overflow-x-auto rounded bg-white/[0.04] p-2 font-mono text-[11px] leading-relaxed text-bone-50/60">
                {JSON.stringify(valore, null, 1)}
              </pre>
            ) : (
              String(valore ?? "—")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ApprovazioniPage() {
  const profile = await requireProfile();

  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Approvazioni">
        <Vuoto>Supabase non è collegato: non ci sono proposte da decidere.</Vuoto>
      </Panel>
    );
  }

  const [attesa, decise] = await Promise.all([proposteInAttesa(), proposteRecenti()]);
  const ruolo = profile.role as RuoloApp;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Approvazioni</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-bone-50/50">
          Ciò che il Brain propone, con l’anteprima calcolata sui dati veri.
          Approvare non esegue: l’esecuzione è un secondo gesto, e rilegge lo stato.
        </p>
      </div>

      <Panel title="In attesa" hint={`${attesa.length} proposte`}>
        {attesa.length === 0 ? (
          <Vuoto>Niente da decidere.</Vuoto>
        ) : (
          <ul className="pb-2">
            {attesa.map((p) => {
              const def = definizione(p.action);
              const puo = def?.ruoli.includes(ruolo) ?? false;
              const vecchia = scaduta(p.scadeIl);

              return (
                <li key={p.id} className="border-t border-white/[0.07] px-5 py-5 first:border-t-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <h3 className="text-[17px] text-bone-50">{p.titolo}</h3>
                    <Stato tono={p.classe === "sensitive" ? "avviso" : "neutro"}>
                      {ETICHETTE_CLASSE[p.classe]}
                    </Stato>
                  </div>

                  <p className="mt-1.5 text-[15px] leading-relaxed text-bone-50/70">{p.sommario}</p>

                  {p.impatto.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/40">
                        Cosa viene toccato
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {p.impatto.map((s) => (
                          <li key={s} className="text-sm text-bone-50/60">
                            · {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <Anteprima proposta={p} />

                  <p className="mt-3 text-xs text-bone-50/30">
                    Proposta il {formatShortDate(p.createdAt)} alle {formatTime(p.createdAt)} ·
                    {vecchia ? " anteprima scaduta" : ` valida fino al ${formatShortDate(p.scadeIl)}`}
                  </p>

                  {vecchia ? (
                    <p className="mt-3 text-sm text-gold-300">
                      L’anteprima è vecchia: i dati di adesso possono essere diversi. Chiedi al
                      Brain di rifare la proposta.
                    </p>
                  ) : puo ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <form action={decidi} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="propostaId" value={p.id} />
                        <input type="hidden" name="decisione" value="approva" />
                        <Testo
                          name="nota"
                          placeholder="Nota (facoltativa)"
                          className="w-56 py-1.5 text-sm"
                        />
                        <Bottone type="submit">Autorizza</Bottone>
                      </form>

                      <form action={decidi}>
                        <input type="hidden" name="propostaId" value={p.id} />
                        <input type="hidden" name="decisione" value="rifiuta" />
                        <Bottone type="submit" variante="quieto">
                          Rifiuta
                        </Bottone>
                      </form>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-bone-50/40">
                      Questa azione la autorizza {def?.ruoli.join(" o ") ?? "la direzione"}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ── Autorizzate, da eseguire ────────────────────────────── */}
      {decise.filter((p) => p.stato === "approved").length > 0 ? (
        <Panel title="Autorizzate" hint="Approvare non esegue: manca l'ultimo gesto.">
          <ul className="pb-2">
            {decise
              .filter((p) => p.stato === "approved")
              .map((p) => {
                const verifica = puoEseguire(
                  { state: p.stato, action: p.action, expiresAt: p.scadeIl },
                  ruolo,
                );
                return (
                  <li key={p.id} className="border-t border-white/[0.07] px-5 py-4 first:border-t-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                      <span className="min-w-0">
                        <span className="block text-[15px] text-bone-50">{p.titolo}</span>
                        <span className="mt-0.5 block text-xs text-bone-50/45">{p.sommario}</span>
                        {p.notaDecisione ? (
                          <span className="mt-1 block text-xs text-bone-50/35">
                            “{p.notaDecisione}”
                          </span>
                        ) : null}
                      </span>

                      {verifica.ok ? (
                        <form action={esegui}>
                          <input type="hidden" name="propostaId" value={p.id} />
                          <Bottone type="submit">Esegui</Bottone>
                        </form>
                      ) : (
                        <span className="text-xs text-gold-300">{verifica.motivo}</span>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ) : null}

      {/* ── Lo storico ──────────────────────────────────────────── */}
      <Panel title="Storico" hint="Chi ha deciso cosa, e com'è andata.">
        {decise.length === 0 ? (
          <Vuoto>Nessuna decisione registrata.</Vuoto>
        ) : (
          <ul className="pb-2">
            {decise.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] text-bone-50">{p.titolo}</span>
                  <span className="mt-0.5 block text-xs text-bone-50/40">
                    {p.risultato?.descrizione
                      ? String(p.risultato.descrizione)
                      : (p.errore ?? p.sommario)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Stato
                    tono={
                      p.stato === "executed"
                        ? "buono"
                        : p.stato === "failed"
                          ? "avviso"
                          : "spento"
                    }
                  >
                    {ETICHETTE_STATO[p.stato]}
                  </Stato>
                  <span className="text-xs text-bone-50/30">
                    {formatShortDate(p.decisaIl ?? p.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
