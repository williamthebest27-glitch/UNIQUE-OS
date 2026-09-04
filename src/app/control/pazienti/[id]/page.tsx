import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  elencoPiani,
  elencoProfessionisti,
  elencoServizi,
  elencoStanze,
  schedaOperativa,
} from "@/lib/data/gestione";
import {
  aggiornaAnagrafica,
  attivaMembership,
  creaAppuntamento,
  registraIncasso,
  spostaAppuntamento,
} from "@/lib/gestione/actions";
import {
  CANALI_INCASSO,
  STATI_MEMBERSHIP,
  STATI_VISITA,
  TIPI_INCASSO,
  etichetta,
} from "@/lib/gestione/etichette";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCredits, formatDurata, formatEuro, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { Campo, Kpi, KpiStrip, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";
import { AzioniVisita } from "@/components/control/azioni-visita";

export const metadata: Metadata = { title: "Scheda paziente" };
export const dynamic = "force-dynamic";

/**
 * La scheda operativa di un paziente.
 *
 * È la pagina che la reception tiene aperta mentre la persona è al
 * banco o al telefono: fissare la prossima visita, registrare quello che
 * paga, attivare o rinnovare il piano, correggere un recapito. Tutto in
 * una pagina e tutto senza scorrere troppo — il paziente aspetta.
 */
export default async function SchedaPazientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Scheda paziente">
        <Vuoto>Supabase non è collegato.</Vuoto>
      </Panel>
    );
  }

  const [scheda, servizi, professionisti, stanze, piani] = await Promise.all([
    schedaOperativa(id),
    elencoServizi(false),
    elencoProfessionisti(),
    elencoStanze(),
    elencoPiani(),
  ]);
  if (!scheda) notFound();

  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const adesso = new Date().toISOString();
  const prossime = scheda.appuntamenti.filter(
    (a) => ["scheduled", "confirmed"].includes(a.status) && a.startsAt >= adesso,
  );
  const passate = scheda.appuntamenti.filter((a) => !prossime.includes(a));

  return (
    <div className="space-y-8">
      <section>
        <Link href="/control/pazienti" className="text-xs text-bone-50/40 hover:text-bone-50">
          ← Pazienti
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-[28px] leading-tight text-bone-50">{scheda.nome}</h1>
          {scheda.membership?.status === "active" ? (
            <Stato tono="buono">{scheda.membership.piano}</Stato>
          ) : (
            <Stato tono="spento">Senza piano</Stato>
          )}
        </div>
        <p className="mt-1.5 text-sm text-bone-50/50">
          {[
            scheda.email,
            scheda.telefono,
            scheda.codice,
            scheda.dataNascita ? `nato il ${formatShortDate(scheda.dataNascita)}` : null,
            scheda.sede,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-4">
          <KpiStrip>
            <Kpi label="Crediti disponibili" value={formatCredits(scheda.crediti.disponibili)} tone={scheda.crediti.disponibili > 0 ? "good" : "neutral"} />
            <Kpi label="Prenotati" value={formatCredits(scheda.crediti.prenotati)} />
            <Kpi label="Usati" value={formatCredits(scheda.crediti.usati)} />
            <Kpi label="Prossime visite" value={String(prossime.length)} />
          </KpiStrip>
        </div>
      </section>

      <Panel title="Nuovo appuntamento" hint="Controlla professionista e stanza prima di scrivere">
        <ModuloAzione action={creaAppuntamento} invio="Fissa l'appuntamento" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <input type="hidden" name="patientId" value={scheda.id} />
          <Campo label="Servizio">
            <Scelta name="serviceId" required defaultValue="">
              <option value="" disabled>
                Scegli…
              </option>
              {servizi.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {formatDurata(s.durataMin)}
                  {s.creditsCost > 0 ? ` · ${formatCredits(s.creditsCost)}` : ""}
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
          <Campo label="Nota per l'agenda">
            <Testo name="note" placeholder="Prima visita, porta gli esami" autoComplete="off" />
          </Campo>
          <label className="flex items-center gap-2 text-sm text-bone-50/70 sm:col-span-2">
            <input
              type="checkbox"
              name="usaCrediti"
              defaultChecked={scheda.crediti.disponibili > 0}
              className="h-4 w-4 accent-brand-500"
            />
            Scala i crediti del piano (altrimenti si paga a prestazione)
          </label>
        </ModuloAzione>
      </Panel>

      <Panel title="Prossime visite" hint={`${prossime.length}`}>
        {prossime.length === 0 ? (
          <Vuoto>Nessuna visita in programma.</Vuoto>
        ) : (
          <ul className="pb-2">
            {prossime.map((a) => {
              const stato = STATI_VISITA[a.status] ?? { label: a.status, tono: "neutro" as const };
              return (
                <li key={a.id} className="border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-display text-[18px] text-bone-50 tnum">
                      {formatWeekdayDayMonth(a.startsAt)} · {formatTime(a.startsAt)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-bone-50/70">
                      {a.servizio}
                      {a.professionista ? ` · ${a.professionista}` : ""}
                      {a.stanza ? ` · ${a.stanza}` : ""}
                      {a.creditsCost > 0 ? ` · ${formatCredits(a.creditsCost)}` : ""}
                    </span>
                    <Stato tono={stato.tono}>{stato.label}</Stato>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <AzioniVisita appointmentId={a.id} patientId={scheda.id} status={a.status} />
                    <details className="text-xs text-bone-50/50">
                      <summary className="cursor-pointer hover:text-bone-50">Sposta</summary>
                      <ModuloAzione action={spostaAppuntamento} invio="Sposta" variante="quieto" className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <Testo name="giorno" type="date" required min={oggi} className="w-auto" aria-label="Nuovo giorno" />
                        <Testo name="ora" type="time" required step={300} className="w-auto" aria-label="Nuova ora" />
                      </ModuloAzione>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="Incassa" hint="Contanti, POS o bonifico: la ricevuta la numera il sistema">
          <ModuloAzione action={registraIncasso} invio="Registra l'incasso" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
            <input type="hidden" name="patientId" value={scheda.id} />
            <Campo label="Importo" hint="In euro, ad esempio 149,00">
              <Testo name="importoEuro" required inputMode="decimal" placeholder="149,00" autoComplete="off" />
            </Campo>
            <Campo label="Canale">
              <Scelta name="channel" defaultValue="pos">
                {Object.entries(CANALI_INCASSO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Scelta>
            </Campo>
            <Campo label="Per cosa">
              <Scelta name="kind" defaultValue="service">
                {Object.entries(TIPI_INCASSO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Scelta>
            </Campo>
            <Campo label="Visita">
              <Scelta name="appointmentId" defaultValue="">
                <option value="">Nessuna in particolare</option>
                {scheda.appuntamenti
                  .filter((a) => a.status !== "cancelled")
                  .slice(0, 12)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatShortDate(a.startsAt)} · {a.servizio}
                    </option>
                  ))}
              </Scelta>
            </Campo>
            <div className="sm:col-span-2">
              <Campo label="Descrizione">
                <Testo name="descrizione" placeholder="Consulenza longevity" autoComplete="off" />
              </Campo>
            </div>
          </ModuloAzione>
        </Panel>

        <Panel
          title="Membership"
          hint={
            scheda.membership
              ? `${scheda.membership.piano} · ${etichetta(STATI_MEMBERSHIP, scheda.membership.status)} dal ${formatShortDate(scheda.membership.startsOn)}${scheda.membership.endsOn ? ` al ${formatShortDate(scheda.membership.endsOn)}` : ""}`
              : "Nessun piano attivo"
          }
        >
          <ModuloAzione
            action={attivaMembership}
            invio={scheda.membership?.status === "active" ? "Sostituisci il piano" : "Attiva il piano"}
            className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2"
          >
            <input type="hidden" name="patientId" value={scheda.id} />
            <Campo label="Piano">
              <Scelta name="tierId" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {piani.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {formatEuro(p.prezzoCents)}/{p.periodo === "month" ? "mese" : "anno"} · {formatCredits(p.crediti)}
                  </option>
                ))}
              </Scelta>
            </Campo>
            <Campo label="Dal">
              <Testo name="startsOn" type="date" defaultValue={oggi} required />
            </Campo>
            <Campo label="Importo incassato" hint="Vuoto = prezzo di listino">
              <Testo name="importoEuro" inputMode="decimal" placeholder="listino" autoComplete="off" />
            </Campo>
            <Campo label="Canale">
              <Scelta name="channel" defaultValue="pos">
                {Object.entries(CANALI_INCASSO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Scelta>
            </Campo>
            <label className="flex items-center gap-2 text-sm text-bone-50/70 sm:col-span-2">
              <input type="checkbox" name="pagata" defaultChecked className="h-4 w-4 accent-brand-500" />
              Pagata adesso: registra anche l&apos;incasso
            </label>
          </ModuloAzione>
        </Panel>
      </div>

      <Panel title="Incassi" hint={`${scheda.incassi.length}`}>
        {scheda.incassi.length === 0 ? (
          <Vuoto>Nessun pagamento registrato.</Vuoto>
        ) : (
          <ul className="pb-2">
            {scheda.incassi.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                <span className="w-28 text-xs text-bone-50/40 tnum">{i.paidAt ? formatShortDate(i.paidAt) : "—"}</span>
                <span className="min-w-0 flex-1 text-sm text-bone-50/80">
                  {i.descrizione ?? etichetta(TIPI_INCASSO, i.kind)}
                  <span className="text-bone-50/40">
                    {" "}
                    · {etichetta(CANALI_INCASSO, i.channel)}
                    {i.ricevuta ? ` · ${i.ricevuta}` : ""}
                  </span>
                </span>
                <span className="font-display text-[17px] text-bone-50 tnum">{formatEuro(i.importoCents, 2)}</span>
                <Stato tono={i.status === "paid" ? "buono" : i.status === "pending" ? "avviso" : "spento"}>
                  {i.status === "paid" ? "Pagato" : i.status === "pending" ? "Da pagare" : i.status}
                </Stato>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Visite passate" hint={`${passate.length}`}>
        {passate.length === 0 ? (
          <Vuoto>Nessuna visita precedente.</Vuoto>
        ) : (
          <ul className="pb-2">
            {passate.map((a) => {
              const stato = STATI_VISITA[a.status] ?? { label: a.status, tono: "neutro" as const };
              return (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                  <span className="w-36 text-sm text-bone-50 tnum">
                    {formatShortDate(a.startsAt)} · {formatTime(a.startsAt)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-bone-50/70">
                    {a.servizio}
                    {a.professionista ? ` · ${a.professionista}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <Stato tono={stato.tono}>{stato.label}</Stato>
                    <AzioniVisita appointmentId={a.id} patientId={scheda.id} status={a.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Anagrafica">
        <ModuloAzione action={aggiornaAnagrafica} invio="Salva" variante="quieto" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <input type="hidden" name="patientId" value={scheda.id} />
          <input type="hidden" name="profileId" value={scheda.profileId} />
          <Campo label="Nome">
            <Testo name="firstName" required defaultValue={scheda.nome.split(" ")[0] ?? ""} />
          </Campo>
          <Campo label="Cognome">
            <Testo name="lastName" required defaultValue={scheda.nome.split(" ").slice(1).join(" ")} />
          </Campo>
          <Campo label="Telefono">
            <Testo name="phone" type="tel" defaultValue={scheda.telefono ?? ""} />
          </Campo>
          <Campo label="Email" hint="L'email è l'accesso: si cambia dalla pagina del paziente, non da qui.">
            <Testo value={scheda.email ?? ""} readOnly disabled />
          </Campo>
          <Campo label="Data di nascita">
            <Testo name="dateOfBirth" type="date" defaultValue={scheda.dataNascita ?? ""} />
          </Campo>
          <Campo label="Codice fiscale">
            <Testo name="fiscalCode" maxLength={16} className="uppercase" defaultValue={scheda.codiceFiscale ?? ""} />
          </Campo>
        </ModuloAzione>
      </Panel>
    </div>
  );
}
