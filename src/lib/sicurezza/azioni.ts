"use server";

import { registraSessione } from "@/lib/sicurezza/sessione";

/**
 * L'esito di una verifica del secondo fattore.
 *
 * La verifica avviene nel browser — `supabase.auth.mfa.verify` ha
 * bisogno della sessione del client — e da lì una riga di registro non
 * si può scrivere: `record_auth_event` è raggiungibile, ma l'indirizzo
 * e il browser li conosce solo il server, e prenderli dal client
 * significherebbe accettare i valori che il client dichiara.
 *
 * Quindi il client dice soltanto *è andata o no*, e il resto della riga
 * lo compone il server. Un client che mentisse su questo booleano
 * scriverebbe una riga falsa in un registro — spiacevole — ma non
 * otterrebbe alcun accesso: il livello `aal2` lo stabilisce Supabase
 * sul token, non questa funzione.
 */
export async function registraSecondoFattore(riuscito: boolean): Promise<void> {
  await registraSessione(riuscito ? "auth.mfa_verified" : "auth.mfa_failed");
}
