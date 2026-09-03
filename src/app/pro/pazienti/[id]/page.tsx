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
import { CopilotPanel } from "@/components/clinical/copilot-panel";
import { NextBestActionPanel } from "@/components/clinical/next-best-action";
import { getPatientSignals } from "@/lib/data/nba";
import {
  CreditAdjustmentForm,
  NoteForm,
  StepProposalForm,
} from "@/components/clinical/clinical-forms";
import { registraEsito } from "@/lib/appointments/actions";
import { getCreditLedger, getPatientAppointments } from "@/lib/data/appointments";
import { CREDIT_ENTRY_LABELS, type CreditEntryKind } from "@/lib/credits/rules";
import { formatCredits, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { decidiStep } from "@/lib/clinical/actions";
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

interface NoteRow {
  id: string;
  kind: "note" | "assessment" | "visit_summary";
  title: string | null;
  body: string;
  visible_to_patient: boolean;
  created_at: string;
  author: { full_name: string } | null;
}

interface StepRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  proposer: { full_name: string } | null;
}

const NOTE_LABEL: Record<NoteRow["kind"], string> = {
  note: "Nota",
  assessment: "Valutazione",
  visit_summary: "Sintesi di visita",
};

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
      <div className="mx-auto max-w-[1000px]">
        <PageHeading title="Cartella paziente" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            cartelle da aprire.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const data = await getPatientDashboard(id);
  if (!data) notFound();

  const supabase = await createSupabaseServerClient();

  const [
    anagraficaRes,
    documentiRes,
    proposteRes,
    timeline,
    briefing,
    movimenti,
    agenda,
    segnali,
    noteRes,
    stepRes,
  ] = await Promise.all([
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
    getCreditLedger(id, 12),
    getPatientAppointments(id),
    getPatientSignals(id),

    supabase
      .from("clinical_notes")
      .select("id, kind, title, body, visible_to_patient, created_at, author:profiles(full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("care_plan_proposals")
      // `care_plan_proposals` ha due chiavi verso `profiles` — chi propone e
      // chi decide. Senza nominare il vincolo, PostgREST non può indovinare
      // quale intendiamo e rifiuta la query.
      .select(
        "id, title, description, status, created_at, proposer:profiles!care_plan_proposals_proposed_by_fkey(full_name)",
      )
      .eq("patient_id", id)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const anagrafica = anagraficaRes.data as unknown as AnagraficaRow | null;
  const documenti = (documentiRes.data ?? []) as unknown as DocRow[];
  const inRevisione = (proposteRes.data ?? []).length;
  const anni = eta(anagrafica?.date_of_birth ?? null);
  const note = (noteRes.data ?? []) as unknown as NoteRow[];
  const stepProposti = (stepRes.data ?? []) as unknown as StepRow[];

  return (
    <div className="mx-auto max-w-[1000px]">
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
                          "before:rounded-full before:bg-brand-500",
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
        <ScoreHero score={data.score} history={data.scoreHistory} seed={id} />

        {/* ── Percorso, visite, crediti ───────────────────────── */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <NextVisitCard appointment={data.nextAppointment} />
          <ProgramCard enrollment={data.enrollment} />
          <CreditsCard membership={data.membership} />
        </div>

        {/* ── Agenda ed esiti ─────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Agenda"
            hint="Registrare l’esito è ciò che sposta il credito da prenotato a utilizzato."
          />
          {agenda.prossimi.length === 0 ? (
            <EmptyState>Nessun appuntamento in programma.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
              {agenda.prossimi.map((appt) => {
                const passato = Date.parse(appt.startsAt) < Date.now();
                return (
                  <li
                    key={appt.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink-900">{appt.serviceName}</p>
                      <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                        {formatWeekdayDayMonth(appt.startsAt)} · ore{" "}
                        <span className="tnum">{formatTime(appt.startsAt)}</span>
                        {appt.creditsCost > 0
                          ? ` · ${formatCredits(appt.creditsCost)}`
                          : ""}
                      </p>
                    </div>

                    {passato ? (
                      <div className="flex flex-wrap gap-2">
                        {[
                          ["true", "Presente"],
                          ["false", "Non presentato"],
                        ].map(([value, label]) => (
                          <form key={value} action={registraEsito}>
                            <input type="hidden" name="appointmentId" value={appt.id} />
                            <input type="hidden" name="patientId" value={id} />
                            <input type="hidden" name="attended" value={value} />
                            <button
                              type="submit"
                              className={cx(
                                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                                value === "true"
                                  ? "bg-brand-700 font-medium text-bone-50 hover:bg-brand-900"
                                  : "text-ink-500 ring-1 ring-bone-200 hover:text-signal-alert",
                              )}
                            >
                              {label}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      <Badge>{appt.status === "confirmed" ? "Confermata" : "In agenda"}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── Crediti ─────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Crediti"
            hint="Le correzioni non modificano il saldo: aggiungono una riga al registro."
          />
          <div className="px-6 pt-3">
            <CreditAdjustmentForm patientId={id} />
          </div>

          {movimenti.length > 0 ? (
            <ul className="mt-5 divide-y divide-bone-200/80 border-t border-bone-200">
              {movimenti.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-900">
                      {m.description ??
                        CREDIT_ENTRY_LABELS[m.kind as CreditEntryKind] ??
                        m.kind}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {CREDIT_ENTRY_LABELS[m.kind as CreditEntryKind] ?? m.kind} ·{" "}
                      <span className="tnum">{formatShortDate(m.createdAt)}</span>
                    </p>
                  </div>
                  <span
                    className={cx(
                      "text-[15px] font-medium tnum",
                      m.amount > 0 ? "text-signal-positive" : "text-ink-700",
                    )}
                  >
                    {m.amount > 0 ? "+" : "−"}
                    {Math.abs(m.amount).toLocaleString("it-IT", {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pb-4" />
          )}
        </Card>

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
                      <Badge tone="positive">Analizzato</Badge>
                    ) : isBrainConfigured() ? (
                      <form action={analizzaDocumento}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="patientId" value={id} />
                        <button
                          type="submit"
                          className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
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

        {/* ── Next Best Action ────────────────────────────────── */}
        {segnali ? (
          <NextBestActionPanel
            stage={segnali.stage}
            clinical={segnali.azioni.clinical}
            commercial={segnali.azioni.commercial}
          />
        ) : null}

        {/* ── Copilot clinico ─────────────────────────────────── */}
        <CopilotPanel patientId={id} disabled={!isBrainConfigured()} />

        {/* ── Azioni ──────────────────────────────────────────── */}
        <ActionsCard actions={data.actions} />

        {/* ── Note e valutazioni ──────────────────────────────── */}
        <Card>
          <CardHeader
            title="Note e valutazioni"
            hint="Restano al care team, a meno che tu non scelga di condividerle."
          />
          <div className="px-6 pt-3">
            <NoteForm patientId={id} />
          </div>

          {anagrafica?.notes ? (
            <p className="mt-5 border-t border-bone-200 px-6 pt-4 text-[15px] leading-relaxed text-ink-700">
              {anagrafica.notes}
            </p>
          ) : null}

          {note.length > 0 ? (
            <ul className="mt-5 divide-y divide-bone-200/80 border-t border-bone-200">
              {note.map((n) => (
                <li key={n.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[11px] uppercase tracking-[0.08em] text-ink-300">
                      {NOTE_LABEL[n.kind]}
                    </span>
                    <span className="text-xs text-ink-400">
                      {n.author?.full_name ?? "—"} · {formatShortDate(n.created_at)}
                    </span>
                    {n.visible_to_patient ? <Badge tone="brand">Condivisa</Badge> : null}
                  </div>
                  {n.title ? (
                    <h3 className="mt-1 text-[15px] font-medium text-ink-900">{n.title}</h3>
                  ) : null}
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                    {n.body}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="pb-2" />
        </Card>

        {/* ── Step del percorso ───────────────────────────────── */}
        <Card>
          <CardHeader
            title="Proposte per il percorso"
            hint="Chiunque nel care team può proporre; la decisione è medica."
          />

          {stepProposti.length > 0 ? (
            <ul className="mt-2 divide-y divide-bone-200/80">
              {stepProposti.map((step) => (
                <li key={step.id} className="px-6 py-4">
                  <h3 className="text-[15px] font-medium text-ink-900">{step.title}</h3>
                  {step.description ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">
                      {step.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-400">
                    Proposto da {step.proposer?.full_name ?? "—"} ·{" "}
                    {formatShortDate(step.created_at)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["accepted", "rejected"] as const).map((decision) => (
                      <form key={decision} action={decidiStep}>
                        <input type="hidden" name="proposalId" value={step.id} />
                        <input type="hidden" name="patientId" value={id} />
                        <input type="hidden" name="decision" value={decision} />
                        <button
                          type="submit"
                          className={cx(
                            "rounded-lg px-3 py-1.5 text-sm transition-colors",
                            decision === "accepted"
                              ? "bg-brand-700 font-medium text-bone-50 hover:bg-brand-900"
                              : "text-ink-500 ring-1 ring-bone-200 hover:text-signal-alert",
                          )}
                        >
                          {decision === "accepted" ? "Accetta" : "Rifiuta"}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="border-t border-bone-200 px-6 py-5">
            <StepProposalForm patientId={id} />
          </div>
        </Card>

        <Timeline events={timeline} hint="Visite, referti e punteggi, dal più recente." />
      </div>
    </div>
  );
}
