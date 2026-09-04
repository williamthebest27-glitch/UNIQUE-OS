import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { esci } from "@/lib/auth-actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { contatoriNav } from "@/lib/data/paziente-sezioni";
import { ColonnaPaziente, PatientTabBar } from "@/components/shell/patient-nav";
import { BellIcon } from "@/components/ui/primitives";

/**
 * Il guscio della Patient App.
 *
 * Fondo chiaro, spazio largo, una sola cosa alla volta: è l'opposto del
 * Control Center, e deve esserlo. Al paziente serve calma; a chi dirige
 * serve vedere tutto insieme.
 */

function Wordmark() {
  return (
    <Link href="/dashboard" className="block">
      <span className="block font-display text-[22px] leading-none tracking-[0.18em] text-ink-900">
        UNIQUE
      </span>
      <span className="mt-1.5 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
        Longevity Clinic
      </span>
    </Link>
  );
}

function Initials({ name }: { name: string }) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[13px] font-semibold text-bone-50"
    >
      {initials}
    </span>
  );
}

/** Avviso onesto: senza database, quelli mostrati non sono dati reali. */
function DemoBadge() {
  return (
    <p className="rounded-lg bg-gold-100 px-2.5 py-1.5 text-[11px] leading-snug text-gold-600">
      Modalità dimostrativa — dati di esempio
    </p>
  );
}

function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={esci}>
      <button type="submit" className={className}>
        Esci
      </button>
    </form>
  );
}

/** La campanella, con il pallino solo quando c'è davvero qualcosa. */
function Campanella({ nonLette }: { nonLette: number }) {
  return (
    <Link
      href="/notifiche"
      aria-label={nonLette > 0 ? `Notifiche, ${nonLette} non lette` : "Notifiche"}
      className="relative rounded-full p-2 text-ink-500 transition-colors hover:bg-bone-100 hover:text-ink-900"
    >
      <BellIcon className="h-5 w-5" />
      {nonLette > 0 ? (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-bone-50" />
      ) : null}
    </Link>
  );
}

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const demo = !isSupabaseConfigured();
  const contatori = await contatoriNav();

  return (
    <div className="min-h-dvh md:flex">
      <ColonnaPaziente
        marchio={<Wordmark />}
        marchioStretto={
          <Link
            href="/dashboard"
            aria-label="Unique — vai alla home"
            className="font-display text-[26px] leading-none text-ink-900"
          >
            U
          </Link>
        }
        messaggiNonLetti={contatori.messaggiNonLetti}
        questionariDaFare={contatori.questionariDaFare}
        piede={
          <div className="space-y-4 border-t border-bone-200 pt-5">
            {demo ? <DemoBadge /> : null}
            <div className="flex items-center gap-3">
              <Initials name={profile.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{profile.fullName}</p>
                <LogoutButton className="text-xs text-ink-400 transition-colors hover:text-ink-700" />
              </div>
              <Campanella nonLette={contatori.notificheNonLette} />
            </div>
          </div>
        }
      />

      {/* Barra superiore, solo su telefono. */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-bone-200 bg-bone-50/95 px-5 py-3.5 backdrop-blur md:hidden">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Campanella nonLette={contatori.notificheNonLette} />
          <LogoutButton className="rounded-full px-2.5 py-2 text-xs text-ink-500 transition-colors hover:bg-bone-100" />
        </div>
      </header>

      {/* pb-24 lascia spazio alla barra in fondo su telefono. */}
      <main className="min-w-0 flex-1 px-5 pt-6 pb-24 sm:px-8 md:pb-12 lg:px-12 lg:pt-10">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>

      <PatientTabBar
        messaggiNonLetti={contatori.messaggiNonLetti}
        questionariDaFare={contatori.questionariDaFare}
      />
    </div>
  );
}
