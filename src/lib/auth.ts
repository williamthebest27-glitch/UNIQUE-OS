import { redirect } from "next/navigation";
import { cache } from "react";
import type { AppRole, Profile } from "@/lib/domain/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";

/** Riga della tabella `profiles`, per come la legge questa applicazione. */
interface ProfileRow {
  id: string;
  role: AppRole;
  full_name: string;
  first_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    firstName: row.first_name,
    email: row.email,
    avatarUrl: row.avatar_url,
  };
}

/** Il minimo che serve sapere di chi sta chiedendo la pagina. */
interface Identita {
  id: string;
  email: string | null;
  fullName: string | null;
}

/**
 * Chi è collegato, verificato.
 *
 * `getClaims()` controlla la firma del token con la chiave pubblica del
 * progetto, in locale: la stessa garanzia di `getUser()` — il cookie non
 * viene creduto sulla parola — ma senza un viaggio di rete fino a
 * Supabase a ogni richiesta. Era il costo fisso che rendeva lente le
 * sezioni: prima che partisse una query sui dati, l’applicazione aveva
 * già fatto tre o quattro di quei viaggi, uno in fila all’altro.
 *
 * Con le vecchie chiavi simmetriche la libreria ricade da sé su
 * `getUser()`: nulla si rompe, nulla peggiora. Attivando le chiavi
 * asimmetriche su Supabase, il controllo diventa gratuito ovunque.
 */
async function identitaVerificata(): Promise<Identita | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (claims?.sub) {
    return {
      id: claims.sub,
      email: claims.email ?? null,
      fullName: (claims.user_metadata?.full_name as string | undefined) ?? null,
    };
  }

  // Nessun errore e nessun claim vuol dire una cosa sola: non c’è sessione.
  if (!error) return null;

  // Il token c’è ma non si è potuto verificare qui: l’ultima parola spetta
  // al server di autenticazione, non al cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
  };
}

/**
 * Profilo dell’utente collegato, o null se non c’è sessione.
 * In modalità dimostrativa restituisce il paziente di esempio.
 *
 * Memoizzato per richiesta. Il layout lo chiede, la pagina lo chiede, e
 * ogni funzione di lettura lo richiede per sapere chi sta guardando:
 * erano altrettante coppie di andata e ritorno verso Supabase, in fila
 * una dopo l’altra, prima che comparisse un solo dato. Adesso è una
 * sola, e le altre cinquanta ricevono la stessa risposta.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) {
    return mockPatientDashboard.profile;
  }

  const identita = await identitaVerificata();
  if (!identita) return null;

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, first_name, email, avatar_url")
    .eq("id", identita.id)
    .maybeSingle();

  const row = data as ProfileRow | null;

  // Il profilo viene creato da un trigger su auth.users. Se manca — utente
  // creato prima delle migrazioni, o trigger non installato — non lasciamo
  // l’applicazione in uno stato ambiguo: ricadiamo su un profilo minimo
  // costruito dai dati dell’account.
  if (!row) {
    return {
      id: identita.id,
      role: "patient",
      fullName: identita.fullName ?? identita.email ?? "",
      firstName: null,
      email: identita.email,
      avatarUrl: null,
    };
  }

  return toProfile(row);
});

/** Come sopra, ma porta al login invece di restituire null. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/accedi");
  return profile;
}

/** Il percorso in cui vive ciascun ruolo. */
export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "patient":
      return "/dashboard";
    case "professional":
      return "/pro";
    case "reception":
      // La reception apre la giornata dall’agenda, non dai numeri.
      return "/control/agenda";
    case "marketing":
      return "/control/marketing";
    case "admin":
    case "owner":
      // Chi dirige entra dalla control room, non dall agenda clinica.
      return "/control";
  }
}

/**
 * Chi può entrare nel Control Center, e con quali sezioni.
 *
 * Il ruolo decide cosa si vede in pagina; la Row Level Security decide
 * cosa si può leggere. Sono due strati diversi di proposito: se questa
 * funzione avesse un errore, il database non restituirebbe comunque
 * righe che l’utente non ha diritto di vedere.
 */
export const CONTROL_SECTIONS: Record<string, AppRole[]> = {
  "/control": ["admin", "owner"],
  "/control/economia": ["admin", "owner"],
  "/control/capacita": ["admin", "owner"],
  "/control/crm": ["admin", "owner", "reception", "marketing"],
  "/control/brain": ["admin", "owner"],
  "/control/approvazioni": ["admin", "owner"],
  "/control/task": ["admin", "owner", "reception"],
  "/control/agenda": ["admin", "owner", "reception"],
  "/control/pazienti": ["admin", "owner", "reception"],
  "/control/incassi": ["admin", "owner", "reception"],
  "/control/servizi": ["admin", "owner"],
  "/control/professionisti": ["admin", "owner", "reception"],
  "/control/marketing": ["admin", "owner", "marketing"],
  "/control/contenuti": ["admin", "owner", "marketing"],
  "/control/conoscenza": ["admin", "owner", "marketing"],
};

export function canSeeControlSection(role: AppRole, path: string): boolean {
  return (CONTROL_SECTIONS[path] ?? ["admin", "owner"]).includes(role);
}
