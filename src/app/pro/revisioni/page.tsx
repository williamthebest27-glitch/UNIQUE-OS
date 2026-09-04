import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { capacitaAttive } from "@/lib/brain/fornitore";
import { approvaProposta, ricalcolaPunteggio, rifiutaProposta } from "@/lib/brain/actions";
import { REVIEW_REASON_LABELS, type ReviewReason } from "@/lib/brain/validation";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";
import { PageHeading } from "@/components/shell/page-heading";

export const metadata: Metadata = { title: "Revisioni cliniche" };
export const dynamic = "force-dynamic";

interface ProposalRow {
  id: string;
  metric_code: string;
  label: string;
  value: number | null;
  category: string | null;
  unit: string | null;
  measured_on: string;
  confidence: number;
  source_excerpt: string | null;
  previous_value: number | null;
  delta: number | null;
  review_reasons: string[];
  analysis: {
    id: string;
    summary: string | null;
    next_steps: string[] | null;
    document: { title: string } | null;
  } | null;
  patient: { id: string; profile: { full_name: string } | null } | null;
}

function formatValue(row: ProposalRow): string {
  if (row.category !== null) return row.category;
  if (row.value === null) return "—";
  const n = Number(row.value).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  return row.unit ? `${n} ${row.unit}` : n;
}

function ProposalCard({ row }: { row: ProposalRow }) {
  const reasons = (row.review_reasons ?? []) as ReviewReason[];

  return (
    <li className="px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-medium text-ink-900">{row.label}</h3>
        <span className="font-mono text-xs text-ink-300">{row.metric_code}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-3">
        {row.previous_value !== null ? (
          <span className="text-sm text-ink-400 tnum line-through decoration-ink-300">
            {Number(row.previous_value).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
          </span>
        ) : null}
        <span className="font-display text-[24px] leading-none text-ink-900 tnum">
          {formatValue(row)}
        </span>
        <span className="text-xs text-ink-400">
          rilevato il {formatShortDate(row.measured_on)} · confidenza{" "}
          {Math.round(row.confidence * 100)}%
        </span>
      </div>

      {row.source_excerpt ? (
        <p className="mt-3 rounded-lg bg-bone-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-500 ring-1 ring-bone-200">
          {row.source_excerpt}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {reasons.map((reason) => (
          <Badge key={reason} tone="attention">
            {REVIEW_REASON_LABELS[reason] ?? reason}
          </Badge>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={approvaProposta}>
          <input type="hidden" name="proposalId" value={row.id} />
          <button
            type="submit"
            className="rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-brand-900"
          >
            Approva e applica
          </button>
        </form>
        <form action={rifiutaProposta} className="flex items-center gap-2">
          <input type="hidden" name="proposalId" value={row.id} />
          <input
            name="note"
            placeholder="Motivo (facoltativo)"
            className="w-52 rounded-lg bg-bone-50 px-3 py-2 text-sm ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-signal-alert"
          >
            Rifiuta
          </button>
        </form>
      </div>
    </li>
  );
}

/**
 * Ricalcolo manuale del punteggio.
 *
 * Il ricalcolo avviene da solo a ogni misura approvata; questo pannello
 * serve dopo un caricamento massivo o un cambio di formula, e per vedere
 * il motore all’opera senza passare da un documento.
 */
async function PazientiPanel() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("id, patient_code, profile:profiles(full_name)")
    .limit(25);

  const patients = (data ?? []) as unknown as {
    id: string;
    patient_code: string | null;
    profile: { full_name: string } | null;
  }[];

  if (patients.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader
        title="Ricalcolo del punteggio"
        hint="Il punteggio si ricalcola da solo a ogni misura approvata. Qui puoi forzarlo."
      />
      <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
        {patients.map((patient) => (
          <li
            key={patient.id}
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
          >
            <span className="text-[15px] text-ink-900">
              {patient.profile?.full_name ?? "Paziente"}
              {patient.patient_code ? (
                <span className="ml-2 font-mono text-xs text-ink-300">
                  {patient.patient_code}
                </span>
              ) : null}
            </span>
            <form action={ricalcolaPunteggio}>
              <input type="hidden" name="patientId" value={patient.id} />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
              >
                Ricalcola punteggio
              </button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function RevisioniPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[860px]">
        <PageHeading
          title="Revisioni cliniche"
          subtitle="I valori che il motore AI propone di scrivere nella cartella del paziente."
        />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            proposte da rivedere.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("measurement_proposals")
    .select(
      "id, metric_code, label, value, category, unit, measured_on, confidence, source_excerpt, previous_value, delta, review_reasons, analysis:document_analyses(id, summary, next_steps, document:documents(title)), patient:patients(id, profile:profiles(full_name))",
    )
    .eq("status", "needs_review")
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = (data ?? []) as unknown as ProposalRow[];

  // Raggruppate per analisi: un referto si rivede tutto insieme, non un
  // valore alla volta scollegato dal suo contesto.
  const groups = new Map<string, ProposalRow[]>();
  for (const row of rows) {
    const key = row.analysis?.id ?? "senza-analisi";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeading
        title="Revisioni cliniche"
        subtitle="I valori che il motore AI ha estratto dai documenti e propone di scrivere in cartella. Finché non li approvi, non toccano il punteggio del paziente."
      />

      {!capacitaAttive().estrazione ? (
        <p className="mt-5 rounded-xl bg-gold-100 px-4 py-3 text-sm text-gold-600">
          I referti li legge il lettore proprietario: riconosce gli esami dal
          catalogo e non manda niente fuori. Un referto scansionato resta però
          un&rsquo;immagine, e per quello servirebbe un modello.
        </p>
      ) : null}

      <PazientiPanel />

      {groups.size === 0 ? (
        <Card className="mt-8">
          <EmptyState>Nessuna proposta in attesa. Tutto revisionato.</EmptyState>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          {[...groups.entries()].map(([key, list]) => {
            const first = list[0];
            const patientName = first.patient?.profile?.full_name ?? "Paziente";
            const nextSteps = first.analysis?.next_steps ?? [];

            return (
              <Card key={key}>
                <CardHeader
                  title={patientName}
                  hint={first.analysis?.document?.title ?? undefined}
                  action={<Badge tone="attention">{list.length} da rivedere</Badge>}
                />

                {first.analysis?.summary ? (
                  <p className="px-6 pt-3 text-[15px] leading-relaxed text-ink-700">
                    {first.analysis.summary}
                  </p>
                ) : null}

                {nextSteps.length > 0 ? (
                  <ul className="mt-3 space-y-1 px-6">
                    {nextSteps.map((step) => (
                      <li
                        key={step}
                        className={cx(
                          "relative pl-4 text-sm text-ink-500",
                          "before:absolute before:left-0 before:top-2 before:h-1 before:w-1",
                          "before:rounded-full before:bg-ink-300",
                        )}
                      >
                        {step}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ul className="mt-4 divide-y divide-bone-200/80">
                  {list.map((row) => (
                    <ProposalCard key={row.id} row={row} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
