import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getPatientDashboard } from "@/lib/data/patient";
import { getPatientTimeline } from "@/lib/data/timeline";
import { getLatestBriefing } from "@/lib/brain/briefing";
import { isBrainConfigured } from "@/lib/brain/extraction";
import { analizzaDocumento, generaBriefing } from "@/lib/brain/actions";
import { formatShortDate } from "@/lib/format";
import { ScoreHero } from "@/components/patient/score-hero";
import { CreditsCard, NextVisitCard, ProgramCard } from "@/components/patient/cards";
import { ActionsCard } from "@/components/patient/lists";
import { Timeline } from "@/components/patient/timeline";
import { UploadForm } from "@/components/documents/upload-form";
import { PageHeading } from "@/components/shell/page-heading";
import { Badge, Card, CardHeader, EmptyState, SparkIcon, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Cartella paziente" };
export const dynamic = "force-dynamic";

interface AnagraficaRow {
  patient_code: string | null;
  date_of_birth: string | null;
  sex_at_birth: string | null;
  height_cm: number | null;
  notes: string | null;
  care_team_members: {
    role_in_team: string | null;
    professionals: {
      title: string | null;
      specialty: string | null;
      profiles: { full_name: string } | null;
    } | null;
  }[];
}

interface DocRow {
  id: string;
  title: string;
  kind: string;
  issued_on: string | null;
  created_at: string;
  analyses: { id: string; status: string }[];
}

function eta(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export default async function CartellaPazientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8">
        <PageHeading title="Cartella paziente" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            cartelle da aprire.
          </EmptyState>
        </Card>
      </main>
    );
  }

  const data = await getPatientDashboard(id);
  if (!data) notFound();

  const supabase = await createSupabaseServerClient();

  const [anagraficaRes, documentiRes, proposteRes, timeline, briefing] = await Promise.all([
    supabase
      .from("patients")
      .select(
        "patient_code, date_of_birth, sex_at_birth, height_cm, notes, care_team_members(role_in_team, professionals(title, specialty, profiles(full_name)))",
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("documents")
      .select("id, title, kind, issued_on, created_at, analyses:document_analyses(id, status)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("measurement_proposals")
      .select("id")
      .eq("patient_id", id)
      .eq("status", "needs_review"),

    getPatientTimeline(id),
    getLatestBriefing(id),
  ]);

  const anagrafica = anagraficaRes.data as unknown as AnagraficaRow | null;
  const documenti = (documentiRes.data ?? []) as unknown as DocRow[];
  const inRevisione = (proposteRes.data ?? []).length;
  const anni = eta(anagrafica?.date_of_birth ?? null);

  return (
    <main className="mx-auto max-w-[1000px] px-5 py-10 pb-20 sm:px-8">
      <Link
        href="/pro/pazienti"
        className="text-sm text-ink-400 transition-colors hover:text-ink-700"
      >
        ← Pazienti
      </Link>

      <div className="mt-4">
        <PageHeading title={data.profile.fullName} />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
          {anagrafica?.patient_code ? (
            <span className="font-mono text-xs text-ink-400">
              {anagrafica.patient_code}
            </span>
          ) : null}
          {anni !== null ? <span className="tnum">{anni} anni</span> : null}
          {anagrafica?.sex_at_birth ? <span>{anagrafica.sex_at_birth}</span> : null}
          {anagrafica?.height_cm ? (
            <span className="tnum">{Number(anagrafica.height_cm)} cm</span>
          ) : null}
        </p>

        {anagrafica?.care_team_members?.length ? (
          <p className="mt-2 text-sm text-ink-400">
            Care team:{" "}
            {anagrafica.care_team_members
              .map((m) =>
                [m.professionals?.title, m.professionals?.profiles?.full_name]
                  .filter(Boolean)
                  .join(" "),
              )
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {inRevisione > 0 ? (
        <Link
          href="/pro/revisioni"
          className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-[#fdf6e8] px-4 py-3 ring-1 ring-[#f0e0bd] transition-colors hover:bg-[#fbf0d9]"
        >
          <span className="text-sm text-signal-attention">
            {inRevisione} {inRevisione === 1 ? "valore in attesa" : "valori in attesa"} di
            revisione per questo paziente.
          </span>
          <span className="shrink-0 text-sm font-medium text-signal-attention">
            Rivedi →
          </span>
        </Link>
      ) : null}

      <div className="mt-6 space-y-6">
        {/* ── Briefing pre-visita ─────────────────────────────── */}
        <Card>
          <CardHeader
            title="Prima della visita"
            hint={
              briefing
                ? `Sintesi generata il ${formatShortDate(briefing.createdAt)}. Fondata solo sui dati in cartella.`
                : "Una sintesi della storia del paziente, scritta solo sui dati disponibili."
            }
            action={<SparkIcon className="h-4 w-4 text-gold-500" />}
          />

          <div className="px-6 pb-6 pt-3">
            {briefing ? (
              <>
                <p className="text-[15px] leading-relaxed text-ink-800">
                  {briefing.summary}
                </p>

                {briefing.highlights.length > 0 ? (
                  <ul className="mt-4 space-y-1.5">
                    {briefing.highlights.map((item) => (
                      <li
                        key={item}
                        className={cx(
                          "relative pl-4 text-sm leading-relaxed text-ink-700",
                          "before:absolute before:left-0 before:top-2 before:h-1 before:w-1",
                          "before:rounded-full before:bg-jade-500",
                        )}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {briefing.openQuestions.length > 0 ? (
                  <div className="mt-5 rounded-xl bg-bone-50 px-4 py-3 ring-1 ring-bone-200">
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-500">
                      Da verificare in visita
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {briefing.openQuestions.map((item) => (
                        <li
                          key={item}
                          className={cx(
                            "relative pl-4 text-sm leading-relaxed text-ink-700",
                            "before:absolute before:left-0 before:top-2 before:h-1 before:w-1",
                            "before:rounded-full before:bg-signal-attention",
                          )}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-500">
                Nessuna sintesi ancora generata per questo paziente.
              </p>
            )}

            {isBrainConfigured() ? (
              <form action={generaBriefing} className="mt-5">
                <input type="hidden" name="patientId" value={id} />
                <button
                  type="submit"
                  className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
                >
                  {briefing ? "Rigenera la sintesi" : "Riassumi prima della visita"}
                </button>
              </form>
            ) : (
              <p className="mt-4 text-xs text-ink-400">
                ANTHROPIC_API_KEY non è impostata: la sintesi non può essere generata.
              </p>
            )}
          </div>
        </Card>

        {/* ── Score e sottoscore ──────────────────────────────── */}
        <ScoreHero score={data.score} history={data.scoreHistory} />

        {/* ── Percorso, visite, crediti ───────────────────────── */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <NextVisitCard appointment={data.nextAppointment} />
          <ProgramCard enrollment={data.enrollment} />
          <CreditsCard credits={data.credits} />
        </div>

        {/* ── Documenti ───────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Documenti"
            hint="Carica un referto: il motore lo classifica e ne estrae i parametri."
          />
          <div className="px-6 pt-3">
            <UploadForm patientId={id} />
          </div>

          {documenti.length === 0 ? (
            <EmptyState>Nessun documento in cartella.</EmptyState>
          ) : (
            <ul className="mt-5 divide-y divide-bone-200/80">
              {documenti.map((doc) => {
                const analizzato = doc.analyses?.some((a) => a.status === "completed");
                return (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink-900">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {formatShortDate(doc.issued_on ?? doc.created_at)}
                      </p>
                    </div>

                    {analizzato ? (
                      <Badge tone="jade">Analizzato</Badge>
                    ) : isBrainConfigured() ? (
                      <form action={analizzaDocumento}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="patientId" value={id} />
                        <button
                          type="submit"
                          className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-jade-700"
                        >
                          Analizza
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="pb-2" />
        </Card>

        {/* ── Azioni e storia ─────────────────────────────────── */}
        <ActionsCard actions={data.actions} />

        {anagrafica?.notes ? (
          <Card>
            <CardHeader title="Note" />
            <p className="px-6 pb-6 pt-2 text-[15px] leading-relaxed text-ink-700">
              {anagrafica.notes}
            </p>
          </Card>
        ) : null}

        <Timeline events={timeline} hint="Visite, referti e punteggi, dal più recente." />
      </div>
    </main>
  );
}
