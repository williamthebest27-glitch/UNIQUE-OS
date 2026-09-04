import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { situazione } from "@/lib/data/percorso-paziente";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { AssistenteChat } from "@/components/patient/assistente-chat";
import { sezioneDi } from "@/lib/patient/sezioni";

export const metadata: Metadata = { title: "Chiedi a Unique" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Chiedi a Unique.
 *
 * Il contesto lo compone il server dai dati che quel paziente ha già
 * davanti in altre pagine — non un dato in più. La domanda non raggiunge
 * nessun servizio esterno: risponde il motore proprietario, in casa.
 */

const SEZIONE = sezioneDi("/assistente")!;

export default async function AssistentePage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const stato = await situazione(data);

  return (
    <div className="space-y-6">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <AssistenteChat contesto={stato.contestoAssistente} />

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Le domande e le risposte non vengono conservate: chiudendo la pagina la
        conversazione finisce. Non è un limite tecnico — è la scelta di non
        creare un archivio di domande sulla salute che poi andrebbe protetto,
        cancellato ed esportato.
      </p>
    </div>
  );
}
