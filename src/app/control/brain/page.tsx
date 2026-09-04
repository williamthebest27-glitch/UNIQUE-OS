import type { Metadata } from "next";
import Link from "next/link";
import { conversazioni, leggiConversazione } from "@/lib/brain/founder";
import { propostePerConversazione } from "@/lib/approvals/proposals";
import { chiedi } from "@/lib/brain/founder-actions";
import { isBrainConfigured } from "@/lib/brain/extraction";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatShortDate, formatTime } from "@/lib/format";
import { ETICHETTE_CLASSE, ETICHETTE_STATO } from "@/lib/approvals/policy";
import { BrainChat } from "@/components/control/brain-chat";
import { Panel, Stato, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Unique Brain" };
export const dynamic = "force-dynamic";

/**
 * L'interfaccia founder.
 *
 * Una casella di testo e una conversazione. Sotto ogni risposta, gli
 * strumenti che sono stati usati per costruirla: è la differenza fra
 * chiedere all'azienda e chiedere a un modello che parla dell'azienda.
 */
export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Unique Brain">
        <Vuoto>
          Supabase non è collegato: senza dati non c’è niente su cui ragionare.
        </Vuoto>
      </Panel>
    );
  }

  const [elenco, conversazione, proposte] = await Promise.all([
    conversazioni(),
    c ? leggiConversazione(c) : Promise.resolve(null),
    c ? propostePerConversazione(c) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Unique Brain</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">
          Chiedi come sta andando, e poi chiedi perché. Il Brain propone azioni;
          a eseguirle sei tu, dopo aver visto cosa cambia.
        </p>
      </div>

      {!isBrainConfigured() ? (
        <Panel title="Modello non configurato">
          <Vuoto>
            ANTHROPIC_API_KEY non è impostata: la conversazione è spenta. I dati e
            le proposte già registrate restano leggibili.
          </Vuoto>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* ── La conversazione ─────────────────────────────────── */}
        <div className="space-y-6">
          {conversazione && conversazione.messaggi.length > 0 ? (
            <div className="space-y-5">
              {conversazione.messaggi.map((m) => (
                <div key={m.id}>
                  {m.ruolo === "user" ? (
                    <div className="rounded-card bg-white/[0.06] px-5 py-3.5">
                      <p className="text-[15px] leading-relaxed text-bone-50">{m.contenuto}</p>
                      <p className="mt-1.5 text-[11px] text-bone-50/30">
                        {formatShortDate(m.createdAt)} · {formatTime(m.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="px-1">
                      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-bone-50/85">
                        {m.contenuto}
                      </div>

                      {m.tracce.length > 0 ? (
                        <ul className="mt-3 space-y-1 border-l border-white/10 pl-3">
                          {m.tracce.map((t, i) => (
                            <li key={i} className="text-xs text-bone-50/35">
                              <span className="text-bone-50/55">{t.strumento}</span> — {t.esito}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Panel title="Nessuna conversazione aperta">
              <div className="px-5 pb-5 pt-1 text-sm text-bone-50/45">
                <p>Qualche domanda con cui cominciare:</p>
                <ul className="mt-2 space-y-1 text-bone-50/60">
                  <li>Come sta andando Unique questo mese?</li>
                  <li>Quale campagna sta portando i pazienti migliori?</li>
                  <li>Ci sono membri che non usano i crediti da più di 60 giorni?</li>
                  <li>Quanto costa il Longevity Score e da quando?</li>
                </ul>
              </div>
            </Panel>
          )}

          {/* ── Le proposte nate qui ───────────────────────────── */}
          {proposte.length > 0 ? (
            <Panel
              title="Proposte di questa conversazione"
              hint="Si autorizzano ed eseguono dalla schermata delle approvazioni."
            >
              <ul className="pb-2">
                {proposte.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] text-bone-50">{p.titolo}</span>
                      <span className="mt-0.5 block text-xs text-bone-50/40">{p.sommario}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Stato tono={p.classe === "sensitive" ? "avviso" : "neutro"}>
                        {ETICHETTE_CLASSE[p.classe]}
                      </Stato>
                      <Stato
                        tono={
                          p.stato === "executed"
                            ? "buono"
                            : p.stato === "pending"
                              ? "avviso"
                              : "spento"
                        }
                      >
                        {ETICHETTE_STATO[p.stato]}
                      </Stato>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="px-5 pb-4 text-xs text-bone-50/35">
                <Link href="/control/approvazioni" className="hover:text-bone-50/70">
                  Vai alle approvazioni →
                </Link>
              </p>
            </Panel>
          ) : null}

          <div className="rounded-card bg-white/[0.04] p-5 ring-1 ring-white/10">
            <BrainChat conversationId={c ?? null} azione={chiedi} />
          </div>
        </div>

        {/* ── Le conversazioni ─────────────────────────────────── */}
        <aside>
          <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/45">
            Conversazioni
          </p>
          <ul className="mt-3 space-y-1">
            <li>
              <Link
                href="/control/brain"
                className="block rounded-lg px-3 py-2 text-sm text-bone-50/60 transition-colors hover:bg-white/[0.05] hover:text-bone-50"
              >
                + Nuova
              </Link>
            </li>
            {elenco.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/control/brain?c=${conv.id}`}
                  className={
                    conv.id === c
                      ? "block rounded-lg bg-white/[0.07] px-3 py-2 text-sm text-bone-50"
                      : "block rounded-lg px-3 py-2 text-sm text-bone-50/50 transition-colors hover:bg-white/[0.05] hover:text-bone-50/80"
                  }
                >
                  <span className="line-clamp-2">{conv.titolo ?? "Senza titolo"}</span>
                  <span className="mt-0.5 block text-[11px] text-bone-50/30">
                    {formatShortDate(conv.ultimoMessaggio)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
