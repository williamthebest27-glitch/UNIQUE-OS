import type { Metadata } from "next";
import { getIntestazione, getPanoramicaClinica, getPiano } from "@/lib/data/cartella";
import { getPatientAppointments } from "@/lib/data/appointments";
import { getAttenzione } from "@/lib/data/attenzione";
import { segnaliDelPaziente } from "@/lib/clinical/attenzione";
import { getLatestBriefing } from "@/lib/brain/briefing";
import { registraEsito } from "@/lib/appointments/actions";
import { traccia } from "@/lib/audit";
import { METRIC_DEFINITIONS } from "@/lib/score/metrics";
import { PILLAR_LABELS, type PillarKey } from "@/lib/score/pillars";
import { formatCredits, formatDelta, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { ConfineAI, Niente, Riquadro, Scorciatoia } from "@/components/clinical/command-center";
import { MisuraForm } from "@/components/clinical/misura-form";
import { NoteForm } from "@/components/clinical/clinical-forms";
import { UploadForm } from "@/components/documents/upload-form";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Visita" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il workspace della visita.
 *
 * Tre momenti su una schermata sola, e sono tre perché è così che va
 * una visita: si arriva avendo letto, si scrive mentre si parla, si
 * chiude decidendo cosa succede dopo.
 *
 *   **Prima** — tutto ciò che serve sapere entrando, e niente altro. La
 *   sintesi, cosa è cambiato, cosa sta fuori, cosa è arrivato di nuovo,
 *   cosa era rimasto in sospeso l'ultima volta.
 *
 *   **Durante** — i tre gesti che si fanno con il paziente davanti:
 *   registrare una misura, scrivere una nota, caricare un documento.
 *   Nessuno di essi deve costare una navigazione.
 *
 *   **Dopo** — l'esito, che è il gesto che sposta il credito da
 *   prenotato a utilizzato e fa avanzare il percorso. Finché manca, la
 *   visita resta aperta per il sistema anche se per il medico è finita.
 *
 * Il pulsante dell'esito è deliberatamente in fondo e non in cima: se
 * stesse sopra, verrebbe premuto prima di scrivere qualunque cosa.
 */

/**
 * Le metriche che si rilevano davvero in ambulatorio.
 *
 * Il catalogo intero ha trenta voci, ma un pannello lipidico non si
 * misura in visita: arriva da un referto. Qui restano le fonti che una
 * persona può leggere da uno strumento o osservare.
 */
const FONTI_IN_VISITA = new Set(["vitals", "body_scan", "anamnesis", "professional", "activity"]);

export default async function VisitaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [p, clinica, agenda, briefing, piano, attenzione] = await Promise.all([
    getIntestazione(id),
    getPanoramicaClinica(id),
    getPatientAppointments(id),
    getLatestBriefing(id),
    getPiano(id),
    getAttenzione(),
  ]);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "visita" },
  });

  if (!p) {
    return (
      <Card>
        <EmptyState>Non è stato possibile aprire la visita.</EmptyState>
      </Card>
    );
  }

  const segnali = segnaliDelPaziente(attenzione.segnali, id);

  // Le visite già passate a cui manca l'esito: sono quelle che il
  // sistema considera ancora aperte.
  const daChiudere = agenda.prossimi.filter(
    (a) => Date.parse(a.startsAt) < Date.now(),
  );
  const inArrivo = agenda.prossimi.filter((a) => Date.parse(a.startsAt) >= Date.now());

  const delta =
    p.score !== null && p.scorePrecedente !== null ? p.score - p.scorePrecedente : null;

  const catalogo = METRIC_DEFINITIONS.filter((m) => FONTI_IN_VISITA.has(m.source)).map(
    (m) => ({
      codice: m.code,
      label: m.label,
      unita: m.unit,
      pilastro: PILLAR_LABELS[m.pillar as PillarKey] ?? m.pillar,
    }),
  );

  return (
    <div className="space-y-6">
      {/* ═══ PRIMA ══════════════════════════════════════════════ */}
      <Fase numero="1" titolo="Prima della visita" sottotitolo="Cosa serve sapere entrando." />

      <Riquadro
        titolo="In sintesi"
        nota={
          briefing
            ? `Sintesi generata il ${formatShortDate(briefing.createdAt)}.`
            : "Nessuna sintesi generata: qui sotto ci sono comunque i fatti."
        }
      >
        <div className="px-6 pb-5 pt-3">
          {briefing ? (
            <>
              <ConfineAI fonte="misure approvate, punteggi, visite e referti in cartella">
                Una sintesi non è una valutazione clinica.
              </ConfineAI>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-800">
                {briefing.summary}
              </p>
              {briefing.openQuestions.length > 0 ? (
                <div className="mt-4 rounded-xl bg-bone-50 px-4 py-3 ring-1 ring-bone-200">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                    Da verificare in visita
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {briefing.openQuestions.map((q) => (
                      <li
                        key={q}
                        className="relative pl-4 text-sm leading-relaxed text-ink-700 before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-signal-attention"
                      >
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-500">
              La sintesi scritta si genera dalla{" "}
              <NavLink
                href={`/pro/pazienti/${id}`}
                className="text-brand-700 underline-offset-4 hover:underline"
              >
                panoramica
              </NavLink>
              .
            </p>
          )}

          {/* I numeri che servono comunque, sintesi o non sintesi. */}
          <dl className="mt-5 grid gap-px overflow-hidden rounded-xl bg-bone-200 ring-1 ring-bone-200 sm:grid-cols-4 [&>*]:bg-white">
            <Numero
              etichetta="Longevity Score"
              valore={p.score === null ? "—" : String(Math.round(p.score))}
              nota={
                delta !== null ? `${formatDelta(Math.round(delta * 10) / 10)} dal precedente` : undefined
              }
            />
            <Numero
              etichetta="Peggiorati"
              valore={String(clinica?.peggiorate.length ?? 0)}
              tono={(clinica?.peggiorate.length ?? 0) > 0 ? "allarme" : "spento"}
            />
            <Numero
              etichetta="Fuori range"
              valore={String(clinica?.fuoriRange.length ?? 0)}
              tono={(clinica?.fuoriRange.length ?? 0) > 0 ? "attenzione" : "spento"}
            />
            <Numero
              etichetta="Crediti"
              valore={p.crediti ? formatCredits(p.crediti.disponibili) : "—"}
              tono="spento"
            />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Scorciatoia href={`/pro/pazienti/${id}/clinico`}>Sintesi clinica</Scorciatoia>
            <Scorciatoia href={`/pro/pazienti/${id}/score`}>Longevity Score</Scorciatoia>
            <Scorciatoia href={`/pro/pazienti/${id}/documenti`}>Documenti</Scorciatoia>
            <Scorciatoia href={`/pro/pazienti/${id}/piano`}>Piano</Scorciatoia>
          </div>
        </div>
      </Riquadro>

      <div className="grid gap-6 lg:grid-cols-2">
        <Riquadro
          titolo="Cambiato dall'ultima volta"
          conta={(clinica?.peggiorate.length ?? 0) + (clinica?.migliorate.length ?? 0)}
        >
          {!clinica || (clinica.peggiorate.length === 0 && clinica.migliorate.length === 0) ? (
            <Niente>Nessuna variazione fra le ultime due rilevazioni.</Niente>
          ) : (
            <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
              {[...clinica.peggiorate, ...clinica.migliorate].slice(0, 8).map((v) => (
                <li
                  key={v.code}
                  className="flex items-baseline justify-between gap-4 px-6 py-2.5"
                >
                  <span className="text-[15px] text-ink-900">{v.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm text-ink-500 tnum">
                      {v.attuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                      {v.unit ? ` ${v.unit}` : ""}
                    </span>
                    <span
                      className={cx(
                        "text-sm font-medium tnum",
                        v.direzione === "migliorato"
                          ? "text-signal-positive"
                          : "text-signal-alert",
                      )}
                    >
                      {v.deltaPunteggio !== null ? formatDelta(v.deltaPunteggio) : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Rimasto in sospeso" conta={segnali.length}>
          {segnali.length === 0 ? (
            <Niente>Niente di aperto su questo paziente.</Niente>
          ) : (
            <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
              {segnali.slice(0, 6).map((s) => (
                <li key={s.id} className="px-6 py-2.5">
                  <p className="text-[15px] text-ink-900">{s.titolo}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{s.motivo[0]}</p>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>
      </div>

      {/* Gli obiettivi del piano precedente: cosa era stato deciso. */}
      {piano && piano.interventi.length > 0 ? (
        <Riquadro
          titolo="Cosa era stato deciso"
          conta={piano.interventi.filter((i) => i.stato !== "done").length}
          nota="Gli interventi del piano ancora aperti: sono le domande da fare per prime."
          tutto={{ label: "Il piano", href: `/pro/pazienti/${id}/piano` }}
        >
          <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
            {piano.interventi
              .filter((i) => i.stato !== "done" && i.stato !== "dismissed")
              .slice(0, 6)
              .map((i) => (
                <li key={i.id} className="px-6 py-2.5">
                  <p className="text-[15px] text-ink-900">{i.titolo}</p>
                  {i.descrizione ? (
                    <p className="mt-0.5 text-sm text-ink-500">{i.descrizione}</p>
                  ) : null}
                </li>
              ))}
          </ul>
        </Riquadro>
      ) : null}

      {/* ═══ DURANTE ════════════════════════════════════════════ */}
      <Fase
        numero="2"
        titolo="Durante la visita"
        sottotitolo="I tre gesti che si fanno con il paziente davanti."
      />

      <Riquadro
        titolo="Registra una misura"
        nota="Entra in cartella firmata da te, senza passare dalla coda di revisione: chi la scrive la sta approvando. Il punteggio si ricalcola subito."
      >
        <div className="px-6 pb-5 pt-3">
          <MisuraForm patientId={id} catalogo={catalogo} />
        </div>
      </Riquadro>

      <Riquadro
        titolo="Nota di visita"
        nota="Resta al care team, a meno che tu non scelga di condividerla."
      >
        <div className="px-6 pb-5 pt-3">
          <NoteForm patientId={id} />
        </div>
      </Riquadro>

      <Riquadro
        titolo="Allega un documento"
        nota="Un referto portato dal paziente, un tracciato, una lettera di un collega."
      >
        <div className="px-6 pb-5 pt-3">
          <UploadForm patientId={id} />
        </div>
      </Riquadro>

      {/* ═══ DOPO ═══════════════════════════════════════════════ */}
      <Fase
        numero="3"
        titolo="Dopo la visita"
        sottotitolo="L'esito, e cosa succede da qui in avanti."
      />

      <Riquadro
        titolo="Esito"
        conta={daChiudere.length}
        nota="Registrare l’esito è ciò che sposta il credito da prenotato a utilizzato e fa avanzare il percorso. Finché manca, la visita resta aperta per il sistema."
      >
        {daChiudere.length === 0 ? (
          <Niente>Nessuna visita svolta in attesa di esito.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {daChiudere.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-900">{a.serviceName}</p>
                  <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                    {formatWeekdayDayMonth(a.startsAt)} · ore{" "}
                    <span className="tnum">{formatTime(a.startsAt)}</span>
                    {a.creditsCost > 0 ? ` · ${formatCredits(a.creditsCost)}` : ""}
                    {a.professionalName ? ` · ${a.professionalName}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    ["true", "Presente"],
                    ["false", "Non presentato"],
                  ].map(([valore, etichetta]) => (
                    <form key={valore} action={registraEsito}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="attended" value={valore} />
                      <button
                        type="submit"
                        className={cx(
                          "rounded-lg px-3.5 py-2 text-sm transition-colors",
                          valore === "true"
                            ? "bg-brand-700 font-medium text-bone-50 hover:bg-brand-900"
                            : "text-ink-500 ring-1 ring-bone-200 hover:text-signal-alert",
                        )}
                      >
                        {etichetta}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <div className="grid gap-6 lg:grid-cols-2">
        <Riquadro
          titolo="Prossimi appuntamenti"
          conta={inArrivo.length}
          tutto={{ label: "Agenda", href: "/pro/agenda" }}
        >
          {inArrivo.length === 0 ? (
            <Niente>
              Nessun appuntamento fissato. Si prenota dal banco o dall&apos;app del
              paziente.
            </Niente>
          ) : (
            <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
              {inArrivo.map((a) => (
                <li key={a.id} className="px-6 py-3">
                  <p className="text-[15px] text-ink-900">{a.serviceName}</p>
                  <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                    {formatWeekdayDayMonth(a.startsAt)} · ore{" "}
                    <span className="tnum">{formatTime(a.startsAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>

        <Riquadro titolo="Cosa fare adesso" nota="Le tre strade che una visita apre.">
          <div className="space-y-2 px-6 pb-5 pt-3">
            <Passo
              href={`/pro/pazienti/${id}/piano`}
              titolo="Aggiorna il piano"
              testo="Interventi, obiettivi e prossima rivalutazione."
            />
            <Passo
              href={`/pro/pazienti/${id}/comunicazioni`}
              titolo="Scrivi al paziente"
              testo="Un filo clinico che il paziente legge dalla sua app."
            />
            <Passo
              href="/pro/task"
              titolo="Apri un task"
              testo="Il lavoro che non è una visita: un richiamo, un referto da leggere."
            />
          </div>
        </Riquadro>
      </div>

      {/* ── Le visite già chiuse ─────────────────────────────── */}
      <Riquadro
        titolo="Visite precedenti"
        conta={agenda.passati.length}
        apribile
        aperto={false}
      >
        {agenda.passati.length === 0 ? (
          <Niente>Nessuna visita in archivio.</Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {agenda.passati.slice(0, 12).map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">{a.serviceName}</p>
                  <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                    {formatWeekdayDayMonth(a.startsAt)}
                    {a.professionalName ? ` · ${a.professionalName}` : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    a.attendance === "attended"
                      ? "positive"
                      : a.status === "no_show"
                        ? "attention"
                        : "neutral"
                  }
                >
                  {a.attendance === "attended"
                    ? "Presente"
                    : a.status === "no_show"
                      ? "Non presentato"
                      : a.status === "cancelled"
                        ? "Disdetta"
                        : a.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>
    </div>
  );
}

/* ── Pezzi ────────────────────────────────────────────────────────── */

/**
 * Il separatore fra i tre momenti.
 *
 * Un numero grande e una riga: serve a far capire, scorrendo, che si è
 * passati da «leggere» a «scrivere» a «chiudere». Senza, le nove schede
 * di questa pagina sarebbero nove schede.
 */
function Fase({
  numero,
  titolo,
  sottotitolo,
}: {
  numero: string;
  titolo: string;
  sottotitolo: string;
}) {
  return (
    <div className="flex items-baseline gap-4 pt-2">
      <span
        aria-hidden="true"
        className="font-display text-[28px] leading-none text-bone-300"
      >
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[20px] leading-tight text-ink-900">{titolo}</h2>
        <p className="mt-0.5 text-sm text-ink-400">{sottotitolo}</p>
      </div>
      <span aria-hidden="true" className="h-px flex-1 bg-bone-200" />
    </div>
  );
}

function Numero({
  etichetta,
  valore,
  nota,
  tono = "neutro",
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  tono?: "neutro" | "allarme" | "attenzione" | "spento";
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd
        className={cx(
          "mt-1 font-display text-[24px] leading-none tnum",
          tono === "allarme"
            ? "text-signal-alert"
            : tono === "attenzione"
              ? "text-signal-attention"
              : tono === "spento"
                ? "text-ink-400"
                : "text-ink-900",
        )}
      >
        {valore}
      </dd>
      {nota ? <p className="mt-1 text-xs text-ink-400 tnum">{nota}</p> : null}
    </div>
  );
}

function Passo({
  href,
  titolo,
  testo,
}: {
  href: string;
  titolo: string;
  testo: string;
}) {
  return (
    <NavLink
      href={href}
      className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-bone-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink-900">{titolo}</span>
        <span className="mt-0.5 block text-sm text-ink-500">{testo}</span>
      </span>
      <span
        aria-hidden="true"
        className="mt-1 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </NavLink>
  );
}
