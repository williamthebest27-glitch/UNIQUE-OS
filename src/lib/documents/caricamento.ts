import "server-only";
import { invalidaCartellaClinica } from "@/lib/cache/invalidazione";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { improntaDi } from "@/lib/document-intelligence/impronta";
import { rileva } from "@/lib/document-intelligence/rilevatore";
import { MIME_CANONICO } from "@/lib/document-intelligence/tipi";
import { FormatoNonSupportato } from "@/lib/document-intelligence/lettore";
import { ChiavePrivilegiataRichiesta, elaboraDocumento } from "@/lib/documents/intelligence";
import { DIMENSIONE_MASSIMA_BYTE, type StatoUpload } from "@/lib/documents/state";

/**
 * Il caricamento di un documento, una volta sola.
 *
 * Sta qui e non in `actions.ts` perché due strade ci arrivano: la server
 * action, che è il percorso senza JavaScript, e la rotta POST, che è
 * quella con la barra di avanzamento. Sono due modi di consegnare gli
 * stessi byte, e devono fare **esattamente** la stessa cosa — controlli
 * di accesso compresi.
 *
 * Duplicare questa funzione avrebbe voluto dire due validazioni di
 * formato, due politiche sui duplicati e due punti in cui dimenticare di
 * scrivere l'impronta. Il giorno in cui divergono, divergono sul
 * controllo che decide di chi è un referto.
 *
 * ---
 *
 * **Il formato si decide dai byte, non dal nome.** Il tipo che arriva dal
 * browser è dedotto dall'estensione o dal sistema operativo, ed è il dato
 * meno affidabile del caricamento. Un `.pdf` rinominato in `.jpg` resta
 * un PDF, e i primi byte lo dicono.
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

export async function caricaFile(formData: FormData): Promise<StatoUpload> {
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

  // ── Che cosa è davvero questo file ──────────────────────────────
  const contenuto = new Uint8Array(await file.arrayBuffer());
  const rilevamento = rileva(contenuto, file.name, file.type || null);

  if (!rilevamento.formato) {
    return {
      esito: "errore",
      messaggio:
        rilevamento.motivo ??
        "Formato non accettato. Sono ammessi PDF, immagini, Word, Excel e CSV.",
    };
  }

  const impronta = improntaDi(contenuto);

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
    const richiesto = String(formData.get("patientId") ?? "");
    if (!richiesto) {
      return { esito: "errore", messaggio: "Paziente non indicato." };
    }
    // Non ci fidiamo dell'id che arriva dal form: se la Row Level
    // Security non restituisce la riga, l'utente non ha titolo su quel
    // paziente.
    const { data } = await supabase
      .from("patients")
      .select("id")
      .eq("id", richiesto)
      .maybeSingle();
    patientId = (data as { id: string } | null)?.id ?? null;
    if (!patientId) {
      return { esito: "errore", messaggio: "Paziente non trovato o non accessibile." };
    }
  }

  // ── Duplicati ───────────────────────────────────────────────────
  // Non si rifiuta il caricamento. Chi ricarica lo stesso referto quasi
  // sempre lo fa perché non è sicuro che il primo sia arrivato:
  // rifiutarlo gli confermerebbe il dubbio invece di risolverlo.
  const { data: gemello } = await supabase
    .from("documents")
    .select("id, title, created_at")
    .eq("patient_id", patientId)
    .eq("file_hash", impronta)
    .limit(1)
    .maybeSingle();

  const duplicato = gemello as { id: string; title: string } | null;

  const titolo = String(formData.get("title") ?? "").trim() || senzaEstensione(file.name);
  const kind = String(formData.get("kind") ?? "other");
  const storagePath = `${patientId}/${crypto.randomUUID()}-${nomeSicuro(file.name)}`;

  // Il MIME che si registra è quello **riconosciuto dai byte**, non
  // quello dichiarato: è ciò che il lettore userà per riaprire il file.
  const mime = MIME_CANONICO[rilevamento.formato];

  // ── Storage ─────────────────────────────────────────────────────
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: mime, upsert: false });

  if (upload.error) {
    return { esito: "errore", messaggio: `Caricamento non riuscito: ${upload.error.message}` };
  }

  // ── Riga in cartella ────────────────────────────────────────────
  const { data: inserito, error } = await supabase
    .from("documents")
    .insert({
      patient_id: patientId,
      kind,
      title: titolo,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: file.size,
      uploaded_by: profile.id,
      file_hash: impronta,
      source_format: rilevamento.formato,
      processing_state: "UPLOADED",
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

  const documentId = (inserito as { id: string }).id;

  // ── Segnalazione al care team ───────────────────────────────────
  if (profile.role === "patient") {
    await supabase.rpc("notify_care_team", {
      target: patientId,
      p_title: "Nuovo documento caricato dal paziente",
      p_body: titolo,
      p_link: `/pro/pazienti/${patientId}/documenti/${documentId}`,
    });
  }

  await supabase.rpc("log_document_event", {
    p_document: documentId,
    p_action: "document.uploaded",
    p_entity: "document",
    p_entity_id: documentId,
    p_previous: null,
    p_new: titolo,
    p_metadata: {
      formato: rilevamento.formato,
      riconosciuto_da: rilevamento.fonte,
      byte: file.size,
      duplicato: duplicato !== null,
    },
  });

  // ── Elaborazione ────────────────────────────────────────────────
  // Un duplicato non si rianalizza: il risultato sarebbe identico, e
  // riprodurlo costerebbe tempo e — con un modello acceso — denaro.
  const dettaglio = duplicato
    ? `Questo file è identico a «${duplicato.title}», già in cartella. Non è stato rianalizzato: decidi tu se tenerlo.`
    : await elabora(documentId);

  // Un referto caricato si vede anche in «Risultati», che legge gli
  // stessi documenti: mancava, e restava indietro di una versione.
  invalidaCartellaClinica(patientId);

  return {
    esito: "ok",
    messaggio: `"${titolo}" è stato caricato.`,
    dettaglio,
    documentId,
    duplicato: duplicato !== null,
  };
}

/**
 * Manda il documento in pipeline e riassume com'è andata.
 *
 * Ogni errore diventa una frase in italiano, e nessuno di essi ferma il
 * caricamento: il file è già al sicuro, e ciò che poteva andare storto
 * qui è la sua **lettura**, non la sua conservazione.
 */
async function elabora(documentId: string): Promise<string> {
  try {
    const esito = await elaboraDocumento(documentId);

    const parti: string[] = [];
    const quanti = esito.strutturato.biomarcatori.length;

    if (quanti > 0) {
      parti.push(`${quanti} ${quanti === 1 ? "parametro riconosciuto" : "parametri riconosciuti"}`);
    }
    if (esito.misureApplicate > 0) parti.push(`${esito.misureApplicate} acquisiti nel punteggio`);
    if (esito.misureProposte > esito.misureApplicate) {
      parti.push(`${esito.misureProposte - esito.misureApplicate} in revisione`);
    }

    if (parti.length === 0) {
      return (
        esito.strutturato.avvertenze[0]?.messaggio ??
        "Analisi completata: nessun parametro misurato da estrarre."
      );
    }

    const chiusura =
      esito.stato === "REVIEW_REQUIRED"
        ? " Un professionista lo guarderà prima che i valori entrino in cartella."
        : "";

    return `Analisi completata: ${parti.join(", ")}.${chiusura}`;
  } catch (errore) {
    console.error("[documenti] elaborazione fallita:", errore);

    if (errore instanceof ChiavePrivilegiataRichiesta) {
      return "Il documento sarà esaminato dalla clinica.";
    }
    if (errore instanceof FormatoNonSupportato) {
      return `Il file è salvato, ma non l'ho potuto leggere: ${errore.dettaglio}`;
    }

    return "Il documento è salvato, ma l'analisi automatica non è riuscita. Lo guarderà un professionista.";
  }
}
