import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Client Supabase per i componenti che girano nel browser.
 *
 * La chiave anonima è pubblica per definizione: finisce nel bundle ed è
 * visibile a chiunque. Ciò che protegge i dati non è la chiave, è la Row
 * Level Security.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
