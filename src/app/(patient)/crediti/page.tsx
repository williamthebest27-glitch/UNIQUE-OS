import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { CreditsCard } from "@/components/patient/cards";

export const metadata: Metadata = { title: "Crediti" };
export const dynamic = "force-dynamic";

export default async function CreditiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading
        title="Crediti e membership"
        subtitle="Il saldo, i movimenti e la membership attiva. Ogni credito accreditato o consumato resta tracciato."
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <CreditsCard credits={data.credits} />
      </div>
    </div>
  );
}
