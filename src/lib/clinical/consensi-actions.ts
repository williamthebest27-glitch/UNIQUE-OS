"use server";

import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaCartellaClinica } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";
import {
  CONSENSI_OBBLIGATORI,
  isTipoConsenso,
  type TipoConsenso,
} from "@/lib/clinical/consensi";

/**
 * Registrare un consenso dalla cartella.
 *
 * Chi raccoglie una firma durante la prima visita è il professionista, e
 * fino a ora non poteva scriverla da nessuna parte: la policy ammetteva
 * il paziente stesso e la direzione. Un consenso firmato su carta
 * restava fuori dal sistema, e il sistema diceva «non concesso» su una
 * persona che aveva firmato.
 *
 * ---
 *
 * **Non si modifica un consenso: se ne registra uno nuovo.**
 * `patient_consents` è append-only come il registro dei crediti, e
 * revocare è scrivere una riga con `granted = false`. La domanda a cui
 * serve rispondere non è «ha acconsentito?» ma «*quando* ha acconsentito
 * e a *quale versione* dell'informativa» — e a quella un campo booleano
 * aggiornato in luogo non risponde.
 *
 * L'origine non si accetta dal modulo: la decide il database guardando
 * chi sta scrivendo. Una persona che dichiarasse di aver firmato su
 * carta starebbe dichiarando qualcosa su un foglio che non esiste.
 */

export async function registraConsenso(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const concesso = formData.get("concesso") === "true";
  const versione = String(formData.get("versione") ?? "v1").trim();
  const origine = String(formData.get("origine") ?? "clinical").trim();

  if (!pazienteId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (!isTipoConsenso(tipo)) return { esito: "errore", messaggio: "Tipo di consenso non valido." };

  /*
   * Revocare un consenso obbligatorio è una decisione, non un errore.
   *
   * Senza `health_data` non si possono conservare referti né calcolare
   * il punteggio: è giusto che si possa fare — è un diritto — ed è
   * giusto che lo si legga prima di farlo, invece di scoprirlo dopo dal
   * fatto che una cartella ha smesso di funzionare.
   */
  const avvertenza =
    !concesso && CONSENSI_OBBLIGATORI.includes(tipo)
      ? " Senza questo consenso non si possono conservare referti né calcolare il punteggio."
      : "";

  try {
    const profile = await requireProfile();
    if (profile.role === "patient") {
      return { esito: "errore", messaggio: "Azione riservata ai professionisti." };
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("record_consent", {
      p_patient: pazienteId,
      p_kind: tipo,
      p_granted: concesso,
      p_version: versione || "v1",
      p_source: origine === "paper" ? "paper" : "clinical",
    });

    if (error) throw new Error(error.message);

    invalidaCartellaClinica(pazienteId);

    return {
      esito: "ok",
      messaggio: concesso
        ? `Consenso registrato, versione ${versione || "v1"}.`
        : `Revoca registrata.${avvertenza}`,
    };
  } catch (errore) {
    const m = errore instanceof Error ? errore.message : "";
    return {
      esito: "errore",
      messaggio:
        /[a-zà-ù]\.$/i.test(m) && !m.includes("_")
          ? m
          : "Consenso non registrato.",
    };
  }
}
