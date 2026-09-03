import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * Client con chiave service-role: **scavalca la Row Level Security**.
 *
 * Serve a un caso solo, in questo progetto: quando un paziente carica un
 * proprio referto e il motore deve analizzarlo. Il paziente non può — e
 * non deve — scrivere in `document_analyses` o `measurement_proposals`,
 * altrimenti vedrebbe valori non ancora validati.
 *
 * Regola d’uso, senza eccezioni: il controllo di autorizzazione va fatto
 * **prima**, con il client di sessione dell’utente. Questo client si usa
 * solo dopo, per la sola scrittura privilegiata, su un paziente già
 * verificato. Non va mai usato per decidere cosa un utente può vedere.
 */

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isServiceRoleConfigured(): boolean {
  return supabaseUrl.length > 0 && serviceKey.length > 0;
}

export function createSupabaseServiceClient() {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY non è impostata: nessuna operazione privilegiata è possibile.",
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
