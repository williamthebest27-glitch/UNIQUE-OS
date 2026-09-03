import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Client Supabase per Server Component, Server Action e Route Handler.
 *
 * Usa la chiave anonima e i cookie di sessione dell’utente, quindi ogni
 * query passa dalla Row Level Security. È deliberato: nemmeno il codice
 * server-side deve poter leggere i dati di un paziente che non gli
 * compete. La chiave service-role, che scavalca la RLS, resta riservata
 * ai job di back-office.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // I Server Component non possono scrivere cookie. Non è un
          // errore: la rotazione del token la fa il proxy a ogni
          // richiesta, e qui non c’è nulla da fare.
        }
      },
    },
  });
}
