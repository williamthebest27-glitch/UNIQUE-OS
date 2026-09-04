import type { Metadata } from "next";
import { getPiano } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { decidiStep } from "@/lib/clinical/actions";
import { StepProposalForm } from "@/components/clinical/clinical-forms";
import { formatCredits, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Piano clinico" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il piano clinico.
 *
 * Un piano è quattro cose tenute insieme, e finora vivevano in quattro
 * punti diversi della cartella: il **percorso** con la sua durata e i
 * suoi passi, gli **interventi** che lo compongono, i **servizi** già
 * pagati che li rendono possibili, e la **prossima rivalutazione**.
 *
 * L'ultima non è un campo: è derivata dall'ultimo punteggio. Una data
 * scritta a mano si disallinea al primo controllo spostato, e una data
 * sbagliata dentro un piano di cura è peggio di nessuna data.
 *
 * Le proposte restano separate dagli interventi accettati. Chiunque nel
 * care team può proporre; la decisione è medica, e la distanza fra le
 * due cose deve vedersi.
 */

const ORIGINE: Record<string, string> = {
  professional: "Da un professionista",
  protocol: "Da protocollo",
  brain: "Proposta dal motore",
};

const STATO_AZIONE: Record<string, string> = {
  suggested: "Suggerita",
  accepted: "Accettata",
  in_progress: "In corso",
  done: "Fatta",
  dismissed: "Scartata",
};

export default async function PianoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getPiano(id);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "piano" },
  });

  if (!p) {
    return (
      <Card>
        <EmptyState>Non è stato possibile leggere il piano.</EmptyState>
      </Card>
    );
  }

  const attivi = p.interventi.filter((i) =>
    ["suggested", "accepted", "in_progress"].includes(i.stato),
  );
  const chiusi = p.interventi.filter((i) => ["done", "dismissed"].includes(i.stato));

  return (
    <div className="space-y-6">
      {/* ── Il percorso ──────────────────────────────────────── */}
      <Riquadro
        titolo="Percorso"
        nota="La cornice dentro cui stanno gli interventi."
        tutto={{ label: "Vedi la fase", href: `/pro/pazienti/${id}/percorso` }}
      >
        {!p.percorso ? (
          <Niente>
            Nessun percorso attivo. Si apre da una proposta accettata, qui sotto.
          </Niente>
        ) : (
          <div className="px-6 pb-5 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <h3 className="font-display text-[22px] text-ink-900">
                  {p.percorso.nome}
                </h3>
                {p.percorso.descrizione ? (
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
                    {p.percorso.descrizione}
                  </p>
                ) : null}
              </div>
              <Badge tone={p.percorso.stato === "active" ? "brand" : "neutral"}>
                {p.percorso.stato === "active" ? "In corso" : p.percorso.stato}
              </Badge>
            </div>

            {/* Passi su totale, non solo la percentuale: «9 su 14» dice a
                che punto si è, «64%» no. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-ink-500">
                  {p.percorso.passiTotali > 0 ? (
                    <>
                      <span className="tnum text-ink-900">{p.percorso.passiFatti}</span> passi
                      su <span className="tnum">{p.percorso.passiTotali}</span>
                    </>
                  ) : (
                    "Nessun passo definito"
                  )}
                </span>
                <span className="tnum text-ink-400">
                  {Math.round(p.percorso.progresso)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bone-200">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${Math.min(100, Math.max(0, p.percorso.progresso))}%` }}
                />
              </div>
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <Voce
                etichetta="Iniziato"
                valore={formatShortDate(p.percorso.iniziatoIl)}
              />
              <Voce
                etichetta="Fine prevista"
                valore={p.percorso.finisceIl ? formatShortDate(p.percorso.finisceIl) : null}
              />
              <Voce
                etichetta="Durata"
                valore={
                  p.percorso.durataGiorni ? `${p.percorso.durataGiorni} giorni` : null
                }
              />
            </dl>
          </div>
        )}
      </Riquadro>

      {/* ── Prossima rivalutazione ───────────────────────────── */}
      {p.prossimaRivalutazione ? (
        <Riquadro titolo="Prossima rivalutazione">
          <div className="px-6 pb-5 pt-3">
            <p className="font-display text-[22px] text-ink-900 tnum">
              {formatShortDate(p.prossimaRivalutazione.quando)}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              {p.prossimaRivalutazione.motivo}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              Non è una data in tabella: è calcolata dall&apos;ultimo punteggio. Un campo
              scritto a mano si disallinea al primo controllo spostato.
            </p>
            <NavLink
              href={`/pro/pazienti/${id}/score`}
              className="mt-3 inline-block text-sm text-brand-700 underline-offset-4 hover:underline"
            >
              Vedi il Longevity Score →
            </NavLink>
          </div>
        </Riquadro>
      ) : null}

      {/* ── Gli interventi ───────────────────────────────────── */}
      <Riquadro
        titolo="Interventi"
        conta={attivi.length}
        nota="Cosa il paziente deve fare, con la priorità e la scadenza."
      >
        {attivi.length === 0 ? (
          <Niente>Nessun intervento attivo nel piano.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {attivi.map((i) => (
              <li key={i.id} className="flex gap-3.5 px-6 py-3.5">
                <span
                  aria-hidden="true"
                  className={cx(
                    "w-[3px] shrink-0 self-stretch rounded-full",
                    i.priorita === 1
                      ? "bg-brand-600"
                      : i.priorita === 2
                        ? "bg-gold-500"
                        : "bg-bone-300",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-ink-900">{i.titolo}</p>
                  {i.descrizione ? (
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                      {i.descrizione}
                    </p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                    <span>{ORIGINE[i.origine] ?? i.origine}</span>
                    {i.pilastro ? <span>{i.pilastro}</span> : null}
                    {i.scadenzaIl ? (
                      <span className="tnum">entro il {formatShortDate(i.scadenzaIl)}</span>
                    ) : null}
                  </p>
                </div>
                <Badge>{STATO_AZIONE[i.stato] ?? i.stato}</Badge>
              </li>
            ))}
          </ul>
        )}

        {chiusi.length > 0 ? (
          <details className="border-t border-bone-200">
            <summary className="cursor-pointer list-none px-6 py-3 text-sm text-ink-400 transition-colors hover:text-ink-700 [&::-webkit-details-marker]:hidden">
              {chiusi.length} {chiusi.length === 1 ? "intervento chiuso" : "interventi chiusi"} →
            </summary>
            <ul className="divide-y divide-bone-200/80 border-t border-bone-200">
              {chiusi.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-2.5"
                >
                  <span
                    className={cx(
                      "text-sm",
                      i.stato === "done"
                        ? "text-ink-400 line-through decoration-ink-300"
                        : "text-ink-400",
                    )}
                  >
                    {i.titolo}
                  </span>
                  <span className="text-xs text-ink-300">
                    {STATO_AZIONE[i.stato] ?? i.stato}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Riquadro>

      {/* ── Proposte ─────────────────────────────────────────── */}
      <Riquadro
        titolo="Proposte per il percorso"
        conta={p.proposte.length}
        nota="Chiunque nel care team può proporre; la decisione è medica."
      >
        {p.proposte.length > 0 ? (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {p.proposte.map((step) => (
              <li key={step.id} className="px-6 py-4">
                <h3 className="text-[15px] font-medium text-ink-900">{step.titolo}</h3>
                {step.descrizione ? (
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    {step.descrizione}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-ink-400">
                  Proposto da {step.propostaDa ?? "—"} · {formatShortDate(step.quando)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(["accepted", "rejected"] as const).map((decisione) => (
                    <form key={decisione} action={decidiStep}>
                      <input type="hidden" name="proposalId" value={step.id} />
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="decision" value={decisione} />
                      <button
                        type="submit"
                        className={cx(
                          "rounded-lg px-3 py-1.5 text-sm transition-colors",
                          decisione === "accepted"
                            ? "bg-brand-700 font-medium text-bone-50 hover:bg-brand-900"
                            : "text-ink-500 ring-1 ring-bone-200 hover:text-signal-alert",
                        )}
                      >
                        {decisione === "accepted" ? "Accetta" : "Rifiuta"}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="border-t border-bone-200 px-6 py-5">
          <StepProposalForm patientId={id} />
        </div>
      </Riquadro>

      {/* ── Servizi ──────────────────────────────────────────── */}
      <Riquadro
        titolo="Servizi acquistati"
        conta={p.servizi.length}
        nota="Cosa rende possibile il piano: i crediti che lo pagano."
        apribile
        aperto={false}
      >
        {p.servizi.length === 0 ? (
          <Niente>Nessun servizio acquistato.</Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {p.servizi.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">{s.nome}</p>
                  {s.descrizione ? (
                    <p className="mt-0.5 text-sm text-ink-500">{s.descrizione}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm text-ink-900 tnum">
                    {formatCredits(s.creditiAssegnati)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400 tnum">
                    {formatShortDate(s.acquistatoIl)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>
    </div>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd className={cx("mt-0.5 text-[15px] tnum", valore ? "text-ink-900" : "text-ink-300")}>
        {valore ?? "non definita"}
      </dd>
    </div>
  );
}
