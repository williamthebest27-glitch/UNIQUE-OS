import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAttenzione, getRimandati } from "@/lib/data/attenzione";
import {
  CATEGORIE_ATTENZIONE,
  ETICHETTE_CATEGORIA,
  ETICHETTE_ORIGINE,
  SPIEGAZIONI_CATEGORIA,
  contaPerCategoria,
  type CategoriaAttenzione,
} from "@/lib/clinical/attenzione";
import { riattivaSegnale, riattivaTutto } from "@/lib/clinical/attenzione-actions";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import {
  ConfineAI,
  Niente,
  Priorita,
  PrioritaTesto,
  Riquadro,
} from "@/components/clinical/command-center";
import { GestiSegnale } from "@/components/clinical/gesti-segnale";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Centro di attenzione" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il centro di attenzione clinica.
 *
 * Tutto ciò che il command center mostra in cima, qui per intero e
 * diviso per tipo di lavoro. Le categorie non sono etichette di comodo:
 * separano gesti diversi, e mescolarle produrrebbe una coda in cui
 * approvare un valore fuori soglia e leggere un messaggio sembrano lo
 * stesso impegno.
 *
 * Ogni riga porta tutto ciò che serve a decidere senza aprirla: il
 * motivo in chiaro, il paziente, la data del fatto, la priorità,
 * l'origine, e i tre gesti. Chi la apre lo fa per agire, non per
 * scoprire di cosa si trattava.
 */

/** Le viste che non corrispondono a una categoria. */
const VISTE_SPECIALI = ["tutto", "rimandate"] as const;

function vistaValida(valore: string | undefined): string {
  if (!valore) return "tutto";
  if ((VISTE_SPECIALI as readonly string[]).includes(valore)) return valore;
  return (CATEGORIE_ATTENZIONE as readonly string[]).includes(valore) ? valore : "tutto";
}

export default async function AttenzionePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Centro di attenzione" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            segnalazioni da mostrare.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { vista: richiesta } = await searchParams;
  const vista = vistaValida(richiesta);

  const [{ segnali, messiATacere }, rimandati] = await Promise.all([
    getAttenzione(),
    vista === "rimandate" ? getRimandati() : Promise.resolve([]),
  ]);

  const conti = contaPerCategoria(segnali);
  const mostrati =
    vista === "tutto" || vista === "rimandate"
      ? segnali
      : segnali.filter((s) => s.categoria === vista);

  const urgenti = segnali.filter((s) => s.priorita === 1).length;

  return (
    <div>
      <PageHeading
        title="Centro di attenzione"
        subtitle="Tutto ciò che richiede una decisione, diviso per tipo di lavoro. Ogni riga porta con sé i fatti che l’hanno accesa."
      />

      <div className="mt-5">
        <ConfineAI fonte="referti, misure approvate, agenda, punteggi, task e messaggi in cartella">
          Le segnalazioni nascono da regole scritte in{" "}
          <code className="font-mono text-[11px]">lib/clinical/attenzione.ts</code>, non da
          un modello. Sono un supporto alla decisione: verifica i dati citati.
        </ConfineAI>
      </div>

      {/* ── I filtri ─────────────────────────────────────────── */}
      <nav aria-label="Categorie" className="mt-5 flex flex-wrap gap-1.5">
        <Filtro
          href="/pro/attenzione"
          attivo={vista === "tutto"}
          etichetta="Tutto"
          conta={segnali.length}
          urgenti={urgenti}
        />
        {conti.map((conto) => (
          <Filtro
            key={conto.categoria}
            href={`/pro/attenzione?vista=${conto.categoria}`}
            attivo={vista === conto.categoria}
            etichetta={ETICHETTE_CATEGORIA[conto.categoria]}
            conta={conto.totale}
            urgenti={conto.urgenti}
          />
        ))}
        {messiATacere > 0 ? (
          <Filtro
            href="/pro/attenzione?vista=rimandate"
            attivo={vista === "rimandate"}
            etichetta="Rimandate"
            conta={messiATacere}
            urgenti={0}
            quieto
          />
        ) : null}
      </nav>

      {/* ── Le segnalazioni rimandate ────────────────────────── */}
      {vista === "rimandate" ? (
        <Riquadro
          titolo="Rimandate da te"
          nota="Sono sparite dalla tua coda, non dalla cartella. Tornano da sole alla scadenza."
          conta={rimandati.length}
          className="mt-6"
          azione={
            rimandati.length > 0 ? (
              <form action={riattivaTutto}>
                <button
                  type="submit"
                  className="text-xs text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
                >
                  Falle tornare tutte
                </button>
              </form>
            ) : null
          }
        >
          {rimandati.length === 0 ? (
            <Niente>Niente di rimandato: la coda è quella che vedi.</Niente>
          ) : (
            <ul className="divide-y divide-bone-200/80">
              {rimandati.map(({ segnale, motivo, fino }) => (
                <li key={segnale.id} className="flex gap-3.5 px-6 py-4">
                  <Priorita livello={segnale.priorita} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-ink-900">{segnale.titolo}</p>
                    {segnale.patientId ? (
                      <p className="mt-0.5 text-sm">
                        <NavLink
                          href={`/pro/pazienti/${segnale.patientId}`}
                          className="text-brand-700 underline-offset-4 hover:underline"
                        >
                          {segnale.patientName}
                        </NavLink>
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-ink-500">
                      Torna il <span className="tnum">{formatShortDate(fino)}</span>
                      {motivo ? ` · ${motivo}` : ""}
                    </p>
                  </div>
                  <form action={riattivaSegnale} className="shrink-0 self-center">
                    <input type="hidden" name="signalId" value={segnale.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
                    >
                      Falla tornare
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Riquadro>
      ) : (
        <>
          {/* ── La coda ──────────────────────────────────────── */}
          {vista !== "tutto" ? (
            <p className="mt-5 text-sm leading-relaxed text-ink-500">
              {SPIEGAZIONI_CATEGORIA[vista as CategoriaAttenzione]}
            </p>
          ) : null}

          <Riquadro
            titolo={vista === "tutto" ? "Tutte le segnalazioni" : ETICHETTE_CATEGORIA[vista as CategoriaAttenzione]}
            conta={mostrati.length}
            className="mt-4"
          >
            {mostrati.length === 0 ? (
              <Niente>
                {vista === "tutto"
                  ? "Niente che richieda attenzione. Le segnalazioni compaiono da sole quando arriva un referto, quando una visita resta senza esito o quando un punteggio invecchia."
                  : "Questa coda è vuota."}
              </Niente>
            ) : (
              <ul className="divide-y divide-bone-200/80">
                {mostrati.map((s) => (
                  <li key={s.id} className="flex gap-3.5 px-6 py-4">
                    <Priorita livello={s.priorita} />
                    <PrioritaTesto livello={s.priorita} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <p className="text-[15px] font-medium leading-snug text-ink-900">
                          {s.titolo}
                        </p>
                        {vista === "tutto" ? (
                          <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                            {ETICHETTE_CATEGORIA[s.categoria]}
                          </span>
                        ) : null}
                        {s.richiedeMedico ? (
                          <Badge tone="attention">Richiede un medico</Badge>
                        ) : null}
                        {s.assegnatario ? (
                          <Badge tone="brand">{s.assegnatario}</Badge>
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

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                        <span>{ETICHETTE_ORIGINE[s.origine]}</span>
                        {s.quando ? (
                          <span className="tnum first-letter:uppercase">
                            {formatRelativeDays(s.quando)}
                          </span>
                        ) : null}
                        <span>Aperta</span>
                      </p>

                      <GestiSegnale segnale={s} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Riquadro>
        </>
      )}
    </div>
  );
}

/* ── Un filtro ────────────────────────────────────────────────────── */

function Filtro({
  href,
  attivo,
  etichetta,
  conta,
  urgenti,
  quieto = false,
}: {
  href: string;
  attivo: boolean;
  etichetta: string;
  conta: number;
  urgenti: number;
  quieto?: boolean;
}) {
  const vuoto = conta === 0;

  return (
    <NavLink
      href={href}
      aria-current={attivo ? "page" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
        attivo
          ? "bg-ink-900 font-medium text-bone-50"
          : vuoto
            ? "text-ink-300 ring-1 ring-bone-200 hover:text-ink-500"
            : "bg-white text-ink-600 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
      )}
    >
      {etichetta}
      <span
        className={cx(
          "tnum text-xs",
          attivo
            ? "text-bone-50/60"
            : urgenti > 0 && !quieto
              ? "font-semibold text-signal-alert"
              : "text-ink-300",
        )}
      >
        {conta}
      </span>
    </NavLink>
  );
}
