import type { Metadata } from "next";
import { getCrmBoard, CHANNEL_LABELS, LEAD_STATUS_LABELS } from "@/lib/data/crm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatEuro, formatPercent, formatRelativeDays, formatShortDate } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Riga, Vuoto } from "@/components/control/primitives";
import { cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

/** Gli stati chiusi non fanno parte dell'imbuto: lo interrompono. */
const CHIUSI = new Set(["inactive", "lost"]);

export default async function CrmPage() {
  const board = await getCrmBoard();

  if (!board) {
    return (
      <Panel title="CRM">
        <Vuoto>
          {isSupabaseConfigured()
            ? "Nessun accesso ai lead."
            : "Supabase non è collegato."}
        </Vuoto>
      </Panel>
    );
  }

  const imbutoAperto = board.imbuto.filter((s) => !CHIUSI.has(s.status));
  const massimo = Math.max(1, ...imbutoAperto.map((s) => s.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">CRM</h1>
        <p className="mt-1.5 text-sm text-bone-50/50">
          Il valore generato si legge dai pagamenti del paziente, non da un campo
          aggiornato a mano.
        </p>
      </div>

      <KpiStrip>
        <Kpi label="Lead" value={String(board.totaleLead)} />
        <Kpi label="Convertiti" value={String(board.totaleConvertiti)} tone="good" />
        <Kpi
          label="Conversion rate"
          value={formatPercent(
            board.totaleLead === 0 ? 0 : board.totaleConvertiti / board.totaleLead,
          )}
        />
        <Kpi label="Valore generato" value={formatEuro(board.valoreTotaleCents)} tone="good" />
      </KpiStrip>

      {/* ── Imbuto ──────────────────────────────────────────────── */}
      <Panel title="Imbuto" hint="Dove si fermano le persone.">
        {board.totaleLead === 0 ? (
          <Vuoto>Nessun lead registrato.</Vuoto>
        ) : (
          <ul className="space-y-2 px-5 pb-5 pt-2">
            {imbutoAperto.map((stadio) => (
              <li key={stadio.status}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-bone-50/80">{stadio.label}</span>
                  <span className="text-sm text-bone-50 tnum">{stadio.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(stadio.count / massimo) * 100}%` }}
                  />
                </div>
              </li>
            ))}

            <li className="flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.07] pt-3 text-sm">
              {board.imbuto
                .filter((s) => CHIUSI.has(s.status))
                .map((s) => (
                  <span key={s.status} className="text-bone-50/40">
                    {s.label}: <span className="tnum text-bone-50/70">{s.count}</span>
                  </span>
                ))}
            </li>
          </ul>
        )}
      </Panel>

      {/* ── Origine ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Per canale" hint="Da dove arrivano, e quanto valgono.">
          {board.perCanale.length === 0 ? (
            <Vuoto>Nessun dato.</Vuoto>
          ) : (
            <ul className="pb-2">
              {board.perCanale.map((o) => (
                <Riga
                  key={o.key}
                  label={o.label}
                  sub={`${o.lead} lead · ${o.convertiti} convertiti`}
                  value={formatEuro(o.valoreCents)}
                  extra={formatPercent(o.conversionRate)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Per campagna" hint="Quale spesa genera pazienti, non clic.">
          {board.perCampagna.length === 0 ? (
            <Vuoto>Nessuna campagna tracciata.</Vuoto>
          ) : (
            <ul className="pb-2">
              {board.perCampagna.map((o) => (
                <Riga
                  key={o.key}
                  label={o.label}
                  sub={`${o.lead} lead · ${o.convertiti} convertiti`}
                  value={formatEuro(o.valoreCents)}
                  extra={formatPercent(o.conversionRate)}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Elenco ──────────────────────────────────────────────── */}
      <Panel title="Lead" hint="Dal contatto più recente.">
        {board.righe.length === 0 ? (
          <Vuoto>Nessun lead registrato.</Vuoto>
        ) : (
          <div className="overflow-x-auto px-5 pb-5 pt-2">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-bone-50/40">
                  <th className="pb-2 font-medium">Persona</th>
                  <th className="pb-2 font-medium">Stato</th>
                  <th className="pb-2 font-medium">Origine</th>
                  <th className="pb-2 font-medium">Interesse</th>
                  <th className="pb-2 text-right font-medium">Conversazioni</th>
                  <th className="pb-2 text-right font-medium">Ultimo contatto</th>
                  <th className="pb-2 text-right font-medium">Valore</th>
                </tr>
              </thead>
              <tbody>
                {board.righe.slice(0, 60).map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.07]">
                    <td className="py-2.5 text-bone-50">{r.fullName ?? "—"}</td>
                    <td className="py-2.5">
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-xs",
                          r.status === "lost"
                            ? "bg-white/5 text-bone-50/40"
                            : r.patientId
                              ? "bg-brand-500/15 text-brand-300"
                              : "bg-white/10 text-bone-50/70",
                        )}
                      >
                        {LEAD_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 text-bone-50/70">
                      {CHANNEL_LABELS[r.source] ?? r.source}
                      {r.campaign ? (
                        <span className="ml-1 text-bone-50/40">· {r.campaign}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-bone-50/70">{r.serviceInterest ?? "—"}</td>
                    <td className="py-2.5 text-right text-bone-50/70 tnum">{r.attivita}</td>
                    <td className="py-2.5 text-right text-bone-50/70 tnum">
                      {r.lastActivityAt
                        ? formatRelativeDays(r.lastActivityAt)
                        : formatShortDate(r.firstSeenAt)}
                    </td>
                    <td className="py-2.5 text-right text-bone-50 tnum">
                      {r.valoreCents > 0 ? formatEuro(r.valoreCents) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
