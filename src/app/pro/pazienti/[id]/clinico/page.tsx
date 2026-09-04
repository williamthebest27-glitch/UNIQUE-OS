import type { Metadata } from "next";
import { getPanoramicaClinica } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { SOGLIA_VARIAZIONE, type Variazione } from "@/lib/clinical/cartella-domande";
import { formatDelta, formatShortDate, formatWeekdayDayMonth } from "@/lib/format";
import { ConfineAI, Niente, Riquadro } from "@/components/clinical/command-center";
import { NoteForm } from "@/components/clinical/clinical-forms";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sintesi clinica" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * La sintesi clinica.
 *
 * Quattro domande, in quest'ordine, che sono l'ordine in cui un medico
 * guarda una cartella che ha già visto:
 *
 *   Cos'è cambiato dall'ultima volta.
 *   Cosa sta fuori adesso.
 *   Cosa manca per poter dire qualcosa di più.
 *   Cosa è stato scritto, e da chi.
 *
 * **Non c'è nessun giudizio clinico in questa pagina.** «Migliorato» e
 * «peggiorato» sono aritmetica: il punteggio che ogni valore ottiene
 * sulla propria curva di normalizzazione — la stessa che alimenta il
 * Longevity Score — è salito o sceso. È il motivo per cui una glicata
 * che cala si legge come un miglioramento e un colesterolo HDL che cala
 * no, senza che da nessuna parte esista un elenco di eccezioni.
 *
 * La distinzione fra i due intervalli è scritta in pagina, non
 * sottintesa: quello del laboratorio è **stampato sul referto** e
 * riportarlo è riferire un fatto; la soglia clinica di Unique è un
 * giudizio versionato con l'algoritmo. Dire cosa significhi l'uno o
 * l'altra per questa persona è medicina, e questa pagina non lo fa.
 */

/** Quante righe per elenco prima che diventi uno scorrimento. */
const QUANTE = 8;

export default async function ClinicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getPanoramicaClinica(id);

  traccia({ azione: "patient.section.view", entita: "patient", patientId: id, dettagli: { sezione: "clinico" } });

  if (!c) {
    return (
      <Card>
        <EmptyState>Non è stato possibile leggere la cartella.</EmptyState>
      </Card>
    );
  }

  const senzaConfronto = c.penultimaRilevazioneIl === null;

  return (
    <div className="space-y-6">
      {/* ── La situazione, in una riga ───────────────────────── */}
      <Riquadro titolo="Situazione attuale">
        <div className="px-6 pb-5 pt-3">
          <ConfineAI fonte={`${c.totaleMisure} misure approvate in cartella`}>
            Confronti calcolati sulle curve di normalizzazione del Longevity Score. Sono
            fatti, non una valutazione clinica.
          </ConfineAI>

          {c.totaleMisure === 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
              In cartella non c&apos;è nessuna misura approvata. Se sono stati caricati
              referti, i valori potrebbero essere ancora in coda di revisione: finché non
              li approva un professionista non entrano qui.
            </p>
          ) : (
            <>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
                {c.ultimaRilevazioneIl ? (
                  <>
                    Ultima rilevazione il{" "}
                    <span className="tnum">{formatShortDate(c.ultimaRilevazioneIl)}</span>.{" "}
                  </>
                ) : null}
                {senzaConfronto ? (
                  <>
                    È la prima: non c&apos;è ancora niente con cui confrontarla, e per
                    questo nessun parametro può risultare migliorato o peggiorato.
                  </>
                ) : (
                  <>
                    A confronto con quella del{" "}
                    <span className="tnum">
                      {formatShortDate(c.penultimaRilevazioneIl!)}
                    </span>
                    : <strong className="font-medium">{c.migliorate.length}</strong> in
                    miglioramento,{" "}
                    <strong className="font-medium">{c.peggiorate.length}</strong> in
                    peggioramento, {c.stabili} stabili.
                  </>
                )}
              </p>

              <div className="mt-4 grid gap-px overflow-hidden rounded-xl bg-bone-200 ring-1 ring-bone-200 sm:grid-cols-4 [&>*]:bg-white">
                <Cifra
                  etichetta="Migliorate"
                  valore={c.migliorate.length}
                  tono={c.migliorate.length > 0 ? "positivo" : "spento"}
                />
                <Cifra
                  etichetta="Peggiorate"
                  valore={c.peggiorate.length}
                  tono={c.peggiorate.length > 0 ? "allarme" : "spento"}
                />
                <Cifra
                  etichetta="Fuori range"
                  valore={c.fuoriRange.length}
                  tono={c.fuoriRange.length > 0 ? "attenzione" : "spento"}
                />
                <Cifra
                  etichetta="Parametri mancanti"
                  valore={c.mancanti.length}
                  tono="spento"
                />
              </div>
            </>
          )}
        </div>
      </Riquadro>

      {/* ── Cosa è cambiato ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Riquadro
          titolo="Aree peggiorate"
          conta={c.peggiorate.length}
          nota={`Il punteggio della metrica è sceso di almeno ${SOGLIA_VARIAZIONE} punti.`}
        >
          {c.peggiorate.length === 0 ? (
            <Niente>
              {senzaConfronto
                ? "Serve una seconda rilevazione per poter confrontare."
                : "Nessun parametro in peggioramento."}
            </Niente>
          ) : (
            <ElencoVariazioni variazioni={c.peggiorate.slice(0, QUANTE)} />
          )}
        </Riquadro>

        <Riquadro
          titolo="Aree migliorate"
          conta={c.migliorate.length}
          nota={`Il punteggio della metrica è salito di almeno ${SOGLIA_VARIAZIONE} punti.`}
        >
          {c.migliorate.length === 0 ? (
            <Niente>
              {senzaConfronto
                ? "Serve una seconda rilevazione per poter confrontare."
                : "Nessun parametro in miglioramento."}
            </Niente>
          ) : (
            <ElencoVariazioni variazioni={c.migliorate.slice(0, QUANTE)} />
          )}
        </Riquadro>
      </div>

      {/* ── Fuori range ──────────────────────────────────────── */}
      <Riquadro
        titolo="Valori fuori range"
        conta={c.fuoriRange.length}
        nota="L’ultimo valore di ogni parametro che sta fuori. Chi lo dichiara — il laboratorio o la soglia clinica di Unique — è scritto su ogni riga."
      >
        {c.fuoriRange.length === 0 ? (
          <Niente>Nessun valore fuori dagli intervalli di riferimento.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {c.fuoriRange.map((v) => (
              <li
                key={v.metrica}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">{v.metrica}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {v.riferimento ? (
                      <>
                        Intervallo del laboratorio{" "}
                        <span className="tnum">
                          {v.riferimento.basso ?? "—"}–{v.riferimento.alto ?? "—"}
                        </span>
                        {v.unita ? ` ${v.unita}` : ""}
                      </>
                    ) : (
                      "Nessun intervallo sul referto"
                    )}
                    {" · "}
                    <span className="tnum">{formatShortDate(v.misurataIl)}</span>
                  </p>
                </div>
                <div className="flex items-baseline gap-3">
                  {v.sogliaClinica ? (
                    <Badge tone="attention">Soglia clinica</Badge>
                  ) : null}
                  <span className="font-display text-[20px] text-ink-900 tnum">
                    {v.valore.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                    {v.unita ? (
                      <span className="ml-1 text-sm font-normal text-ink-400">
                        {v.unita}
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Cosa manca ───────────────────────────────────────── */}
      <Riquadro
        titolo="Informazioni mancanti"
        conta={c.mancanti.length + c.pilastriMancanti.length}
        nota="Un dato che manca non è un dato normale: tiene parziale il quadro, e un punteggio parziale ha lo stesso aspetto di uno completo."
        apribile
        aperto={c.pilastriMancanti.length > 0}
      >
        <div className="px-6 py-4">
          {c.pilastriMancanti.length > 0 ? (
            <div className="rounded-xl bg-[#fdf6e8] px-4 py-3 ring-1 ring-[#f0e0bd]">
              <p className="text-sm leading-relaxed text-signal-attention">
                Pilastri non calcolabili nell&apos;ultimo punteggio:{" "}
                <strong className="font-medium">{c.pilastriMancanti.join(", ")}</strong>.
              </p>
            </div>
          ) : null}

          {c.mancanti.length === 0 ? (
            <p className={cx("text-sm text-ink-400", c.pilastriMancanti.length > 0 && "mt-4")}>
              Tutte le metriche previste dal catalogo hanno almeno una misura.
            </p>
          ) : (
            <>
              <p className={cx("text-sm text-ink-500", c.pilastriMancanti.length > 0 && "mt-4")}>
                Nessuna misura per {c.mancanti.length}{" "}
                {c.mancanti.length === 1 ? "parametro" : "parametri"} del catalogo:
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.mancanti.map((m) => (
                  <li
                    key={m.codice}
                    className="rounded-full bg-bone-100 px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200"
                  >
                    {m.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Riquadro>

      {/* ── Prossimi controlli ───────────────────────────────── */}
      <Riquadro titolo="Prossimi controlli" conta={c.prossimiControlli.length}>
        {c.prossimiControlli.length === 0 ? (
          <Niente>Nessun appuntamento in programma.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80 pb-2">
            {c.prossimiControlli.map((v) => (
              <li key={`${v.servizio}-${v.quando}`} className="px-6 py-3">
                <p className="text-[15px] text-ink-900">{v.servizio}</p>
                <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                  {formatWeekdayDayMonth(v.quando)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Note e valutazioni ───────────────────────────────── */}
      <Riquadro
        titolo="Note e valutazioni"
        conta={c.note.length}
        nota="Restano al care team, a meno che tu non scelga di condividerle con il paziente."
      >
        <div className="px-6 pt-3">
          <NoteForm patientId={id} />
        </div>

        {c.note.length > 0 ? (
          <ul className="mt-5 divide-y divide-bone-200/80 border-t border-bone-200">
            {c.note.map((n) => (
              <li key={n.id} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-ink-300">
                    {n.tipo === "assessment"
                      ? "Valutazione"
                      : n.tipo === "visit_summary"
                        ? "Sintesi di visita"
                        : "Nota"}
                  </span>
                  <span className="text-xs text-ink-400">
                    {n.autore ?? "—"} · {formatShortDate(n.quando)}
                  </span>
                  {n.condivisa ? <Badge tone="brand">Condivisa</Badge> : null}
                </div>
                {n.titolo ? (
                  <h3 className="mt-1 text-[15px] font-medium text-ink-900">{n.titolo}</h3>
                ) : null}
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {n.corpo}
                </p>
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

/* ── Pezzi ────────────────────────────────────────────────────────── */

function Cifra({
  etichetta,
  valore,
  tono,
}: {
  etichetta: string;
  valore: number;
  tono: "positivo" | "allarme" | "attenzione" | "spento";
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </p>
      <p
        className={cx(
          "mt-1 font-display text-[24px] leading-none tnum",
          tono === "positivo"
            ? "text-signal-positive"
            : tono === "allarme"
              ? "text-signal-alert"
              : tono === "attenzione"
                ? "text-signal-attention"
                : "text-ink-300",
        )}
      >
        {valore}
      </p>
    </div>
  );
}

/**
 * Una variazione, con dentro tutto quello che serve a verificarla.
 *
 * Valore prima, valore dopo, le due date, e la differenza sia sul valore
 * grezzo sia sul punteggio. Sono due numeri diversi e servono entrambi:
 * il primo è quello che il paziente legge sul referto, il secondo è
 * quello che ha mosso il Longevity Score.
 */
function ElencoVariazioni({ variazioni }: { variazioni: Variazione[] }) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {variazioni.map((v) => {
        const migliorato = v.direzione === "migliorato";

        return (
          <li key={v.code} className="px-6 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[15px] text-ink-900">{v.label}</p>
              <span
                className={cx(
                  "text-sm font-medium tnum",
                  migliorato ? "text-signal-positive" : "text-signal-alert",
                )}
              >
                {v.deltaPunteggio !== null ? formatDelta(v.deltaPunteggio) : "—"} punti
              </span>
            </div>

            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-500">
              {v.precedente !== null ? (
                <>
                  <span className="tnum text-ink-400">
                    {v.precedente.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                  </span>
                  <span aria-hidden="true" className="text-ink-300">
                    →
                  </span>
                </>
              ) : null}
              <span className="tnum text-ink-900">
                {v.attuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                {v.unit ? ` ${v.unit}` : ""}
              </span>
              {v.deltaValore !== null ? (
                <span className="text-xs text-ink-400 tnum">
                  ({formatDelta(v.deltaValore)})
                </span>
              ) : null}
              {v.fuoriSoglia ? <Badge tone="attention">Soglia clinica</Badge> : null}
            </p>

            <p className="mt-0.5 text-xs text-ink-300 tnum">
              {v.precedenteIl ? `${formatShortDate(v.precedenteIl)} → ` : ""}
              {formatShortDate(v.attualeIl)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
