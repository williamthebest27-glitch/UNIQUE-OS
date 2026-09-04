"use server";

import { redirect } from "next/navigation";
import { messaggioPerErrore, messaggioPerPassword } from "@/lib/auth-errors";
import { appUrl, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PASSWORD_MINIMA, type StatoAccesso, type StatoPassword } from "@/lib/auth-state";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Dove riportare l'utente dopo l'accesso. Solo percorsi interni. */
function destinazione(formData: FormData): string {
  const richiesto = String(formData.get("next") ?? "");
  return richiesto.startsWith("/") && !richiesto.startsWith("//") ? richiesto : "/";
}

/**
 * Accesso con email e password.
 *
 * Convive con il link via email invece di sostituirlo, e le due strade
 * servono a persone diverse: chi entra ogni giorno vuole una password,
 * chi entra due volte l'anno non se la ricorderebbe comunque.
 *
 * Un account creato con il link non ha una password finché non se ne
 * sceglie una: è il motivo per cui `richiediReimpostazione` non è una
 * funzione di emergenza ma il primo passo normale.
 */
export async function accediConPassword(
  _prev: StatoAccesso,
  formData: FormData,
): Promise<StatoAccesso> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_PATTERN.test(email)) {
    return { esito: "errore", messaggio: "Controlla l’indirizzo email.", email };
  }

  if (password.length === 0) {
    return { esito: "errore", messaggio: "Serve la password.", email };
  }

  if (!isSupabaseConfigured()) {
    return {
      esito: "errore",
      messaggio:
        "Supabase non è ancora collegato: l’applicazione è in modalità dimostrativa.",
      email,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // La password non finisce nei log, mai. Solo il codice dell'errore.
    console.error("[accesso] password rifiutata:", error.code, error.message);
    const { messaggio, codice } = messaggioPerPassword(error.code, error.message);
    return { esito: "errore", messaggio, codice, email };
  }

  redirect(destinazione(formData));
}

/**
 * Manda il link per scegliere una password.
 *
 * Serve in due momenti che sembrano diversi e sono lo stesso: la prima
 * volta, quando una password non c'è ancora, e quando non la si ricorda
 * più. Per questo il testo non dice "reimposta" ma "scegli".
 *
 * La risposta è identica che l'indirizzo esista o no, come per il link di
 * accesso: dire "questa email non è registrata" permetterebbe a chiunque
 * di scoprire chi è paziente della clinica.
 */
export async function richiediReimpostazione(
  _prev: StatoAccesso,
  formData: FormData,
): Promise<StatoAccesso> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { esito: "errore", messaggio: "Controlla l’indirizzo email.", email };
  }

  if (!isSupabaseConfigured()) {
    return {
      esito: "errore",
      messaggio:
        "Supabase non è ancora collegato: l’applicazione è in modalità dimostrativa.",
      email,
    };
  }

  const origine = appUrl();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/callback?next=%2Fimposta-password`,
  });

  if (error) {
    console.error("[accesso] invio reimpostazione fallito:", error.code, error.message);
    const { messaggio, codice } = messaggioPerErrore(error.code, error.message);
    return { esito: "errore", messaggio, codice, email };
  }

  return { esito: "reimpostazione", email, origine };
}

/**
 * Sceglie la password, da dentro una sessione già aperta.
 *
 * Ci si arriva in due modi: dal link di reimpostazione — che apre una
 * sessione e porta qui — oppure dall'interno, per cambiarla. In entrambi
 * i casi al momento della scrittura l'utente è già autenticato, ed è
 * questo che rende l'operazione sicura: la vecchia password non serve
 * perché a dimostrare l'identità è la sessione.
 */
export async function impostaPassword(
  _prev: StatoPassword,
  formData: FormData,
): Promise<StatoPassword> {
  const password = String(formData.get("password") ?? "");
  const conferma = String(formData.get("conferma") ?? "");

  if (password.length < PASSWORD_MINIMA) {
    return {
      esito: "errore",
      messaggio: `Servono almeno ${PASSWORD_MINIMA} caratteri. Una frase che ricordi è più robusta di una parola con i numeri dentro.`,
    };
  }

  if (password !== conferma) {
    return { esito: "errore", messaggio: "Le due password non coincidono." };
  }

  if (!isSupabaseConfigured()) {
    return {
      esito: "errore",
      messaggio: "Supabase non è ancora collegato: non c’è un account su cui scrivere.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      esito: "errore",
      messaggio:
        "La sessione non è più valida. Richiedi un nuovo link e riprova: il collegamento dura un’ora.",
      codice: "sessione",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[accesso] password non aggiornata:", error.code, error.message);
    const { messaggio, codice } = messaggioPerPassword(error.code, error.message);
    return { esito: "errore", messaggio, codice };
  }

  redirect("/");
}

/**
 * Invia il link di accesso via email.
 *
 * Nessuna password: un collegamento a scadenza breve è più sicuro di una
 * password che il paziente riuserebbe altrove, e toglie a Unique l’onere
 * di custodirla.
 *
 * Il messaggio di risposta è volutamente identico che l’indirizzo esista
 * o no: dire "questa email non è registrata" permetterebbe a chiunque di
 * scoprire chi è paziente della clinica.
 */
export async function richiediAccesso(
  _prev: StatoAccesso,
  formData: FormData,
): Promise<StatoAccesso> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { esito: "errore", messaggio: "Controlla l’indirizzo email.", email };
  }

  if (!isSupabaseConfigured()) {
    return {
      esito: "errore",
      messaggio:
        "Supabase non è ancora collegato: l’applicazione è in modalità dimostrativa.",
      email,
    };
  }

  // Dopo l’accesso riportiamo l’utente dove stava andando. Accettiamo solo
  // percorsi interni: un "next" che punta altrove sarebbe un redirect aperto.
  const next = destinazione(formData);
  const origine = appUrl();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origine}/auth/callback?next=${encodeURIComponent(next)}`,
      // I pazienti vengono registrati dalla clinica, non si iscrivono da soli.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Il testo originale resta nei log del server; davanti al paziente va
    // qualcosa di leggibile, che non riveli se l'indirizzo è registrato.
    console.error("[accesso] invio link fallito:", error.code, error.message);
    const { messaggio, codice } = messaggioPerErrore(error.code, error.message);
    return { esito: "errore", messaggio, codice, email };
  }

  return { esito: "inviato", email, origine };
}

export async function esci() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/accedi");
}
