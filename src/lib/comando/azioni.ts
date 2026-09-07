"use server";

import { getRigheCoda, type RigaCoda } from "@/lib/data/stato-clinica";

/**
 * Aprire una coda.
 *
 * Un'azione server per una lettura, che non è la scelta ovvia. La
 * ragione è che le righe di una coda contengono nomi di pazienti, e
 * l'unico modo di leggerle dal browser senza un'azione sarebbe una
 * chiamata diretta a PostgREST con la sessione — cioè la stessa cosa,
 * ma con la forma dei dati decisa nel client.
 *
 * Qui la forma resta in `getRigheCoda`, che è la stessa funzione che
 * userebbe una pagina server. Nessuna seconda strada per lo stesso
 * dato.
 *
 * Non c'è nessun controllo di ruolo, e non servirebbe:
 * `command_center_queue` ha i diritti dell'invocante. Chi chiamasse
 * questa azione a mano riceverebbe le proprie righe, che è la
 * definizione di ciò che gli spetta.
 */
export async function apriCoda(chiave: string): Promise<RigaCoda[]> {
  return getRigheCoda(chiave);
}
