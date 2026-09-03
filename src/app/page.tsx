import { redirect } from "next/navigation";
import { getCurrentProfile, homePathForRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Punto d’ingresso unico: smista verso il livello che compete al ruolo.
 * È l’unico posto in cui questa decisione viene presa.
 */
export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/accedi");
  redirect(homePathForRole(profile.role));
}
