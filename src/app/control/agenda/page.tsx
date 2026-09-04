import type { Metadata } from "next";
import Link from "next/link";
import { getAgendaSede, getPolsoGiornata } from "@/lib/data/operations";
import { elencoPazienti, elencoProfessionisti, elencoServizi, elencoStanze } from "@/lib/data/gestione";
import { creaAppuntamento } from "@/lib/gestione/actions";
import { STATI_VISITA } from "@/lib/gestione/etichette";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCredits, formatDurata, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { Campo, Kpi, KpiStrip, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";
import { AzioniVisita } from "@/components/control/azioni-visita";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

/**
 * L'agenda della sede.
 *
 * È la schermata della reception: chi arriva, per cosa, da chi, in
 * quale stanza. E i quattro gesti che l'agenda richiede — fissare,
 * confermare, segnare l'esito, disdire — senza cambiare pagina. Il nome
 * del paziente porta alla sua scheda operativa; la cartella clinica no,
 * perché non compete al banco.
 */
export default async function AgendaSedePage() {
  const sezione = SEZIONI_CONTROL["/control/agenda"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: in modalità dimostrativa non c’è un’agenda da mostrare.</Vuoto>
      </Panel>
    );
  }

  const [giorni, polso, pazienti, servizi, professionisti, stanze] = await Promise.all([
    getAgendaSede(7),
    getPolsoGiornata(),
    elencoPazienti(),
    elencoServizi(false),
    elencoProfessionisti(),
    elencoStanze(),
  ]);

  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const perNome = [...pazienti].sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">{sezione.title}</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/45">{sezione.subtitle}</p>

        {polso ? (
          <div className="mt-4">
            <KpiStrip>
              <Kpi label="Visite oggi" value={String(polso.visite)} />
              <Kpi label="Da confermare" value={String(polso.daConfermare)} tone={polso.daConfermare > 0 ? "warn" : "neutral"} />
              <Kpi label="Non presentati" value={String(polso.noShow)} tone={polso.noShow > 0 ? "warn" : "neutral"} />
              <Kpi label="Nuovi pazienti" value={String(polso.nuoviPazienti)} tone="good" />
            </KpiStrip>
          </div>
        ) : null}
      </section>

      <Panel title="Nuovo appuntamento" hint="Se il paziente non c'è, prima si aggiunge in Pazienti">
        <ModuloAzione action={creaAppuntamento} invio="Fissa l'appuntamento" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Paziente">
            <Scelta name="patientId" required defaultValue="">
              <option value="" disabled>
                Scegli…
              </option>
              {perNome.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.telefono ? ` · ${p.telefono}` : ""}
                </option>
              ))}
            </Scelta>
          </Campo>
          <Campo label="Servizio">
            <Scelta name="serviceId" required defaultValue="">
              <option value="" disabled>
                Scegli…
              </option>
              {servizi.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {formatDurata(s.durataMin)}
                </option>
              ))}
            </Scelta>
          </Campo>
          <Campo label="Professionista">
            <Scelta name="professionalId" defaultValue="">
              <option value="">Da assegnare</option>
              {professionisti
                .filter((p) => p.attivo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.titolo, p.nome].filter(Boolean).join(" ")}
                  </option>
                ))}
            </Scelta>
          </Campo>
          <Campo label="Giorno">
            <Testo name="giorno" type="date" required min={oggi} defaultValue={oggi} />
          </Campo>
          <Campo label="Ora">
            <Testo name="ora" type="time" required step={300} />
          </Campo>
          <Campo label="Stanza">
            <Scelta name="roomId" defaultValue="">
              <option value="">Nessuna</option>
              {stanze
                .filter((s) => s.attiva)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
            </Scelta>
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Nota per l'agenda">
              <Testo name="note" placeholder="Prima visita, porta gli esami" autoComplete="off" />
            </Campo>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-bone-50/70">
            <input type="checkbox" name="usaCrediti" defaultChecked className="h-4 w-4 accent-brand-500" />
            Scala i crediti del piano
          </label>
        </ModuloAzione>
      </Panel>

      {giorni.length === 0 ? (
        <Panel title="Prossimi giorni">
          <Vuoto>Nessuna visita in programma nei prossimi sette giorni.</Vuoto>
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
                const stato = STATI_VISITA[visita.status] ?? { label: visita.status, tono: "neutro" as const };
                return (
                  <li key={visita.id} className="border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="font-display text-[18px] text-bone-50 tnum">{formatTime(visita.startsAt)}</span>
                      <span className="min-w-0 flex-1">
                        {visita.patientId ? (
                          <Link href={`/control/pazienti/${visita.patientId}`} className="block text-[15px] text-bone-50 hover:text-brand-300">
                            {visita.patientName}
                          </Link>
                        ) : (
                          <span className="block text-[15px] text-bone-50">{visita.patientName}</span>
                        )}
                        <span className="mt-0.5 block text-xs text-bone-50/40">
                          {visita.serviceName}
                          {visita.professionalName ? ` · ${visita.professionalName}` : ""}
                          {visita.roomName ? ` · ${visita.roomName}` : ""}
                          {visita.creditsCost > 0 ? ` · ${formatCredits(visita.creditsCost)}` : ""}
                          {visita.source !== "unique_os" ? " · dal gestionale esterno" : ""}
                        </span>
                      </span>
                      <Stato tono={stato.tono}>{stato.label}</Stato>
                    </div>
                    <div className="mt-2">
                      <AzioniVisita appointmentId={visita.id} patientId={visita.patientId || null} status={visita.status} />
                    </div>
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
