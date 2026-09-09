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
 * La modalità dimostrativa non esiste in produzione.
 *
 * Senza questa funzione l'assenza delle variabili d'ambiente era un
 * **guasto silenzioso e aperto**: `getCurrentProfile()` restituiva il
 * paziente finto, il proxy lasciava passare tutti, e chiunque aprisse il
 * sito si trovava dentro l'area riservata nei panni di una persona. Non
 * è uno scenario di laboratorio — una variabile non propagata a un
 * deploy è il modo più comune in cui una configurazione si perde, e il
 * sintomo era un'applicazione che sembrava funzionare benissimo.
 *
 * Fuori da `development` la mancanza di configurazione torna a essere
 * quello che è: un errore, che si vede.
 *
 * Il controllo è su `NODE_ENV` e non su un'altra variabile di proposito.
 * `NODE_ENV` lo imposta il runtime, non chi configura: non si può
 * dimenticare, e non si può sbagliare a scrivere.
 */
export function modalitaDimostrativaAmmessa(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Vero quando si può servire il paziente di esempio.
 *
 * È la sola porta da cui i dati finti entrano nell'applicazione. Dove si
 * legge `isSupabaseConfigured()` per decidere fra database e dati
 * dimostrativi, quello che si vuole davvero sapere è questo.
 */
export function inDimostrazione(): boolean {
  return !isSupabaseConfigured() && modalitaDimostrativaAmmessa();
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
