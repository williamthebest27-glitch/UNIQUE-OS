"use server";

import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidaComunicazioni } from "@/lib/cache/invalidazione";
import type { StatoTesto } from "@/lib/clinical/state";
import type { EsitoGestione } from "@/lib/gestione/state";
import { DIMENSIONE_MASSIMA_BYTE } from "@/lib/documents/state";
import {
  isGenere,
  isPriorita,
  isStatoConsulto,
  isTipoMessaggio,
  type Priorita,
  type TipoMessaggio,
} from "@/lib/comunicazioni/tipi";

/**
 * Cosa si fa a una comunicazione interna.
 *
 * Ogni gesto passa da una funzione del database e non da un `insert`
 * diretto, e non è una preferenza stilistica: mandare un messaggio è
 * cinque cose che devono avvenire insieme — la riga, l'anteprima sul
 * filo, la ricevuta di chi scrive, l'avviso a chi deve rispondere, la
 * traccia nel registro. Scritte qui sarebbero cinque chiamate di rete
 * con quattro punti in cui fermarsi a metà, e il quarto è quello che
 * lascia un consulto senza notifica.
 *
 * Quello che resta a questo livello è la validazione di ciò che arriva
 * da un modulo HTML — dove tutto è una stringa, compreso ciò che
 * dovrebbe essere un enum — e la traduzione degli errori in una frase
 * che una persona possa leggere.
 */

/** Le comunicazioni interne sono del personale: un paziente non entra. */
async function requireInterno() {
  const profile = await requireProfile();
  if (profile.role === "patient") {
    throw new Error("Le comunicazioni interne sono riservate al personale di Unique.");
  }
  return profile;
}

/**
 * Un errore di Postgres, in italiano.
 *
 * Le eccezioni sollevate dalle funzioni del database sono già scritte
 * per essere lette — «Il consulto è chiuso.» — e vanno mostrate così
 * come sono. Tutto il resto (violazioni di vincolo, timeout) diventa una
 * frase generica: un messaggio che parla di `conversation_participants`
 * non aiuta chi lo legge e racconta lo schema a chi non deve conoscerlo.
 */
function leggibile(errore: unknown, ripiego: string): string {
  if (!(errore instanceof Error)) return ripiego;
  const m = errore.message;
  // Le nostre `raise exception` finiscono con un punto e sono in italiano.
  if (/[a-zà-ù]\.$/i.test(m) && !m.includes("_")) return m;
  return ripiego;
}

function priorita(formData: FormData, campo = "priorita"): Priorita {
  const v = String(formData.get(campo) ?? "normal");
  return isPriorita(v) ? v : "normal";
}

function tipo(formData: FormData, campo = "tipo"): TipoMessaggio {
  const v = String(formData.get(campo) ?? "info");
  return isTipoMessaggio(v) ? v : "info";
}

/** Le caselle di un `select multiple` o di un gruppo di checkbox. */
function elenco(formData: FormData, campo: string): string[] {
  return formData
    .getAll(campo)
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
}

/* ── Aprire ───────────────────────────────────────────────────────── */

export async function apriConversazione(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const titolo = String(formData.get("titolo") ?? "").trim();
  const corpo = String(formData.get("corpo") ?? "").trim();
  const genereGrezzo = String(formData.get("genere") ?? "direct");
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const persone = elenco(formData, "persone");
  const reparti = elenco(formData, "reparti");

  if (titolo.length < 3) {
    return { esito: "errore", messaggio: "Serve un oggetto: è quello che si legge nell'elenco." };
  }
  if (corpo.length < 2) {
    return { esito: "errore", messaggio: "Il messaggio è vuoto." };
  }
  if (persone.length === 0 && reparti.length === 0) {
    return {
      esito: "errore",
      messaggio: "Indica almeno un destinatario: una persona o un reparto.",
    };
  }

  // Il genere si deduce dai destinatari invece di chiederlo: chiederlo
  // avrebbe permesso una conversazione «diretta» con quattro reparti
  // dentro, e nessuno avrebbe capito perché l'elenco la mostra così.
  const genere = reparti.length > 0
    ? "department"
    : persone.length > 1
      ? "group"
      : isGenere(genereGrezzo)
        ? genereGrezzo
        : "direct";

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("open_conversation", {
      p_title: titolo,
      p_body: corpo,
      p_kind: genere,
      p_priority: priorita(formData),
      p_department: reparti[0] ?? null,
      p_patient: pazienteId || null,
      p_profiles: persone,
      p_departments: reparti,
      p_message_kind: tipo(formData),
    });

    if (error) throw new Error(error.message);

    invalidaComunicazioni(pazienteId || null);
    return { esito: "ok", messaggio: "Comunicazione aperta." };
  } catch (errore) {
    return {
      esito: "errore",
      messaggio: leggibile(errore, "Comunicazione non aperta."),
    };
  }
}

/* ── Scrivere ─────────────────────────────────────────────────────── */

export async function inviaMessaggio(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const corpo = String(formData.get("corpo") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();

  if (!conversationId) {
    return { esito: "errore", messaggio: "Conversazione non indicata." };
  }
  if (corpo.length < 1) {
    return { esito: "errore", messaggio: "Il messaggio è vuoto." };
  }

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("post_message", {
      p_conversation: conversationId,
      p_body: corpo,
      p_kind: tipo(formData),
      p_priority: priorita(formData),
      p_document: String(formData.get("documentId") ?? "").trim() || null,
    });

    if (error) throw new Error(error.message);

    // Scrivere è anche leggere: lasciare acceso il pallino di una
    // conversazione in cui si è appena risposto è il modo più rapido per
    // insegnare a ignorarlo.
    await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });

    invalidaComunicazioni(pazienteId || null);
    return { esito: "ok", messaggio: "Inviato." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Messaggio non inviato.") };
  }
}

/* ── Leggere ──────────────────────────────────────────────────────── */

/**
 * Segnare letta una conversazione.
 *
 * Al contrario dei fili con i pazienti — dove il timestamp è uno per
 * tutta la clinica e segnarlo all'apertura toglierebbe il pallino a
 * tutto il team — qui la lettura è di una persona sola. Aprire *è*
 * leggere, e chiedere un clic in più per confermare qualcosa che è già
 * successo sarebbe burocrazia.
 *
 * Non torna niente e non si attende: la pagina è già stata disegnata.
 */
export async function segnaLetta(conversationId: string): Promise<void> {
  if (!conversationId) return;

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
  } catch {
    // Muto per costruzione, come il registro degli accessi: una pagina
    // clinica non si rompe perché un pallino è rimasto acceso.
  }
}

/* ── Silenziare, chiudere, aggiungere ─────────────────────────────── */

export async function silenziaConversazione(formData: FormData): Promise<void> {
  const profile = await requireInterno();
  const id = String(formData.get("conversationId") ?? "").trim();
  const silenzia = formData.get("silenzia") === "true";
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("conversation_participants")
    .update({ is_muted: silenzia })
    .eq("conversation_id", id)
    .eq("profile_id", profile.id);

  invalidaComunicazioni(null);
}

export async function chiudiConversazione(formData: FormData): Promise<void> {
  await requireInterno();
  const id = String(formData.get("conversationId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const riapri = formData.get("riapri") === "true";
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("set_conversation_closed", {
    p_conversation: id,
    p_closed: !riapri,
  });

  invalidaComunicazioni(pazienteId || null);
}

export async function aggiungiPartecipante(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const id = String(formData.get("conversationId") ?? "").trim();
  const destinatario = String(formData.get("destinatario") ?? "").trim();

  if (!id || !destinatario) {
    return { esito: "errore", messaggio: "Indica chi aggiungere." };
  }

  // Un solo campo per due cose diverse: il modulo manda `persona:<id>`
  // oppure `reparto:<id>`. Due `select` affiancati avrebbero permesso di
  // riempirli entrambi, e il database avrebbe rifiutato dopo il clic.
  const [genere, valore] = destinatario.split(":");
  if (!valore || (genere !== "persona" && genere !== "reparto")) {
    return { esito: "errore", messaggio: "Destinatario non valido." };
  }

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("add_conversation_participant", {
      p_conversation: id,
      p_profile: genere === "persona" ? valore : null,
      p_department: genere === "reparto" ? valore : null,
    });

    if (error) throw new Error(error.message);

    invalidaComunicazioni(null);
    return { esito: "ok", messaggio: "Aggiunto." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Non aggiunto.") };
  }
}

/* ── Consulti ─────────────────────────────────────────────────────── */

export async function richiediConsulto(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const repartoId = String(formData.get("repartoId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const descrizione = String(formData.get("descrizione") ?? "").trim();
  const incaricato = String(formData.get("incaricato") ?? "").trim();
  const scadenza = String(formData.get("scadenza") ?? "").trim();

  if (!pazienteId) return { esito: "errore", messaggio: "Indica il paziente." };
  if (!repartoId) return { esito: "errore", messaggio: "Indica il reparto destinatario." };
  if (motivo.length < 3) {
    return {
      esito: "errore",
      messaggio: "Serve un motivo: è la prima cosa che legge chi lo prende in carico.",
    };
  }

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("request_consultation", {
      p_patient: pazienteId,
      p_department: repartoId,
      p_reason: motivo,
      p_description: descrizione || null,
      p_priority: priorita(formData),
      p_assignee: incaricato || null,
      // Una data senza ora è mezzanotte, e mezzanotte è la fine del
      // giorno indicato: una scadenza «entro il 10» che scade all'alba
      // del 10 sarebbe stata letta come un bug.
      p_due_at: scadenza ? `${scadenza}T23:59:00` : null,
    });

    if (error) throw new Error(error.message);

    invalidaComunicazioni(pazienteId);
    return { esito: "ok", messaggio: "Consulto richiesto." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Consulto non richiesto.") };
  }
}

/**
 * Muovere un consulto.
 *
 * La macchina a stati è nel database — `advance_consultation` conosce le
 * transizioni ammesse — e qui si controlla solo che lo stato richiesto
 * sia uno dei cinque. Riscrivere le regole di transizione anche qui
 * avrebbe prodotto due macchine, e la seconda sarebbe andata fuori sincrono.
 */
export async function avanzaConsulto(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const consultoId = String(formData.get("consultoId") ?? "").trim();
  const stato = String(formData.get("stato") ?? "").trim();
  const risposta = String(formData.get("risposta") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();

  if (!consultoId) return { esito: "errore", messaggio: "Consulto non indicato." };
  if (!isStatoConsulto(stato)) {
    return { esito: "errore", messaggio: "Stato non valido." };
  }
  if (stato === "answered" && risposta.length < 3) {
    return { esito: "errore", messaggio: "Una risposta vuota non è una risposta." };
  }

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.rpc("advance_consultation", {
      p_consultation: consultoId,
      p_status: stato,
      p_answer: risposta || null,
    });

    if (error) throw new Error(error.message);

    invalidaComunicazioni(pazienteId || null);

    const detto: Record<string, string> = {
      taken: "Preso in carico.",
      in_review: "In valutazione.",
      answered: "Risposta inviata.",
      closed: "Consulto chiuso.",
      open: "Riaperto.",
    };
    return { esito: "ok", messaggio: detto[stato] ?? "Aggiornato." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Consulto non aggiornato.") };
  }
}

/* ── Allegati ─────────────────────────────────────────────────────── */

/**
 * Allegare un referto già in cartella.
 *
 * Non copia niente: salva un riferimento a `documents`, e i permessi
 * restano quelli del documento. Se domani chi guarda esce dal care team
 * del paziente, l'allegato smette di aprirsi — che è il comportamento
 * giusto, e sarebbe stato impossibile ottenerlo duplicando il file.
 */
export async function allegaDocumento(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();

  if (!conversationId || !documentId) {
    return { esito: "errore", messaggio: "Indica il documento da allegare." };
  }

  try {
    const profile = await requireInterno();
    const supabase = await createSupabaseServerClient();

    // Il titolo lo legge la RLS di `documents`: se chi allega non ha
    // titolo su quel referto, qui non arriva niente e ci fermiamo.
    const { data: documento } = await supabase
      .from("documents")
      .select("id, title, mime_type, size_bytes")
      .eq("id", documentId)
      .maybeSingle();

    const d = documento as {
      id: string;
      title: string;
      mime_type: string | null;
      size_bytes: number | null;
    } | null;

    if (!d) {
      return { esito: "errore", messaggio: "Documento non accessibile." };
    }

    const { error } = await supabase.from("conversation_attachments").insert({
      conversation_id: conversationId,
      document_id: d.id,
      file_name: d.title,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      uploaded_by: profile.id,
    });

    if (error) throw new Error(error.message);

    await supabase.rpc("log_comms", {
      p_action: "communication.attachment.added",
      p_conversation: conversationId,
      p_patient: pazienteId || null,
      p_metadata: { document_id: d.id },
    });

    invalidaComunicazioni(pazienteId || null);
    return { esito: "ok", messaggio: "Allegato." };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Allegato non aggiunto.") };
  }
}

/** Un nome file finisce dentro un percorso di storage: va disinnescato. */
function nomeSicuro(nome: string): string {
  return (
    nome
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(-80)
      .replace(/^[.\-]+/, "") || "allegato"
  );
}

/**
 * Caricare un file nella conversazione.
 *
 * Per ciò che in cartella non c'è: la foto di una lastra, il PDF di un
 * collega esterno, uno schema disegnato a mano. Ciò che **è** un referto
 * va caricato in cartella e allegato da lì — lì viene classificato, ne
 * vengono estratti i valori e resta nella storia clinica della persona,
 * mentre qui resterebbe in fondo a una conversazione.
 *
 * Il percorso è `<conversation_id>/<uuid>-<nome>`: il primo segmento è
 * la chiave dei permessi, esattamente come per i referti. Il nome
 * originale non entra nel percorso senza essere ripulito — un file
 * chiamato `../../altro` scriverebbe altrove.
 *
 * Se la riga non si scrive, il file viene tolto: un oggetto nello
 * storage senza la sua riga è invisibile a chiunque e non lo cancella
 * più nessuno.
 */
export async function caricaAllegato(
  _prev: StatoTesto,
  formData: FormData,
): Promise<StatoTesto> {
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const pazienteId = String(formData.get("pazienteId") ?? "").trim();
  const file = formData.get("file");

  if (!conversationId) {
    return { esito: "errore", messaggio: "Conversazione non indicata." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { esito: "errore", messaggio: "Nessun file selezionato." };
  }
  if (file.size > DIMENSIONE_MASSIMA_BYTE) {
    const mb = Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024);
    return { esito: "errore", messaggio: `Il file supera gli ${mb} MB consentiti.` };
  }

  try {
    const profile = await requireInterno();
    const supabase = await createSupabaseServerClient();

    const percorso = `${conversationId}/${crypto.randomUUID()}-${nomeSicuro(file.name)}`;

    // La policy dello storage chiede `conversation_writable`: se chi
    // carica non partecipa, il caricamento fallisce qui e non serve un
    // controllo in più a monte.
    const caricamento = await supabase.storage
      .from("clinical-comms")
      .upload(percorso, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (caricamento.error) {
      return {
        esito: "errore",
        messaggio: "Caricamento non riuscito. Controlla di poter scrivere in questa conversazione.",
      };
    }

    const { error } = await supabase.from("conversation_attachments").insert({
      conversation_id: conversationId,
      storage_path: percorso,
      file_name: file.name.slice(0, 200),
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: profile.id,
    });

    if (error) {
      await supabase.storage.from("clinical-comms").remove([percorso]);
      throw new Error(error.message);
    }

    await supabase.rpc("log_comms", {
      p_action: "communication.attachment.added",
      p_conversation: conversationId,
      p_patient: pazienteId || null,
      p_metadata: { file_name: file.name, size_bytes: file.size },
    });

    invalidaComunicazioni(pazienteId || null);
    return { esito: "ok", messaggio: `«${file.name}» caricato.` };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Allegato non caricato.") };
  }
}

/**
 * Il collegamento firmato per aprire un allegato caricato nel bucket.
 *
 * I file clinici non sono pubblici e non lo diventano: l'URL vale dieci
 * minuti — il tempo di una lettura, non di una giornata — e la firma la
 * produce Supabase soltanto se la policy di lettura dice sì. Un
 * collegamento copiato e incollato altrove smette di funzionare da solo.
 */
export async function urlAllegato(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;

  try {
    await requireInterno();
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.storage
      .from("clinical-comms")
      .createSignedUrl(storagePath, 600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/* ── Reparti (direzione) ──────────────────────────────────────────── */

async function requireDirezione() {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "owner") {
    throw new Error("Solo la direzione può modificare i reparti.");
  }
  return profile;
}

/**
 * Da un nome a uno slug: minuscolo, senza accenti, con i trattini.
 *
 * `NFD` separa la lettera dal suo accento, e il filtro che segue tiene
 * solo l'ASCII: è il modo di scrivere «Riabilitazione post-chirurgica»
 * e ottenere uno slug leggibile invece di una stringa con dentro dei
 * segni che nessuna barra degli indirizzi mostra volentieri.
 */
function slugifica(nome: string): string {
  return nome
    .normalize("NFD")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Creare un reparto.
 *
 * Torna `EsitoGestione` e non `StatoTesto` come le altre azioni di
 * questo file: il modulo che la chiama vive nel Control Center, che ha
 * il suo stato, i suoi campi scuri e il suo `ModuloAzione`. Adattare il
 * componente del banco al nostro tipo sarebbe stato scrivere un secondo
 * modulo identico al primo — e i due sarebbero divergiti alla prima
 * modifica.
 */
export async function creaReparto(
  _prev: EsitoGestione,
  formData: FormData,
): Promise<EsitoGestione> {
  const nome = String(formData.get("nome") ?? "").trim();
  const descrizione = String(formData.get("descrizione") ?? "").trim();
  const clinico = formData.get("clinico") === "true";

  if (nome.length < 2) return { esito: "errore", messaggio: "Serve un nome." };

  const slug = slugifica(nome);
  if (!slug) {
    return {
      esito: "errore",
      messaggio: "Il nome non produce un identificativo valido.",
    };
  }

  try {
    await requireDirezione();
    const supabase = await createSupabaseServerClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "unique")
      .maybeSingle();

    const organizationId = (org as { id: string } | null)?.id;
    if (!organizationId) {
      return { esito: "errore", messaggio: "Organizzazione non trovata." };
    }

    const { error } = await supabase.from("departments").insert({
      organization_id: organizationId,
      slug,
      name: nome,
      description: descrizione || null,
      is_clinical: clinico,
    });

    if (error) {
      // 23505: slug già preso. È l'unico caso che vale la pena spiegare.
      if (error.code === "23505") {
        return { esito: "errore", messaggio: "Esiste già un reparto con questo nome." };
      }
      throw new Error(error.message);
    }

    invalidaComunicazioni(null);
    return { esito: "ok", messaggio: `Reparto «${nome}» creato.` };
  } catch (errore) {
    return { esito: "errore", messaggio: leggibile(errore, "Reparto non creato.") };
  }
}

export async function cambiaStatoReparto(formData: FormData): Promise<void> {
  await requireDirezione();
  const id = String(formData.get("repartoId") ?? "").trim();
  const attiva = formData.get("attiva") === "true";
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("departments").update({ is_active: attiva }).eq("id", id);

  invalidaComunicazioni(null);
}

export async function cambiaMembroReparto(formData: FormData): Promise<void> {
  await requireDirezione();
  const repartoId = String(formData.get("repartoId") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  const dentro = formData.get("dentro") === "true";
  if (!repartoId || !profileId) return;

  const supabase = await createSupabaseServerClient();

  if (dentro) {
    // `upsert` e non `insert`: chi è già uscito dal reparto e rientra ha
    // una riga con `ended_at` valorizzato, e un insert nudo fallirebbe
    // sulla chiave primaria senza dire perché.
    await supabase
      .from("department_members")
      .upsert(
        { department_id: repartoId, profile_id: profileId, ended_at: null },
        { onConflict: "department_id,profile_id" },
      );
  } else {
    await supabase
      .from("department_members")
      .update({ ended_at: new Date().toISOString() })
      .eq("department_id", repartoId)
      .eq("profile_id", profileId);
  }

  invalidaComunicazioni(null);
}
