"use server";

import {
  invalidaCartellaClinica,
  invalidaRevisioneDocumenti,
} from "@/lib/cache/invalidazione";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { caricaFile } from "@/lib/documents/caricamento";
import { elaboraDocumento } from "@/lib/documents/intelligence";
import type {
  StatoRevisioneAnalisi,
  StatoRevisioneDocumento,
  StatoUpload,
} from "@/lib/documents/state";

/**
 * Le azioni sui documenti sanitari.
 *
 * Il caricamento vero e proprio sta in `caricamento.ts`, perché ci
 * arrivano due strade: questa server action — il percorso che funziona
 * anche senza JavaScript — e la rotta `POST /api/documenti`, che è
 * quella con la barra di avanzamento. Due modi di consegnare gli stessi
 * byte, e devono fare esattamente la stessa cosa.
 */

export async function caricaDocumento(
  _prev: StatoUpload,
  formData: FormData,
): Promise<StatoUpload> {
  return caricaFile(formData);
}

/* ── Rilettura ────────────────────────────────────────────────────── */

/**
 * Rilegge un documento già in archivio.
 *
 * Serve per i referti caricati prima che il motore esistesse, e dopo
 * ogni miglioramento del lettore: la stessa pipeline sullo stesso file
 * produce una nuova estrazione **accanto** alla precedente, non al posto
 * suo. Confrontare due letture dello stesso documento è come si scopre
 * se il motore è davvero migliorato.
 */
export async function rileggiDocumento(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("La rilettura di un documento è riservata ai professionisti.");
  }

  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!documentId) throw new Error("Documento non indicato.");

  await elaboraDocumento(documentId);

  const patientId = String(formData.get("patientId") ?? "").trim();
  invalidaCartellaClinica(patientId || null);
}

/* ── Revisione del referto ────────────────────────────────────────── */

/**
 * Segnare un referto letto, o approvarlo.
 *
 * Non fa un `update`: chiama `review_document`, che è security definer.
 * Tre regole devono valere insieme e una policy da sola non le esprime —
 * approvare richiede il titolo clinico, l'autore e l'istante li scrive
 * il database e non il chiamante, e il passaggio lascia sia un evento
 * sia una riga nel registro degli accessi.
 *
 * L'errore del database si mostra così com'è. «Approvare un referto
 * richiede un medico» è esattamente ciò che va detto a chi ha premuto un
 * pulsante che non doveva vedere — e nasconderlo dietro un generico
 * «operazione non riuscita» lascerebbe pensare a un guasto.
 */
export async function revisionaDocumento(
  _prev: StatoRevisioneDocumento,
  formData: FormData,
): Promise<StatoRevisioneDocumento> {
  const documentId = String(formData.get("documentId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();

  if (!documentId) return { esito: "errore", messaggio: "Documento non indicato." };
  if (!["pending", "reviewed", "approved"].includes(stato)) {
    return { esito: "errore", messaggio: "Stato di revisione non valido." };
  }

  try {
    await requireProfile();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("review_document", {
      p_document: documentId,
      p_state: stato,
      p_note: nota || null,
    });

    if (error) throw new Error(error.message);

    invalidaRevisioneDocumenti(patientId || null);

    return {
      esito: "ok",
      stato: stato as "pending" | "reviewed" | "approved",
      messaggio:
        stato === "approved"
          ? "Approvato: ha valore clinico."
          : stato === "reviewed"
            ? "Segnato come letto. Il paziente ora vede anche i valori estratti."
            : "Rimesso in coda.",
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio:
        error instanceof Error ? error.message : "La revisione non è stata registrata.",
    };
  }
}

/* ── Revisione dell'analisi ───────────────────────────────────────── */

/**
 * Approvare, correggere o respingere ciò che il motore ha capito.
 *
 * È un gesto **diverso** dal revisionare il referto, e le due cose
 * restano separate per un motivo pratico: un medico può leggere e
 * approvare un referto e insieme respingere l'estrazione, perché il
 * motore ha letto male tre valori. Con un flag solo bisognerebbe
 * scegliere quale delle due verità registrare.
 */
export async function revisionaAnalisi(
  _prev: StatoRevisioneAnalisi,
  formData: FormData,
): Promise<StatoRevisioneAnalisi> {
  const extractionId = String(formData.get("extractionId") ?? "").trim();
  const decisione = String(formData.get("decisione") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();

  if (!extractionId) return { esito: "errore", messaggio: "Analisi non indicata." };
  if (!["approvata", "corretta", "respinta"].includes(decisione)) {
    return { esito: "errore", messaggio: "Decisione non valida." };
  }

  try {
    await requireProfile();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("revisiona_estrazione", {
      p_extraction: extractionId,
      p_decision: decisione,
      p_note: nota || null,
    });

    if (error) throw new Error(error.message);

    invalidaCartellaClinica(patientId || null);

    return {
      esito: "ok",
      messaggio:
        decisione === "respinta"
          ? "Analisi respinta: il documento resta da rivedere."
          : "Analisi validata.",
    };
  } catch (error) {
    return {
      esito: "errore",
      messaggio:
        error instanceof Error ? error.message : "La revisione non è stata registrata.",
    };
  }
}

/**
 * Correggere un valore che il motore ha letto male.
 *
 * Il valore originale non viene sovrascritto: resta accanto alla
 * correzione. È la differenza fra una cartella clinica e un foglio di
 * calcolo — fra un anno si deve poter sapere che cosa aveva letto la
 * macchina e che cosa ha corretto la persona.
 */
export async function correggiValore(formData: FormData): Promise<void> {
  await requireProfile();

  const biomarkerId = String(formData.get("biomarkerId") ?? "").trim();
  const grezzo = String(formData.get("valore") ?? "").trim().replace(",", ".");
  const nota = String(formData.get("nota") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();

  if (!biomarkerId) throw new Error("Valore non indicato.");

  const valore = Number(grezzo);
  if (!Number.isFinite(valore)) throw new Error("Il valore inserito non è un numero.");

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("correggi_biomarcatore", {
    p_biomarker: biomarkerId,
    p_value: valore,
    p_note: nota || null,
  });

  if (error) throw new Error(error.message);

  invalidaCartellaClinica(patientId || null);
}

/**
 * Decidere su una raccomandazione.
 *
 * È l'anello che chiude il ciclo: osservazione, interpretazione,
 * raccomandazione, **decisione**. Finché nessuno decide, la
 * raccomandazione resta sospesa — e il paziente non la vede, perché una
 * raccomandazione non ancora valutata da un professionista è
 * indistinguibile da un consiglio clinico.
 */
export async function decidiRaccomandazione(formData: FormData): Promise<void> {
  await requireProfile();

  const recommendationId = String(formData.get("recommendationId") ?? "").trim();
  const decisione = String(formData.get("decisione") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();
  const patientId = String(formData.get("patientId") ?? "").trim();

  if (!recommendationId) throw new Error("Raccomandazione non indicata.");
  if (!["accolta", "respinta", "rimandata"].includes(decisione)) {
    throw new Error("Decisione non valida.");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("decidi_raccomandazione", {
    p_recommendation: recommendationId,
    p_decision: decisione,
    p_note: nota || null,
  });

  if (error) throw new Error(error.message);

  invalidaCartellaClinica(patientId || null);
}
