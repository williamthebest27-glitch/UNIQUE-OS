import type { PatientDashboardData, Profile } from "@/lib/domain/types";
import { mockPatientDashboard } from "@/lib/mock/patient-dashboard";

/**
 * Profilo dell utente collegato. Separato dalla dashboard perché serve
 * anche al layout, che non deve caricare l intera home per sapere
 * chi sta guardando.
 */
export async function getCurrentPatientProfile(): Promise<Profile> {
  return mockPatientDashboard.profile;
}

/**
 * Unica porta d accesso ai dati della home paziente.
 *
 * Oggi restituisce dati dimostrativi. Quando Supabase sarà collegato si
 * sostituisce soltanto il corpo di questa funzione: le pagine e i
 * componenti non sanno da dove arrivino i dati e non vanno toccati.
 *
 * L implementazione reale sarà, in sintesi:
 *
 *   const supabase = await createServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) redirect("/accedi");
 *   const [score, appointment, credits, ...] = await Promise.all([...]);
 *
 * Nessuna query filtra per paziente a mano: ci pensa la Row Level
 * Security definita in supabase/migrations/20260903100100_rls_policies.sql.
 */
export async function getPatientDashboard(): Promise<PatientDashboardData> {
  return mockPatientDashboard;
}
