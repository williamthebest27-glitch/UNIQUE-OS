import type { Metadata } from "next";
import { getPatientDashboard } from "@/lib/data/patient";
import { PageHeading } from "@/components/shell/page-heading";
import { NextVisitCard } from "@/components/patient/cards";

export const metadata: Metadata = { title: "Appuntamenti" };
export const dynamic = "force-dynamic";

export default async function AppuntamentiPage() {
  const data = await getPatientDashboard();

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading
        title="Appuntamenti"
        subtitle="Le visite in programma e lo storico dei tuoi controlli in clinica."
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <NextVisitCard appointment={data.nextAppointment} />
      </div>
    </div>
  );
}
