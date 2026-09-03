/**
 * Configurazione Supabase.
 *
 * Finché le variabili d’ambiente non sono presenti, Unique OS gira in
 * "modalità dimostrativa": dati finti, nessuna autenticazione. Serve a
 * poter lavorare sull’interfaccia senza dipendere dal database, e a non
 * far esplodere l’applicazione a chi la clona per la prima volta.
 *
 * I riferimenti a process.env sono scritti per esteso di proposito:
 * Next li sostituisce a build time solo se li trova letterali.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

/** Origine pubblica dell’applicazione, per i link inviati via email. */
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
