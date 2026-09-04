import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeControlSection, homePathForRole, requireProfile } from "@/lib/auth";
import { esci } from "@/lib/auth-actions";
import { ControlNav } from "@/components/control/control-nav";

/**
 * Il Control Center.
 *
 * Deliberatamente diverso dall'app paziente: fondo scuro, numeri densi,
 * niente respiro. Sono due mestieri diversi — al paziente serve calma,
 * a chi dirige serve vedere tutto insieme.
 *
 * Ci entrano quattro ruoli e ciascuno ne vede una parte: la direzione
 * tutto, la reception l'agenda e il CRM, il marketing le campagne. Il
 * menu segue il ruolo; i dati li filtra comunque la Row Level Security.
 */

const SEZIONI = [
  { href: "/control", label: "Oggi" },
  { href: "/control/brain", label: "Brain" },
  { href: "/control/agenda", label: "Agenda" },
  { href: "/control/economia", label: "Economia" },
  { href: "/control/capacita", label: "Capacità" },
  { href: "/control/crm", label: "CRM" },
  { href: "/control/task", label: "Task" },
  { href: "/control/approvazioni", label: "Approvazioni" },
  { href: "/control/marketing", label: "Marketing" },
  { href: "/control/contenuti", label: "Contenuti" },
  { href: "/control/conoscenza", label: "Conoscenza" },
] as const;

export default async function ControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // Paziente e professionista hanno la loro area.
  if (!["admin", "owner", "reception", "marketing"].includes(profile.role)) {
    redirect(homePathForRole(profile.role));
  }

  const voci = SEZIONI.filter((s) => canSeeControlSection(profile.role, s.href));

  return (
    <div className="min-h-dvh bg-ink-900">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/control" className="block">
            <span className="block font-display text-[20px] leading-none tracking-[0.18em] text-bone-50">
              UNIQUE
            </span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.28em] text-bone-50/50">
              Control Center
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-bone-50/60">{profile.fullName}</span>
            <form action={esci}>
              <button
                type="submit"
                className="text-sm text-bone-50/50 transition-colors hover:text-bone-50"
              >
                Esci
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <ControlNav voci={voci} />
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 py-8 pb-20 sm:px-8">{children}</main>
    </div>
  );
}
