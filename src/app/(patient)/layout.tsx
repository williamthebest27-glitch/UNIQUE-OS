import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { contatoriNav } from "@/lib/data/paziente-sezioni";
import { ColonnaPaziente, PatientTabBar } from "@/components/shell/patient-nav";
import { BarraSuperiore } from "@/components/shell/barra-utente";
import { BellIcon, cx } from "@/components/ui/primitives";
import { Marchio } from "@/components/brand/marchio";

/**
 * Il guscio della Patient App.
 *
 * Fondo chiaro, spazio largo, una sola cosa alla volta: è l'opposto del
 * Control Center, e deve esserlo. Al paziente serve calma; a chi dirige
 * serve vedere tutto insieme.
 */

function Wordmark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <Marchio className="h-9 w-auto shrink-0" />
      <span className="min-w-0">
        <span className="block font-display text-[22px] leading-none tracking-[0.18em] text-ink-900">
          UNIQUE
        </span>
        <span className="mt-1.5 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
          Longevity Clinic
        </span>
      </span>
    </Link>
  );
}

/**
 * Il marchio dove lo spazio è poco: la colonna stretta e la barra sul
 * telefono. Il logotipo per esteso non è rimpicciolito, è tolto — sotto
 * una certa larghezza «Longevity Clinic» in maiuscoletto spaziato non si
 * legge più, occupa soltanto.
 */
function Simbolo({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Unique — vai alla home"
      className={cx("flex shrink-0", className)}
    >
      <Marchio className="h-8 w-auto" />
    </Link>
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
        marchioStretto={<Simbolo className="justify-center" />}
        messaggiNonLetti={contatori.messaggiNonLetti}
        questionariDaFare={contatori.questionariDaFare}
        piede={demo ? <DemoBadge /> : null}
      />

      {/* Barra e contenuto in colonna: così la barra resta in cima al
          contenuto, a fianco del menu e non sopra di esso. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperiore
          simbolo={<Simbolo />}
          nome={profile.fullName}
          azioni={<Campanella nonLette={contatori.notificheNonLette} />}
        />

        {/* pb-24 lascia spazio alla barra in fondo su telefono. */}
        <main className="min-w-0 flex-1 px-5 pt-6 pb-24 sm:px-8 md:pb-12 lg:px-12 lg:pt-10">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      <PatientTabBar
        messaggiNonLetti={contatori.messaggiNonLetti}
        questionariDaFare={contatori.questionariDaFare}
      />
    </div>
  );
}
