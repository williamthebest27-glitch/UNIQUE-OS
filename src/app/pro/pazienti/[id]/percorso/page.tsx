import type { Metadata } from "next";
import { getPercorsoPaziente } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { avanzamento, mappaPercorso } from "@/lib/journey/avanzamento";
import { STAGE_LABELS } from "@/lib/journey/stages";
import { CREDIT_ENTRY_LABELS, type CreditEntryKind } from "@/lib/credits/rules";
import { CreditAdjustmentForm } from "@/components/clinical/clinical-forms";
import { formatCredits, formatShortDate } from "@/lib/format";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Percorso del paziente" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il percorso: dove si è, come ci si è arrivati, cosa manca.
 *
 * **La fase non è un campo che qualcuno aggiorna: è derivata dai
 * fatti.** Un campo scritto a mano si disallinea al primo passaggio
 * dimenticato, e uno stato sbagliato in un CRM è peggio di nessuno
 * stato, perché ci si costruiscono sopra decisioni e automazioni.
 *
 * La stessa funzione che calcola questa fase la usa il CRM della
 * direzione e la usa la Patient App: non è un'ottimizzazione, è la
 * ragione per cui il paziente e la clinica vedono lo stesso percorso.
 *
 * «Inattivo» e «perso» non compaiono sulla linea. Non sono tappe, sono
 * uscite — e una freccia che li mettesse in fila dopo la retention
 * insegnerebbe che è lì che si finisce.
 */
export default async function PercorsoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getPercorsoPaziente(id);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "percorso" },
  });

  if (!p) {
    return (
      <Card>
        <EmptyState>Non è stato possibile ricostruire il percorso.</EmptyState>
      </Card>
    );
  }

  const mappa = mappaPercorso(p.fase.stage);
  const avanti = avanzamento(p.fatti, p.fase.stage);

  return (
    <div className="space-y-6">
      {/* ── Dove si è ────────────────────────────────────────── */}
      <Riquadro
        titolo="Fase attuale"
        nota="Derivata dai fatti — visite, punteggi, membership, percorso — e non da un campo aggiornato a mano."
      >
        <div className="px-6 pb-6 pt-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h3 className="font-display text-[26px] text-ink-900">
              {STAGE_LABELS[p.fase.stage]}
            </h3>
            {avanti.fuoriLinea ? <Badge tone="attention">Fuori percorso</Badge> : null}
          </div>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">
            {p.fase.reason}
          </p>
          {p.fase.daysSinceActivity !== null ? (
            <p className="mt-1 text-sm text-ink-400">
              Ultima attività{" "}
              <span className="tnum">{p.fase.daysSinceActivity}</span>{" "}
              {p.fase.daysSinceActivity === 1 ? "giorno" : "giorni"} fa.
            </p>
          ) : null}

          {/* ── La linea ─────────────────────────────────────── */}
          <ol className="mt-7 space-y-0">
            {mappa.map((passo, i) => {
              const ultimo = i === mappa.length - 1;
              return (
                <li key={passo.stage} className="relative flex gap-4 pb-5 last:pb-0">
                  {!ultimo ? (
                    <span
                      aria-hidden="true"
                      className={cx(
                        "absolute left-[5px] top-4 h-full w-px",
                        passo.stato === "fatta" ? "bg-brand-300" : "bg-bone-200",
                      )}
                    />
                  ) : null}

                  <span
                    aria-hidden="true"
                    className={cx(
                      "relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white",
                      passo.stato === "corrente"
                        ? "bg-brand-600 ring-brand-100"
                        : passo.stato === "fatta"
                          ? "bg-brand-300"
                          : "bg-bone-300",
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        "text-[15px]",
                        passo.stato === "corrente"
                          ? "font-medium text-ink-900"
                          : passo.stato === "fatta"
                            ? "text-ink-600"
                            : "text-ink-300",
                      )}
                    >
                      {passo.label}
                    </p>
                    {passo.stato === "corrente" ? (
                      <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-brand-600">
                        Adesso
                      </p>
                    ) : null}
                    {passo.stage === avanti.prossima ? (
                      <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-ink-400">
                        Prossima
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Riquadro>

      {/* ── Cosa manca ───────────────────────────────────────── */}
      <Riquadro
        titolo={avanti.prossima ? "Per passare alla fase successiva" : "Condizioni"}
        nota={
          avanti.prossima
            ? `Prossima fase: ${STAGE_LABELS[avanti.prossima]}.`
            : "Non c’è una fase successiva sulla linea."
        }
      >
        <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
          {avanti.condizioni.map((c) => (
            <li key={c.testo} className="flex items-start gap-3 px-6 py-3.5">
              <span
                aria-hidden="true"
                className={cx(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                  c.fatto
                    ? "bg-[#e9f6ee] text-signal-positive"
                    : "bg-bone-100 text-ink-300 ring-1 ring-bone-200",
                )}
              >
                {c.fatto ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cx(
                    "text-[15px]",
                    c.fatto ? "text-ink-500" : "text-ink-900",
                  )}
                >
                  {c.testo}
                </p>
                {!c.fatto && c.azione ? (
                  <p className="mt-0.5 text-sm text-brand-700">{c.azione}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Riquadro>

      {/* ── Le tappe già percorse ────────────────────────────── */}
      <Riquadro
        titolo="Tappe"
        conta={p.tappe.length}
        nota="Ricostruite dai fatti: la data di ciascuna è quella della riga che l’ha prodotta."
      >
        {p.tappe.length === 0 ? (
          <Niente>Nessuna tappa registrata.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
            {p.tappe.map((t) => (
              <li
                key={`${t.quando}-${t.cosa}`}
                className="flex items-baseline gap-4 px-6 py-2.5"
              >
                <span className="w-24 shrink-0 text-sm text-ink-400 tnum">
                  {formatShortDate(t.quando)}
                </span>
                <span className="text-[15px] text-ink-900">{t.cosa}</span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Membership ───────────────────────────────────────── */}
      <Riquadro titolo="Membership">
        {!p.membership ? (
          <Niente>Nessuna membership. Si attiva dal banco.</Niente>
        ) : (
          <dl className="grid gap-px bg-bone-200 sm:grid-cols-3 [&>*]:bg-white">
            <Voce etichetta="Piano" valore={p.membership.piano} />
            <Voce
              etichetta="Stato"
              valore={p.membership.attiva ? "Attiva" : p.membership.stato}
            />
            <Voce
              etichetta="Inizio"
              valore={p.membership.iniziaIl ? formatShortDate(p.membership.iniziaIl) : null}
            />
            <Voce
              etichetta="Scadenza"
              valore={
                p.membership.finisceIl ? formatShortDate(p.membership.finisceIl) : null
              }
            />
            <Voce
              etichetta="Rinnovo"
              valore={
                p.membership.rinnovaIl ? formatShortDate(p.membership.rinnovaIl) : null
              }
            />
            <Voce
              etichetta="Rinnovo automatico"
              valore={p.membership.rinnovoAutomatico ? "Sì" : "No"}
            />
          </dl>
        )}
      </Riquadro>

      {/* ── Crediti ──────────────────────────────────────────── */}
      <Riquadro
        titolo="Crediti"
        nota="Il saldo è la somma dei movimenti: correggere significa scrivere la correzione, non riscrivere il saldo."
      >
        {p.crediti ? (
          <div className="grid gap-px bg-bone-200 sm:grid-cols-3 [&>*]:bg-white">
            <Voce etichetta="Assegnati" valore={formatCredits(p.crediti.assegnati)} />
            <Voce etichetta="Utilizzati" valore={formatCredits(p.crediti.usati)} />
            <Voce etichetta="Disponibili" valore={formatCredits(p.crediti.disponibili)} />
          </div>
        ) : null}

        <div className="px-6 pt-5">
          <CreditAdjustmentForm patientId={id} />
        </div>

        {p.crediti && p.crediti.movimenti.length > 0 ? (
          <ul className="mt-5 divide-y divide-bone-200/80 border-t border-bone-200">
            {p.crediti.movimenti.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink-900">
                    {m.descrizione ??
                      CREDIT_ENTRY_LABELS[m.tipo as CreditEntryKind] ??
                      m.tipo}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {CREDIT_ENTRY_LABELS[m.tipo as CreditEntryKind] ?? m.tipo} ·{" "}
                    <span className="tnum">{formatShortDate(m.quando)}</span>
                  </p>
                </div>
                <span
                  className={cx(
                    "text-[15px] font-medium tnum",
                    m.importo > 0 ? "text-signal-positive" : "text-ink-700",
                  )}
                >
                  {m.importo > 0 ? "+" : "−"}
                  {Math.abs(m.importo).toLocaleString("it-IT", {
                    maximumFractionDigits: 1,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pb-4" />
        )}
      </Riquadro>
    </div>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string | null }) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd className={cx("mt-1 text-[15px] tnum", valore ? "text-ink-900" : "text-ink-300")}>
        {valore ?? "—"}
      </dd>
    </div>
  );
}
