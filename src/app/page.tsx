import { redirect } from "next/navigation";

/**
 * Punto d ingresso unico. Quando l autenticazione sarà attiva, qui si
 * leggerà il ruolo del profilo e si smisterà verso il livello giusto:
 * /dashboard per il paziente, /pro per il professionista, /control per
 * amministrazione e management.
 */
export default function RootPage() {
  redirect("/dashboard");
}
