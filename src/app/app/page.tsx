import { redirect } from "next/navigation";
import { getCurrentProfile, homePathForRole } from "@/lib/auth";

/**
 * Lo smistamento per ruolo.
 *
 * Era la radice, e ha smesso di poterlo essere il giorno in cui `/` è
 * diventata la presentazione di Unique OS: l'unico indirizzo che una
 * persona digita, condivide o riceve in un link deve poter essere aperto
 * anche da chi un account non ce l'ha.
 *
 * Qui invece si arriva solo da dentro — dal modulo d'accesso, dalla
 * scelta della password, dai comandi della landing quando una sessione
 * c'è — e la decisione su *quale* livello compete al ruolo resta presa
 * in un posto solo, come prima.
 *
 * Chi arriva senza sessione lo ferma già il proxy, che lo manda
 * all'accesso ricordandosi che stava venendo qui. Il controllo qui sotto
 * è la rete: la stessa domanda posta due volte, perché un livello di
 * sicurezza che dipende da un altro livello non è un livello.
 */
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/accedi");
  redirect(homePathForRole(profile.role));
}
