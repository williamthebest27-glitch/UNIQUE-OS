"use server";

import {
  invalidaCartellaClinica,
  invalidaRevisioneDocumenti,
} from "@/lib/cache/invalidazione";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBrainConfigured } from "@/lib/brain/extraction";
import { ServiceRoleRequiredError, analyzeDocument } from "@/lib/brain/analyze";
import {
  DIMENSIONE_MASSIMA_BYTE,
  TIPI_ACCETTATI,
  type StatoRevisioneDocumento,
  type StatoUpload,
} from "@/lib/documents/state";

/**
 * Caricamento di un documento sanitario.
 *
 * Lo usano sia il paziente, per i propri referti, sia il professionista,
 * sul paziente che segue. Dopo il salvataggio il motore classifica il
 * documento, ne estrae i parametri e avvisa il care team — ma se
 * qualcosa di tutto ciò fallisce, **il file resta caricato**: perdere il
 * referto per un errore dell'AI sarebbe il peggiore dei risultati.
 */

const BUCKET = "patient-documents";

/** Un nome file finisce dentro un percorso di storage: va disinnescato. */
function nomeSicuro(nome: string): string {
  return nome
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80)
    .replace(/^[.\-]+/, "") || "documento";
}

function senzaEstensione(nome: string): string {
  return nome.replace(/\.[^.]+$/, "");
}

export async function caricaDocumento(
  _prev: StatoUpload,
  formData: FormData,
): Promise<StatoUpload> {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { esito: "errore", messaggio: "Nessun file selezionato." };
  }

  if (file.size > DIMENSIONE_MASSIMA_BYTE) {
    return {
      esito: "errore",
      messaggio: `Il file supera gli ${Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB consentiti.`,
    };
  }

  if (!(TIPI_ACCETTATI as readonly string[]).includes(file.type)) {
    return {
      esito: "errore",
      messaggio: "Formato non accettato. Sono ammessi PDF, PNG, JPEG e WebP.",
    };
  }

  // ── A chi appartiene il documento ───────────────────────────────
  // Un paziente carica solo su di sé, qualunque cosa arrivi dal form.
  let patientId: string | null = null;

  if (profile.role === "patient") {
    const { data } = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    patientId = (data as { id: string } | null)?.id ?? null;
    if (!patientId) {
      return { esito: "errore", messaggio: "La tua scheda clinica non è ancora aperta." };
    }
  } else {
    const requested = String(formData.get("patientId") ?? "");
    if (!requested) {
      return { esito: "errore", messaggio: "Paziente non indicato." };
    }
    // Non ci fidiamo dell'id che arriva dal form: se la Row Level Security
    // non restituisce la riga, l'utente non ha titolo su quel paziente.
    const { data } = await supabase
      .from("patients")
      .select("id")
      .eq("id", requested)
      .maybeSingle();
    patientId = (data as { id: string } | null)?.id ?? null;
    if (!patientId) {
      return { esito: "errore", messaggio: "Paziente non trovato o non accessibile." };
    }
  }

  const titolo =
    String(formData.get("title") ?? "").trim() || senzaEstensione(file.name);
  const kind = String(formData.get("kind") ?? "other");
  const storagePath = `${patientId}/${crypto.randomUUID()}-${nomeSicuro(file.name)}`;

  // ── Storage ─────────────────────────────────────────────────────
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (upload.error) {
    return {
      esito: "errore",
      messaggio: `Caricamento non riuscito: ${upload.error.message}`,
    };
  }

  // ── Riga in cartella ────────────────────────────────────────────
  const { data: inserted, error } = await supabase
    .from("documents")
    .insert({
      patient_id: patientId,
      kind,
      title: titolo,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: profile.id,
      // Se lo carica il paziente stesso, per lui non è una novità.
      is_new_for_patient: profile.role !== "patient",
    })
    .select("id")
    .single();

  if (error) {
    // Il file è già nello storage: senza la riga sarebbe orfano.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { esito: "errore", messaggio: `Documento non registrato: ${error.message}` };
  }

  const documentId = (inserted as { id: string }).id;

  // ── Segnalazione al care team ───────────────────────────────────
  if (profile.role === "patient") {
    await supabase.rpc("notify_care_team", {
      target: patientId,
      p_title: "Nuovo documento caricato dal paziente",
      p_body: titolo,
      p_link: `/pro/pazienti/${patientId}`,
    });
  }

  // ── Analisi ─────────────────────────────────────────────────────
  let dettaglio: string | undefined;

  if (isBrainConfigured()) {
    try {
      const esito = await analyzeDocument(documentId);
      const parti: string[] = [];
      if (esito.autoApplied > 0) parti.push(`${esito.autoApplied} valori acquisiti`);
      if (esito.pendingReview > 0) parti.push(`${esito.pendingReview} in revisione`);
      dettaglio =
        parti.length > 0
          ? `Analisi completata: ${parti.join(", ")}.`
          : "Analisi completata: nessun parametro misurato da estrarre.";
    } catch (analysisError) {
      dettaglio =
        analysisError instanceof ServiceRoleRequiredError
          ? "Il documento sarà esaminato dalla clinica."
          : "Il documento è salvato, ma l'analisi automatica non è riuscita.";
      console.error("[documenti] analisi fallita:", analysisError);
    }
  } else {
    dettaglio = "Il documento sarà esaminato dalla clinica.";
  }

  // Un referto caricato si vede anche in «Risultati», che legge gli
  // stessi documenti: mancava, e restava indietro di una versione.
  invalidaCartellaClinica(patientId);

  return { esito: "ok", messaggio: `"${titolo}" è stato caricato.`, dettaglio };
}

/* ── Revisione ────────────────────────────────────────────────────── */

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
            ? "Segnato come letto."
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
