import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { ScoreHero } from "@/components/patient/score-hero";
import { ProgramCard } from "@/components/patient/cards";
import { ActionsCard, HighlightsCard } from "@/components/patient/lists";

export const metadata: Metadata = { title: "Percorso" };
export const dynamic = "force-dynamic";

export default async function PercorsoPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading
        title="Il tuo percorso"
        subtitle="Lo Score nel tempo, il protocollo in corso e le azioni che lo fanno avanzare."
      />

      <ScoreHero score={data.score} history={data.scoreHistory} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ProgramCard enrollment={data.enrollment} />
        <div className="lg:col-span-2">
          <ActionsCard actions={data.actions} />
        </div>
      </div>

      <HighlightsCard highlights={data.highlights} />
    </div>
  );
}
