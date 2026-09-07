import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { livelloAccesso, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Marchio } from "@/components/brand/marchio";
import { SfidaSecondoFattore } from "@/components/shell/sfida-secondo-fattore";

export const metadata: Metadata = { title: "Verifica" };
export const dynamic = "force-dynamic";

/**
 * Il secondo passaggio.
 *
 * Ci si arriva quando un account ha un fattore configurato e non l'ha
 * usato in questa sessione. È il passaggio che rende utile l'iscrizione:
 * senza, attivare l'MFA aggiungerebbe una spunta verde in una pagina di
 * impostazioni e niente altro — un cookie rubato porterebbe dentro
 * esattamente come prima.
 *
 * La pagina sta fuori dalle aree cliniche di proposito. Il loro layout è
 * ciò che rimanda qui, e se questa vivesse dentro uno di essi si
 * rimanderebbe a sé stessa.
 *
 * Chi è già a `aal2` non ci deve restare: rimbalza dove stava andando.
 * Una schermata di verifica che compare a chi si è già verificato è il
 * modo più rapido per insegnare a cliccare senza leggere.
 */
export default async function VerificaPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  await requireProfile();

  const { da } = await searchParams;

  /*
   * La destinazione arriva dall'indirizzo, quindi non è fidata.
   *
   * Solo un percorso interno, che comincia per una barra e non per due:
   * `//altrosito.it` è un URL assoluto valido per il browser, e
   * rimandarci sopra dopo un accesso è la forma classica di open
   * redirect.
   */
  const destinazione = da && /^\/[^/]/.test(da) ? da : "/app";

  if (!isSupabaseConfigured()) redirect(destinazione);

  const livello = await livelloAccesso();
  if (!livello.deveVerificare) redirect(destinazione);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bone-100 px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3">
          <Marchio className="h-9 w-auto shrink-0" />
          <span>
            <span className="block font-display text-[20px] leading-none tracking-[0.18em] text-ink-900">
              UNIQUE
            </span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
              Verifica
            </span>
          </span>
        </div>

        <h1 className="mt-8 font-display text-[26px] leading-tight text-ink-900">
          Il codice dall’app di autenticazione.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
          Hai attivato la verifica in due passaggi su questo account. Senza il
          codice non si entra: è quello che sta fra una password rubata e la
          cartella clinica di qualcuno.
        </p>

        <div className="mt-6 rounded-card bg-white p-6 shadow-card ring-1 ring-bone-200/70">
          <SfidaSecondoFattore destinazione={destinazione} />
        </div>

        <p className="mt-5 text-xs leading-relaxed text-ink-400">
          Hai perso il dispositivo? Il secondo fattore lo può togliere solo chi
          entra: scrivi a chi amministra il progetto Supabase, che può rimuovere
          il fattore dal pannello di autenticazione.
        </p>
      </div>
    </main>
  );
}
