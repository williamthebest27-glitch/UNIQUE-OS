import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { situazione } from "@/lib/data/percorso-paziente";
import { getPatientTimeline } from "@/lib/data/timeline";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { PercorsoMappa } from "@/components/patient/percorso-mappa";
import { ProgramCard } from "@/components/patient/cards";
import { HighlightsCard } from "@/components/patient/lists";
import { Timeline } from "@/components/patient/timeline";
import { sezioneDi } from "@/lib/patient/sezioni";

export const metadata: Metadata = { title: "Percorso" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Il percorso.
 *
 * Prima dove sei, poi cosa hai ottenuto, poi tutto quello che è
 * successo. Il punteggio non è più qui — ha una pagina sua — perché
 * questa risponde a una domanda diversa: non *come sto*, ma *a che punto
 * sono*.
 */

const SEZIONE = sezioneDi("/percorso")!;

function giornoDelPercorso(inizio: string): number {
  const da = Date.parse(`${inizio.slice(0, 10)}T00:00:00Z`);
  const oggi = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(1, Math.round((oggi - da) / 86_400_000) + 1);
}

export default async function PercorsoPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const [stato, eventi] = await Promise.all([situazione(data), getPatientTimeline()]);

  const iscrizione = data.enrollment;
  const giorno = iscrizione ? giornoDelPercorso(iscrizione.startedOn) : null;
  const giorniTotali =
    iscrizione?.endsOn && iscrizione.startedOn
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${iscrizione.endsOn}T00:00:00Z`) -
              Date.parse(`${iscrizione.startedOn}T00:00:00Z`)) /
              86_400_000,
          ),
        )
      : null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <PercorsoMappa fase={stato.fase} giorno={giorno} giorniTotali={giorniTotali} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ProgramCard enrollment={iscrizione} />
        <div className="lg:col-span-2">
          <HighlightsCard highlights={data.highlights} />
        </div>
      </div>

      <Timeline events={eventi} />
    </div>
  );
}
