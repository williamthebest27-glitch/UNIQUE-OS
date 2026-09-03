import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { ScoreHero } from "@/components/patient/score-hero";
import { Intro } from "@/components/patient/intro";
import { Reveal, SplitText } from "@/components/motion/reveal";
import {
  CreditsCard,
  NextVisitCard,
  ProgramCard,
} from "@/components/patient/cards";
import {
  ActionsCard,
  DocumentsCard,
  HighlightsCard,
  NotificationsCard,
} from "@/components/patient/lists";
import { BellIcon } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Home" };

// La home è personale e cambia di giorno in giorno: non va mai
// prerenderizzata a build time.
export const dynamic = "force-dynamic";

const todayFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Rome",
});

export default async function PatientHomePage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const unreadCount = data.notifications.filter((n) => n.readAt === null).length;
  const firstName = data.profile.firstName ?? data.profile.fullName.split(" ")[0];

  return (
    <>
      <Intro />

      <div className="space-y-6 lg:space-y-8">
        {/* ── Saluto ─────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-[34px] leading-[1.05] text-ink-900 sm:text-[44px]">
              <SplitText text={`Ciao ${firstName}.`} />
            </h1>
            <p
              className="mt-2 text-sm text-ink-400 first-letter:uppercase"
              data-reveal=""
              style={{ "--i": 3 } as React.CSSProperties}
            >
              {todayFormatter.format(new Date())}
            </p>
          </div>

          <button
            type="button"
            aria-label={
              unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"
            }
            className="relative hidden rounded-full bg-white p-2.5 text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-ink-900 md:block"
            data-reveal=""
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <BellIcon className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-jade-500 ring-2 ring-white" />
            ) : null}
          </button>
        </header>

        {/* ── La Signature ───────────────────────────────────────── */}
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
          <div className="space-y-6">
            <Reveal index={1}>
              <DocumentsCard documents={data.newDocuments} />
            </Reveal>
            <Reveal index={2}>
              <NotificationsCard notifications={data.notifications} />
            </Reveal>
          </div>
        </div>

        {/* ── La prova che il percorso funziona ──────────────────── */}
        <Reveal>
          <HighlightsCard highlights={data.highlights} />
        </Reveal>
      </div>
    </>
  );
}
