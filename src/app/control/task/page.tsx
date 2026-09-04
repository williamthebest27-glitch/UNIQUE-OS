import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { chiudiTaskControl } from "@/lib/brain/founder-actions";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { Bottone, Panel, Stato, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

/**
 * I task di Unique.
 *
 * Uno solo per tutta l'azienda: richiamare un paziente è della reception,
 * controllare un pagamento dell'amministrazione, approvare uno Score di
 * un medico. Due elenchi avrebbero significato due notifiche e la domanda
 * "dove sta il mio task".
 *
 * Ogni riga porta la sua origine. Un task nato dal Brain non è come uno
 * scritto da una persona: chi lo esegue ha diritto di sapere da dove
 * viene.
 */

const PRIORITA: Record<number, { label: string; tono: "avviso" | "neutro" | "spento" }> = {
  1: { label: "Alta", tono: "avviso" },
  2: { label: "Media", tono: "neutro" },
  3: { label: "Bassa", tono: "spento" },
};

const ORIGINI: Record<string, string> = {
  brain: "Unique Brain",
  rule: "Regola automatica",
  professional: "Professionista",
  patient: "Paziente",
  system: "Sistema",
};

interface RigaTask {
  id: string;
  title: string;
  detail: string | null;
  due_on: string | null;
  priority: number;
  origin: string;
  category: string | null;
  status: string;
  completed_at: string | null;
  owner: { full_name: string } | null;
  patient: { id: string; profile: { full_name: string } | null } | null;
}

export default async function TaskPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Task">
        <Vuoto>Supabase non è collegato: i task vivono nel database.</Vuoto>
      </Panel>
    );
  }

  const supabase = await createSupabaseServerClient();
  const campi =
    "id, title, detail, due_on, priority, origin, category, status, completed_at, " +
    "owner:profiles!tasks_owner_id_fkey(full_name), " +
    "patient:patients(id, profile:profiles(full_name))";

  const [apertiRes, chiusiRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(campi)
      .eq("status", "open")
      .order("priority", { ascending: true })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(80),
    supabase
      .from("tasks")
      .select(campi)
      .neq("status", "open")
      .gte("completed_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order("completed_at", { ascending: false })
      .limit(20),
  ]);

  const aperti = (apertiRes.data ?? []) as unknown as RigaTask[];
  const chiusi = (chiusiRes.data ?? []) as unknown as RigaTask[];

  const perCategoria = new Map<string, RigaTask[]>();
  for (const t of aperti) {
    const chiave = t.category ?? "generale";
    perCategoria.set(chiave, [...(perCategoria.get(chiave) ?? []), t]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Task</h1>
        <p className="mt-1.5 text-sm text-bone-50/50">
          {aperti.length} aperti. Ogni task ha un incaricato, una priorità, una
          scadenza e un’origine.
        </p>
      </div>

      {aperti.length === 0 ? (
        <Panel title="Aperti">
          <Vuoto>Nessun task aperto.</Vuoto>
        </Panel>
      ) : (
        [...perCategoria.entries()].map(([categoria, elenco]) => (
          <Panel
            key={categoria}
            title={categoria === "generale" ? "Da fare" : categoria}
            hint={`${elenco.length} task`}
          >
            <ul className="pb-2">
              {elenco.map((t) => (
                <li key={t.id} className="border-t border-white/[0.07] px-5 py-3.5 first:border-t-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="min-w-0">
                      <span className="block text-[15px] text-bone-50">{t.title}</span>
                      {t.detail ? (
                        <span className="mt-0.5 block text-xs text-bone-50/45">{t.detail}</span>
                      ) : null}
                      <span className="mt-1 block text-xs text-bone-50/30">
                        {t.owner?.full_name ?? "non assegnato"}
                        {t.due_on ? ` · ${formatRelativeDays(`${t.due_on}T12:00:00Z`)}` : ""}
                        {` · ${ORIGINI[t.origin] ?? t.origin}`}
                      </span>
                    </span>

                    <span className="flex items-center gap-3">
                      <Stato tono={PRIORITA[t.priority]?.tono ?? "neutro"}>
                        {PRIORITA[t.priority]?.label ?? t.priority}
                      </Stato>
                      <form action={chiudiTaskControl}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <Bottone type="submit" variante="quieto" className="px-3 py-1.5">
                          Fatto
                        </Bottone>
                      </form>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}

      {chiusi.length > 0 ? (
        <Panel title="Chiusi di recente" hint="Ultime due settimane.">
          <ul className="pb-2">
            {chiusi.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-2.5 first:border-t-0"
              >
                <span className="text-sm text-bone-50/50 line-through decoration-white/20">
                  {t.title}
                </span>
                <span className="text-xs text-bone-50/30">
                  {t.completed_at ? formatShortDate(t.completed_at) : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
