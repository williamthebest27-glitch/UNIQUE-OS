import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTask, type TaskCompleto } from "@/lib/data/professional";
import { chiudiTask } from "@/lib/clinical/actions";
import { lasciaTask, prendiInCarico } from "@/lib/clinical/attenzione-actions";
import { daysFromToday, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Priorita, PrioritaTesto, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il lavoro clinico che non è una visita.
 *
 * Tre code, e non sono un filtro sullo stesso elenco: sono tre stati
 * diversi del lavoro.
 *
 * **«Da prendere» è la coda che di solito manca**, ed è quella dove le
 * cose si perdono. Un task aperto senza incaricato è di tutti, quindi di
 * nessuno: resta lì mentre ognuno pensa che se ne occupi qualcun altro.
 * Elencarlo insieme ai propri lo nasconde; darle una colonna sua la
 * rende una domanda — «lo prendo io?».
 *
 * L'origine resta scritta su ogni riga. Non cambia cosa fare: cambia
 * quanto fidarsi del titolo. Un task nato da una soglia porta con sé i
 * fatti che l'hanno acceso; uno scritto da una persona porta il suo
 * giudizio.
 */

const ORIGINE: Record<string, string> = {
  professional: "Scritto da una persona",
  brain: "Proposto dal motore",
  rule: "Nato da una regola",
  patient: "Chiesto dal paziente",
  system: "Automatico",
};

/** Scaduto, oggi, o la data: la scadenza si legge senza fare il conto. */
function Scadenza({ dueOn }: { dueOn: string | null }) {
  if (dueOn === null) return <span className="text-ink-300">senza scadenza</span>;

  const giorni = daysFromToday(dueOn);
  if (giorni < 0) return <Badge tone="attention">scaduto da {-giorni}g</Badge>;
  if (giorni === 0) return <Badge tone="attention">oggi</Badge>;
  if (giorni <= 3) return <Badge tone="gold">fra {giorni}g</Badge>;
  return <span className="text-ink-400 tnum">entro il {formatShortDate(dueOn)}</span>;
}

export default async function TaskPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Task" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono task.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const coda = await getTask();
  const scaduti = [...coda.miei, ...coda.daPrendere].filter(
    (t) => t.dueOn !== null && daysFromToday(t.dueOn) < 0,
  ).length;

  return (
    <div>
      <PageHeading
        title="Task"
        subtitle="Richiami, referti da leggere, piani da aggiornare. Un task ha sempre un incaricato: senza, è un desiderio."
      />

      {scaduti > 0 ? (
        <p className="mt-4 rounded-xl bg-[#fdf6e8] px-4 py-2.5 text-sm text-signal-attention ring-1 ring-[#f0e0bd]">
          <span className="tnum">{scaduti}</span>{" "}
          {scaduti === 1 ? "task è scaduto" : "task sono scaduti"}.
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        <Riquadro
          titolo="Da prendere"
          conta={coda.daPrendere.length}
          nota="Aperti e senza incaricato. Sono di tutti, quindi di nessuno."
        >
          {coda.daPrendere.length === 0 ? (
            <Niente>Ogni task aperto ha un incaricato.</Niente>
          ) : (
            <Elenco task={coda.daPrendere} modo="prendere" />
          )}
        </Riquadro>

        <Riquadro titolo="Miei" conta={coda.miei.length} nota="Assegnati a te.">
          {coda.miei.length === 0 ? (
            <Niente>Niente in carico a te.</Niente>
          ) : (
            <Elenco task={coda.miei} modo="mio" />
          )}
        </Riquadro>

        <Riquadro
          titolo="Del team"
          conta={coda.delTeam.length}
          nota="Assegnati a un collega. Sono qui perché tu li possa vedere, non perché tocchino a te."
          apribile
          aperto={false}
        >
          {coda.delTeam.length === 0 ? (
            <Niente>Nessun task assegnato ad altri.</Niente>
          ) : (
            <Elenco task={coda.delTeam} modo="altrui" />
          )}
        </Riquadro>

        {coda.chiusi.length > 0 ? (
          <Riquadro
            titolo="Chiusi di recente"
            conta={coda.chiusi.length}
            nota="Ultime due settimane. Servono a ricordare cosa è già stato fatto prima di riaprire lo stesso lavoro."
            apribile
            aperto={false}
          >
            <ul className="divide-y divide-bone-200/80">
              {coda.chiusi.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-2.5"
                >
                  <p className="text-[15px] text-ink-400 line-through decoration-ink-300">
                    {t.title}
                  </p>
                  <p className="text-xs text-ink-400">
                    {t.patientName ?? "Senza paziente"}
                    {t.completedAt ? ` · ${formatShortDate(t.completedAt)}` : ""}
                    {t.assegnatario ? ` · ${t.assegnatario}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Riquadro>
        ) : null}
      </div>
    </div>
  );
}

/* ── L'elenco ─────────────────────────────────────────────────────── */

function Elenco({
  task,
  modo,
}: {
  task: TaskCompleto[];
  modo: "prendere" | "mio" | "altrui";
}) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {task.map((t) => (
        <li key={t.id} className="flex gap-3.5 px-6 py-4">
          <Priorita livello={(t.priorita === 1 ? 1 : t.priorita === 3 ? 3 : 2) as 1 | 2 | 3} />
          <PrioritaTesto livello={(t.priorita === 1 ? 1 : t.priorita === 3 ? 3 : 2) as 1 | 2 | 3} />

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ink-900">{t.title}</p>

            {t.detail ? (
              <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{t.detail}</p>
            ) : null}

            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {t.patientId ? (
                <NavLink
                  href={`/pro/pazienti/${t.patientId}`}
                  className="text-brand-700 underline-offset-4 hover:underline"
                >
                  {t.patientName}
                </NavLink>
              ) : (
                <span className="text-ink-400">Senza paziente</span>
              )}
              <Scadenza dueOn={t.dueOn} />
              {modo === "altrui" && t.assegnatario ? (
                <span className="text-ink-400">{t.assegnatario}</span>
              ) : null}
            </p>

            <p className="mt-1 text-xs text-ink-300">
              {ORIGINE[t.origine] ?? t.origine}
              {t.creatoDa ? ` · ${t.creatoDa}` : ""} ·{" "}
              <span className="tnum">{formatShortDate(t.creatoIl)}</span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {modo === "prendere" ? (
              <form action={prendiInCarico}>
                <input type="hidden" name="taskId" value={t.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
                >
                  Lo prendo io
                </button>
              </form>
            ) : null}

            {modo === "mio" ? (
              <form action={lasciaTask}>
                <input type="hidden" name="taskId" value={t.id} />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-400 ring-1 ring-bone-200 transition-colors hover:text-ink-700"
                >
                  Lascia
                </button>
              </form>
            ) : null}

            {modo !== "altrui" ? (
              <form action={chiudiTask}>
                <input type="hidden" name="taskId" value={t.id} />
                <button
                  type="submit"
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-sm ring-1 ring-bone-200 transition-colors",
                    "text-ink-500 hover:bg-bone-50 hover:text-brand-700",
                  )}
                >
                  Fatto
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
