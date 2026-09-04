import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { motivoLink } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Logotipo } from "@/components/brand/marchio";

export const metadata: Metadata = { title: "Accedi" };

/**
 * Le tre porte, e da quale si entra.
 *
 * La landing manda qui in due modi diversi: «Accedi» apre la strada
 * normale, con la password; «Registrati» apre quella della *scelta*
 * della password. Non è un vezzo di parametri: alla Unique gli account
 * li crea la clinica — `richiediAccesso` chiede a Supabase
 * `shouldCreateUser: false`, e non per distrazione — quindi la prima
 * cosa che fa una persona nuova non è iscriversi, è attivare l'accesso
 * che le è già stato aperto.
 *
 * Il testo cambia con la porta, perché la stessa schermata risponde a
 * due domande diverse: «come rientro» e «come comincio».
 */

type Modo = "password" | "link" | "attiva";

const MODI: Record<Modo, { titolo: string; testo: string; iniziale: "password" | "link" | "reimposta" }> = {
  password: {
    titolo: "Accedi al tuo percorso",
    testo: "Entra con la tua password. Se preferisci, ti mandiamo un link via email.",
    iniziale: "password",
  },
  link: {
    titolo: "Entra con un link",
    testo: "Ti mandiamo un collegamento a scadenza breve: nessuna password da ricordare.",
    iniziale: "link",
  },
  attiva: {
    titolo: "Attiva il tuo accesso",
    testo:
      "L’account a Unique lo apre la clinica: qui scegli la password la prima volta. Ti mandiamo il collegamento all’indirizzo che hai lasciato in segreteria.",
    iniziale: "reimposta",
  },
};

function modoValido(valore: string | undefined): Modo {
  return valore === "link" || valore === "attiva" ? valore : "password";
}

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; errore?: string; modo?: string }>;
}) {
  const { da, errore, modo } = await searchParams;
  const scelto = modoValido(modo);
  const copia = MODI[scelto];

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          {/* Il marchio riporta alla presentazione: chi è arrivato qui per
              sbaglio, o vuole solo capire cos'è Unique OS, ha una strada
              indietro che non è il tasto del browser. */}
          <Link href="/" className="inline-block" aria-label="Unique OS">
            <Logotipo className="mx-auto w-[224px]" />
          </Link>
        </div>

        <div className="mt-9 rounded-card bg-white p-7 shadow-card ring-1 ring-bone-200/70 sm:p-8">
          <h1 className="font-display text-[26px] leading-tight text-ink-900">
            {copia.titolo}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{copia.testo}</p>

          {errore ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-signal-alert"
            >
              {motivoLink(errore)}
            </p>
          ) : null}

          <div className="mt-6">
            <LoginForm next={da} iniziale={copia.iniziale} />
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
            {scelto === "attiva"
              ? " Se non sei ancora paziente della clinica, scrivi alla segreteria: l’account lo apriamo noi."
              : " Per problemi, scrivi alla segreteria."}
          </p>
        )}
      </div>
    </main>
  );
}
