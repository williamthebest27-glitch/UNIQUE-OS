import { redirect } from "next/navigation";
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

/**
 * Profilo dell’utente collegato, o null se non c’è sessione.
 * In modalità dimostrativa restituisce il paziente di esempio.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) {
    return mockPatientDashboard.profile;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, first_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const row = data as ProfileRow | null;

  // Il profilo viene creato da un trigger su auth.users. Se manca — utente
  // creato prima delle migrazioni, o trigger non installato — non lasciamo
  // l’applicazione in uno stato ambiguo: ricadiamo su un profilo minimo
  // costruito dai dati dell’account.
  if (!row) {
    return {
      id: user.id,
      role: "patient",
      fullName: (user.user_metadata?.full_name as string) ?? user.email ?? "",
      firstName: null,
      email: user.email ?? null,
      avatarUrl: null,
    };
  }

  return toProfile(row);
}

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
    case "admin":
    case "owner":
      // Chi dirige entra dalla control room, non dall agenda clinica.
      return "/control";
  }
}
