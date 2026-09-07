import type { Metadata } from "next";
import { analizzaPaziente } from "@/lib/clinical/analisi";
import { traccia } from "@/lib/audit";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { ConfineAI, Niente, Riquadro } from "@/components/clinical/command-center";
import { CopilotPanel } from "@/components/clinical/copilot-panel";
import { Andamenti } from "@/components/clinical/andamento";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";
import { ETICHETTE_VIA, SIGLE_VIA } from "@/lib/clinical/terapie";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * «Analizza paziente».
 *
 * La schermata che risponde alla domanda con cui un medico apre una
 * cartella che non conosce, o che non apre da tre mesi: **cosa devo
 * sapere di questa persona, e cosa è cambiato dall'ultima volta.**
 *
 * ---
 *
 * Tutto ciò che sta sopra il copilot **non è generato**. È assemblato da
 * query: i valori fuori range sono le righe fuori dall'intervallo
 * stampato sul referto, «cosa è cambiato» è un confronto di date, le
 * terapie attuali sono le prescrizioni attive. Nessuna di queste frasi
 * può essere sbagliata, perché nessuna è una frase — sono dati con
 * accanto la loro provenienza.
 *
 * Anche le **domande da approfondire** sono regole, non un modello, e
 * ognuna porta con sé il fatto che l'ha accesa. È la differenza fra un
 * suggerimento che si verifica in due secondi e uno da credere sulla
 * parola: il secondo, dopo la terza volta che sbaglia, viene ignorato
 * anche quando ha ragione.
 *
 * Al modello resta il fondo della pagina, dove si può chiedere. Sta
 * dopo i fatti e non prima, e se non c'è — chiave non configurata, rete
 * caduta — questa pagina resta intera. È il contrario di come si
 * costruiscono di solito queste cose, ed è la ragione per cui questa si
 * può usare in ambulatorio.
 */
export default async function AnalisiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await analizzaPaziente(id);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "analisi" },
  });

  if (!a) {
    return (
      <Card>
        <EmptyState>
          Non è stato possibile comporre l’analisi. Serve una cartella con almeno
          una misura.
        </EmptyState>
      </Card>
    );
  }

  const c = a.cambiamenti;

  const niente =
    c.variazioni.length === 0 &&
    c.refertiNuovi.length === 0 &&
    c.terapieAvviate.length === 0 &&
    c.terapieChiuse.length === 0 &&
    c.noteNuove === 0 &&
    c.punteggio === null;

  return (
    <div className="space-y-6">
      {/* ── Cosa è cambiato ──────────────────────────────────── */}
      <Riquadro
        titolo="Cosa è cambiato"
        nota={
          c.visitaIl
            ? `Dall'ultima visita conclusa — ${c.visitaServizio ?? "visita"}, ${formatShortDate(c.visitaIl)}.`
            : "Nessuna visita conclusa in cartella: si guardano gli ultimi novanta giorni."
        }
      >
        {niente ? (
          <Niente>
            Niente di nuovo{c.visitaIl ? " dall'ultima visita" : " negli ultimi novanta giorni"}.
            Nessuna misura, nessun referto, nessuna terapia cambiata.
          </Niente>
        ) : (
          <div className="space-y-4 px-6 pb-5 pt-3">
            {c.punteggio ? (
              <p className="text-[15px] leading-relaxed text-ink-900">
                Longevity Score{" "}
                <span className="tnum">{Math.round(c.punteggio.prima)}</span> →{" "}
                <span className="font-medium tnum">{Math.round(c.punteggio.dopo)}</span>{" "}
                <span
                  className={cx(
                    "text-sm tnum",
                    c.punteggio.delta > 0
                      ? "text-signal-positive"
                      : c.punteggio.delta < 0
                        ? "text-signal-alert"
                        : "text-ink-400",
                  )}
                >
                  ({c.punteggio.delta > 0 ? "+" : ""}
                  {c.punteggio.delta})
                </span>
              </p>
            ) : null}

            {c.variazioni.length > 0 ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                  Parametri cambiati
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {c.variazioni.slice(0, 8).map((v) => (
                    <li key={v.code} className="text-sm leading-relaxed text-ink-700">
                      <span className="text-ink-900">{v.label}</span>{" "}
                      <span className="tnum">
                        {v.precedente !== null ? `${v.precedente} → ` : ""}
                        {v.attuale}
                      </span>
                      {v.unit ? ` ${v.unit}` : ""}
                      <span
                        className={cx(
                          "ml-2 text-xs",
                          v.direzione === "migliorato"
                            ? "text-signal-positive"
                            : v.direzione === "peggiorato"
                              ? "text-signal-alert"
                              : "text-ink-400",
                        )}
                      >
                        {v.direzione}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.refertiNuovi.length > 0 ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                  Referti arrivati
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {c.refertiNuovi.map((d) => (
                    <li key={d.id} className="text-sm">
                      <NavLink
                        href={`/pro/pazienti/${id}/documenti/${d.id}`}
                        className="text-brand-700 underline-offset-4 hover:underline"
                      >
                        {d.titolo}
                      </NavLink>
                      <span className="ml-2 text-xs text-ink-300 tnum">
                        {formatShortDate(d.quando)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.terapieAvviate.length > 0 || c.terapieChiuse.length > 0 ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                  Terapia
                </h3>
                <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-ink-700">
                  {c.terapieAvviate.map((t) => (
                    <li key={`+${t.farmaco}${t.quando}`}>
                      Avviata <span className="text-ink-900">{t.farmaco}</span> {t.dose}
                      <span className="ml-2 text-xs text-ink-300 tnum">
                        {formatShortDate(`${t.quando}T12:00:00Z`)}
                      </span>
                    </li>
                  ))}
                  {c.terapieChiuse.map((t) => (
                    <li key={`-${t.farmaco}`}>
                      {t.stato === "suspended" ? "Sospesa" : "Annullata"}{" "}
                      <span className="text-ink-900">{t.farmaco}</span>
                      {t.motivo ? ` — ${t.motivo}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.noteNuove > 0 ? (
              <p className="text-sm text-ink-500">
                {c.noteNuove} {c.noteNuove === 1 ? "nota clinica" : "note cliniche"}{" "}
                {c.noteNuove === 1 ? "scritta" : "scritte"} da allora.{" "}
                <NavLink
                  href={`/pro/pazienti/${id}/clinico`}
                  className="text-brand-700 underline-offset-4 hover:underline"
                >
                  Leggile
                </NavLink>
              </p>
            ) : null}
          </div>
        )}
      </Riquadro>

      {/* ── Domande da approfondire ──────────────────────────── */}
      <Riquadro
        titolo="Da approfondire"
        conta={a.domande.length}
        nota="Domande, non raccomandazioni. Ognuna porta con sé il fatto che l’ha accesa: si verifica in due secondi."
      >
        {a.domande.length === 0 ? (
          <Niente>
            Niente che salti all’occhio dalle regole: nessun valore oltre la soglia
            clinica, nessun andamento di tre rilevazioni, nessuna terapia con
            aderenza bassa.
          </Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {a.domande.map((d) => (
              <li key={d.testo} className="px-6 py-3.5">
                <p className="text-[15px] leading-snug text-ink-900">{d.testo}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{d.perche}</p>
                {d.href ? (
                  <NavLink
                    href={d.href}
                    className="mt-1.5 inline-block text-xs text-brand-700 underline-offset-4 hover:underline"
                  >
                    Vai a guardare →
                  </NavLink>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Fuori range ──────────────────────────────────────── */}
      <Riquadro
        titolo="Valori fuori range"
        conta={a.fuoriRange.length}
        nota="L’ultimo valore di ogni parametro che sta fuori. Chi lo dichiara — il laboratorio o la soglia clinica di Unique — è scritto su ogni riga."
        tutto={{ label: "Clinico", href: `/pro/pazienti/${id}/clinico` }}
      >
        {a.fuoriRange.length === 0 ? (
          <Niente>Nessun valore fuori dagli intervalli di riferimento.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {a.fuoriRange.map((v) => (
              <li
                key={`${v.metrica}-${v.misurataIl}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <span className="text-[15px] text-ink-900">
                  {v.metrica}{" "}
                  <span className="font-medium tnum">
                    {v.valore}
                    {v.unita ? ` ${v.unita}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {v.riferimento ? (
                    <span className="text-xs text-ink-400 tnum">
                      rif. {v.riferimento.basso ?? "—"}–{v.riferimento.alto ?? "—"}
                    </span>
                  ) : null}
                  {v.sogliaClinica ? <Badge tone="attention">Soglia clinica</Badge> : null}
                  <span className="text-xs text-ink-300 tnum">
                    {formatShortDate(`${v.misurataIl}T12:00:00Z`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Andamenti che dicono qualcosa ────────────────────── */}
      <Andamenti andamenti={a.andamenti} quanti={6} />

      {/* ── Terapia in corso ─────────────────────────────────── */}
      <Riquadro
        titolo="Terapia in corso"
        conta={a.terapieAttive.length}
        tutto={{ label: "Piano", href: `/pro/pazienti/${id}/piano` }}
      >
        {a.terapieAttive.length === 0 ? (
          <Niente>Nessuna terapia attiva.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {a.terapieAttive.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <span className="text-[15px] text-ink-900">
                  <span className="font-medium">{t.farmaco}</span>{" "}
                  <span className="tnum">{t.dose}</span>{" "}
                  <span
                    className="text-xs uppercase tracking-[0.06em] text-ink-400"
                    title={ETICHETTE_VIA[t.via]}
                  >
                    {SIGLE_VIA[t.via]}
                  </span>
                  <span className="ml-2 text-sm text-ink-500">{t.frequenza}</span>
                </span>
                {t.aderenza && t.aderenza.previste > 0 ? (
                  <Badge
                    tone={
                      t.aderenza.date / t.aderenza.previste >= 0.8
                        ? "positive"
                        : "attention"
                    }
                  >
                    {t.aderenza.date} su {t.aderenza.previste} in 14 giorni
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Eventi recenti ───────────────────────────────────── */}
      <Riquadro
        titolo="Eventi recenti"
        conta={a.eventiRecenti.length}
        tutto={{ label: "Timeline", href: `/pro/pazienti/${id}/timeline` }}
        apribile
        aperto={false}
      >
        {a.eventiRecenti.length === 0 ? (
          <Niente>Nessun evento nel periodo considerato.</Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {a.eventiRecenti.map((e) => (
              <li
                key={`${e.categoria}-${e.quando}-${e.cosa}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-2.5"
              >
                <span className="w-28 shrink-0 text-xs text-ink-400 tnum first-letter:uppercase">
                  {formatRelativeDays(e.quando)}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink-900">{e.cosa}</span>
                {e.dettaglio ? (
                  <span className="text-xs text-ink-300">{e.dettaglio}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Il fondamento, dichiarato ────────────────────────── */}
      <div className="px-1">
        <ConfineAI
          fonte={`${a.misureTotali} misure approvate${
            a.ultimaRilevazioneIl
              ? `, l'ultima del ${formatShortDate(`${a.ultimaRilevazioneIl}T12:00:00Z`)}`
              : ""
          }`}
        >
          Tutto ciò che sta sopra è letto dalla cartella, non generato: ogni riga
          è un dato con la sua data. Le domande sono regole scritte, non un
          modello. Verifica i valori citati prima di agire.
        </ConfineAI>
      </div>

      {/* ── E qui si può chiedere ────────────────────────────── */}
      <CopilotPanel patientId={id} />
    </div>
  );
}
