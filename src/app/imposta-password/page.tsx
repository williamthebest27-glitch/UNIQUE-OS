import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import { Logotipo } from "@/components/brand/marchio";

export const metadata: Metadata = { title: "Scegli la password" };
export const dynamic = "force-dynamic";

/**
 * Dove si sceglie la password.
 *
 * Ci si arriva dal collegamento ricevuto via email — che apre una
 * sessione e atterra qui — oppure da dentro, per cambiarla. In entrambi i
 * casi serve una sessione: `requireProfile` porta all'accesso chi non ce
 * l'ha, e il proxy lo farebbe comunque.
 *
 * Deliberatamente fuori dal guscio del paziente: chi arriva qui potrebbe
 * essere un medico o chi sta in amministrazione, e la barra laterale con
 * "il tuo percorso" sarebbe fuori posto.
 */
export default async function ImpostaPasswordPage() {
  const profile = await requireProfile();

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          <Logotipo className="mx-auto w-[224px]" />
        </div>

        <div className="mt-9 rounded-card bg-white p-7 shadow-card ring-1 ring-bone-200/70 sm:p-8">
          <h1 className="font-display text-[26px] leading-tight text-ink-900">
            Scegli la tua password
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Da adesso entrerai direttamente, senza aspettare l’email.
            {profile.email ? (
              <>
                {" "}
                L’account è <span className="font-medium text-ink-800">{profile.email}</span>.
              </>
            ) : null}
          </p>

          <div className="mt-6">
            <PasswordForm />
          </div>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-400">
          Qui dentro ci sono dati sanitari: questa password non va riusata
          altrove, e non va scritta in una chat.
        </p>
      </div>
    </main>
  );
}
