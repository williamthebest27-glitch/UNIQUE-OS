import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { SEZIONI_PAZIENTE } from "@/lib/sezioni";
import { ScoreHero } from "@/components/patient/score-hero";
import { ProgramCard } from "@/components/patient/cards";
import { ActionsCard, HighlightsCard } from "@/components/patient/lists";
import { Timeline } from "@/components/patient/timeline";
import { getPatientTimeline } from "@/lib/data/timeline";

export const metadata: Metadata = { title: "Percorso" };
export const dynamic = "force-dynamic";

export default async function PercorsoPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading {...SEZIONI_PAZIENTE.percorso} />

      <ScoreHero score={data.score} history={data.scoreHistory} seed={data.profile.id} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ProgramCard enrollment={data.enrollment} />
        <div className="lg:col-span-2">
          <ActionsCard actions={data.actions} />
        </div>
      </div>

      <HighlightsCard highlights={data.highlights} />

      <Timeline events={await getPatientTimeline()} />
    </div>
  );
}
