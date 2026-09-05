import "server-only";
import { requireProfile } from "@/lib/auth";
import { insertMeasurements } from "@/lib/brain/analyze";
import {
  analizzaDocumentoStrutturato,
  type AnalisiDocumento,
  type ContestoClinico,
  type MisuraStorica,
} from "@/lib/brain/documento";
import { motoreConversazione } from "@/lib/brain/fornitore";
import { validateExtraction } from "@/lib/brain/validation";
import { fiduciaPerRiga, leggiDocumento, FormatoNonSupportato } from "@/lib/document-intelligence/lettore";
import { improntaDi } from "@/lib/document-intelligence/impronta";
import { processa } from "@/lib/document-intelligence/processore";
import { TIPO_VERSO_KIND, type DocumentoStrutturato, type StatoLavorazione } from "@/lib/document-intelligence/tipi";
import { getMetric } from "@/lib/score/metrics";
import { loadLatestValues, recomputeAndStoreScore } from "@/lib/score/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";

/**
 * La pipeline, dal file in archivio alla cartella clinica.
 *
 * Mette insieme i pezzi e non ne implementa nessuno: la lettura sta in
 * `document-intelligence/lettore.ts`, la strutturazione in
 * `processore.ts`, l'analisi in `brain/documento.ts`. Qui c'è solo
 * l'orchestrazione e la scrittura — che è già abbastanza lavoro, perché
 * una scrittura a metà su una cartella clinica è peggio di nessuna
 * scrittura.
 *
 * ---
 *
 * **Perché il Longevity Score continua a passare da dove passava
 * prima.** Il motore clinico ha già una coda di revisione delle misure,
 * con le sue regole di validazione testate e la sua interfaccia. Il
 * nuovo motore non la scavalca: estrae quaranta esami, e i dieci che
 * corrispondono a una metrica dello Score entrano in
 * `measurement_proposals` esattamente come prima, passando dalla stessa
 * `validateExtraction`.
 *
 * Costruire una seconda strada verso le stesse misure avrebbe voluto
 * dire due politiche di validazione, due code, e — il giorno in cui
 * divergono — due punteggi diversi per lo stesso paziente.
 */

const BUCKET = "patient-documents";

export interface EsitoElaborazione {
  extractionId: string;
  stato: StatoLavorazione;
  strutturato: DocumentoStrutturato;
  analisi: AnalisiDocumento;
  /** Quante misure sono entrate nella coda del motore clinico. */
  misureProposte: number;
  misureApplicate: number;
  duplicato: boolean;
}

export class DocumentoNonAccessibile extends Error {
  constructor() {
    super("Documento non trovato o non accessibile.");
    this.name = "DocumentoNonAccessibile";
  }
}

export class ChiavePrivilegiataRichiesta extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY non è impostata: i documenti caricati dai pazienti non vengono analizzati in automatico.",
    );
    this.name = "ChiavePrivilegiataRichiesta";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/**
 * Elabora un documento già in archivio.
 *
 * Il controllo di accesso avviene **prima**, con il client di sessione
 * dell'utente: se la Row Level Security non restituisce la riga,
 * l'utente non ha titolo su quel documento e non si va oltre. Solo
 * dopo, e solo per un paziente che analizza un proprio referto, si passa
 * alla chiave privilegiata — perché un paziente non può scrivere
 * risultati non ancora validati, e nemmeno deve poterli leggere.
 */
export async function elaboraDocumento(documentId: string): Promise<EsitoElaborazione> {
  const profile = await requireProfile();
  const sessione = await createSupabaseServerClient();

  const { data: docData } = await sessione
    .from("documents")
    .select(
      "id, patient_id, title, storage_path, mime_type, size_bytes, issued_on, kind, file_hash, " +
        "patient:patients(id, date_of_birth, sex_at_birth, profile:profiles(full_name))",
    )
    .eq("id", documentId)
    .maybeSingle();

  const documento = docData as {
    id: string;
    patient_id: string;
    title: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    issued_on: string | null;
    kind: string;
    file_hash: string | null;
    patient: {
      id: string;
      date_of_birth: string | null;
      sex_at_birth: string | null;
      profile: { full_name: string } | null;
    } | null;
  } | null;

  if (!documento) throw new DocumentoNonAccessibile();

  const serveIlPrivilegio = profile.role === "patient";
  if (serveIlPrivilegio && !isServiceRoleConfigured()) {
    throw new ChiavePrivilegiataRichiesta();
  }
  const supabase: Client = serveIlPrivilegio ? createSupabaseServiceClient() : sessione;

  await stato(supabase, documentId, "PROCESSING");

  try {
    // ── Il file ───────────────────────────────────────────────────
    const scaricato = await supabase.storage.from(BUCKET).download(documento.storage_path);
    if (scaricato.error || !scaricato.data) {
      throw new Error(`File non scaricabile: ${scaricato.error?.message ?? "assente"}`);
    }

    const dati = new Uint8Array(await scaricato.data.arrayBuffer());
    const impronta = documento.file_hash ?? improntaDi(dati);

    // ── Duplicati ─────────────────────────────────────────────────
    const duplicato = await cercaDuplicato(supabase, documento.patient_id, impronta, documentId);

    // ── Lettura ───────────────────────────────────────────────────
    const nomeFile = documento.title;
    let lettura;

    try {
      lettura = await leggiDocumento(dati, nomeFile, documento.mime_type);
    } catch (errore) {
      if (errore instanceof FormatoNonSupportato) {
        await stato(supabase, documentId, "FAILED", errore.dettaglio);
        throw errore;
      }
      throw errore;
    }

    // L'OCR è già avvenuto dentro il lettore quando serviva: qui si
    // dichiara soltanto, perché lo stato lo vede chi guarda la pagina.
    if (lettura.contenuto.via !== "nativo") {
      await stato(supabase, documentId, "OCR");
    }

    await stato(supabase, documentId, "EXTRACTING");

    // ── Strutturazione ────────────────────────────────────────────
    const paziente = documento.patient;
    const contesto = {
      oggi: new Date().toISOString().slice(0, 10),
      sesso: normalizzaSesso(paziente?.sex_at_birth),
      eta: etaDa(paziente?.date_of_birth),
      fiduciaPerRiga: fiduciaPerRiga(lettura.contenuto),
      nomePazienteInCartella: paziente?.profile?.full_name ?? null,
      duplicatoDi: duplicato,
    };

    const strutturato = processa(
      lettura.contenuto,
      {
        nomeFile,
        formato: lettura.rilevamento.formato!,
        mime: lettura.rilevamento.mime,
        dimensioneByte: documento.size_bytes ?? dati.length,
        impronta,
        documentId,
      },
      contesto,
    );

    await stato(supabase, documentId, "ANALYZING");

    // ── Il Brain ──────────────────────────────────────────────────
    const storico = await caricaStorico(supabase, documento.patient_id, documentId);

    const contestoClinico: ContestoClinico = {
      eta: contesto.eta,
      sesso: contesto.sesso,
      storico,
      obiettivi: await caricaObiettivi(supabase, documento.patient_id),
    };

    const analisi = analizzaDocumentoStrutturato(strutturato, contestoClinico);

    // ── Scrittura ─────────────────────────────────────────────────
    const { extractionId, analysisId } = await salva(
      supabase,
      documento,
      strutturato,
      analisi,
      lettura.rilevamento.formato!,
      profile.id,
      duplicato !== null,
    );

    // ── La coda del motore clinico ────────────────────────────────
    const { proposte, applicate } = await alimentaMotoreClinico(
      supabase,
      documento,
      strutturato,
      analysisId,
      profile.id,
    );

    // ── Lo stato finale ───────────────────────────────────────────
    const finale: StatoLavorazione = analisi.richiede_revisione_clinica
      ? "REVIEW_REQUIRED"
      : "COMPLETED";

    await stato(supabase, documentId, finale);
    await aggiornaDocumento(supabase, documento, strutturato, impronta);

    return {
      extractionId,
      stato: finale,
      strutturato,
      analisi,
      misureProposte: proposte,
      misureApplicate: applicate,
      duplicato: duplicato !== null,
    };
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    await stato(supabase, documentId, "FAILED", messaggio);
    throw errore;
  }
}

/* ── Stato ────────────────────────────────────────────────────────── */

/**
 * Fa avanzare la lavorazione.
 *
 * Non solleva mai: se il registro di stato ha un problema, il documento
 * viene elaborato lo stesso. Perdere l'analisi di un referto perché una
 * riga di stato non si è scritta sarebbe il peggiore degli scambi.
 */
async function stato(
  supabase: Client,
  documentId: string,
  nuovo: StatoLavorazione,
  errore?: string,
): Promise<void> {
  try {
    await supabase.rpc("set_document_processing", {
      p_document: documentId,
      p_state: nuovo,
      p_error: errore ?? null,
    });
  } catch (problema) {
    console.error("[document-intelligence] stato non aggiornato:", problema);
  }
}

/* ── Duplicati ────────────────────────────────────────────────────── */

async function cercaDuplicato(
  supabase: Client,
  patientId: string,
  impronta: string,
  esclusoId: string,
): Promise<{ id: string; titolo: string } | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, title")
    .eq("patient_id", patientId)
    .eq("file_hash", impronta)
    .neq("id", esclusoId)
    .limit(1);

  const riga = ((data ?? []) as { id: string; title: string }[])[0];
  return riga ? { id: riga.id, titolo: riga.title } : null;
}

/* ── Storico ──────────────────────────────────────────────────────── */

/**
 * I valori precedenti dello stesso paziente.
 *
 * Esclude il documento in lavorazione: se ci fosse dentro, il trend
 * confronterebbe il referto con se stesso e dichiarerebbe ogni valore
 * «stabile». È il genere di errore che non si vede mai, perché il
 * risultato sembra ragionevole.
 */
async function caricaStorico(
  supabase: Client,
  patientId: string,
  documentIdEscluso: string,
): Promise<MisuraStorica[]> {
  const { data } = await supabase
    .from("patient_biomarker_history")
    .select("canonical_name, value, unit, measured_on, document_id")
    .eq("patient_id", patientId)
    .order("measured_on", { ascending: true })
    .limit(2000);

  return ((data ?? []) as {
    canonical_name: string;
    value: number | null;
    unit: string | null;
    measured_on: string | null;
    document_id: string | null;
  }[])
    .filter((r) => r.value !== null && r.measured_on !== null && r.document_id !== documentIdEscluso)
    .map((r) => ({
      canonical_name: r.canonical_name,
      valore: Number(r.value),
      unita: r.unit,
      data: r.measured_on as string,
    }));
}

/** Gli obiettivi del percorso del paziente, se ne ha uno attivo. */
async function caricaObiettivi(supabase: Client, patientId: string): Promise<string[]> {
  const { data } = await supabase
    .from("program_enrollments")
    .select("program:programs(name, description)")
    .eq("patient_id", patientId)
    .eq("status", "active")
    .limit(3);

  return ((data ?? []) as { program: { name: string } | null }[])
    .map((r) => r.program?.name)
    .filter((n): n is string => Boolean(n));
}

/* ── Scrittura ────────────────────────────────────────────────────── */

async function salva(
  supabase: Client,
  documento: { id: string; patient_id: string; title: string },
  strutturato: DocumentoStrutturato,
  analisi: AnalisiDocumento,
  formato: string,
  attore: string,
  duplicato: boolean,
): Promise<{ extractionId: string; analysisId: string | null }> {
  // ── L'analisi del motore clinico, che esisteva già ──────────────
  // Continua a essere scritta: è ciò a cui la cartella e il centro di
  // attenzione guardano oggi, e toglierla romperebbe pagine che
  // funzionano.
  const { data: analisiRiga } = await supabase
    .from("document_analyses")
    .insert({
      document_id: documento.id,
      patient_id: documento.patient_id,
      status: "completed",
      model: `unique-document-intelligence${
        strutturato.lettura.motoreOcr ? `+ocr:${strutturato.lettura.motoreOcr}` : ""
      }/${motoreConversazione()}`,
      detected_kind: TIPO_VERSO_KIND[strutturato.tipo_documento],
      detected_date: strutturato.data_documento,
      summary: analisi.sintesi,
      next_steps: analisi.raccomandazioni.slice(0, 8).map((r) => r.azione),
      raw: strutturato,
      requested_by: attore,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const analysisId = (analisiRiga as { id: string } | null)?.id ?? null;

  // ── L'estrazione ────────────────────────────────────────────────
  const { data: estrazioneRiga, error } = await supabase
    .from("document_extractions")
    .insert({
      document_id: documento.id,
      patient_id: documento.patient_id,
      analysis_id: analysisId,
      document_type: strutturato.tipo_documento,
      document_date: strutturato.data_documento,
      laboratory: strutturato.laboratorio,
      source_format: formato,
      page_count: strutturato.documento.pagine,
      read_via: strutturato.lettura.via,
      ocr_engine: strutturato.lettura.motoreOcr ?? null,
      text_confidence: strutturato.lettura.fiduciaTesto,
      extracted_text: strutturato.testo_estratto,
      structured: strutturato,
      patient_name_on_document: strutturato.paziente.nome,
      overall_confidence: strutturato.confidenza_complessiva,
      requires_review: analisi.richiede_revisione_clinica,
      warnings: strutturato.avvertenze,
      created_by: attore,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Estrazione non salvata: ${error.message}`);
  const extractionId = (estrazioneRiga as { id: string }).id;

  const comuni = {
    extraction_id: extractionId,
    document_id: documento.id,
    patient_id: documento.patient_id,
  };

  // ── I biomarcatori ──────────────────────────────────────────────
  if (strutturato.biomarcatori.length > 0) {
    const { error: erroreBiomarcatori } = await supabase.from("document_biomarkers").insert(
      strutturato.biomarcatori.map((b) => ({
        ...comuni,
        canonical_name: b.canonical_name,
        display_name: b.display_name,
        document_label: b.etichetta_documento,
        category: b.categoria,
        metric_code: b.metric_code,
        value: b.valore,
        raw_value: b.valore_testuale,
        unit: b.unita,
        original_unit: b.conversione?.da ?? null,
        original_value: b.conversione?.valoreOriginale ?? null,
        ref_low: b.intervallo.min,
        ref_high: b.intervallo.max,
        ref_source: b.intervallo.fonte,
        ref_text: b.intervallo.testo ?? null,
        state: b.stato,
        confidence: b.confidenza,
        requires_review: b.richiedeVerifica,
        notes: b.note,
        citation: b.citazione,
        source_page: b.pagina,
        measured_on: b.data,
      })),
    );

    if (erroreBiomarcatori) {
      throw new Error(`Valori non salvati: ${erroreBiomarcatori.message}`);
    }
  }

  // ── Farmaci, integratori, note ──────────────────────────────────
  const note = [
    ...strutturato.farmaci.map((f) => ({
      ...comuni,
      kind: "farmaco",
      subtype: null,
      label: f.nome,
      detail: f.principio_attivo,
      dose: f.dose,
      posology: f.posologia,
      citation: f.citazione,
      source_page: null,
      confidence: f.confidenza,
    })),
    ...strutturato.integratori.map((i) => ({
      ...comuni,
      kind: "integratore",
      subtype: null,
      label: i.nome,
      detail: null,
      dose: i.dose,
      posology: i.posologia,
      citation: i.citazione,
      source_page: null,
      confidence: i.confidenza,
    })),
    ...strutturato.note_cliniche.map((n) => ({
      ...comuni,
      kind: "nota",
      subtype: n.tipo,
      label: n.tipo,
      detail: n.testo,
      dose: null,
      posology: null,
      citation: null,
      source_page: n.pagina,
      confidence: n.confidenza,
    })),
  ];

  if (note.length > 0) await supabase.from("document_notes").insert(note);

  // ── Intuizioni ──────────────────────────────────────────────────
  const intuizioni = [
    ...analisi.reperti_positivi.map((i) => ({ bucket: "positivo", ...i })),
    ...analisi.reperti_negativi.map((i) => ({ bucket: "negativo", ...i })),
    ...analisi.aree_da_rivedere.map((i) => ({ bucket: "da_rivedere", ...i })),
  ];

  if (intuizioni.length > 0) {
    await supabase.from("document_insights").insert(
      intuizioni.map((i) => ({
        ...comuni,
        bucket: i.bucket,
        observation: i.osservazione,
        severity: i.gravita,
        evidence: i.prove,
        trend: i.trend,
        confidence: i.confidenza,
        refs: i.riferimenti,
      })),
    );
  }

  // ── Raccomandazioni ─────────────────────────────────────────────
  if (analisi.raccomandazioni.length > 0) {
    await supabase.from("document_recommendations").insert(
      analisi.raccomandazioni.map((r) => ({
        ...comuni,
        action: r.azione,
        rationale: r.motivo,
        priority: r.priorita,
        refs: r.riferimenti,
        requires_clinical_approval: true,
      })),
    );
  }

  // ── Il registro ─────────────────────────────────────────────────
  await supabase.rpc("log_document_event", {
    p_document: documento.id,
    p_action: "extraction.completed",
    p_entity: "extraction",
    p_entity_id: extractionId,
    p_previous: null,
    p_new: null,
    p_metadata: {
      biomarcatori: strutturato.biomarcatori.length,
      confidenza: strutturato.confidenza_complessiva,
      via: strutturato.lettura.via,
      motore_ocr: strutturato.lettura.motoreOcr ?? null,
      duplicato,
    },
  });

  return { extractionId, analysisId };
}

/* ── Il ponte verso lo Score ──────────────────────────────────────── */

/**
 * I biomarcatori che alimentano una metrica dello Score entrano nella
 * coda che esiste già.
 *
 * Passano da `validateExtraction`, cioè dalle stesse regole
 * deterministiche di sempre: confidenza, unità, plausibilità, confronto
 * con lo storico, soglie cliniche. Quelle regole sono testate e un
 * medico le può leggere; costruirne un secondo insieme qui accanto
 * avrebbe voluto dire due politiche per la stessa decisione.
 */
async function alimentaMotoreClinico(
  supabase: Client,
  documento: { id: string; patient_id: string; issued_on: string | null },
  strutturato: DocumentoStrutturato,
  analysisId: string | null,
  attore: string,
): Promise<{ proposte: number; applicate: number }> {
  if (!analysisId) return { proposte: 0, applicate: 0 };

  const misurabili = strutturato.biomarcatori.filter(
    (b) => b.metric_code !== null && b.valore !== null,
  );

  if (misurabili.length === 0) return { proposte: 0, applicate: 0 };

  const precedenti = await loadLatestValues(supabase, documento.patient_id);

  const { proposals } = validateExtraction(
    misurabili.map((b) => ({
      metric_code: b.metric_code as string,
      label: b.display_name,
      value: b.valore,
      category: null,
      unit: b.unita,
      measured_on: b.data,
      confidence: b.confidenza,
      source_excerpt: b.citazione,
    })),
    {
      previousValues: precedenti,
      documentDate: strutturato.data_documento ?? documento.issued_on,
      today: new Date().toISOString().slice(0, 10),
    },
  );

  const automatiche = proposals.filter((p) => p.status === "auto_applied");

  const idMisure = await insertMeasurements(
    supabase,
    documento.patient_id,
    documento.id,
    analysisId,
    attore,
    automatiche,
  );

  if (proposals.length > 0) {
    await supabase.from("measurement_proposals").insert(
      proposals.map((p) => ({
        analysis_id: analysisId,
        patient_id: documento.patient_id,
        metric_code: p.metricCode,
        label: p.label,
        value: p.value,
        category: p.category,
        unit: p.unit,
        measured_on: p.measuredOn,
        confidence: p.confidence,
        source_excerpt: p.sourceExcerpt,
        previous_value: p.previousValue,
        delta: p.delta,
        status: p.status,
        review_reasons: p.reviewReasons,
        measurement_id: idMisure[p.metricCode] ?? null,
      })),
    );
  }

  // Il punteggio si ricalcola solo se qualcosa è davvero entrato.
  if (automatiche.length > 0) {
    await recomputeAndStoreScore(supabase, documento.patient_id);
  }

  return { proposte: proposals.length, applicate: automatiche.length };
}

/* ── Ritocchi al documento ────────────────────────────────────────── */

/**
 * Classificazione, data e impronta.
 *
 * Non sovrascrive mai una classificazione decisa da una persona: se il
 * documento ha già un `kind` diverso da «altro», qualcuno l'ha scelto, e
 * il motore non lo contraddice.
 */
async function aggiornaDocumento(
  supabase: Client,
  documento: { id: string; kind: string; issued_on: string | null; file_hash: string | null },
  strutturato: DocumentoStrutturato,
  impronta: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    page_count: strutturato.documento.pagine,
    source_format: strutturato.documento.formato,
  };

  if (!documento.file_hash) patch.file_hash = impronta;
  if (documento.kind === "other") patch.kind = TIPO_VERSO_KIND[strutturato.tipo_documento];
  if (!documento.issued_on && strutturato.data_documento) {
    patch.issued_on = strutturato.data_documento;
  }

  await supabase.from("documents").update(patch).eq("id", documento.id);
}

/* ── Contesto del paziente ────────────────────────────────────────── */

function normalizzaSesso(grezzo: string | null | undefined): "M" | "F" | null {
  if (!grezzo) return null;
  const s = grezzo.trim().toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return null;
}

function etaDa(dataNascita: string | null | undefined): number | null {
  if (!dataNascita) return null;

  const nascita = new Date(dataNascita);
  if (Number.isNaN(nascita.getTime())) return null;

  const oggi = new Date();
  let anni = oggi.getFullYear() - nascita.getFullYear();
  const mese = oggi.getMonth() - nascita.getMonth();
  if (mese < 0 || (mese === 0 && oggi.getDate() < nascita.getDate())) anni -= 1;

  return anni >= 0 && anni < 130 ? anni : null;
}

/* ── Un dettaglio che serve alle metriche ─────────────────────────── */

/** L'unità attesa da una metrica dello Score, per mostrarla accanto al valore. */
export function unitaMetrica(metricCode: string | null): string | null {
  if (!metricCode) return null;
  return getMetric(metricCode)?.unit ?? null;
}
