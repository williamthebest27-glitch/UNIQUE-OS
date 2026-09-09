"use server";

import { revalidatePath } from "next/cache";
import { invalidaContatoriPaziente } from "@/lib/cache/invalidazione";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emitEvent } from "@/lib/events/emit";
import { daFormData, leggiDomande, valida } from "@/lib/patient/questionari";
import { mioPatientId, type TipoConsenso } from "@/lib/data/paziente-sezioni";
import { getPatientDashboard } from "@/lib/data/patient";
import { situazione } from "@/lib/data/percorso-paziente";
import { cerca, fontiDistinte } from "@/lib/brain/ricerca-documenti";
import { rispondi, type ContestoPaziente, type RispostaAssistente } from "@/lib/patient/assistente";

/**
 * Ciò che il paziente può cambiare.
 *
 * L'elenco è corto di proposito: le proprie risposte, i propri consensi,
 * i propri recapiti, e il segno "l'ho letto" su documenti e messaggi.
 * **Nessun dato clinico.** Un valore di laboratorio, un punteggio, una
 * misura: quelli li scrive chi li ha misurati, e il paziente li legge.
 *
 * Nessuna azione lancia: torna una frase. Un errore in faccia a un
 * paziente deve leggersi, non aprire una pagina grigia.
 */

export type EsitoPaziente = { esito: "ok" | "errore"; messaggio: string } | null;

function messaggioLeggibile(raw: string): string {
  return raw.replace(/^.*?(?:ERROR|error):\s*/i, "").trim() || "Non è riuscito. Riprova.";
}

function errore(messaggio: string): EsitoPaziente {
  return { esito: "errore", messaggio };
}

function ok(messaggio: string): EsitoPaziente {
  return { esito: "ok", messaggio };
}

function testo(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

async function soloPaziente() {
  const profile = await requireProfile();
  if (profile.role !== "patient") throw new Error("Azione riservata al paziente.");
  return profile;
}

/* ── Documenti e notifiche: il segno "l'ho visto" ─────────────────── */

export async function segnaDocumentoAperto(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await soloPaziente();

  const id = testo(formData, "documentId");
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_document_opened", { p_document: id });

  revalidatePath("/documenti");
  revalidatePath("/risultati");
  revalidatePath("/dashboard");
}

export async function segnaNotificheLette(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const profile = await requireProfile();

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);

  revalidatePath("/notifiche");
  revalidatePath("/dashboard");
  invalidaContatoriPaziente();
}

/* ── Questionari ──────────────────────────────────────────────────── */

/**
 * Salvare le risposte, o consegnarle.
 *
 * La validazione qui è una cortesia: mette l'errore accanto al campo
 * giusto. Il conteggio che conta lo rifà `save_assessment` dentro il
 * database, dove un modulo non può mentire sul proprio completamento.
 */
export async function salvaQuestionario(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  try {
    await soloPaziente();
    const id = testo(formData, "assessmentId");
    // Il bottone «Salva e continua dopo» porta `bozza`; il principale no.
    const consegna = formData.get("bozza") !== "true";
    if (!id) return errore("Questionario non indicato.");
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa le risposte non vengono salvate.");

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("patient_assessments")
      .select("questions, status")
      .eq("id", id)
      .maybeSingle();

    const riga = data as { questions: unknown; status: string } | null;
    if (!riga) return errore("Questionario non trovato.");
    if (riga.status === "completed") return errore("Questo questionario è già stato consegnato.");

    const domande = leggiDomande(riga.questions);
    const risposte = daFormData(domande, (nome) => formData.getAll(nome).map(String));

    const esito = valida(domande, risposte, consegna);
    if (!esito.ok) {
      const primo = Object.values(esito.errori)[0];
      return errore(
        consegna && esito.mancanti.length > 0
          ? `Mancano ${esito.mancanti.length} ${esito.mancanti.length === 1 ? "risposta" : "risposte"} per consegnare.`
          : (primo ?? "Qualche risposta non va."),
      );
    }

    const { error } = await supabase.rpc("save_assessment", {
      p_assessment: id,
      p_answers: risposte,
      p_complete: consegna,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/questionari");
    revalidatePath(`/questionari/${id}`);
    revalidatePath("/dashboard");
    invalidaContatoriPaziente();

    return ok(
      consegna
        ? "Grazie. Le tue risposte sono arrivate al team clinico."
        : "Salvato. Puoi riprendere quando vuoi.",
    );
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }
}

/* ── Messaggi ─────────────────────────────────────────────────────── */

export async function apriConversazione(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  let nuovoId: string;
  try {
    await soloPaziente();
    const oggetto = testo(formData, "oggetto");
    const corpo = testo(formData, "corpo");
    const categoria = testo(formData, "categoria") === "administrative" ? "administrative" : "clinical";

    if (!oggetto) return errore("Serve un oggetto: è quello che si legge nell'elenco.");
    if (corpo.length < 2) return errore("Scrivi il tuo messaggio.");
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa i messaggi non vengono inviati.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("open_thread", {
      p_subject: oggetto,
      p_body: corpo,
      p_category: categoria,
    });
    if (error) throw new Error(error.message);
    nuovoId = data as string;
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }

  revalidatePath("/messaggi");
  redirect(`/messaggi/${nuovoId}`);
}

/**
 * L'allegato di un messaggio, se ce n'è uno.
 *
 * Non apre una seconda strada per i file: passa da `caricaFile`, la
 * stessa che serve il caricamento in cartella. Vuol dire che un allegato
 * eredita per intero i controlli che già esistono — il formato deciso
 * dai byte e non dal nome, il limite di dimensione, il riconoscimento
 * dei duplicati, il percorso di storage sotto la cartella del paziente,
 * l'avviso al care team e la lettura del motore documentale.
 *
 * Un secondo percorso di upload sarebbe stato più corto da scrivere e
 * avrebbe significato, il giorno dopo, un file sanitario salvato con
 * metà di quei controlli.
 *
 * Restituisce `null` quando non c'è nessun file: è il caso normale.
 * Lancia quando c'è e non è andato — meglio non spedire il messaggio che
 * spedirlo senza il referto di cui parla.
 */
async function allegatoDi(
  formData: FormData,
  campi?: Record<string, string>,
): Promise<string | null> {
  const file = formData.get("allegato");
  if (!(file instanceof File) || file.size === 0) return null;

  const { caricaFile } = await import("@/lib/documents/caricamento");

  const dati = new FormData();
  dati.set("file", file);
  for (const [chiave, valore] of Object.entries(campi ?? {})) dati.set(chiave, valore);

  const esito = await caricaFile(dati);
  if (esito.esito !== "ok" || !esito.documentId) {
    throw new Error(esito.messaggio ?? "Allegato non caricato.");
  }
  return esito.documentId;
}

export async function inviaMessaggio(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  try {
    await requireProfile();
    const threadId = testo(formData, "threadId");
    const corpo = testo(formData, "corpo");
    if (!threadId) return errore("Conversazione non indicata.");
    if (corpo.length < 2) return errore("Scrivi il tuo messaggio.");
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa i messaggi non vengono inviati.");

    const documentId = await allegatoDi(formData);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("send_message", {
      p_thread: threadId,
      p_body: corpo,
      p_document: documentId,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/messaggi/${threadId}`);
    revalidatePath("/messaggi");
    if (documentId) revalidatePath("/documenti");
    invalidaContatoriPaziente();
    return ok(documentId ? "Messaggio e allegato inviati." : "Messaggio inviato.");
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }
}

/** Aprire una conversazione la segna letta, come aprire una busta. */
export async function segnaConversazioneLetta(threadId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("messages")
    .update({ read_by_patient_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("from_patient", false)
    .is("read_by_patient_at", null);

  revalidatePath(`/messaggi/${threadId}`);
  revalidatePath("/messaggi");
  invalidaContatoriPaziente();
}

/* ── Profilo, preferenze, consensi ────────────────────────────────── */

export async function aggiornaRecapiti(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  try {
    const profile = await soloPaziente();
    const nome = testo(formData, "nome");
    const cognome = testo(formData, "cognome");
    if (!nome) return errore("Il nome non può restare vuoto.");
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa i dati non vengono salvati.");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: nome,
        last_name: cognome || null,
        full_name: [nome, cognome].filter(Boolean).join(" "),
        phone: testo(formData, "telefono") || null,
      })
      .eq("id", profile.id);
    if (error) throw new Error(error.message);

    revalidatePath("/profilo");
    return ok("Recapiti aggiornati.");
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }
}

export async function salvaPreferenze(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  try {
    const profile = await soloPaziente();
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa le preferenze non vengono salvate.");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        notification_prefs: {
          email: formData.get("email") === "on",
          appointment_reminders: formData.get("appointmentReminders") === "on",
          results: formData.get("results") === "on",
          messages: formData.get("messages") === "on",
        },
      })
      .eq("id", profile.id);
    if (error) throw new Error(error.message);

    revalidatePath("/profilo");
    return ok("Preferenze salvate.");
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }
}

const CONSENSI: TipoConsenso[] = ["privacy_policy", "health_data", "marketing", "research"];

/**
 * Concedere o revocare un consenso.
 *
 * Non si aggiorna una riga: se ne scrive una nuova. "Ha accettato il
 * marketing?" è una domanda senza risposta utile se non si sa quando e
 * quale versione dell'informativa — e una revoca che cancella la
 * concessione precedente cancella anche la prova di averla avuta.
 */
export async function decidiConsenso(
  _prev: EsitoPaziente,
  formData: FormData,
): Promise<EsitoPaziente> {
  try {
    const profile = await soloPaziente();
    const tipo = testo(formData, "tipo") as TipoConsenso;
    const concesso = testo(formData, "concesso") === "true";
    if (!CONSENSI.includes(tipo)) return errore("Consenso non riconosciuto.");
    if (!isSupabaseConfigured()) return ok("In modalità dimostrativa i consensi non vengono registrati.");

    const patientId = await mioPatientId();
    if (!patientId) return errore("La tua scheda clinica non è ancora attiva.");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("patient_consents").insert({
      patient_id: patientId,
      kind: tipo,
      granted: concesso,
      decided_by: profile.id,
      source: "patient_app",
    });
    if (error) throw new Error(error.message);

    await emitEvent("consent.changed", {
      entity: "consent",
      patientId,
      payload: { kind: tipo, granted: concesso },
    });

    revalidatePath("/profilo");
    revalidatePath("/dashboard");
    return ok(concesso ? "Consenso registrato." : "Consenso revocato.");
  } catch (error) {
    return errore(messaggioLeggibile(error instanceof Error ? error.message : String(error)));
  }
}

/* ── L'assistente ─────────────────────────────────────────────────── */

/**
 * La domanda del paziente, con la risposta del motore proprietario.
 *
 * Il contesto lo compone il server dai dati che quel paziente ha già
 * davanti: la domanda non raggiunge nessun servizio esterno, e la
 * risposta non può contenere un fatto che non sia in quel contesto.
 */
export async function chiediAUnique(
  _prev: RispostaAssistente | null,
  formData: FormData,
): Promise<RispostaAssistente | null> {
  await soloPaziente();

  const domanda = testo(formData, "domanda");
  if (!domanda) return null;

  /*
   * Il contesto si ricostruisce qui, non arriva dal modulo.
   *
   * Prima veniva serializzato in un campo nascosto e rispedito dal
   * browser a ogni domanda. Non era una falla verso gli altri — sono i
   * dati di chi sta scrivendo, e la Row Level Security non c'entra — ma
   * era una bugia sull'architettura: il commento in cima alla pagina
   * dice «il contesto lo compone il server», e il server si limitava a
   * rileggere ciò che il client gli restituiva. Chiunque avesse aperto
   * gli strumenti di sviluppo poteva far dire all'assistente che il
   * proprio punteggio era novanta.
   *
   * Ricostruirlo costa due letture già memoizzate per richiesta, e in
   * cambio la frase «risponde con i tuoi dati» diventa vera.
   */
  const dati = await getPatientDashboard();
  if (!dati) {
    return {
      categoria: "non_so",
      testo: "Non riesco a leggere i tuoi dati in questo momento. Riprova fra poco.",
      collegamenti: [],
      fonti: [],
    };
  }

  const contesto: ContestoPaziente = (await situazione(dati)).contestoAssistente;
  const risposta = rispondi(domanda, contesto);

  /*
   * Quando il motore non sa rispondere, si guarda nei propri documenti.
   *
   * È la parte che mancava all'assistente del paziente: sapeva parlare
   * di punteggio, visite e crediti, e davanti a «cosa c'era scritto nel
   * referto della tiroide» rispondeva con l'elenco di ciò che sa fare.
   *
   * Si cerca **solo nella propria cartella** — `mioPatientId()`, non un
   * id che arriva da fuori — e la funzione di ricerca è `security
   * invoker`: anche sbagliando quel parametro, il database non
   * restituirebbe il documento di un'altra persona.
   *
   * Si riportano le parole del referto, non una spiegazione: il
   * documento il paziente lo può già aprire per intero dalla sua
   * sezione Documenti, quindi citarlo non gli mostra niente di nuovo —
   * mentre *interpretarlo* sarebbe esattamente la riga che questo
   * assistente non deve attraversare.
   */
  if (risposta.categoria === "non_so") {
    const patientId = await mioPatientId();
    const passaggi = patientId ? await cerca(domanda, patientId, 3) : [];

    if (passaggi.length > 0) {
      const corpo = passaggi
        .map((p) => {
          const dove = p.pagina ? `${p.titolo}, pagina ${p.pagina}` : p.titolo;
          return `**${dove}**\n«${p.testo}»`;
        })
        .join("\n\n");

      return {
        categoria: "risultati",
        testo:
          `Non so rispondere da solo, ma nei tuoi documenti ho trovato ` +
          `${passaggi.length === 1 ? "questo passaggio" : "questi passaggi"}. ` +
          `Sono le parole del referto, così come sono scritte — per capire ` +
          `cosa significano nel tuo caso, chiedi a chi ti segue.\n\n${corpo}`,
        collegamenti: [{ href: "/documenti", etichetta: "I tuoi documenti" }],
        fonti: fontiDistinte(passaggi).map((f) =>
          f.pagina ? `${f.titolo} (pagina ${f.pagina})` : f.titolo,
        ),
      };
    }
  }

  return risposta;
}
