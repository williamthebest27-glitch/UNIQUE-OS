import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FINESTRE_REPORT, getReportClinici } from "@/lib/data/report";
import { formatDelta, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Numero, Riquadro, Striscia } from "@/components/clinical/command-center";
import { Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Report clinici" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * I numeri del lavoro clinico.
 *
 * Non sono quelli della direzione — fatturato, capacità, margine stanno
 * nel Control Center. Questi rispondono alla domanda più scomoda che un
 * professionista possa farsi: **i pazienti che seguo stanno
 * migliorando?**
 *
 * La barra dei migliorati e dei peggiorati tiene una terza colonna
 * separata, «senza confronto», invece di metterli fra gli stabili. Un
 * paziente con un punteggio solo non è stabile: è una persona di cui non
 * sappiamo ancora niente, e contarla come stabile gonfia la colonna che
 * nessuno guarda mentre svuota le due che contano.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Report clinici" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono numeri da
            mostrare.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { periodo } = await searchParams;
  const r = await getReportClinici(periodo);

  if (!r) {
    return (
      <div>
        <PageHeading title="Report clinici" />
        <Card className="mt-8">
          <EmptyState>Non è stato possibile calcolare i numeri.</EmptyState>
        </Card>
      </div>
    );
  }

  const conConfronto = r.migliorati + r.peggiorati + r.stabili;

  return (
    <div>
      <PageHeading
        title="Report clinici"
        subtitle="I pazienti che segui stanno migliorando? Il perimetro è il tuo: la Row Level Security mostra a ciascuno i propri, e lo stesso report letto da due persone dà due numeri."
      />

      {/* ── La finestra ──────────────────────────────────────── */}
      <nav aria-label="Periodo" className="mt-5 flex flex-wrap gap-1.5">
        {FINESTRE_REPORT.map((f) => (
          <NavLink
            key={f.id}
            href={`/pro/report?periodo=${f.id}`}
            aria-current={r.finestra.id === f.id ? "true" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-sm transition-colors",
              r.finestra.id === f.id
                ? "bg-ink-900 font-medium text-bone-50"
                : "bg-white text-ink-500 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
            )}
          >
            {f.etichetta}
          </NavLink>
        ))}
        <span className="self-center pl-2 text-xs text-ink-300 tnum">
          dal {formatShortDate(r.da)}
        </span>
      </nav>

      <div className="mt-6 space-y-6">
        {/* ── I pazienti ─────────────────────────────────────── */}
        <Striscia>
          <Numero etichetta="Pazienti in carico" valore={r.pazientiTotali} href="/pro/pazienti" />
          <Numero
            etichetta="Attivi nel periodo"
            valore={r.pazientiAttivi}
            nota="Almeno una visita svolta"
          />
          <Numero
            etichetta="Punteggio medio"
            valore={r.punteggioMedio === null ? "—" : String(Math.round(r.punteggioMedio))}
          />
          <Numero
            etichetta="Assessment"
            valore={r.assessment}
            nota={`${r.reassessment} ripetizioni`}
          />
          <Numero
            etichetta="Da rivalutare"
            valore={r.daRivalutare}
            nota="Score oltre 4 mesi"
            tono={r.daRivalutare > 0 ? "attenzione" : "quieto"}
            href="/pro/attenzione?vista=reassessment"
          />
          <Numero
            etichetta="Mai valutati"
            valore={r.senzaPunteggio}
            tono={r.senzaPunteggio > 0 ? "attenzione" : "quieto"}
          />
        </Striscia>

        {/* ── L'esito: chi migliora ──────────────────────────── */}
        <Riquadro
          titolo="Come vanno i pazienti"
          nota="Confronto fra l’ultimo punteggio e il precedente. Sotto il punto di differenza si parla di stabilità, non di variazione."
          azione={
            r.variazioneMedia !== null ? (
              <span
                className={cx(
                  "text-sm font-medium tnum",
                  r.variazioneMedia > 0
                    ? "text-signal-positive"
                    : r.variazioneMedia < 0
                      ? "text-signal-alert"
                      : "text-ink-300",
                )}
              >
                {formatDelta(Math.round(r.variazioneMedia * 10) / 10)} in media
              </span>
            ) : null
          }
        >
          <div className="px-6 pb-6 pt-4">
            {conConfronto === 0 ? (
              <p className="py-4 text-center text-sm text-ink-400">
                Nessun paziente ha ancora due punteggi da confrontare. Il primo
                reassessment è ciò che rende leggibile questa pagina.
              </p>
            ) : (
              <>
                {/* Una barra, non tre numeri: le proporzioni si leggono
                    prima delle cifre. */}
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-bone-200"
                  role="img"
                  aria-label={`${r.migliorati} migliorati, ${r.stabili} stabili, ${r.peggiorati} peggiorati`}
                >
                  <div
                    className="bg-signal-positive"
                    style={{ width: `${(r.migliorati / conConfronto) * 100}%` }}
                  />
                  <div
                    className="bg-bone-300"
                    style={{ width: `${(r.stabili / conConfronto) * 100}%` }}
                  />
                  <div
                    className="bg-signal-alert"
                    style={{ width: `${(r.peggiorati / conConfronto) * 100}%` }}
                  />
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                  <Esito etichetta="Migliorati" valore={r.migliorati} tono="positivo" />
                  <Esito etichetta="Stabili" valore={r.stabili} tono="neutro" />
                  <Esito etichetta="Peggiorati" valore={r.peggiorati} tono="allarme" />
                  <Esito
                    etichetta="Senza confronto"
                    valore={r.senzaConfronto}
                    tono="spento"
                    nota="Un punteggio solo: non è stabilità, è assenza di dati."
                  />
                </dl>
              </>
            )}
          </div>
        </Riquadro>

        {/* ── Il lavoro svolto ───────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Riquadro titolo="Visite" nota={`Nel periodo scelto (${r.finestra.etichetta}).`}>
            <dl className="mt-1 divide-y divide-bone-200/80 pb-2">
              <Riga etichetta="Svolte" valore={r.visiteSvolte} />
              <Riga etichetta="Disdette" valore={r.visiteDisdette} />
              <Riga etichetta="Mancate presentazioni" valore={r.mancatePresentazioni} />
              <Riga
                etichetta="Senza esito registrato"
                valore={r.visiteAperte}
                tono={r.visiteAperte > 0 ? "attenzione" : undefined}
                nota="Il credito resta prenotato finché manca"
              />
            </dl>
          </Riquadro>

          <Riquadro titolo="Referti" nota={`Arrivati nel periodo scelto.`}>
            <dl className="mt-1 divide-y divide-bone-200/80 pb-2">
              <Riga etichetta="Arrivati" valore={r.refertiArrivati} />
              <Riga
                etichetta="Da revisionare"
                valore={r.refertiDaRevisionare}
                tono={r.refertiDaRevisionare > 0 ? "attenzione" : undefined}
              />
              <Riga etichetta="Approvati" valore={r.refertiApprovati} />
            </dl>
          </Riquadro>

          <Riquadro titolo="Task" nota="Il lavoro che non è una visita.">
            <dl className="mt-1 divide-y divide-bone-200/80 pb-2">
              <Riga etichetta="Chiusi nel periodo" valore={r.taskChiusi} />
              <Riga etichetta="Ancora aperti" valore={r.taskAperti} />
              <Riga
                etichetta="Scaduti"
                valore={r.taskScaduti}
                tono={r.taskScaduti > 0 ? "allarme" : undefined}
              />
            </dl>
          </Riquadro>

          <Riquadro
            titolo="Aderenza al percorso"
            nota="Avanzamento medio dei percorsi attivi."
          >
            <div className="px-6 pb-6 pt-4">
              {r.percorsiAttivi === 0 ? (
                <p className="py-4 text-center text-sm text-ink-400">
                  Nessun percorso attivo.
                </p>
              ) : (
                <>
                  <p className="font-display text-[32px] leading-none text-ink-900 tnum">
                    {r.aderenzaMedia === null ? "—" : `${Math.round(r.aderenzaMedia)}%`}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-500">
                    su <span className="tnum">{r.percorsiAttivi}</span>{" "}
                    {r.percorsiAttivi === 1 ? "percorso attivo" : "percorsi attivi"}
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bone-200">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.min(100, Math.max(0, r.aderenzaMedia ?? 0))}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </Riquadro>
        </div>

        {/* ── La mia attività ────────────────────────────────── */}
        <Riquadro
          titolo="La tua attività"
          nota={`Cosa hai scritto tu, nel periodo scelto. Solo le tue righe: firmate con il tuo profilo.`}
        >
          <dl className="grid gap-px bg-bone-200 sm:grid-cols-3 [&>*]:bg-white">
            <Attivita etichetta="Note e valutazioni" valore={r.mieAttivita.note} />
            <Attivita etichetta="Misure registrate" valore={r.mieAttivita.misure} />
            <Attivita etichetta="Valori revisionati" valore={r.mieAttivita.revisioni} />
          </dl>
        </Riquadro>

        <Riquadro titolo="Come leggere questi numeri" apribile aperto={false}>
          <div className="space-y-3 px-6 py-4 text-sm leading-relaxed text-ink-600">
            <p>
              Il <strong className="font-medium text-ink-900">perimetro</strong> è quello
              della Row Level Security: un professionista vede i propri pazienti, la
              direzione tutti. Lo stesso report letto da due persone dà due numeri, ed è
              corretto.
            </p>
            <p>
              <strong className="font-medium text-ink-900">Migliorato</strong> significa
              che il Longevity Score è salito di almeno un punto rispetto al precedente.
              È il punteggio calcolato dalle curve di normalizzazione — che sono una
              struttura di lavoro da confermare clinicamente, non un algoritmo validato.
            </p>
            <p>
              «<strong className="font-medium text-ink-900">Senza confronto</strong>» non
              è una categoria di comodo: sono i pazienti con un punteggio solo. Non
              stanno né bene né male — non lo sappiamo ancora.
            </p>
          </div>
        </Riquadro>
      </div>
    </div>
  );
}

/* ── Pezzi ────────────────────────────────────────────────────────── */

function Esito({
  etichetta,
  valore,
  tono,
  nota,
}: {
  etichetta: string;
  valore: number;
  tono: "positivo" | "neutro" | "allarme" | "spento";
  nota?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd
        className={cx(
          "mt-1 font-display text-[26px] leading-none tnum",
          tono === "positivo"
            ? "text-signal-positive"
            : tono === "allarme"
              ? "text-signal-alert"
              : tono === "spento"
                ? "text-ink-300"
                : "text-ink-700",
        )}
      >
        {valore}
      </dd>
      {nota ? <p className="mt-1 text-xs leading-snug text-ink-400">{nota}</p> : null}
    </div>
  );
}

function Riga({
  etichetta,
  valore,
  tono,
  nota,
}: {
  etichetta: string;
  valore: number;
  tono?: "attenzione" | "allarme";
  nota?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-6 py-3">
      <dt className="min-w-0">
        <span className="text-[15px] text-ink-900">{etichetta}</span>
        {nota ? <span className="mt-0.5 block text-xs text-ink-400">{nota}</span> : null}
      </dt>
      <dd
        className={cx(
          "shrink-0 font-display text-[20px] leading-none tnum",
          valore === 0
            ? "text-ink-300"
            : tono === "allarme"
              ? "text-signal-alert"
              : tono === "attenzione"
                ? "text-signal-attention"
                : "text-ink-900",
        )}
      >
        {valore}
      </dd>
    </div>
  );
}

function Attivita({ etichetta, valore }: { etichetta: string; valore: number }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd
        className={cx(
          "mt-1 font-display text-[26px] leading-none tnum",
          valore === 0 ? "text-ink-300" : "text-ink-900",
        )}
      >
        {valore}
      </dd>
    </div>
  );
}
