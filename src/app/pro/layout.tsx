import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getProNavCounts } from "@/lib/data/professional";
import { ProSidebarNav, ProTabBar, type ProCounts } from "@/components/shell/pro-nav";
import { BarraSuperiore } from "@/components/shell/barra-utente";
import { Marchio } from "@/components/brand/marchio";

/**
 * L'area clinica.
 *
 * Stessa lingua visiva della dashboard del paziente — carta, calma, un
 * solo accento — perché è la stessa applicazione vista da un altro lato,
 * non un gestionale a parte. Cambia la mappa: qui la colonna di sinistra
 * elenca il lavoro di una giornata clinica.
 */

function Wordmark() {
  return (
    <Link href="/pro" className="flex items-center gap-3">
      <Marchio className="h-9 w-auto shrink-0" />
      <span className="min-w-0">
        <span className="block font-display text-[22px] leading-none tracking-[0.18em] text-ink-900">
          UNIQUE
        </span>
        <span className="mt-1.5 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
          Area clinica
        </span>
      </span>
    </Link>
  );
}

/** Il marchio per la barra sul telefono: il simbolo, non il logotipo. */
function Simbolo() {
  return (
    <Link
      href="/pro"
      aria-label="Unique — vai all'area clinica"
      className="flex shrink-0"
    >
      <Marchio className="h-8 w-auto" />
    </Link>
  );
}

function DemoBadge() {
  return (
    <p className="rounded-lg bg-gold-100 px-2.5 py-1.5 text-[11px] leading-snug text-gold-600">
      Modalità dimostrativa — dati di esempio
    </p>
  );
}

export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // Un paziente qui non ci deve arrivare: ha una sua home.
  if (profile.role === "patient") redirect("/dashboard");

  const demo = !isSupabaseConfigured();
  // Senza database non c'è nulla da contare, e la query fallirebbe.
  const counts: ProCounts = demo
    ? { revisioni: 0, task: 0, documenti: 0, messaggi: 0 }
    : await getProNavCounts();

  return (
    <div className="min-h-dvh md:flex">
      {/* Colonna di navigazione, da tablet in su. */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-bone-200 bg-bone-50 px-5 py-7 md:flex lg:w-[264px]">
        <Wordmark />

        <div className="mt-9 flex-1">
          <ProSidebarNav counts={counts} />
        </div>

        {demo ? (
          <div className="border-t border-bone-200 pt-5">
            <DemoBadge />
          </div>
        ) : null}
      </aside>

      {/* Barra e contenuto in colonna: così la barra resta in cima al
          contenuto, a fianco del menu e non sopra di esso. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperiore simbolo={<Simbolo />} nome={profile.fullName} />

        {/* pb-24 lascia spazio alla tab bar su telefono. */}
        <main className="min-w-0 flex-1 px-5 pt-6 pb-24 sm:px-8 md:pb-12 lg:px-12 lg:pt-10">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      <ProTabBar counts={counts} />
    </div>
  );
}
