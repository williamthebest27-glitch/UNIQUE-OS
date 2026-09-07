import "server-only";
import { chiediPassaggio, liberaPassaggio, messaggioFreno, type Contesto } from "@/lib/sicurezza/freno";
import { chiaveEmail, chiaveIndirizzo, richiedente } from "@/lib/sicurezza/richiedente";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Il freno e il registro, sulle porte d'ingresso.
 *
 * Due gesti che vanno sempre insieme e che sarebbe facile scordarsi
 * uno dei due: chi bussa troppo si ferma, e chi bussa lascia una riga.
 */

/** Le azioni che il database accetta. L'elenco è chiuso anche lì. */
export type EventoSessione =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_reset_requested"
  | "auth.magic_link_requested"
  | "auth.mfa_verified"
  | "auth.mfa_failed"
  | "auth.throttled";

/**
 * Scrive una riga nel registro delle sessioni.
 *
 * Non attende e non solleva mai. Vale la stessa regola di `traccia()`:
 * nessuno deve restare fuori dall'applicazione perché il registro ha
 * avuto un problema, e nessuno deve aspettare un viaggio di rete in più
 * per entrare.
 */
export async function registraSessione(
  azione: EventoSessione,
  email?: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const chi = await richiedente();
    const supabase = await createSupabaseServerClient();

    await supabase.rpc("record_auth_event", {
      p_action: azione,
      p_email: email ?? null,
      p_ip: chi.ip,
      p_user_agent: chi.agente,
    });
  } catch (errore) {
    console.error("[sessione] evento non registrato:", azione, errore);
  }
}

export interface Freno {
  passa: boolean;
  /** Da mostrare quando non passa. Vuoto quando passa. */
  messaggio: string;
}

/**
 * Frena chi insiste su una porta d'ingresso.
 *
 * **Due conteggi, non uno**, quando c'è un'email: per indirizzo ferma
 * chi prova mille password sullo stesso account, per email ferma chi
 * prova la stessa password su mille account da mille indirizzi — e il
 * secondo è l'attacco che il conteggio per indirizzo non vede passare.
 *
 * Entrambi vengono **sempre** contati, anche quando il primo ha già
 * detto no: contare solo fino al primo rifiuto lascerebbe la seconda
 * finestra ferma, e chi alterna gli indirizzi non la riempirebbe mai.
 *
 * Un rifiuto lascia una riga nel registro. È l'unica cosa che
 * distingue «qualcuno ha sbagliato password» da «qualcuno le sta
 * provando tutte», e senza, un attacco a forza bruta si vedrebbe solo
 * come una serie di fallimenti indistinguibili da una persona
 * distratta.
 */
export async function frena(
  contesto: Contesto,
  email?: string | null,
): Promise<Freno> {
  const chi = await richiedente();

  const perIndirizzo = chiediPassaggio(contesto, chiaveIndirizzo(chi.ip));
  const perEmail = email ? chiediPassaggio(contesto, chiaveEmail(email)) : null;

  const bloccante =
    !perIndirizzo.passa ? perIndirizzo : perEmail && !perEmail.passa ? perEmail : null;

  if (!bloccante) return { passa: true, messaggio: "" };

  await registraSessione("auth.throttled", email ?? null);
  return { passa: false, messaggio: messaggioFreno(bloccante) };
}

/**
 * Dopo un accesso riuscito la finestra si azzera.
 *
 * Senza, chi ha sbagliato quattro volte e poi ha indovinato resterebbe
 * a un tentativo dal blocco per i cinque minuti successivi — e la
 * prossima volta che sbaglia una lettera si troverebbe fuori senza
 * capire perché.
 */
export async function sciogliFreno(contesto: Contesto, email?: string | null): Promise<void> {
  const chi = await richiedente();
  liberaPassaggio(contesto, chiaveIndirizzo(chi.ip));
  if (email) liberaPassaggio(contesto, chiaveEmail(email));
}
