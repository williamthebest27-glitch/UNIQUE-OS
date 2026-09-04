"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chiediAlBrain } from "@/lib/brain/founder";
import { decidiProposta, eseguiProposta } from "@/lib/approvals/proposals";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  invalidaEsecuzioneBrain,
  invalidaLavoro,
} from "@/lib/cache/invalidazione";

/**
 * Le azioni dell'interfaccia founder.
 *
 * Tre gesti separati, come i tre momenti del ciclo: chiedere, decidere,
 * eseguire. Sono azioni distinte anche nell'interfaccia perché un
 * pulsante solo che approva ed esegue insieme toglierebbe il momento in
 * cui si può ancora cambiare idea.
 */

export async function chiedi(formData: FormData): Promise<void> {
  const domanda = String(formData.get("domanda") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "") || null;

  const esito = await chiediAlBrain({ domanda, conversationId });

  revalidatePath("/control/brain");
  redirect(`/control/brain?c=${esito.conversationId}`);
}

export async function decidi(formData: FormData): Promise<void> {
  const id = String(formData.get("propostaId") ?? "");
  const approva = String(formData.get("decisione") ?? "") === "approva";
  const nota = String(formData.get("nota") ?? "").trim() || undefined;

  if (!id) throw new Error("Proposta non indicata.");
  await decidiProposta(id, approva, nota);

  revalidatePath("/control/approvazioni");
  revalidatePath("/control/brain");
}

export async function esegui(formData: FormData): Promise<void> {
  const id = String(formData.get("propostaId") ?? "");
  if (!id) throw new Error("Proposta non indicata.");

  await eseguiProposta(id);

  // Eseguire vuol dire aver scritto qualcosa: un task, un prezzo di
  // listino, una voce pubblicata. Invalidare le tre pagine del ciclo di
  // approvazione lasciava indietro proprio le schermate su cui l'effetto
  // si vede.
  invalidaEsecuzioneBrain();
}

/** Chiude un task dal Control Center. */
export async function chiudiTaskControl(formData: FormData): Promise<void> {
  await requireProfile();
  const id = String(formData.get("taskId") ?? "");
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open");

  invalidaLavoro();
}

/** Segna come letta una notifica. */
export async function segnaLetta(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  const id = String(formData.get("notificaId") ?? "");
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profile.id);

  revalidatePath("/control");
}
