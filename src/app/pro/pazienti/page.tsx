import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/format";
import { PageHeading } from "@/components/shell/page-heading";
import { Card, ChevronIcon, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Pazienti" };
export const dynamic = "force-dynamic";

interface PatientRow {
  id: string;
  patient_code: string | null;
  profile: { full_name: string } | null;
}

export default async function PazientiPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[860px] px-5 py-12 sm:px-8">
        <PageHeading title="Pazienti" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è un elenco
            pazienti.
          </EmptyState>
        </Card>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();

  // La Row Level Security fa il filtro: un professionista vede i pazienti
  // del proprio care team, amministrazione e management vedono tutto.
  const { data } = await supabase
    .from("patients")
    .select("id, patient_code, profile:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const patients = (data ?? []) as unknown as PatientRow[];

  // Ultimo punteggio per paziente. Una seconda query invece di annidarla:
  // un select annidato restituirebbe tutto lo storico di ognuno.
  const scores = new Map<string, { score: number; measuredOn: string }>();

  if (patients.length > 0) {
    const { data: scoreRows } = await supabase
      .from("longevity_scores")
      .select("patient_id, score, measured_on")
      .in(
        "patient_id",
        patients.map((p) => p.id),
      )
      .order("measured_on", { ascending: false });

    for (const row of (scoreRows ?? []) as {
      patient_id: string;
      score: number;
      measured_on: string;
    }[]) {
      if (!scores.has(row.patient_id)) {
        scores.set(row.patient_id, {
          score: Number(row.score),
          measuredOn: row.measured_on,
        });
      }
    }
  }

  return (
    <main className="mx-auto max-w-[860px] px-5 py-12 sm:px-8">
      <PageHeading
        title="Pazienti"
        subtitle="I pazienti che segui, con il punteggio più recente."
      />

      <Card className="mt-8">
        {patients.length === 0 ? (
          <EmptyState>
            Nessun paziente assegnato. Le assegnazioni si gestiscono in
            <code className="mx-1 font-mono text-xs">care_team_members</code>.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {patients.map((patient) => {
              const score = scores.get(patient.id);
              return (
                <li key={patient.id}>
                  <Link
                    href={`/pro/pazienti/${patient.id}`}
                    className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink-900">
                        {patient.profile?.full_name ?? "Paziente"}
                      </p>
                      {patient.patient_code ? (
                        <p className="mt-0.5 font-mono text-xs text-ink-300">
                          {patient.patient_code}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      {score ? (
                        <>
                          <p className="font-display text-[22px] leading-none text-ink-900 tnum">
                            {Math.round(score.score)}
                          </p>
                          <p className="mt-1 text-xs text-ink-400 tnum">
                            {formatShortDate(score.measuredOn)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-ink-300">nessun punteggio</p>
                      )}
                    </div>

                    <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
