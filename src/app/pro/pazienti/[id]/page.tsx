import type { Metadata } from "next";
import { getIntestazione } from "@/lib/data/cartella";
import { getPatientSignals } from "@/lib/data/nba";
import { getPatientTimeline } from "@/lib/data/timeline";
import { getLatestBriefing } from "@/lib/brain/briefing";
import { capacitaAttive } from "@/lib/brain/fornitore";
import { generaBriefing } from "@/lib/brain/actions";
import { getAttenzione } from "@/lib/data/attenzione";
import { segnaliDelPaziente, ETICHETTE_CATEGORIA } from "@/lib/clinical/attenzione";
import { formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import {
  ConfineAI,
  Niente,
  Priorita,
  PrioritaTesto,
  Riquadro,
  Verbo,
} from "@/components/clinical/command-center";
import { CopilotPanel } from "@/components/clinical/copilot-panel";
import { NextBestActionPanel } from "@/components/clinical/next-best-action";
import { Badge, SparkIcon, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Panoramica paziente" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * La panoramica: cosa serve sapere prima di parlare con questa persona.
 *
 * È la sezione che si apre per prima e quella che si guarda quando non
 * si sa cosa guardare. Per questo non contiene *dati* — i dati stanno
 * nelle sezioni che li sanno mostrare bene — ma **sintesi e decisioni
 * aperte**: cosa richiede attenzione adesso, cosa suggeriscono le
 * regole, e un copilot a cui chiedere il resto.
 *
 * Ogni output del motore porta la propria etichetta e le proprie fonti,
 * sopra e non sotto: chi legge deve sapere che è un supporto **prima**
 * di leggerlo.
 */
export default async function PanoramicaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [p, segnali, briefing, eventi, attenzione] = await Promise.all([
    getIntestazione(id),
    getPatientSignals(id),
    getLatestBriefing(id),
    getPatientTimeline(id, 8),
    getAttenzione(),
  ]);

  const capacita = capacitaAttive();
  const suoi = segnaliDelPaziente(attenzione.segnali, id);

  return (
    <div className="space-y-6">
      {/* ── Cosa richiede attenzione su questa persona ───────── */}
      <Riquadro
        titolo="Richiede attenzione"
        conta={suoi.length}
        nota="Le stesse segnalazioni del centro di attenzione, filtrate su questa persona."
        tutto={{ label: "Centro di attenzione", href: "/pro/attenzione" }}
      >
        {suoi.length === 0 ? (
          <Niente>Niente di aperto su questo paziente.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {suoi.map((s) => (
              <li key={s.id} className="flex gap-3.5 px-6 py-3.5">
                <Priorita livello={s.priorita} />
                <PrioritaTesto livello={s.priorita} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-[15px] font-medium text-ink-900">{s.titolo}</p>
                    <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                      {ETICHETTE_CATEGORIA[s.categoria]}
                    </span>
                    {s.richiedeMedico ? (
                      <Badge tone="attention">Richiede un medico</Badge>
                    ) : null}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {s.motivo.map((riga) => (
                      <li key={riga} className="text-sm leading-relaxed text-ink-500">
                        {riga}
                      </li>
                    ))}
                  </ul>
                </div>
                {s.azione ? (
                  <NavLink
                    href={s.azione.href}
                    className="shrink-0 self-center rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
                  >
                    {s.azione.label}
                  </NavLink>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── La sintesi pre-visita ────────────────────────────── */}
      <Riquadro
        titolo="Prima della visita"
        nota={
          briefing
            ? `Generata il ${formatShortDate(briefing.createdAt)}, sui soli dati in cartella.`
            : "Una sintesi della storia del paziente, scritta solo sui dati disponibili."
        }
        azione={<SparkIcon className="h-4 w-4 text-gold-500" />}
      >
        <div className="px-6 pb-6 pt-3">
          <ConfineAI fonte="misure approvate, punteggi, visite e referti in cartella">
            Una sintesi non è una valutazione clinica. Ciò che afferma va verificato
            nelle sezioni che portano i dati.
          </ConfineAI>

          {briefing ? (
            <>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-800">
                {briefing.summary}
              </p>

              {briefing.highlights.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {briefing.highlights.map((item) => (
                    <li
                      key={item}
                      className={cx(
                        "relative pl-4 text-sm leading-relaxed text-ink-700",
                        "before:absolute before:left-0 before:top-2 before:h-1 before:w-1",
                        "before:rounded-full before:bg-brand-500",
                      )}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}

              {briefing.openQuestions.length > 0 ? (
                <div className="mt-5 rounded-xl bg-bone-50 px-4 py-3 ring-1 ring-bone-200">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                    Da verificare in visita
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {briefing.openQuestions.map((item) => (
                      <li
                        key={item}
                        className={cx(
                          "relative pl-4 text-sm leading-relaxed text-ink-700",
                          "before:absolute before:left-0 before:top-2 before:h-1 before:w-1",
                          "before:rounded-full before:bg-signal-attention",
                        )}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-500">
              Nessuna sintesi ancora generata per questo paziente.
            </p>
          )}

          {capacita.redazione ? (
            <form action={generaBriefing} className="mt-5">
              <input type="hidden" name="patientId" value={id} />
              <Verbo type="submit">
                {briefing ? "Rigenera la sintesi" : "Riassumi prima della visita"}
              </Verbo>
            </form>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              La sintesi scritta richiede un modello linguistico, che non è
              configurato. Il copilot qui sotto risponde comunque: chiedigli una
              sintesi prima della visita, e citerà valore e data di ogni cosa che dice.
            </p>
          )}
        </div>
      </Riquadro>

      {/* ── Next Best Action ─────────────────────────────────── */}
      {segnali ? (
        <NextBestActionPanel
          stage={segnali.stage}
          clinical={segnali.azioni.clinical}
          commercial={segnali.azioni.commercial}
        />
      ) : null}

      {/* ── Copilot ──────────────────────────────────────────── */}
      <CopilotPanel patientId={id} disabled={false} />

      {/* ── Cosa è successo di recente ───────────────────────── */}
      <Riquadro
        titolo="Ultimi movimenti"
        conta={eventi.length}
        tutto={{ label: "Tutta la timeline", href: `/pro/pazienti/${id}/timeline` }}
      >
        {eventi.length === 0 ? (
          <Niente>
            La timeline si popola da sola con visite, referti e punteggi.
          </Niente>
        ) : (
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {eventi.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3">
                <span className="w-24 shrink-0 text-xs text-ink-400 tnum">
                  {formatShortDate(e.occurredAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink-900">{e.title}</p>
                  {e.detail ? (
                    <p className="mt-0.5 text-sm text-ink-500">{e.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Recapiti ─────────────────────────────────────────── */}
      {p ? (
        <Riquadro titolo="Anagrafica e recapiti" apribile aperto={false}>
          <dl className="grid gap-px bg-bone-200 sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-white">
            <Dato etichetta="Nome" valore={p.nome} />
            <Dato etichetta="Codice paziente" valore={p.codice} mono />
            <Dato
              etichetta="Data di nascita"
              valore={p.dataNascita ? formatShortDate(p.dataNascita) : null}
            />
            <Dato etichetta="Sesso alla nascita" valore={p.sesso} />
            <Dato etichetta="Altezza" valore={p.altezzaCm ? `${p.altezzaCm} cm` : null} />
            <Dato etichetta="Sede" valore={p.sede} />
            <Dato etichetta="Telefono" valore={p.telefono} />
            <Dato etichetta="Email" valore={p.email} />
            <Dato
              etichetta="Care team"
              valore={
                p.careTeam.length > 0
                  ? p.careTeam
                      .map((m) => [m.titolo, m.nome].filter(Boolean).join(" "))
                      .join(", ")
                  : null
              }
            />
          </dl>
        </Riquadro>
      ) : null}
    </div>
  );
}

function Dato({
  etichetta,
  valore,
  mono = false,
}: {
  etichetta: string;
  valore: string | null;
  mono?: boolean;
}) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd
        className={cx(
          "mt-1 text-[15px]",
          valore ? "text-ink-900" : "text-ink-300",
          mono && valore ? "font-mono text-sm" : "",
        )}
      >
        {valore ?? "non indicato"}
      </dd>
    </div>
  );
}
