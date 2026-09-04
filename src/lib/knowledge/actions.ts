"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

/**
 * Scrivere nella memoria aziendale.
 *
 * Tre azioni e un principio: **non si modifica un'informazione, se ne
 * pubblica una versione nuova.** Correggere in luogo farebbe sparire la
 * frase che ieri qualcuno ha detto a un paziente — e con essa la
 * possibilità di spiegare perché gliel'ha detta.
 *
 * Chi propone e chi pubblica possono essere persone diverse: il
 * marketing apre una bozza, la direzione la mette in vigore. È la stessa
 * separazione che vale per i dati clinici, applicata alle informazioni
 * commerciali.
 */

function testo(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

async function richiediInterno() {
  const profile = await requireProfile();
  if (!["admin", "owner", "marketing"].includes(profile.role)) {
    throw new Error("La knowledge base si scrive dalla direzione.");
  }
  return profile;
}

/** Apre una voce nuova, con la sua prima versione già in bozza. */
export async function creaVoce(formData: FormData): Promise<void> {
  const profile = await richiediInterno();
  const supabase = await createSupabaseServerClient();

  const slug = testo(formData, "slug")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const title = testo(formData, "title");
  const kind = testo(formData, "kind");
  const body = testo(formData, "body");

  if (!slug || !title || !kind) throw new Error("Servono titolo, tipo e identificativo.");
  if (body.length < 10) throw new Error("Il contenuto è troppo corto per essere utile.");

  const { data, error } = await supabase
    .from("knowledge_entries")
    .insert({
      slug,
      title,
      kind,
      audience: testo(formData, "audience") === "public" ? "public" : "internal",
      owner_id: profile.id,
      tags: testo(formData, "tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Voce non creata: ${error.message}`);

  const entryId = (data as { id: string }).id;

  const { error: erroreVersione } = await supabase.from("knowledge_versions").insert({
    entry_id: entryId,
    version: 1,
    status: "draft",
    title,
    body,
    summary: testo(formData, "summary") || null,
    author_id: profile.id,
    valid_from: testo(formData, "validFrom") || new Date().toISOString().slice(0, 10),
    change_note: testo(formData, "changeNote") || "Prima stesura.",
  });

  if (erroreVersione) throw new Error(`Versione non creata: ${erroreVersione.message}`);

  revalidatePath("/control/conoscenza");
  redirect(`/control/conoscenza/${slug}`);
}

/**
 * Una versione nuova di un'informazione esistente.
 *
 * Nasce sempre in bozza, anche se la scrive chi potrebbe pubblicarla: fra
 * lo scrivere e il mettere in vigore ci deve stare una rilettura.
 */
export async function nuovaVersione(formData: FormData): Promise<void> {
  const profile = await richiediInterno();
  const supabase = await createSupabaseServerClient();

  const entryId = testo(formData, "entryId");
  const slug = testo(formData, "slug");
  const body = testo(formData, "body");
  if (!entryId || body.length < 10) throw new Error("Serve un contenuto.");

  const { data: ultima } = await supabase
    .from("knowledge_versions")
    .select("version, title")
    .eq("entry_id", entryId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const precedente = ultima as { version: number; title: string } | null;

  let datiStrutturati: Record<string, unknown> = {};
  const grezzo = testo(formData, "data");
  if (grezzo) {
    try {
      datiStrutturati = JSON.parse(grezzo) as Record<string, unknown>;
    } catch {
      throw new Error("I dati strutturati non sono JSON valido.");
    }
  }

  const { error } = await supabase.from("knowledge_versions").insert({
    entry_id: entryId,
    version: (precedente?.version ?? 0) + 1,
    status: "draft",
    title: testo(formData, "title") || precedente?.title || "Senza titolo",
    body,
    summary: testo(formData, "summary") || null,
    data: datiStrutturati,
    author_id: profile.id,
    valid_from: testo(formData, "validFrom") || new Date().toISOString().slice(0, 10),
    change_note: testo(formData, "changeNote") || null,
  });

  if (error) throw new Error(`Versione non salvata: ${error.message}`);

  revalidatePath(`/control/conoscenza/${slug}`);
}

/**
 * Mette in vigore una bozza.
 *
 * Il lavoro vero lo fa `publish_knowledge_version` nel database: chiude
 * la versione precedente il giorno prima, attiva questa, registra chi ha
 * autorizzato ed emette l'evento. Farlo lì e non qui significa che vale
 * anche per chi scrive dal database.
 */
export async function pubblicaVersione(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!["admin", "owner"].includes(profile.role)) {
    throw new Error("Solo la direzione mette in vigore un'informazione.");
  }

  const versionId = testo(formData, "versionId");
  const slug = testo(formData, "slug");
  if (!versionId) throw new Error("Versione non indicata.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_knowledge_version", { p_version: versionId });
  if (error) throw new Error(`Pubblicazione non riuscita: ${error.message}`);

  revalidatePath("/control/conoscenza");
  revalidatePath(`/control/conoscenza/${slug}`);
}

/** Archivia l'informazione: smette di essere vera senza essere sostituita. */
export async function archiviaVersione(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!["admin", "owner"].includes(profile.role)) {
    throw new Error("Solo la direzione archivia un'informazione.");
  }

  const versionId = testo(formData, "versionId");
  const entryId = testo(formData, "entryId");
  const slug = testo(formData, "slug");
  if (!versionId) throw new Error("Versione non indicata.");

  const supabase = await createSupabaseServerClient();
  const oggi = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("knowledge_versions")
    .update({ status: "archived", valid_to: oggi })
    .eq("id", versionId);

  if (error) throw new Error(`Archiviazione non riuscita: ${error.message}`);

  await emitEvent("knowledge.archived", {
    entity: "knowledge",
    entityId: entryId || null,
    payload: { version_id: versionId },
  });

  revalidatePath("/control/conoscenza");
  revalidatePath(`/control/conoscenza/${slug}`);
}
