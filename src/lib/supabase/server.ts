import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Client Supabase per Server Component, Server Action e Route Handler.
 *
 * Usa la chiave anonima e i cookie di sessione dell’utente, quindi ogni
 * query passa dalla Row Level Security. È deliberato: nemmeno il codice
 * server-side deve poter leggere i dati di un paziente che non gli
 * compete. La chiave service-role, che scavalca la RLS, resta riservata
 * ai job di back-office.
 *
 * `cache` ne fa uno solo per richiesta. Una schermata ne chiedeva anche
 * dieci — uno per ciascuna funzione di lettura — e ognuno rileggeva i
 * cookie e ricostruiva il proprio stato di sessione. Adesso il primo lo
 * crea e gli altri ricevono quello. È sicuro perché il perimetro della
 * cache è la singola richiesta HTTP: due utenti non si incontrano mai.
 */
export const createSupabaseServerClient = cache(async () => {
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
});
