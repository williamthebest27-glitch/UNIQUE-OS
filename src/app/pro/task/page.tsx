import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTask } from "@/lib/data/professional";
import { chiudiTask } from "@/lib/clinical/actions";
import { daysFromToday, formatShortDate } from "@/lib/format";
import { PageHeading } from "@/components/shell/page-heading";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

/** Scaduto, oggi, o la data: la scadenza si legge senza fare il conto. */
function Scadenza({ dueOn }: { dueOn: string | null }) {
  if (dueOn === null) return <span className="text-ink-300">senza scadenza</span>;

  const giorni = daysFromToday(dueOn);
  if (giorni < 0) return <Badge tone="attention">scaduto da {-giorni}g</Badge>;
  if (giorni === 0) return <Badge tone="attention">oggi</Badge>;
  if (giorni <= 3) return <Badge tone="gold">fra {giorni}g</Badge>;
  return <span className="text-ink-400 tnum">entro il {formatShortDate(dueOn)}</span>;
}

/**
 * I task clinici.
 *
 * La home ne mostra dieci perché è una giornata; qui c'è tutto ciò che
 * resta aperto, ordinato per scadenza — e le ultime due settimane di
 * chiusi, che servono a ricordare cosa è già stato fatto prima di
 * riaprire lo stesso lavoro.
 */
export default async function TaskPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[860px]">
        <PageHeading title="Task" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            task.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { aperti, chiusi } = await getTask();

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeading
        title="Task"
        subtitle="Il lavoro clinico che non è una visita: richiami, referti da leggere, piani da aggiornare."
      />

      <Card className="mt-8">
        <CardHeader
          title="Da fare"
          hint="In ordine di scadenza. Chi non ne ha, sta in fondo."
          action={aperti.length > 0 ? <Badge tone="attention">{aperti.length}</Badge> : null}
        />

        {aperti.length === 0 ? (
          <EmptyState>
            Niente in sospeso. I task nascono dalla cartella del paziente e
            dalle proposte del motore.
          </EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {aperti.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-start justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink-900">{task.title}</p>
                  {task.detail ? (
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                      {task.detail}
                    </p>
                  ) : null}
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                    {task.patientId ? (
                      <Link
                        href={`/pro/pazienti/${task.patientId}`}
                        className="text-brand-700 underline-offset-4 hover:underline"
                      >
                        {task.patientName}
                      </Link>
                    ) : (
                      <span className="text-ink-400">Senza paziente</span>
                    )}
                    <Scadenza dueOn={task.dueOn} />
                  </p>
                </div>

                <form action={chiudiTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
                  >
                    Fatto
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {chiusi.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title="Chiusi di recente" hint="Ultime due settimane." />
          <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
            {chiusi.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <p className="text-[15px] text-ink-400 line-through decoration-ink-300">
                  {task.title}
                </p>
                <p className="text-xs text-ink-400">
                  {task.patientName ?? "Senza paziente"}
                  {task.completedAt ? ` · ${formatShortDate(task.completedAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
