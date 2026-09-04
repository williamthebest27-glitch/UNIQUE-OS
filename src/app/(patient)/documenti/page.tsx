import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { DocumentsCard } from "@/components/patient/lists";
import { UploadForm } from "@/components/documents/upload-form";
import { Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documenti" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

export default async function DocumentiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={sezioneDi("/documenti")!.titolo} subtitle={sezioneDi("/documenti")!.sottotitolo} />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader
            title="Carica un documento"
            hint="Esami, referti, prescrizioni. Alla classificazione e alla lettura dei valori pensiamo noi."
          />
          <div className="px-6 pb-6 pt-3">
            <UploadForm />
          </div>
        </Card>

        <DocumentsCard documents={data.newDocuments} />
      </div>
    </div>
  );
}
