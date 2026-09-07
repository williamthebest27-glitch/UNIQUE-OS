"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaCartellaClinica } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";
import { isStatoEsame } from "@/lib/clinical/laboratorio";
import { isPriorita } from "@/lib/comunicazioni/tipi";

/**
 * Cosa si fa a una richiesta di esame.
 *
 * Chiedere, farla avanzare, validarla. La macchina a stati vive nel
 * database — `advance_lab_order` conosce le transizioni ammesse — e qui
 * si controlla solo che lo stato richiesto sia uno dei sei. Riscrivere
 * le regole di transizione anche qui avrebbe prodotto due macchine, e
 * la seconda sarebbe andata fuori sincrono al primo cambiamento.
 *
 * **Validare è separato.** Non passa da `advance_lab_order` e non è un
 * clic come gli altri: è la firma che fa entrare i valori in cartella, e
 * la chiede `can_approve_clinical_flag()` — la stessa funzione che
 * protegge l'approvazione di un valore fuori soglia.
 */

async function requireClinico() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Azione riservata ai professionisti.");
  }
  return profile;
}

function leggibile(errore: unknown, ripiego: string): string {
  if (!(errore instanceof Error)) return ripiego;
  const m = errore.message;
  if (/[a-zà-ù»]\.$/i.test(m) && !m.includes("_")) return m;
  return ripiego;
}

/**
 * Dove ricompare una richiesta quando cambia.
 *
 * La cartella, la sezione clinica, e la schermata di apertura della
 * diagnostica — che è quella che si dimentica, perché non è la pagina da
 * cui è partito il clic.
 */
function invalidaLaboratorio(patientId: string | null): void {
  invalidaCartellaClinica(patientId);
  revalidatePath("/pro");
  revalidatePath("/pro/revisioni");
  if (patientId) revalidatePath(`/pro/pazienti/${patientId}`, "layout");
}

/* ── Chiedere ─────────────────────────────────────────────────────── */

export async function chiediEsame(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const pannello = String(formData.get("pannello") ?? "").trim();
  const domanda = String(formData.get("domanda") ?? "").trim();
  const prioritaGrezza = String(formData.get("priorita") ?? "normal");

  const codici = formData
    .getAll("codici")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!pazienteId) return { esito: "errore", messaggio: "Paziente non indicato." };
  if (pannello.length < 3) {
    return { esito: "errore", messaggio: "Indica cosa stai chiedendo." };
  }

  try {
    await requireClinico();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("request_lab_order", {
      p_patient: pazienteId,
      p_panel: pannello,
      p_tests: codici,
      p_question: domanda || null,
      p_priority: isPriorita(prioritaGrezza) ? prioritaGrezza : "normal",
      p_department: null,
    });

    if (error) throw new Error(error.message);

    invalidaLaboratorio(pazienteId);

    return {
      esito: "ok",
      messaggio:
        codici.length > 0
          ? `Richiesto. ${codici.length} ${codici.length === 1 ? "parametro atteso" : "parametri attesi"}; la Diagnostica è stata avvisata.`
          : "Richiesto. La Diagnostica è stata avvisata.",
    };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Richiesta non inviata.") };
  }
}

/* ── Farla avanzare ───────────────────────────────────────────────── */

export async function avanzaEsame(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const richiestaId = String(formData.get("richiestaId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();

  if (!richiestaId) return { esito: "errore", messaggio: "Richiesta non indicata." };
  if (!isStatoEsame(stato)) return { esito: "errore", messaggio: "Stato non valido." };

  if (stato === "cancelled" && nota.length < 3) {
    return { esito: "errore", messaggio: "Serve il motivo dell'annullamento." };
  }

  try {
    await requireClinico();
    const supabase = await createSupabaseServerClient();

    // Validare è una firma, non un passaggio: ha una funzione sua, e
    // solo quella controlla che chi firma sia un medico.
    if (stato === "validated") {
      const { data, error } = await supabase.rpc("validate_lab_order", {
        p_order: richiestaId,
        p_note: nota || null,
      });
      if (error) throw new Error(error.message);

      invalidaLaboratorio(pazienteId || null);

      const quanti = typeof data === "number" ? data : 0;
      return {
        esito: "ok",
        messaggio:
          quanti > 0
            ? `Validato. ${quanti} ${quanti === 1 ? "valore" : "valori"} in cartella.`
            : "Validato. Nessun valore legato alla richiesta: il referto c'è, i valori no.",
      };
    }

    const { error } = await supabase.rpc("advance_lab_order", {
      p_order: richiestaId,
      p_status: stato,
      p_note: nota || null,
    });

    if (error) throw new Error(error.message);

    invalidaLaboratorio(pazienteId || null);

    const detto: Record<string, string> = {
      collected: "Prelevato.",
      processing: "In analisi.",
      resulted: "Risultati registrati. Chi ha chiesto l'esame è stato avvisato.",
      requested: "Rimessa in richiesta.",
      cancelled: "Annullata.",
    };
    return { esito: "ok", messaggio: detto[stato] ?? "Aggiornata." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Richiesta non aggiornata.") };
  }
}

/**
 * La scorciatoia della coda: un clic, avanti di un passo.
 *
 * Senza stato di ritorno perché il risultato si vede — la riga cambia
 * colonna. Un modulo con l'esito sotto ogni riga della coda avrebbe
 * messo venti frasi di conferma su una schermata sola.
 */
export async function avanzaEsameRapido(formData: FormData): Promise<void> {
  await requireClinico();
  const richiestaId = String(formData.get("richiestaId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();

  if (!richiestaId || !isStatoEsame(stato) || stato === "cancelled") return;

  const supabase = await createSupabaseServerClient();

  if (stato === "validated") {
    await supabase.rpc("validate_lab_order", { p_order: richiestaId, p_note: null });
  } else {
    await supabase.rpc("advance_lab_order", {
      p_order: richiestaId,
      p_status: stato,
      p_note: null,
    });
  }

  invalidaLaboratorio(pazienteId || null);
}
