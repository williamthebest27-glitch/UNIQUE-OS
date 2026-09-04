import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  elencoProfessionisti,
  elencoSedi,
  elencoServizi,
  nomiPazienti,
  teamPerProfessionista,
} from "@/lib/data/gestione";
import {
  assegnaAlTeam,
  attivaDisattivaProfessionista,
  chiudiAssegnazione,
  creaProfessionista,
  generaDisponibilita,
  salvaTurni,
} from "@/lib/gestione/actions";
import { DISCIPLINE, GIORNI_SETTIMANA, etichetta } from "@/lib/gestione/etichette";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatDurata } from "@/lib/format";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { Campo, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";

export const metadata: Metadata = { title: "Professionisti" };
export const dynamic = "force-dynamic";

/**
 * La squadra.
 *
 * Per ogni professionista: chi è, quando riceve, quante fette libere ha
 * pubblicato. Gli orari settimanali sono la regola; le disponibilità
 * sono la regola applicata a un periodo, fetta per fetta, e sono quelle
 * che il paziente vede e prenota. Le pubblica il banco, a tre mesi per
 * volta al massimo — oltre, l'agenda cambia prima di arrivarci.
 */

const GIORNO_BREVE = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export default async function ProfessionistiPage() {
  const sezione = SEZIONI_CONTROL["/control/professionisti"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: la squadra vive nel database.</Vuoto>
      </Panel>
    );
  }

  const [profile, professionisti, servizi, sedi, pazienti, team] = await Promise.all([
    requireProfile(),
    elencoProfessionisti(),
    elencoServizi(false),
    elencoSedi(),
    nomiPazienti(),
    teamPerProfessionista(),
  ]);
  const direzione = ["admin", "owner"].includes(profile.role);

  // Chi si può ancora assegnare a ciascuno: l'elenco meno chi già segue.
  // Si calcola qui e non dentro la lista perché serve una riga sola per
  // professionista, e nel corpo della `map` non c'è posto per una const.
  const assegnabiliA = new Map(
    professionisti.map((p) => {
      const gia = new Set((team.get(p.id) ?? []).map((s) => s.patientId));
      return [p.id, pazienti.filter((x) => !gia.has(x.id))] as const;
    }),
  );

  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const fraUnMese = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">{sezione.title}</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
      </div>

      {professionisti.length === 0 ? (
        <Panel title="Squadra">
          <Vuoto>Nessun professionista ancora.</Vuoto>
        </Panel>
      ) : (
        professionisti.map((p) => (
          <Panel
            key={p.id}
            title={[p.titolo, p.nome].filter(Boolean).join(" ")}
            hint={[etichetta(DISCIPLINE, p.disciplina), p.specialita, p.sede].filter(Boolean).join(" · ")}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-3 pt-1 text-sm text-bone-50/60">
              <Stato tono={p.attivo ? "buono" : "spento"}>{p.attivo ? "In servizio" : "Non attivo"}</Stato>
              <span>
                {p.turni.length === 0
                  ? "Nessun orario settimanale"
                  : p.turni.map((t) => `${GIORNO_BREVE[t.weekday]} ${t.startsAt}–${t.endsAt}`).join(" · ")}
              </span>
              <span className="text-bone-50/40 tnum">
                {p.slotFuturi} {p.slotFuturi === 1 ? "disponibilità libera" : "disponibilità libere"}
              </span>
              {direzione ? (
                <form action={attivaDisattivaProfessionista} className="ml-auto">
                  <input type="hidden" name="professionalId" value={p.id} />
                  <input type="hidden" name="attivo" value={p.attivo ? "false" : "true"} />
                  <button type="submit" className="text-xs text-bone-50/50 hover:text-bone-50">
                    {p.attivo ? "Metti fuori servizio" : "Rimetti in servizio"}
                  </button>
                </form>
              ) : null}
            </div>

            <div className="grid gap-6 border-t border-white/[0.07] px-5 pb-5 pt-4 lg:grid-cols-2">
              {direzione ? (
                <details open={p.turni.length === 0}>
                  <summary className="cursor-pointer text-sm text-bone-50/70 hover:text-bone-50">Orari settimanali</summary>
                  <ModuloAzione action={salvaTurni} invio="Salva gli orari" variante="quieto" className="mt-3 grid gap-3">
                    <input type="hidden" name="professionalId" value={p.id} />
                    {GIORNI_SETTIMANA.map((g) => {
                      const turno = p.turni.find((t) => t.weekday === g.weekday);
                      return (
                        <div key={g.chiave} className="flex items-center gap-2">
                          <span className="w-24 text-sm text-bone-50/60">{g.label}</span>
                          <Testo type="time" name={`${g.chiave}_da`} defaultValue={turno?.startsAt ?? ""} className="w-auto" aria-label={`${g.label}, dalle`} />
                          <span className="text-xs text-bone-50/40">–</span>
                          <Testo type="time" name={`${g.chiave}_a`} defaultValue={turno?.endsAt ?? ""} className="w-auto" aria-label={`${g.label}, alle`} />
                        </div>
                      );
                    })}
                    <p className="text-xs text-bone-50/35">Vuoto = giorno di riposo. Un turno per giorno.</p>
                  </ModuloAzione>
                </details>
              ) : null}

              <details>
                <summary className="cursor-pointer text-sm text-bone-50/70 hover:text-bone-50">Pubblica disponibilità</summary>
                <ModuloAzione action={generaDisponibilita} invio="Pubblica" className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="professionalId" value={p.id} />
                  <div className="sm:col-span-3">
                    <Campo label="Servizio" hint="Decide la durata delle fette.">
                      <Scelta name="serviceId" defaultValue="">
                        <option value="">Fette da {formatDurata(60)}</option>
                        {servizi.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome} · {formatDurata(s.durataMin)}
                          </option>
                        ))}
                      </Scelta>
                    </Campo>
                  </div>
                  <Campo label="Da">
                    <Testo type="date" name="da" required defaultValue={oggi} min={oggi} />
                  </Campo>
                  <Campo label="A">
                    <Testo type="date" name="a" required defaultValue={fraUnMese} min={oggi} />
                  </Campo>
                </ModuloAzione>
              </details>

              {direzione ? (
                <details>
                  <summary className="cursor-pointer text-sm text-bone-50/70 hover:text-bone-50">
                    Pazienti seguiti · <span className="tnum">{(team.get(p.id) ?? []).length}</span>
                  </summary>

                  {(team.get(p.id) ?? []).length === 0 ? (
                    <p className="mt-3 text-xs text-bone-50/35">
                      Nessuno. Entra in area clinica e non trova nessun paziente: è il team a
                      decidere cosa vede, non il ruolo.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {(team.get(p.id) ?? []).map((s) => (
                        <li key={s.patientId} className="flex flex-wrap items-baseline gap-x-3">
                          <Link
                            href={`/control/pazienti/${s.patientId}`}
                            className="text-sm text-bone-50/80 hover:text-bone-50"
                          >
                            {s.nome}
                          </Link>
                          {s.ruolo ? <span className="text-xs text-bone-50/35">{s.ruolo}</span> : null}
                          <form action={chiudiAssegnazione} className="ml-auto">
                            <input type="hidden" name="patientId" value={s.patientId} />
                            <input type="hidden" name="professionalId" value={p.id} />
                            <button
                              type="submit"
                              className="text-xs text-bone-50/40 transition-colors hover:text-gold-300"
                            >
                              Togli
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  {(assegnabiliA.get(p.id) ?? []).length === 0 ? (
                    <p className="mt-3 text-xs text-bone-50/35">
                      {pazienti.length === 0
                        ? "Nessun paziente in anagrafica."
                        : "Segue già tutti i pazienti in anagrafica."}
                    </p>
                  ) : (
                    <ModuloAzione
                      action={assegnaAlTeam}
                      invio="Assegna"
                      variante="quieto"
                      className="mt-3 grid gap-3"
                    >
                      <input type="hidden" name="professionalId" value={p.id} />
                      <Campo label="Aggiungi un paziente">
                        <Scelta name="patientId" required defaultValue="">
                          <option value="" disabled>
                            Scegli…
                          </option>
                          {(assegnabiliA.get(p.id) ?? []).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nome}
                              {x.codice ? ` · ${x.codice}` : ""}
                            </option>
                          ))}
                        </Scelta>
                      </Campo>
                      <Campo label="Ruolo nel team" hint="Facoltativo: è come compare in cartella.">
                        <Testo name="ruolo" placeholder="Referente clinico" autoComplete="off" />
                      </Campo>
                    </ModuloAzione>
                  )}
                </details>
              ) : null}
            </div>
          </Panel>
        ))
      )}

      {direzione ? (
        <Panel title="Nuovo professionista" hint="Crea anche l'accesso all'area clinica">
          <ModuloAzione action={creaProfessionista} invio="Aggiungi alla squadra" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
            <Campo label="Nome">
              <Testo name="firstName" required autoComplete="off" />
            </Campo>
            <Campo label="Cognome">
              <Testo name="lastName" required autoComplete="off" />
            </Campo>
            <Campo label="Email" hint="Con questa entra nell'area clinica.">
              <Testo name="email" type="email" required autoComplete="off" />
            </Campo>
            <Campo label="Telefono">
              <Testo name="phone" type="tel" autoComplete="off" />
            </Campo>
            <Campo label="Titolo">
              <Scelta name="title" defaultValue="Dott.">
                <option value="">Nessuno</option>
                <option value="Dott.">Dott.</option>
                <option value="Dott.ssa">Dott.ssa</option>
                <option value="Prof.">Prof.</option>
              </Scelta>
            </Campo>
            <Campo label="Disciplina" hint="Decide su quali pilastri può scrivere.">
              <Scelta name="discipline" defaultValue="physician">
                {Object.entries(DISCIPLINE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Scelta>
            </Campo>
            <Campo label="Specialità">
              <Testo name="specialty" placeholder="Medicina interna" autoComplete="off" />
            </Campo>
            {sedi.length > 1 ? (
              <Campo label="Sede">
                <Scelta name="locationId" defaultValue={sedi[0]?.id}>
                  {sedi.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </Scelta>
              </Campo>
            ) : null}
          </ModuloAzione>
        </Panel>
      ) : null}
    </div>
  );
}
