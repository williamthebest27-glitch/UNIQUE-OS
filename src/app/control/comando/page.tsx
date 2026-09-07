import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathForRole, requireProfile } from "@/lib/auth";
import { getStatoClinica } from "@/lib/data/stato-clinica";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Comando } from "@/components/control/comando";
import { PolsoClinica } from "@/components/control/polso";
import { Panel, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Comando" };

/**
 * Niente cache: è una schermata che risponde alla domanda «adesso».
 * Un valore vecchio di trenta secondi qui è peggio di nessun valore,
 * perché non si distingue da uno fresco.
 */
export const dynamic = "force-dynamic";

export default async function ComandoPage() {
  // Reception e marketing entrano nel Control Center ma non da qui: le
  // code sono cliniche, e a loro la Row Level Security restituirebbe
  // comunque una schermata di zeri. Portarli dove hanno qualcosa da
  // fare è meglio che mostrargliela.
  const profile = await requireProfile();
  if (profile.role === "reception" || profile.role === "marketing") {
    redirect(homePathForRole(profile.role));
  }

  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Clinical Command">
        <Vuoto>
          Supabase non è collegato: in modalità dimostrativa non c&apos;è uno stato da leggere.
        </Vuoto>
      </Panel>
    );
  }

  const stato = await getStatoClinica();

  return (
    <div className="space-y-6">
      <Comando stato={stato} />
      <PolsoClinica />
    </div>
  );
}
