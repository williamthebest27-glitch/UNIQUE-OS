import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getAgendaClinica,
  oggiRoma,
  spostaAncora,
  type VistaAgenda,
} from "@/lib/data/agenda";
import { formatDurata, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * L'agenda, in tre scale.
 *
 * Non sono tre viste dello stesso elenco: sono tre domande diverse, e il
 * dettaglio giusto cambia con ciascuna. Il **giorno** dice chi entra
 * adesso e con quale preparazione; la **settimana** come è messa la
 * settimana; il **mese** dove c'è spazio. Mostrare i nomi dei pazienti
 * su trenta giorni produce una parete di testo che nessuno legge, ed è
 * il motivo per cui la vista mensile conta e non elenca.
 *
 * Le visite passate senza esito restano visibili con il loro colore: è
 * l'unica cosa che un calendario di solito nasconde e che invece è
 * lavoro arretrato.
 */

const VISTE: { id: VistaAgenda; label: string }[] = [
  { id: "giorno", label: "Giorno" },
  { id: "settimana", label: "Settimana" },
  { id: "mese", label: "Mese" },
];

const GIORNI_CORTI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function urlAgenda(vista: VistaAgenda, ancora: string): string {
  return `/pro/agenda?vista=${vista}&data=${ancora}`;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; data?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Agenda" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è un’agenda da
            mostrare.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const parametri = await searchParams;
  const vista = (VISTE.find((v) => v.id === parametri.vista)?.id ?? "giorno") as VistaAgenda;
  const ancora = /^\d{4}-\d{2}-\d{2}$/.test(parametri.data ?? "")
    ? parametri.data!
    : oggiRoma();

  const a = await getAgendaClinica(vista, ancora);
  const oggi = oggiRoma();

  return (
    <div>
      <PageHeading
        title="Agenda"
        subtitle="Le visite dei pazienti che segui. Da una riga si apre il workspace della visita, dove si prepara e si registra l’esito."
      />

      {/* ── Comandi ──────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Scala" className="flex gap-1.5">
          {VISTE.map((v) => (
            <NavLink
              key={v.id}
              href={urlAgenda(v.id, ancora)}
              aria-current={vista === v.id ? "true" : undefined}
              className={cx(
                "rounded-full px-3 py-1 text-sm transition-colors",
                vista === v.id
                  ? "bg-ink-900 font-medium text-bone-50"
                  : "bg-white text-ink-500 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
              )}
            >
              {v.label}
            </NavLink>
          ))}
        </nav>

        <nav aria-label="Periodo" className="flex items-center gap-1.5">
          <NavLink
            href={urlAgenda(vista, spostaAncora(vista, ancora, -1))}
            aria-label="Periodo precedente"
            className="rounded-lg bg-white px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
          >
            ←
          </NavLink>
          <NavLink
            href={urlAgenda(vista, oggi)}
            className="rounded-lg bg-white px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
          >
            Oggi
          </NavLink>
          <NavLink
            href={urlAgenda(vista, spostaAncora(vista, ancora, 1))}
            aria-label="Periodo successivo"
            className="rounded-lg bg-white px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
          >
            →
          </NavLink>
        </nav>
      </div>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-sm text-ink-400">
        <span className="first-letter:uppercase">
          {vista === "giorno"
            ? formatWeekdayDayMonth(`${a.da}T12:00:00Z`)
            : `${formatShortDate(a.da)} – ${formatShortDate(a.a)}`}
        </span>
        <span className="tnum">
          {a.totale} {a.totale === 1 ? "visita" : "visite"}
        </span>
        {a.senzaEsito > 0 ? (
          <NavLink
            href="/pro/attenzione?vista=visita"
            className="text-signal-alert underline-offset-4 hover:underline"
          >
            {a.senzaEsito} senza esito
          </NavLink>
        ) : null}
      </p>

      {/* ── Il mese: si conta, non si elenca ─────────────────── */}
      {vista === "mese" ? (
        <Riquadro titolo="Mese" conta={a.totale} className="mt-5">
          <div className="px-6 pb-6 pt-4">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-bone-200 ring-1 ring-bone-200 [&>*]:bg-white">
              {GIORNI_CORTI.map((g) => (
                <div
                  key={g}
                  className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400"
                >
                  {g}
                </div>
              ))}

              {/* Le celle vuote prima del primo del mese, o la griglia
                  partirebbe dal giorno sbagliato della settimana. */}
              {Array.from({
                length: (new Date(`${a.da}T12:00:00Z`).getUTCDay() + 6) % 7,
              }).map((_, i) => (
                <div key={`vuota-${i}`} className="min-h-[74px] bg-bone-50/60" />
              ))}

              {a.giorni.map((g) => {
                const aperte = g.visite.filter((v) => v.senzaEsito).length;
                return (
                  <NavLink
                    key={g.data}
                    href={urlAgenda("giorno", g.data)}
                    className={cx(
                      "min-h-[74px] px-2 py-1.5 transition-colors hover:bg-bone-50",
                      g.data === oggi && "ring-1 ring-inset ring-brand-300",
                    )}
                  >
                    <span
                      className={cx(
                        "block text-sm tnum",
                        g.data === oggi ? "font-semibold text-brand-700" : "text-ink-500",
                      )}
                    >
                      {Number(g.data.slice(-2))}
                    </span>
                    {g.visite.length > 0 ? (
                      <span className="mt-1 block">
                        <span
                          className={cx(
                            "font-display text-[18px] leading-none tnum",
                            aperte > 0 ? "text-signal-alert" : "text-ink-900",
                          )}
                        >
                          {g.visite.length}
                        </span>
                        {aperte > 0 ? (
                          <span className="mt-0.5 block text-[10px] text-signal-alert">
                            {aperte} da chiudere
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-ink-400">
              Su un mese le visite si contano: i nomi di trenta giorni sono una parete
              di testo. Apri un giorno per vederli.
            </p>
          </div>
        </Riquadro>
      ) : (
        /* ── Giorno e settimana: si elencano ────────────────── */
        <div className="mt-5 space-y-5">
          {a.giorni.map((g) => (
            <section key={g.data}>
              <h2
                className={cx(
                  "text-[13px] font-semibold uppercase tracking-[0.09em] first-letter:uppercase",
                  g.data === oggi ? "text-brand-700" : "text-ink-500",
                )}
              >
                {formatWeekdayDayMonth(`${g.data}T12:00:00Z`)}
                {g.data === oggi ? " · oggi" : ""}
              </h2>

              {/* Card e non Riquadro: l'intestazione qui è il giorno, sopra,
                  e un secondo titolo sarebbe un titolo vuoto. */}
              <Card className="mt-2">
                {g.visite.length === 0 ? (
                  <Niente>Nessuna visita.</Niente>
                ) : (
                  <ul className="divide-y divide-bone-200/80">
                    {g.visite.map((v) => (
                      <li key={v.id}>
                        <NavLink
                          href={`/pro/pazienti/${v.patientId}/visita`}
                          className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3.5 transition-colors hover:bg-bone-50"
                        >
                          <span
                            className={cx(
                              "w-16 shrink-0 font-display text-[19px] tnum",
                              v.senzaEsito
                                ? "text-signal-alert"
                                : v.stato === "completed"
                                  ? "text-ink-300"
                                  : "text-ink-900",
                            )}
                          >
                            {formatTime(v.iniziaAlle)}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium text-ink-900">
                              {v.paziente}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-ink-500">
                              <span>{v.servizio}</span>
                              {v.durataMin ? (
                                <span className="text-ink-400 tnum">
                                  {formatDurata(v.durataMin)}
                                </span>
                              ) : null}
                              {v.professionista ? (
                                <span className="text-ink-400">{v.professionista}</span>
                              ) : null}
                              {v.stanza ?? v.luogo ? (
                                <span className="text-ink-400">{v.stanza ?? v.luogo}</span>
                              ) : null}
                            </span>
                          </span>

                          <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {v.senzaEsito ? (
                              <Badge tone="attention">Esito mancante</Badge>
                            ) : v.stato === "completed" ? (
                              <Badge tone="positive">Svolta</Badge>
                            ) : v.stato === "no_show" ? (
                              <Badge tone="attention">Non presentato</Badge>
                            ) : v.stato === "scheduled" ? (
                              <Badge>Da confermare</Badge>
                            ) : null}

                            {v.refertiDaLeggere > 0 ? (
                              <Badge tone="attention">
                                {v.refertiDaLeggere} referti
                              </Badge>
                            ) : null}

                            {!v.preparata && !["completed", "no_show"].includes(v.stato) ? (
                              <Badge tone="gold">Da preparare</Badge>
                            ) : null}
                          </span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
