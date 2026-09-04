import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getElencoPazienti, type OrdinePazienti } from "@/lib/data/pazienti";
import { STAGE_LABELS, type JourneyStage } from "@/lib/journey/stages";
import { LINEA_PRINCIPALE } from "@/lib/journey/avanzamento";
import { formatDelta, formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Priorita, PrioritaTesto, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, ChevronIcon, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Pazienti" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * L'elenco dei pazienti.
 *
 * Prima mostrava nome, codice e ultimo punteggio: bastava a trovare
 * qualcuno, non a **scegliere chi guardare**. Adesso ogni riga risponde
 * alla seconda domanda — quanta attenzione richiede, dove sta nel
 * percorso, da quanto non lo si vede, quando lo si rivede, come va il
 * punteggio — e i filtri lavorano su quelle.
 *
 * L'ordinamento predefinito è per attenzione e non alfabetico. Un
 * elenco in ordine di cognome è un archivio; questo deve essere una
 * coda di lavoro.
 */

const ORDINI: { id: OrdinePazienti; label: string }[] = [
  { id: "attenzione", label: "Attenzione" },
  { id: "nome", label: "Nome" },
  { id: "score", label: "Punteggio" },
  { id: "contatto", label: "Ultimo contatto" },
  { id: "visita", label: "Prossima visita" },
];

const LIVELLI = [
  { id: "urgente", label: "Urgenti" },
  { id: "attenzione", label: "Con segnalazioni" },
  { id: "tranquilli", label: "Tranquilli" },
];

function costruisciUrl(
  base: Record<string, string | undefined>,
  cambio: Record<string, string | undefined>,
): string {
  const parametri = new URLSearchParams();
  for (const [chiave, valore] of Object.entries({ ...base, ...cambio })) {
    if (valore) parametri.set(chiave, valore);
  }
  const query = parametri.toString();
  return query ? `/pro/pazienti?${query}` : "/pro/pazienti";
}

export default async function PazientiPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    fase?: string;
    livello?: string;
    membership?: string;
    ordine?: string;
  }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Pazienti" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è un elenco
            pazienti.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const filtri = await searchParams;
  const ordine = (ORDINI.find((o) => o.id === filtri.ordine)?.id ??
    "attenzione") as OrdinePazienti;

  const pazienti = await getElencoPazienti({
    q: filtri.q,
    fase: filtri.fase,
    livello: filtri.livello,
    membership: filtri.membership,
    ordine,
  });

  const attivi = Object.entries(filtri).filter(
    ([chiave, valore]) => valore && chiave !== "ordine",
  ).length;

  return (
    <div>
      <PageHeading
        title="Pazienti"
        subtitle="I pazienti che segui. In ordine di attenzione richiesta, non di cognome: questa è una coda di lavoro, non un archivio."
      />

      {/* ── Ricerca ──────────────────────────────────────────── */}
      <form method="get" className="mt-6" role="search">
        {/* I filtri attivi viaggiano con la ricerca: cercare non li spegne. */}
        {filtri.fase ? <input type="hidden" name="fase" value={filtri.fase} /> : null}
        {filtri.livello ? (
          <input type="hidden" name="livello" value={filtri.livello} />
        ) : null}
        {filtri.membership ? (
          <input type="hidden" name="membership" value={filtri.membership} />
        ) : null}
        {filtri.ordine ? <input type="hidden" name="ordine" value={filtri.ordine} /> : null}

        <label htmlFor="cerca-paziente" className="sr-only">
          Cerca fra i pazienti che segui
        </label>
        <input
          id="cerca-paziente"
          name="q"
          type="search"
          defaultValue={filtri.q ?? ""}
          placeholder="Nome o codice paziente…"
          className="w-full max-w-md rounded-xl bg-white px-4 py-2.5 text-[15px] text-ink-900 shadow-card ring-1 ring-bone-200 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      {/* ── Filtri ───────────────────────────────────────────── */}
      <div className="mt-4 space-y-2.5">
        <Riga etichetta="Attenzione">
          {LIVELLI.map((l) => (
            <Pillola
              key={l.id}
              href={costruisciUrl(filtri, {
                livello: filtri.livello === l.id ? undefined : l.id,
              })}
              attiva={filtri.livello === l.id}
            >
              {l.label}
            </Pillola>
          ))}
        </Riga>

        <Riga etichetta="Fase">
          {LINEA_PRINCIPALE.map((fase) => (
            <Pillola
              key={fase}
              href={costruisciUrl(filtri, {
                fase: filtri.fase === fase ? undefined : fase,
              })}
              attiva={filtri.fase === fase}
            >
              {STAGE_LABELS[fase]}
            </Pillola>
          ))}
        </Riga>

        <Riga etichetta="Membership">
          {[
            { id: "attiva", label: "Attiva" },
            { id: "nessuna", label: "Nessuna" },
          ].map((m) => (
            <Pillola
              key={m.id}
              href={costruisciUrl(filtri, {
                membership: filtri.membership === m.id ? undefined : m.id,
              })}
              attiva={filtri.membership === m.id}
            >
              {m.label}
            </Pillola>
          ))}
        </Riga>

        <Riga etichetta="Ordina per">
          {ORDINI.map((o) => (
            <Pillola
              key={o.id}
              href={costruisciUrl(filtri, { ordine: o.id })}
              attiva={ordine === o.id}
              quieta
            >
              {o.label}
            </Pillola>
          ))}
        </Riga>
      </div>

      {attivi > 0 ? (
        <p className="mt-3 text-sm text-ink-400">
          <NavLink
            href="/pro/pazienti"
            className="text-brand-700 underline-offset-4 hover:underline"
          >
            Togli tutti i filtri
          </NavLink>
        </p>
      ) : null}

      {/* ── L'elenco ─────────────────────────────────────────── */}
      <Riquadro
        titolo={filtri.q ? `Risultati per «${filtri.q}»` : "Pazienti"}
        conta={pazienti.length}
        className="mt-5"
        nota={
          filtri.q
            ? "In ordine di pertinenza."
            : ORDINI.find((o) => o.id === ordine)?.id === "attenzione"
              ? "In ordine di attenzione richiesta."
              : undefined
        }
      >
        {pazienti.length === 0 ? (
          <Niente>
            {attivi > 0 || filtri.q
              ? "Nessun paziente con questi filtri."
              : "Nessun paziente assegnato. Il care team lo compone la direzione, dalla scheda del paziente o dalla pagina dei professionisti."}
          </Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {pazienti.map((p) => (
              <li key={p.id}>
                <NavLink
                  href={`/pro/pazienti/${p.id}`}
                  className="group flex items-stretch gap-3.5 px-6 py-4 transition-colors hover:bg-bone-50"
                >
                  {p.attenzione !== null ? (
                    <>
                      <Priorita livello={p.attenzione} />
                      <PrioritaTesto livello={p.attenzione} />
                    </>
                  ) : (
                    <span aria-hidden="true" className="w-[3px] shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="text-[15px] font-medium text-ink-900">
                        {p.nome}
                      </span>
                      {p.codice ? (
                        <span className="font-mono text-xs text-ink-300">{p.codice}</span>
                      ) : null}
                      <Badge>{STAGE_LABELS[p.fase as JourneyStage]}</Badge>
                      {p.membership?.stato === "active" ? (
                        <Badge tone="gold">{p.membership.piano ?? "Membership"}</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-500">
                      {p.segnali > 0 ? (
                        <span
                          className={cx(
                            p.urgenti > 0 ? "text-signal-alert" : "text-signal-attention",
                          )}
                        >
                          {p.segnali}{" "}
                          {p.segnali === 1 ? "segnalazione" : "segnalazioni"}
                          {p.urgenti > 0 ? ` · ${p.urgenti} urgenti` : ""}
                        </span>
                      ) : null}

                      {p.ultimoContatto ? (
                        <span className="text-ink-400">
                          visto {formatRelativeDays(p.ultimoContatto)}
                        </span>
                      ) : (
                        <span className="text-ink-300">mai visto</span>
                      )}

                      {p.prossimaVisita ? (
                        <span className="text-ink-400">
                          torna {formatRelativeDays(p.prossimaVisita.quando)}
                        </span>
                      ) : null}

                      {p.professionisti.length > 0 ? (
                        <span className="text-ink-300">{p.professionisti[0]}</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="shrink-0 self-center text-right">
                    {p.score !== null ? (
                      <>
                        <p className="font-display text-[22px] leading-none text-ink-900 tnum">
                          {Math.round(p.score)}
                        </p>
                        <p className="mt-1 flex items-baseline justify-end gap-1.5 text-xs">
                          {p.scorePrecedente !== null ? (
                            <span
                              className={cx(
                                "tnum",
                                p.trend === "up"
                                  ? "text-signal-positive"
                                  : p.trend === "down"
                                    ? "text-signal-alert"
                                    : "text-ink-300",
                              )}
                            >
                              {formatDelta(
                                Math.round((p.score - p.scorePrecedente) * 10) / 10,
                              )}
                            </span>
                          ) : null}
                          <span className="text-ink-400 tnum">
                            {p.scoreIl ? formatShortDate(p.scoreIl) : ""}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-300">nessun punteggio</p>
                    )}
                  </div>

                  <ChevronIcon className="h-4 w-4 shrink-0 self-center text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>
    </div>
  );
}

/* ── Filtri ───────────────────────────────────────────────────────── */

function Riga({
  etichetta,
  children,
}: {
  etichetta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pillola({
  href,
  attiva,
  quieta = false,
  children,
}: {
  href: string;
  attiva: boolean;
  quieta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      href={href}
      aria-current={attiva ? "true" : undefined}
      className={cx(
        "rounded-full px-3 py-1 text-sm transition-colors",
        attiva
          ? quieta
            ? "bg-bone-200 font-medium text-ink-900"
            : "bg-ink-900 font-medium text-bone-50"
          : "bg-white text-ink-500 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
      )}
    >
      {children}
    </NavLink>
  );
}
