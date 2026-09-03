"use server";

import { redirect } from "next/navigation";
import { appUrl, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StatoAccesso } from "@/lib/auth-state";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Invia il link di accesso via email.
 *
 * Nessuna password: un collegamento a scadenza breve è più sicuro di una
 * password che il paziente riuserebbe altrove, e toglie a Unique l’onere
 * di custodirla.
 *
 * Il messaggio di risposta è volutamente identico che l’indirizzo esista
 * o no: dire "questa email non è registrata" permetterebbe a chiunque di
 * scoprire chi è paziente della clinica.
 */
export async function richiediAccesso(
  _prev: StatoAccesso,
  formData: FormData,
): Promise<StatoAccesso> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { esito: "errore", messaggio: "Controlla l’indirizzo email.", email };
  }

  if (!isSupabaseConfigured()) {
    return {
      esito: "errore",
      messaggio:
        "Supabase non è ancora collegato: l’applicazione è in modalità dimostrativa.",
      email,
    };
  }

  // Dopo l’accesso riportiamo l’utente dove stava andando. Accettiamo solo
  // percorsi interni: un "next" che punta altrove sarebbe un redirect aperto.
  const richiesto = String(formData.get("next") ?? "");
  const next =
    richiesto.startsWith("/") && !richiesto.startsWith("//") ? richiesto : "/";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      // I pazienti vengono registrati dalla clinica, non si iscrivono da soli.
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error("[accesso] invio link fallito:", error.message);
    return {
      esito: "errore",
      messaggio: "Non siamo riusciti a inviare il link. Riprova fra poco.",
      email,
    };
  }

  return { esito: "inviato", email };
}

export async function esci() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/accedi");
}
