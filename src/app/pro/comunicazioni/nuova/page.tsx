import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getColleghi, getReparti } from "@/lib/data/comunicazioni";
import { Indietro, Riquadro } from "@/components/clinical/command-center";
import { PageHeading } from "@/components/shell/page-heading";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ModuloNuovaConversazione } from "@/components/comunicazioni/moduli";

export const metadata: Metadata = { title: "Nuova comunicazione" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Aprire una comunicazione.
 *
 * Una pagina e non una finestra modale: aprire una conversazione con
 * quattro destinatari e un paziente collegato è un modulo vero, e un
 * modulo vero dentro una finestra che si chiude cliccando accanto è il
 * modo più rapido per perdere un testo scritto.
 *
 * Il **genere** della conversazione non si chiede: lo decidono i
 * destinatari. Un reparto fra i destinatari la rende una comunicazione
 * di reparto, due persone la rendono un gruppo, una persona sola una
 * diretta. Chiederlo avrebbe permesso una conversazione «diretta» con
 * dentro tre reparti, e nessuno avrebbe capito perché l'elenco la mostra
 * in un altro modo.
 */
export default async function NuovaComunicazionePage({
  searchParams,
}: {
  searchParams: Promise<{ paziente?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>
        <Card className="mt-6">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const { paziente: pazienteId } = await searchParams;

  const [reparti, colleghi] = await Promise.all([getReparti(), getColleghi()]);

  // Il nome serve solo a scriverlo in pagina. Se la Row Level Security
  // non lo restituisce, chi sta guardando non ha titolo su quella
  // persona e la conversazione non deve poterla nominare.
  let pazienteNome: string | null = null;
  if (pazienteId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("patients")
      .select("id, profile:profiles(full_name)")
      .eq("id", pazienteId)
      .maybeSingle();

    pazienteNome =
      (data as unknown as { profile: { full_name: string } | null } | null)?.profile
        ?.full_name ?? null;
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>

      <div className="mt-4">
        <PageHeading
          title="Nuova comunicazione"
          subtitle="A una persona, a un gruppo o a un reparto. Scrivere a un reparto significa che chiunque ne faccia parte la legge — anche chi entrerà domani."
        />
      </div>

      <Riquadro titolo="Destinatari e messaggio" className="mt-6">
        <div className="px-5 pb-5 pt-4">
          <ModuloNuovaConversazione
            colleghi={colleghi}
            reparti={reparti}
            pazienteId={pazienteId ?? null}
            pazienteNome={pazienteNome}
          />
        </div>
      </Riquadro>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        Serve un parere su una persona? Un <strong className="font-medium text-ink-600">consulto</strong> è
        un oggetto con uno stato — aperto, preso in carico, risposto, chiuso — e si
        può contare. Una conversazione no.{" "}
        <a
          href="/pro/comunicazioni/consulti/nuovo"
          className="text-brand-700 underline-offset-4 hover:underline"
        >
          Richiedi un consulto
        </a>
        .
      </p>
    </div>
  );
}
