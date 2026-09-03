import type { Metadata } from "next";
import { getControlCenter } from "@/lib/data/control";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { monthsToSaturation, projectDemand } from "@/lib/capacity/engine";
import { DISCIPLINE_LABELS, type Discipline } from "@/lib/professionals/disciplines";
import { formatDurata, formatPercent } from "@/lib/format";
import { Barra, Kpi, KpiStrip, Panel, Riga, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Capacità" };
export const dynamic = "force-dynamic";

/** Scenari di crescita su cui proiettare la domanda. */
const SCENARI = [250, 500, 1000];
const CRESCITA_MENSILE = 10;

function etichettaDisciplina(chiave: string): string {
  return DISCIPLINE_LABELS[chiave as Discipline] ?? chiave;
}

export default async function CapacitaPage() {
  const dati = await getControlCenter();

  if (!dati) {
    return (
      <Panel title="Capacità">
        <Vuoto>
          {isSupabaseConfigured()
            ? "Il tuo profilo non ha i permessi di direzione."
            : "Supabase non è collegato."}
        </Vuoto>
      </Panel>
    );
  }

  const c = dati.capacita;
  const haModello = c.modelloConsumo.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Capacità</h1>
        <p className="mt-1.5 text-sm text-bone-50/50">
          Il modello di consumo è ricavato dalle visite erogate agli attuali{" "}
          {c.membriAttivi} membri, non da un’ipotesi.
        </p>
      </div>

      <KpiStrip>
        <Kpi
          label="Capacità ambulatori"
          value={formatDurata(c.minutiSettimanaClinica)}
          hint="a settimana"
        />
        <Kpi
          label="Presenza professionisti"
          value={formatDurata(c.minutiSettimanaProfessionisti)}
          hint="a settimana"
        />
        <Kpi
          label="Collo di bottiglia"
          value={
            c.collo
              ? formatPercent(c.collo.saturazione)
              : "—"
          }
          hint={
            c.collo
              ? (c.nomiProfessionisti.get(c.collo.professionalId) ?? "—")
              : "Nessun orario configurato"
          }
          tone={c.collo && c.collo.saturazione > 0.85 ? "warn" : "neutral"}
        />
        <Kpi
          label="Membri ancora acquisibili"
          value={haModello ? String(c.margineCrescita.membriAggiuntivi) : "—"}
          hint={
            c.margineCrescita.vincolo
              ? `Vincolo: ${etichettaDisciplina(c.margineCrescita.vincolo)}`
              : "Servono più dati"
          }
          tone={
            haModello && c.margineCrescita.membriAggiuntivi < 20 ? "warn" : "good"
          }
        />
      </KpiStrip>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Saturazione ─────────────────────────────────────── */}
        <Panel
          title="Saturazione per professionista"
          hint="Minuti erogati sui minuti di presenza configurati."
        >
          {c.utilizzi.length === 0 ? (
            <Vuoto>Nessun orario configurato: la capacità non è misurabile.</Vuoto>
          ) : (
            <ul className="pb-2">
              {c.utilizzi.map((u) => (
                <li
                  key={u.professionalId}
                  className="border-t border-white/[0.07] px-5 py-3 first:border-t-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[15px] text-bone-50">
                      {c.nomiProfessionisti.get(u.professionalId) ?? "Professionista"}
                    </span>
                    <span className="text-[15px] text-bone-50 tnum">
                      {u.minutiDisponibili === 0 ? "—" : formatPercent(u.saturazione)}
                    </span>
                  </div>
                  {u.minutiDisponibili > 0 ? <Barra ratio={u.saturazione} /> : null}
                  <p className="mt-1 text-xs text-bone-50/40 tnum">
                    {formatDurata(u.minutiErogati)} su {formatDurata(u.minutiDisponibili)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Consumo ─────────────────────────────────────────── */}
        <Panel
          title="Consumo per membro"
          hint="Ore all’anno, per disciplina, misurate sui membri attuali."
        >
          {!haModello ? (
            <Vuoto>
              Servono membership attive e visite erogate per ricavare un modello.
            </Vuoto>
          ) : (
            <ul className="pb-2">
              {c.modelloConsumo.map((m) => (
                <Riga
                  key={m.discipline}
                  label={etichettaDisciplina(m.discipline)}
                  value={formatDurata(m.minutiPerMembroAnno)}
                  extra="per membro all’anno"
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Proiezioni ──────────────────────────────────────────── */}
      <Panel
        title="Se cresciamo"
        hint={`Ore annue necessarie per disciplina, e mesi alla saturazione a ${CRESCITA_MENSILE} nuovi membri al mese.`}
      >
        {!haModello ? (
          <Vuoto>Senza modello di consumo non si proietta nulla.</Vuoto>
        ) : (
          <div className="overflow-x-auto px-5 pb-5 pt-2">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-bone-50/40">
                  <th className="pb-2 font-medium">Disciplina</th>
                  {SCENARI.map((n) => (
                    <th key={n} className="pb-2 text-right font-medium tnum">
                      {n} membri
                    </th>
                  ))}
                  <th className="pb-2 text-right font-medium">Saturazione</th>
                </tr>
              </thead>
              <tbody>
                {c.modelloConsumo.map((m) => {
                  const capacita = c.capacitaAnnuaPerDisciplina.get(m.discipline) ?? 0;
                  const mesi = monthsToSaturation(
                    c.membriAttivi,
                    CRESCITA_MENSILE,
                    m.discipline,
                    c.modelloConsumo,
                    capacita,
                  );

                  return (
                    <tr key={m.discipline} className="border-t border-white/[0.07]">
                      <td className="py-2.5 text-bone-50">
                        {etichettaDisciplina(m.discipline)}
                        <span className="ml-2 text-xs text-bone-50/40 tnum">
                          capacità {formatDurata(capacita)}/anno
                        </span>
                      </td>
                      {SCENARI.map((n) => {
                        const ore = projectDemand(n, [m])[0].oreAnno;
                        const oltre = capacita > 0 && ore * 60 > capacita;
                        return (
                          <td
                            key={n}
                            className={`py-2.5 text-right tnum ${oltre ? "text-signal-alert" : "text-bone-50/80"}`}
                          >
                            {Math.round(ore).toLocaleString("it-IT")} h
                          </td>
                        );
                      })}
                      <td className="py-2.5 text-right tnum text-bone-50/80">
                        {mesi === null
                          ? "—"
                          : mesi === 0
                            ? "già satura"
                            : `${mesi} mesi`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
