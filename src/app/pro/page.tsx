import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getComandoClinico } from "@/lib/data/comando";
import { DISCIPLINE_LABELS } from "@/lib/professionals/disciplines";
import { ETICHETTE_CATEGORIA } from "@/lib/clinical/attenzione";
import { formatRelativeDays, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import {
  Coda,
  ConfineAI,
  Niente,
  Numero,
  Priorita,
  PrioritaTesto,
  Riquadro,
  Scorciatoia,
  Striscia,
} from "@/components/clinical/command-center";
import { GestiSegnale } from "@/components/clinical/gesti-segnale";
import { RicercaGlobale } from "@/components/clinical/ricerca-globale";
import {
  Badge,
  BellIcon,
  CalendarIcon,
  Card,
  DocumentIcon,
  EmptyState,
  SparkIcon,
  TaskIcon,
  UsersIcon,
  cx,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Area clinica" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
export const unstable_dynamicStaleTime = 0;

/**
 * Il Clinical Command Center.
 *
 * La domanda a cui questa schermata risponde, e l'unica che conta
 * quando un medico la apre alle otto del mattino: **cosa sta succedendo
 * ai miei pazienti e cosa devo fare adesso.**
 *
 * L'ordine in cui le cose stanno in pagina è la risposta:
 *
 *   1. I numeri della giornata, su una riga. Contesto, non lavoro.
 *   2. **Adesso** — le cinque cose, in ordine di urgenza, ciascuna con i
 *      fatti che l'hanno accesa e un verbo per agire.
 *   3. La giornata: chi entra, a che ora, preparato o no.
 *   4. I pazienti che richiedono attenzione, raggruppati per persona.
 *   5. Tutto il resto, chiuso, a portata di un clic.
 *
 * Il punto tre non è al primo posto di proposito. L'agenda dice cosa
 * succederà; il lavoro arretrato dice cosa è rimasto indietro, e nessun
 * calendario lo mostra. Aprire la giornata dall'agenda è come leggere
 * solo la posta in arrivo di oggi.
 */

/** Quante ne mostra la coda principale. Cinque, come la domanda pone. */
const QUANTE_ADESSO = 5;

export default async function ComandoClinicoPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  const c = isSupabaseConfigured() ? await getComandoClinico() : null;

  return (
    <div>
      {/* ── Intestazione ─────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
            Ciao {profile.firstName ?? profile.fullName}.
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-400 first-letter:uppercase">
            {formatWeekdayDayMonth(new Date().toISOString())}
            {c ? <Badge>{DISCIPLINE_LABELS[c.discipline]}</Badge> : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Scorciatoia href="/pro/agenda" icona={<CalendarIcon />}>
            Agenda
          </Scorciatoia>
          <Scorciatoia href="/pro/attenzione" icona={<SparkIcon />}>
            Attenzione
          </Scorciatoia>
          <Scorciatoia href="/pro/pazienti" icona={<UsersIcon />}>
            Pazienti
          </Scorciatoia>
        </div>
      </header>

      <div className="mt-5">
        <RicercaGlobale />
      </div>

      {!c ? (
        <Card className="mt-8">
          <EmptyState>
            {isSupabaseConfigured()
              ? "Il tuo profilo non risulta fra i professionisti della clinica."
              : "Supabase non è collegato: in modalità dimostrativa non c’è una giornata da mostrare."}
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {/* ── I numeri della giornata ──────────────────────── */}
          <Striscia>
            <Numero
              etichetta="Pazienti oggi"
              valore={c.numeri.pazientiOggi}
              nota={
                c.numeri.visiteOggi !== c.numeri.pazientiOggi
                  ? `${c.numeri.visiteOggi} visite`
                  : undefined
              }
              href="/pro/agenda"
            />
            <Numero
              etichetta="Da completare"
              valore={c.numeri.daCompletare}
              nota="Esito non registrato"
              tono="urgente"
              href="/pro/attenzione?vista=visita"
            />
            <Numero
              etichetta="Criticità"
              valore={c.numeri.criticita}
              nota="Fuori soglia clinica"
              tono="urgente"
              href="/pro/revisioni"
            />
            <Numero
              etichetta="Referti da leggere"
              valore={c.numeri.refertiDaRevisionare}
              tono="attenzione"
              href="/pro/documenti"
            />
            <Numero
              etichetta="Risultati nuovi"
              valore={c.numeri.risultatiNuovi}
              nota="In attesa di conferma"
              tono="attenzione"
              href="/pro/revisioni"
            />
            <Numero
              etichetta="Reassessment"
              valore={c.numeri.reassessment}
              nota="Score non recente"
              tono="quieto"
              href="/pro/attenzione?vista=reassessment"
            />
          </Striscia>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            {/* ── Adesso ───────────────────────────────────── */}
            <Riquadro
              titolo="Adesso"
              nota="Le cose più importanti, in ordine. Ognuna porta con sé i fatti che l’hanno accesa."
              tutto={{ label: "Tutto il centro di attenzione", href: "/pro/attenzione" }}
            >
              <div className="px-6 pt-3">
                <ConfineAI fonte="referti, misure approvate, agenda, punteggi, task e messaggi in cartella">
                  L’ordine è calcolato da regole scritte, non da un modello, e non
                  sostituisce il giudizio clinico. Verifica i dati citati prima di agire.
                </ConfineAI>
              </div>

              {c.segnali.length === 0 ? (
                <Niente>
                  Niente che richieda attenzione. Le segnalazioni compaiono da sole
                  quando arriva un referto, quando una visita resta senza esito o
                  quando un punteggio invecchia.
                </Niente>
              ) : (
                <ul className="mt-1 divide-y divide-bone-200/80">
                  {c.segnali.slice(0, QUANTE_ADESSO).map((s) => (
                    <li key={s.id} className="flex gap-3.5 px-6 py-4">
                      <Priorita livello={s.priorita} />
                      <PrioritaTesto livello={s.priorita} />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <p className="text-[15px] font-medium leading-snug text-ink-900">
                            {s.titolo}
                          </p>
                          <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                            {ETICHETTE_CATEGORIA[s.categoria]}
                          </span>
                          {s.richiedeMedico ? (
                            <Badge tone="attention">Richiede un medico</Badge>
                          ) : null}
                        </div>

                        {s.patientId ? (
                          <p className="mt-0.5 text-sm">
                            <NavLink
                              href={`/pro/pazienti/${s.patientId}`}
                              className="text-brand-700 underline-offset-4 hover:underline"
                            >
                              {s.patientName}
                            </NavLink>
                          </p>
                        ) : null}

                        <ul className="mt-1.5 space-y-0.5">
                          {s.motivo.map((riga) => (
                            <li key={riga} className="text-sm leading-relaxed text-ink-500">
                              {riga}
                            </li>
                          ))}
                        </ul>

                        {s.richiedeMedico && !c.puoApprovare ? (
                          <p className="mt-2 text-xs text-ink-400">
                            La tua disciplina non può approvare un valore fuori soglia:
                            passa la mano a un medico o crea un task.
                          </p>
                        ) : null}

                        <GestiSegnale segnale={s} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {c.segnali.length > QUANTE_ADESSO ? (
                <p className="border-t border-bone-200 px-6 py-3 text-sm text-ink-400">
                  Altre <span className="tnum">{c.segnali.length - QUANTE_ADESSO}</span>{" "}
                  segnalazioni nel centro di attenzione.
                </p>
              ) : null}
            </Riquadro>

            {/* ── La giornata ──────────────────────────────── */}
            <div className="space-y-6">
              <Riquadro
                titolo="La giornata"
                conta={c.oggi.length}
                tutto={{ label: "Agenda", href: "/pro/agenda" }}
              >
                {c.oggi.length === 0 ? (
                  <Niente>Nessuna visita in agenda oggi.</Niente>
                ) : (
                  <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                    {c.oggi.map((visita) => {
                      const passata = Date.parse(visita.startsAt) < Date.now();
                      return (
                        <li key={visita.id}>
                          <NavLink
                            href={`/pro/pazienti/${visita.patientId}/visita`}
                            className="group flex items-baseline gap-3.5 px-6 py-3 transition-colors hover:bg-bone-50"
                          >
                            <span
                              className={cx(
                                "font-display text-[18px] tnum",
                                passata ? "text-ink-300" : "text-ink-900",
                              )}
                            >
                              {formatTime(visita.startsAt)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cx(
                                  "block truncate text-[15px]",
                                  passata
                                    ? "font-normal text-ink-400"
                                    : "font-medium text-ink-900",
                                )}
                              >
                                {visita.patientName}
                              </span>
                              <span className="mt-0.5 block truncate text-sm text-ink-400">
                                {visita.serviceName}
                              </span>
                            </span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Riquadro>

              <Riquadro
                titolo="Prossimi giorni"
                conta={c.prossimi.length}
                apribile
                aperto={false}
              >
                {c.prossimi.length === 0 ? (
                  <Niente>Agenda libera nella prossima settimana.</Niente>
                ) : (
                  <ul className="divide-y divide-bone-200/80">
                    {c.prossimi.map((visita) => (
                      <li key={visita.id}>
                        <NavLink
                          href={`/pro/pazienti/${visita.patientId}`}
                          className="block px-6 py-3 transition-colors hover:bg-bone-50"
                        >
                          <p className="text-[15px] text-ink-900">{visita.patientName}</p>
                          <p className="mt-0.5 text-sm text-ink-400 first-letter:uppercase">
                            {formatWeekdayDayMonth(visita.startsAt)} · ore{" "}
                            <span className="tnum">{formatTime(visita.startsAt)}</span>
                          </p>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Riquadro>

              <Riquadro
                titolo="Notifiche"
                conta={c.notifiche.length}
                apribile
                aperto={false}
                azione={<BellIcon className="h-4 w-4 text-ink-400" />}
              >
                {c.notifiche.length === 0 ? (
                  <Niente>Niente di non letto.</Niente>
                ) : (
                  <ul className="divide-y divide-bone-200/80">
                    {c.notifiche.map((n) => (
                      <li key={n.id} className="px-6 py-3">
                        <p className="text-[15px] leading-snug text-ink-900">{n.title}</p>
                        {n.body ? (
                          <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                            {n.body}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-ink-300 first-letter:uppercase">
                          {formatRelativeDays(n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Riquadro>
            </div>
          </div>

          {/* ── Pazienti che richiedono attenzione ───────────── */}
          <Riquadro
            titolo="Pazienti che richiedono attenzione"
            nota="In ordine di gravità, non di quantità: una criticità viene prima di sei task."
            conta={c.pazienti.length}
            tutto={{ label: "Tutti i pazienti", href: "/pro/pazienti" }}
          >
            {c.pazienti.length === 0 ? (
              <Niente>Nessun paziente ha segnalazioni aperte.</Niente>
            ) : (
              <Coda>
                {c.pazienti.slice(0, 8).map((p) => (
                  <li key={p.patientId} className="flex gap-3.5 px-6 py-3.5">
                    <Priorita livello={p.prioritaMassima} />
                    <PrioritaTesto livello={p.prioritaMassima} />

                    <div className="min-w-0 flex-1">
                      <NavLink
                        href={`/pro/pazienti/${p.patientId}`}
                        className="text-[15px] font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {p.patientName}
                      </NavLink>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-ink-500">
                        {p.segnali.slice(0, 3).map((s) => (
                          <span key={s.id}>{s.titolo}</span>
                        ))}
                        {p.segnali.length > 3 ? (
                          <span className="text-ink-300">
                            e altre {p.segnali.length - 3}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <span className="shrink-0 self-center text-xs text-ink-300 tnum">
                      {p.segnali.length}
                    </span>
                  </li>
                ))}
              </Coda>
            )}
          </Riquadro>

          {/* ── Le code, per categoria ───────────────────────── */}
          <Riquadro
            titolo="Le code"
            nota="Cosa resta, diviso per tipo di lavoro."
            apribile
            aperto={false}
            azione={<TaskIcon className="h-4 w-4 text-ink-400" />}
          >
            <ul className="grid gap-px bg-bone-200 sm:grid-cols-2 lg:grid-cols-5 [&>*]:bg-white">
              {c.conti.map((conto) => (
                <li key={conto.categoria}>
                  <NavLink
                    href={`/pro/attenzione?vista=${conto.categoria}`}
                    className="block px-5 py-4 transition-colors hover:bg-bone-50"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
                      {ETICHETTE_CATEGORIA[conto.categoria]}
                    </p>
                    <p
                      className={cx(
                        "mt-1 font-display text-[22px] leading-none tnum",
                        conto.totale === 0
                          ? "text-ink-300"
                          : conto.urgenti > 0
                            ? "text-signal-alert"
                            : "text-ink-900",
                      )}
                    >
                      {conto.totale}
                    </p>
                    {conto.urgenti > 0 ? (
                      <p className="mt-1 text-xs text-signal-alert tnum">
                        {conto.urgenti} urgenti
                      </p>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>

            {c.messiATacere > 0 ? (
              <p className="border-t border-bone-200 px-6 py-3 text-sm text-ink-400">
                <span className="tnum">{c.messiATacere}</span>{" "}
                {c.messiATacere === 1 ? "segnalazione rimandata" : "segnalazioni rimandate"}{" "}
                da te.{" "}
                <NavLink
                  href="/pro/attenzione?vista=rimandate"
                  className="text-brand-700 underline-offset-4 hover:underline"
                >
                  Rivedile
                </NavLink>
              </p>
            ) : null}
          </Riquadro>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2 text-xs text-ink-300">
            <span className="inline-flex items-center gap-1.5">
              <DocumentIcon className="h-3.5 w-3.5" />I dati clinici in questa schermata non
              passano mai dalla cache: sono quelli di adesso.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
