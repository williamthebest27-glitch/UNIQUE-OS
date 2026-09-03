import type { Metadata } from "next";
import { getPatientDashboard } from "@/lib/data/patient";
import { PageHeading } from "@/components/shell/page-heading";
import { DocumentsCard } from "@/components/patient/lists";

export const metadata: Metadata = { title: "Documenti" };
export const dynamic = "force-dynamic";

export default async function DocumentiPage() {
  const data = await getPatientDashboard();

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading
        title="Documenti e risultati"
        subtitle="Referti, esami e piani di cura. Ogni file resta accessibile solo a te e ai professionisti che ti seguono."
      />
      <div className="max-w-3xl">
        <DocumentsCard documents={data.newDocuments} />
      </div>
    </div>
  );
}
