import type { Metadata } from "next";
import { getPatientDashboard } from "@/lib/data/patient";
import { ScoreHero } from "@/components/patient/score-hero";
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
  const data = await getPatientDashboard();
  const unreadCount = data.notifications.filter((n) => n.readAt === null).length;
  const firstName = data.profile.firstName ?? data.profile.fullName.split(" ")[0];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* ── Saluto ─────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[36px]">
            Ciao {firstName}.
          </h1>
          <p className="mt-1.5 text-sm text-ink-400 first-letter:uppercase">
            {todayFormatter.format(new Date())}
          </p>
        </div>

        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notifiche, ${unreadCount} non lette`
              : "Notifiche"
          }
          className="relative hidden rounded-full bg-white p-2.5 text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-ink-900 md:block"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-jade-500 ring-2 ring-white" />
          ) : null}
        </button>
      </header>

      {/* ── Unique Longevity Score ─────────────────────────────── */}
      <ScoreHero score={data.score} history={data.scoreHistory} />

      {/* ── Il momento presente: cosa succede adesso ───────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <NextVisitCard appointment={data.nextAppointment} />
        <ProgramCard enrollment={data.enrollment} />
        <CreditsCard credits={data.credits} />
      </div>

      {/* ── Cosa fare, cosa è arrivato ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionsCard actions={data.actions} />
        </div>
        <div className="space-y-6">
          <DocumentsCard documents={data.newDocuments} />
          <NotificationsCard notifications={data.notifications} />
        </div>
      </div>

      {/* ── La prova che il percorso funziona ──────────────────── */}
      <HighlightsCard highlights={data.highlights} />
    </div>
  );
}
