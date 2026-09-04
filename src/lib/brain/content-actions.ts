"use server";

import { revalidatePath } from "next/cache";
import { generaContenuto, type FormatoContenuto } from "@/lib/brain/content";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Le azioni del Content Brain.
 *
 * Generare non è pubblicare: ciò che esce da qui è una bozza che qualcuno
 * deve leggere. L'approvazione è un gesto separato, e resta scritta.
 */

export async function generaContenutoAction(formData: FormData): Promise<void> {
  const formato = String(formData.get("formato") ?? "") as FormatoContenuto;
  const brief = String(formData.get("brief") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "") || null;

  await generaContenuto({ formato, brief, campaignId });
  revalidatePath("/control/contenuti");
}

/** "Va bene così": il contenuto può essere prodotto e pubblicato. */
export async function approvaContenuto(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!["admin", "owner", "marketing"].includes(profile.role)) {
    throw new Error("Approvazione riservata a direzione e marketing.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Contenuto non indicato.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("generated_contents")
    .update({ approved_at: new Date().toISOString(), approved_by: profile.id })
    .eq("id", id);

  if (error) throw new Error(`Approvazione non riuscita: ${error.message}`);
  revalidatePath("/control/contenuti");
}
