import "server-only";
import { headers } from "next/headers";

/**
 * Chi sta bussando.
 *
 * Serve a due cose che si somigliano e non sono la stessa: **frenare**
 * chi insiste, e **registrare** chi ha fatto una cosa che un domani
 * qualcuno chiederà di ricostruire.
 *
 * ---
 *
 * **L'indirizzo non è un'identità, ed è importante non trattarlo come
 * tale.** `x-forwarded-for` lo scrive il proxy davanti all'applicazione,
 * e chiunque può inviarne uno inventato: dietro Vercel il valore
 * autentico è **l'ultimo** che il proxy ha aggiunto, non il primo. Il
 * primo è quello che il client ha dichiarato, ed è esattamente ciò che
 * si legge di solito per sbaglio.
 *
 * Per questo l'indirizzo qui non decide **mai** un permesso: entra in un
 * conteggio e in una riga di registro. Se decidesse un accesso, un'
 * intestazione falsificata sarebbe una scalata di privilegi.
 */

export interface Richiedente {
  /** L'indirizzo, per quel che vale. `null` se non deducibile. */
  ip: string | null;
  /** Il browser dichiarato, troncato. `null` se assente. */
  agente: string | null;
}

/**
 * `user-agent` arriva dal client e può essere lungo a piacere. Va
 * troncato prima di finire in una riga di registro: senza un limite,
 * una richiesta con un'intestazione da un megabyte diventa un megabyte
 * dentro `audit_log`, moltiplicato per ogni tentativo.
 */
const AGENTE_MAX = 200;

export async function richiedente(): Promise<Richiedente> {
  try {
    const h = await headers();

    // Vercel espone l'indirizzo reale a parte: quando c'è, è la fonte
    // da preferire perché non passa dalla catena dichiarata dal client.
    const diretto = h.get("x-real-ip");

    const catena = h.get("x-forwarded-for");
    // L'ultimo anello, non il primo: gli anteriori li può scrivere chi
    // chiama.
    const ultimo = catena?.split(",").pop()?.trim() ?? null;

    const agente = h.get("user-agent");

    return {
      ip: diretto?.trim() || ultimo || null,
      agente: agente ? agente.slice(0, AGENTE_MAX) : null,
    };
  } catch {
    // Fuori da una richiesta — un lavoro in background, un test —
    // `headers()` solleva. Non è un errore: è che non c'è nessuno che
    // bussa.
    return { ip: null, agente: null };
  }
}

/**
 * La chiave con cui frenare, quando non c'è ancora una sessione.
 *
 * Sull'accesso si frena **sia** per indirizzo **sia** per email, e le
 * due cose servono a fermare due attacchi diversi: per indirizzo ferma
 * chi prova mille password su un account, per email ferma chi prova la
 * stessa password su mille account da mille indirizzi — che è
 * l'attacco che il conteggio per indirizzo non vede.
 *
 * L'email si normalizza: `Mario@Esempio.IT` e `mario@esempio.it` sono
 * lo stesso account, e senza normalizzazione sarebbero due finestre.
 */
export function chiaveEmail(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function chiaveIndirizzo(ip: string | null): string {
  return `ip:${ip ?? "sconosciuto"}`;
}
