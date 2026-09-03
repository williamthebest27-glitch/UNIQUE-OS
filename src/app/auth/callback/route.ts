import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Atterraggio del link di accesso ricevuto via email.
 *
 * Supabase può inviare due formati a seconda della configurazione del
 * progetto: `code` (flusso PKCE) oppure `token_hash` + `type`. Li
 * gestiamo entrambi, così il collegamento funziona senza dover indovinare
 * come è impostato il progetto.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Solo percorsi interni: un "next" assoluto sarebbe un redirect aperto.
  const richiesto = searchParams.get("next") ?? "/";
  const next =
    richiesto.startsWith("/") && !richiesto.startsWith("//") ? richiesto : "/";

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[auth] scambio del codice fallito:", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[auth] verifica del token fallita:", error.message);
  }

  return NextResponse.redirect(`${origin}/accedi?errore=link`);
}
