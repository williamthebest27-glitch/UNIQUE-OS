import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { motivoLink } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Accedi" };

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; errore?: string }>;
}) {
  const { da, errore } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          <span className="block font-display text-[26px] leading-none tracking-[0.18em] text-ink-900">
            UNIQUE
          </span>
          <span className="mt-2 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
            Longevity Clinic
          </span>
        </div>

        <div className="mt-9 rounded-card bg-white p-7 shadow-card ring-1 ring-bone-200/70 sm:p-8">
          <h1 className="font-display text-[26px] leading-tight text-ink-900">
            Accedi al tuo percorso
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Entra con la tua password. Se preferisci, ti mandiamo un link via
            email.
          </p>

          {errore ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-signal-alert"
            >
              {motivoLink(errore)}
            </p>
          ) : null}

          <div className="mt-6">
            <LoginForm next={da} />
          </div>
        </div>

        {!isSupabaseConfigured() ? (
          <p className="mt-5 text-center text-xs leading-relaxed text-ink-400">
            Supabase non è ancora collegato: l’applicazione gira in modalità
            dimostrativa e l’accesso non è attivo.
          </p>
        ) : (
          <p className="mt-5 text-center text-xs leading-relaxed text-ink-400">
            L’accesso è riservato ai pazienti e ai professionisti di Unique.
            Per problemi, scrivi alla segreteria.
          </p>
        )}
      </div>
    </main>
  );
}
