import type { Metadata } from "next";
import { getAgendaSede, getPolsoGiornata } from "@/lib/data/operations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCredits, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

/**
 * L'agenda della sede.
 *
 * È la schermata della reception: chi arriva oggi, per cosa, da chi. Le
 * righe non portano da nessuna parte perché non c'è nessun posto in cui
 * la reception debba andare — la cartella clinica non le compete.
 */

const STATI: Record<string, { label: string; tono: "neutro" | "buono" | "avviso" }> = {
  scheduled: { label: "Da confermare", tono: "avviso" },
  confirmed: { label: "Confermata", tono: "neutro" },
  completed: { label: "Svolta", tono: "buono" },
  no_show: { label: "Non presentato", tono: "avviso" },
};

export default async function AgendaSedePage() {
  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Agenda">
        <Vuoto>
          Supabase non è collegato: in modalità dimostrativa non c’è un’agenda
          da mostrare.
        </Vuoto>
      </Panel>
    );
  }

  const [giorni, polso] = await Promise.all([getAgendaSede(7), getPolsoGiornata()]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Agenda</h1>
        <p className="mt-1.5 text-sm text-bone-50/45">
          I prossimi sette giorni, tutti i professionisti.
        </p>

        {polso ? (
          <div className="mt-4">
            <KpiStrip>
              <Kpi label="Visite oggi" value={String(polso.visite)} />
              <Kpi
                label="Da confermare"
                value={String(polso.daConfermare)}
                tone={polso.daConfermare > 0 ? "warn" : "neutral"}
              />
              <Kpi
                label="Non presentati"
                value={String(polso.noShow)}
                tone={polso.noShow > 0 ? "warn" : "neutral"}
              />
              <Kpi label="Nuovi pazienti" value={String(polso.nuoviPazienti)} tone="good" />
            </KpiStrip>
          </div>
        ) : null}
      </section>

      {giorni.length === 0 ? (
        <Panel title="Prossimi giorni">
          <Vuoto>
            Nessuna visita in programma. Le prenotazioni arrivano dal gestionale
            o dalla dashboard del paziente.
          </Vuoto>
        </Panel>
      ) : (
        giorni.map((giorno) => (
          <Panel
            key={giorno.data}
            title={formatWeekdayDayMonth(`${giorno.data}T12:00:00Z`)}
            hint={`${giorno.visite.length} ${giorno.visite.length === 1 ? "visita" : "visite"}`}
          >
            <ul className="pb-2">
              {giorno.visite.map((visita) => {
                const stato = STATI[visita.status] ?? { label: visita.status, tono: "neutro" };
                return (
                  <li
                    key={visita.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0"
                  >
                    <span className="font-display text-[18px] text-bone-50 tnum">
                      {formatTime(visita.startsAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-bone-50">{visita.patientName}</span>
                      <span className="mt-0.5 block text-xs text-bone-50/40">
                        {visita.serviceName}
                        {visita.professionalName ? ` · ${visita.professionalName}` : ""}
                        {visita.source !== "unique_os" ? " · dal gestionale" : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span
                        className={
                          stato.tono === "buono"
                            ? "block text-xs text-brand-300"
                            : stato.tono === "avviso"
                              ? "block text-xs text-gold-300"
                              : "block text-xs text-bone-50/50"
                        }
                      >
                        {stato.label}
                      </span>
                      {visita.creditsCost > 0 ? (
                        <span className="mt-0.5 block text-xs text-bone-50/35 tnum">
                          {formatCredits(visita.creditsCost)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}
