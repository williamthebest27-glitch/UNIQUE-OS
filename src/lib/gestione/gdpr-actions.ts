"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messaggioLeggibile, type EsitoGestione } from "@/lib/gestione/state";

/**
 * I due diritti che si esercitano da qui.
 *
 * L'esportazione è una rotta (`/api/pazienti/[id]/esporta`) perché deve
 * produrre un file; qui resta la cancellazione, che è un gesto e non un
 * documento.
 *
 * ---
 *
 * **Cancellare una cartella clinica non è conformità: è distruzione di
 * documentazione sanitaria.** L'art. 17 del GDPR dà il diritto alla
 * cancellazione, e il suo comma 3 lettera h lo sospende quando il
 * trattamento serve a medicina preventiva, diagnosi e cura — che è
 * esattamente cosa fa Unique. Una cartella ha obblighi di conservazione
 * che non sono negoziabili con la persona che riguarda.
 *
 * Quello che si può e si deve fare è togliere ciò che **identifica**:
 * nome, recapiti, codice fiscale, la corrispondenza. Resta una storia
 * clinica senza una persona attaccata, che è il punto d'arrivo che la
 * norma chiede davvero.
 *
 * Il gesto è deliberatamente scomodo: chiede il motivo, chiede di
 * scrivere il nome della persona, ed è riservato alla direzione. Non
 * per burocrazia — perché è irreversibile e non c'è un annulla.
 */

async function requireDirezione() {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "owner") {
    throw new Error("Azione riservata alla direzione.");
  }
  return profile;
}

export async function cancellaDatiPaziente(
  _prev: EsitoGestione,
  formData: FormData,
): Promise<EsitoGestione> {
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const conferma = String(formData.get("conferma") ?? "").trim();
  const nomeAtteso = String(formData.get("nomeAtteso") ?? "").trim();

  if (!pazienteId) return { esito: "errore", messaggio: "Paziente non indicato." };

  if (motivo.length < 10) {
    return {
      esito: "errore",
      messaggio:
        "Scrivi il motivo per esteso: fra un anno questa riga è l'unica cosa che spiegherà perché.",
    };
  }

  /*
   * Scrivere il nome è la conferma.
   *
   * Una finestra «sei sicuro?» si clicca senza leggerla — è il gesto che
   * si compie per far sparire la finestra. Ricopiare il nome della
   * persona costringe a guardare *quale* persona, ed è l'unico controllo
   * che funziona su un'azione irreversibile.
   */
  if (conferma.toLowerCase() !== nomeAtteso.toLowerCase()) {
    return {
      esito: "errore",
      messaggio: `Per confermare, scrivi esattamente: ${nomeAtteso}`,
    };
  }

  try {
    await requireDirezione();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("erase_patient", {
      p_patient: pazienteId,
      p_reason: motivo,
    });

    if (error) throw new Error(messaggioLeggibile(error.message));

    revalidatePath("/control/pazienti");
    revalidatePath(`/control/pazienti/${pazienteId}`);
    revalidatePath("/control/registro");

    return {
      esito: "ok",
      messaggio:
        "Dati identificativi rimossi. La storia clinica resta, senza un nome attaccato, e la cancellazione è nel registro.",
    };
  } catch (errore) {
    return {
      esito: "errore",
      messaggio:
        errore instanceof Error
          ? messaggioLeggibile(errore.message)
          : "Cancellazione non eseguita.",
    };
  }
}
