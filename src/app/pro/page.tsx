import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { chiudiTask } from "@/lib/clinical/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getProfessionalDashboard } from "@/lib/data/professional";
import { DISCIPLINE_LABELS } from "@/lib/professionals/disciplines";
import { formatRelativeDays, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import {
  Badge,
  CalendarIcon,
  Card,
  CardHeader,
  ChevronIcon,
  DocumentIcon,
  EmptyState,
  cx,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Area professionale" };
export const dynamic = "force-dynamic";

export default async function ProPage() {
  const profile = await requireProfile();

  // Un paziente qui non ci deve arrivare: ha una sua home.
  if (profile.role === "patient") redirect("/dashboard");

  const dashboard = isSupabaseConfigured() ? await getProfessionalDashboard() : null;

  return (
    <div className="mx-auto max-w-[1000px]">
      <header>
        <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
          Ciao {profile.firstName ?? profile.fullName}.
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-400 first-letter:uppercase">
          {formatWeekdayDayMonth(new Date().toISOString())}
          {dashboard ? (
            <Badge>{DISCIPLINE_LABELS[dashboard.discipline]}</Badge>
          ) : null}
        </p>
      </header>

      {!dashboard ? (
        <Card className="mt-8">
          <EmptyState>
            {isSupabaseConfigured()
              ? "Il tuo profilo non risulta fra i professionisti della clinica."
              : "Supabase non è collegato: in modalità dimostrativa non c’è un’agenda da mostrare."}
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          {/* ── Agenda di oggi ──────────────────────────────── */}
          <Card>
            <CardHeader
              title="Pazienti di oggi"
              hint="Apri la cartella per la sintesi pre-visita."
              action={<CalendarIcon className="h-4 w-4 text-ink-400" />}
            />
            {dashboard.oggi.length === 0 ? (
              <EmptyState>Nessuna visita in agenda oggi.</EmptyState>
            ) : (
              <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                {dashboard.oggi.map((visita) => (
                  <li key={visita.id}>
                    <Link
                      href={`/pro/pazienti/${visita.patientId}`}
                      className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                    >
                      <span className="font-display text-[20px] text-ink-900 tnum">
                        {formatTime(visita.startsAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-ink-900">
                          {visita.patientName}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-500">
                          {visita.serviceName}
                          {visita.location ? ` · ${visita.location}` : ""}
                        </span>
                      </span>
                      <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Prossimi giorni ───────────────────────────── */}
            <Card>
              <CardHeader title="Prossimi giorni" />
              {dashboard.prossimi.length === 0 ? (
                <EmptyState>Agenda libera nella prossima settimana.</EmptyState>
              ) : (
                <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                  {dashboard.prossimi.map((visita) => (
                    <li key={visita.id} className="px-6 py-3.5">
                      <p className="text-[15px] text-ink-900">{visita.patientName}</p>
                      <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                        {formatWeekdayDayMonth(visita.startsAt)} · ore{" "}
                        <span className="tnum">{formatTime(visita.startsAt)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* ── Documenti nuovi ───────────────────────────── */}
            <Card>
              <CardHeader
                title="Documenti nuovi"
                action={<DocumentIcon className="h-4 w-4 text-ink-400" />}
              />
              {dashboard.documentiNuovi.length === 0 ? (
                <EmptyState>Nessun documento caricato di recente.</EmptyState>
              ) : (
                <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                  {dashboard.documentiNuovi.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/pro/pazienti/${doc.patientId}`}
                        className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
                      >
                        <p className="text-[15px] text-ink-900">{doc.title}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {doc.patientName} · {formatShortDate(doc.createdAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Task ──────────────────────────────────────── */}
            <Card>
              <CardHeader title="Task" />
              {dashboard.task.length === 0 ? (
                <EmptyState>Niente in sospeso.</EmptyState>
              ) : (
                <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                  {dashboard.task.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-start justify-between gap-3 px-6 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] text-ink-900">{task.title}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {task.patientName ?? "Senza paziente"}
                          {task.dueOn ? ` · entro il ${formatShortDate(task.dueOn)}` : ""}
                        </p>
                      </div>
                      <form action={chiudiTask}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
                        >
                          Fatto
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* ── Da rivalutare ─────────────────────────────── */}
            <Card>
              <CardHeader
                title="Da rivalutare"
                hint="Nessun punteggio da oltre quattro mesi."
              />
              {dashboard.daRivalutare.length === 0 ? (
                <EmptyState>Tutti i pazienti sono aggiornati.</EmptyState>
              ) : (
                <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                  {dashboard.daRivalutare.map((p) => (
                    <li key={p.patientId}>
                      <Link
                        href={`/pro/pazienti/${p.patientId}`}
                        className="flex items-center justify-between gap-3 px-6 py-3.5 transition-colors hover:bg-bone-50"
                      >
                        <span className="text-[15px] text-ink-900">{p.patientName}</span>
                        <span
                          className={cx(
                            "shrink-0 text-xs tnum",
                            p.lastScoreOn === null ? "text-signal-attention" : "text-ink-400",
                          )}
                        >
                          {p.lastScoreOn === null
                            ? "mai valutato"
                            : formatRelativeDays(p.lastScoreOn)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ── Notifiche ───────────────────────────────────── */}
          {dashboard.notifiche.length > 0 ? (
            <Card>
              <CardHeader title="Notifiche" />
              <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
                {dashboard.notifiche.map((n) => (
                  <li key={n.id} className="flex gap-3 px-6 py-3.5">
                    <span
                      aria-hidden="true"
                      className={cx(
                        "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                        n.readAt === null ? "bg-brand-500" : "bg-bone-300",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink-900">{n.title}</p>
                      {n.body ? (
                        <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-ink-400 first-letter:uppercase">
                        {formatRelativeDays(n.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
