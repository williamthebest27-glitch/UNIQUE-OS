import type { Metadata } from "next";
import Link from "next/link";
import { requirePatientDashboard } from "@/lib/data/patient";
import { situazione } from "@/lib/data/percorso-paziente";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { ScoreHero } from "@/components/patient/score-hero";
import { Reveal, SplitText } from "@/components/motion/reveal";
import { ProssimoPasso } from "@/components/patient/prossimo-passo";
import { CreditsCard, NextVisitCard, ProgramCard } from "@/components/patient/cards";
import { ActionsCard, DocumentsCard, HighlightsCard } from "@/components/patient/lists";
import { ChevronIcon } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Home" };

// La home è personale e cambia di giorno in giorno: non va mai
// prerenderizzata a build time.
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * La home del paziente.
 *
 * L'ordine è una gerarchia, non un'impaginazione. Prima **cosa fare
 * adesso**, perché è la domanda con cui si apre un'app di salute; poi
 * **come sto**, che è la ragione per cui si torna; poi il presente
 * concreto — la prossima visita, il percorso, i crediti; poi ciò che è
 * arrivato. I progressi chiudono, perché sono la prova che il percorso
 * funziona e si guardano volentieri per ultimi.
 */

const oggiFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Rome",
});

export default async function PatientHomePage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const stato = await situazione(data);
  const firstName = data.profile.firstName ?? data.profile.fullName.split(" ")[0];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* ── Saluto ─────────────────────────────────────────────── */}
      <header>
        <h1 className="font-display text-[34px] leading-[1.05] text-ink-900 sm:text-[44px]">
          <SplitText text={`Ciao ${firstName}.`} />
        </h1>
        <p
          className="mt-2 text-sm text-ink-400 first-letter:uppercase"
          data-reveal=""
          style={{ "--i": 3 } as React.CSSProperties}
        >
          {oggiFormatter.format(new Date())} · {stato.fase.reason}
        </p>
      </header>

      {/* ── Cosa fare adesso ───────────────────────────────────── */}
      <Reveal index={0}>
        <ProssimoPasso passi={stato.passi} />
      </Reveal>

      {/* ── Come sto ───────────────────────────────────────────── */}
      <Reveal index={1}>
        <ScoreHero score={data.score} history={data.scoreHistory} seed={data.profile.id} />
      </Reveal>

      {/* ── Il momento presente ────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Reveal index={0}>
          <NextVisitCard appointment={data.nextAppointment} />
        </Reveal>
        <Reveal index={1}>
          <ProgramCard enrollment={data.enrollment} />
        </Reveal>
        <Reveal index={2}>
          <CreditsCard membership={data.membership} />
        </Reveal>
      </div>

      {/* ── Cosa fare, cosa è arrivato ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2" index={0}>
          <ActionsCard actions={data.actions} />
        </Reveal>
        <Reveal index={1}>
          <DocumentsCard documents={data.newDocuments} />
        </Reveal>
      </div>

      {/* ── La prova che il percorso funziona ──────────────────── */}
      <Reveal>
        <HighlightsCard highlights={data.highlights} />
      </Reveal>

      <Reveal>
        <Link
          href="/assistente"
          className="group flex items-center gap-4 rounded-card bg-ink-900 px-6 py-5 text-bone-50 transition-colors hover:bg-ink-800"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[20px] leading-tight">Chiedi a Unique</span>
            <span className="mt-1 block text-sm text-bone-50/55">
              Come sto andando, cosa è cambiato, cosa mi conviene fare. Risponde con i tuoi dati,
              senza mandarli da nessuna parte.
            </span>
          </span>
          <ChevronIcon className="h-5 w-5 shrink-0 text-bone-50/50 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Reveal>
    </div>
  );
}
