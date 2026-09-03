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

/**
 * Origine pubblica dell’applicazione, per i link inviati via email.
 *
 * Usata solo lato server, nell’azione che manda il collegamento di
 * accesso. L’ordine conta: prima ciò che è stato deciso a mano, poi il
 * dominio di produzione che Vercel espone da sé, poi l’URL del singolo
 * deploy, e solo alla fine lo sviluppo locale.
 *
 * Il ripiego su localhost era una trappola: dimenticare
 * `NEXT_PUBLIC_APP_URL` in produzione non rompeva niente di visibile, ma
 * spediva ai pazienti un collegamento verso il loro stesso computer.
 */
export function appUrl(): string {
  const esplicito = process.env.NEXT_PUBLIC_APP_URL;
  if (esplicito) return esplicito.replace(/\/+$/, "");

  // Vercel le valorizza da sé, senza protocollo.
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
