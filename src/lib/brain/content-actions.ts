"use server";

import { revalidatePath } from "next/cache";
import { generaContenuto, type FormatoContenuto } from "@/lib/brain/content";
import { costruisciContenutoProprio, controllaTesto } from "@/lib/content/content-proprio";
import { capacitaAttive } from "@/lib/brain/fornitore";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Segnalazione } from "@/lib/content/regole-brand";

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

  /*
   * Con il modello si ottiene un testo; senza, un'impalcatura.
   *
   * Sono due cose diverse e l'interfaccia lo dice: qui non si finge che
   * una traccia con i fatti giusti sia un post pronto. La differenza fra
   * le due è esattamente il lavoro che resta da fare a una persona.
   */
  if (capacitaAttive().redazione) {
    await generaContenuto({ formato, brief, campaignId });
  } else {
    await costruisciContenutoProprio({ formato, brief, campaignId });
  }

  revalidatePath("/control/contenuti");
}

/**
 * Il controllo di conformità su un testo scritto altrove.
 *
 * È l'azione più utile del Content Brain, e l'unica in cui il codice fa
 * meglio di un modello: verifica sempre, allo stesso modo, e non si
 * stanca alla ventesima variante di un carosello.
 */
export async function controllaContenutoAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ esito: "vuoto" } | { esito: "fatto"; segnalazioni: Segnalazione[]; pubblicabile: boolean; caratteri: number }> {
  const testo = String(formData.get("testo") ?? "").trim();
  if (testo.length < 10) return { esito: "vuoto" };

  const formato = String(formData.get("formato") ?? "") || undefined;
  const risultato = await controllaTesto(testo, formato as FormatoContenuto | undefined);

  return {
    esito: "fatto",
    segnalazioni: risultato.segnalazioni,
    pubblicabile: risultato.pubblicabile,
    caratteri: risultato.caratteri,
  };
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
