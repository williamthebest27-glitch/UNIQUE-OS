import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getColleghi, getReparti } from "@/lib/data/comunicazioni";
import { Indietro, Riquadro } from "@/components/clinical/command-center";
import { PageHeading } from "@/components/shell/page-heading";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ModuloConsulto } from "@/components/comunicazioni/moduli";

export const metadata: Metadata = { title: "Nuovo consulto" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Chiedere un parere.
 *
 * L'elenco dei pazienti da cui si sceglie è quello che la Row Level
 * Security restituisce a chi sta guardando: i propri. Non c'è un campo
 * di ricerca su tutti i pazienti della clinica, e non è una mancanza —
 * chiedere un consulto su una persona che non si segue non è un caso
 * d'uso, è un accesso.
 *
 * I reparti destinatari sono solo quelli **clinici**: ad accoglienza e
 * amministrazione un consulto non si chiede, e mostrarli avrebbe
 * prodotto un errore dopo il clic invece che un'opzione assente prima.
 */
export default async function NuovoConsultoPage({
  searchParams,
}: {
  searchParams: Promise<{ paziente?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/comunicazioni/consulti">Consulti</Indietro>
        <Card className="mt-6">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const { paziente: pazienteId } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [reparti, colleghi, pazientiRes] = await Promise.all([
    getReparti(),
    getColleghi(),
    supabase
      .from("patients")
      .select("id, profile:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const pazienti = ((pazientiRes.data ?? []) as unknown as {
    id: string;
    profile: { full_name: string } | null;
  }[])
    .map((p) => ({ id: p.id, nome: p.profile?.full_name ?? "Paziente" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  const pazienteNome = pazienteId
    ? (pazienti.find((p) => p.id === pazienteId)?.nome ?? null)
    : null;

  const clinici = reparti.filter((r) => r.clinico);

  return (
    <div className="mx-auto max-w-[760px]">
      <Indietro href="/pro/comunicazioni/consulti">Consulti</Indietro>

      <div className="mt-4">
        <PageHeading
          title="Nuovo consulto"
          subtitle="Una richiesta di parere con uno stato: aperto, preso in carico, in valutazione, risposto, chiuso. È ciò che una conversazione non sa dire."
        />
      </div>

      {clinici.length === 0 ? (
        <Card className="mt-6">
          <EmptyState>
            Non ci sono reparti clinici configurati. La direzione li crea da
            «Reparti» nel Control Center.
          </EmptyState>
        </Card>
      ) : pazienti.length === 0 ? (
        <Card className="mt-6">
          <EmptyState>
            Non segui ancora nessun paziente: un consulto si chiede su una persona
            di cui si ha la cartella.
          </EmptyState>
        </Card>
      ) : (
        <Riquadro titolo="La richiesta" className="mt-6">
          <div className="px-5 pb-5 pt-4">
            <ModuloConsulto
              reparti={clinici}
              colleghi={colleghi}
              pazienteId={pazienteId ?? null}
              pazienteNome={pazienteNome}
              pazienti={pazienti}
            />
          </div>
        </Riquadro>
      )}
    </div>
  );
}
