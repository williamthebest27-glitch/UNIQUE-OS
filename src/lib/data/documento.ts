import "server-only";
import { cache } from "react";
import type { DirezioneTrend, Gravita } from "@/lib/brain/documento";
import { ETICHETTE_CATEGORIA, type CategoriaClinica, type StatoValore } from "@/lib/document-intelligence/tipi";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Leggere un documento e tutto ciò che il motore ne ha ricavato.
 *
 * Una funzione sola per le due interfacce — quella del paziente e
 * quella del professionista — e non è una scorciatoia: **la differenza
 * fra ciò che i due vedono la decide la Row Level Security, non questo
 * file.** Se la separazione stesse qui, un errore in una condizione
 * mostrerebbe a un paziente i valori non ancora validati. Stando nel
 * database, un errore qui restituisce zero righe e basta.
 *
 * Per questo le query non hanno filtri di ruolo: chiedono tutto, e
 * Postgres consegna ciò che chi chiede ha diritto di vedere.
 */

export interface BiomarcatoreInCartella {
  id: string;
  canonicalName: string;
  nome: string;
  etichettaDocumento: string | null;
  categoria: CategoriaClinica;
  etichettaCategoria: string;
  metricCode: string | null;
  valore: number | null;
  valoreGrezzo: string | null;
  /** Il valore corretto da un professionista, quando c'è stata una correzione. */
  valoreCorretto: number | null;
  unita: string | null;
  unitaOriginale: string | null;
  valoreOriginale: number | null;
  intervallo: { min: number | null; max: number | null; fonte: string; testo: string | null };
  stato: StatoValore;
  confidenza: number;
  richiedeVerifica: boolean;
  note: string[];
  citazione: string | null;
  pagina: number | null;
  data: string | null;
  correttoDa: string | null;
  correttoIl: string | null;
}

export interface IntuizioneInCartella {
  id: string;
  gruppo: "positivo" | "negativo" | "da_rivedere";
  osservazione: string;
  gravita: Gravita;
  prove: string[];
  trend: DirezioneTrend | null;
  confidenza: number;
  riferimenti: string[];
}

export interface RaccomandazioneInCartella {
  id: string;
  azione: string;
  motivo: string | null;
  priorita: Gravita;
  riferimenti: string[];
  decisione: "accolta" | "respinta" | "rimandata" | null;
  decisaDa: string | null;
  decisaIl: string | null;
  notaDecisione: string | null;
}

export interface NotaInCartella {
  id: string;
  tipo: "farmaco" | "integratore" | "nota";
  sottotipo: string | null;
  etichetta: string;
  dettaglio: string | null;
  dose: string | null;
  posologia: string | null;
  citazione: string | null;
  confidenza: number;
}

export interface RigaRegistro {
  id: number;
  azione: string;
  attore: string | null;
  quando: string;
  prima: string | null;
  dopo: string | null;
  dettagli: Record<string, unknown>;
}

export interface DocumentoCompleto {
  id: string;
  patientId: string;
  titolo: string;
  tipo: string;
  formato: string | null;
  mime: string | null;
  dimensione: number | null;
  pagine: number | null;
  emessoIl: string | null;
  caricatoIl: string;
  caricatoDa: string | null;
  statoLavorazione: string;
  erroreLavorazione: string | null;
  statoRevisione: string;
  revisionatoDa: string | null;
  revisionatoIl: string | null;
  notaRevisione: string | null;

  /** L'estrazione più recente. Le precedenti restano in archivio. */
  estrazione: {
    id: string;
    tipoDocumento: string;
    dataDocumento: string | null;
    laboratorio: string | null;
    letturaVia: string;
    motoreOcr: string | null;
    fiduciaTesto: number | null;
    confidenza: number | null;
    richiedeRevisione: boolean;
    nomeSulDocumento: string | null;
    avvertenze: { codice: string; messaggio: string; riferimento?: string }[];
    sintesi: string | null;
    creataIl: string;
    testo: string | null;
  } | null;

  biomarcatori: BiomarcatoreInCartella[];
  intuizioni: IntuizioneInCartella[];
  raccomandazioni: RaccomandazioneInCartella[];
  note: NotaInCartella[];
  revisioniAnalisi: {
    id: string;
    decisione: string;
    nota: string | null;
    revisore: string | null;
    quando: string;
  }[];
  registro: RigaRegistro[];
}

/**
 * Un documento con tutto il suo corredo.
 *
 * Memoizzata per richiesta: la pagina la chiede, l'intestazione la
 * chiede, e il registro degli accessi vuole sapere il paziente. Sarebbe
 * la stessa query fatta tre volte.
 */
export const getDocumento = cache(async (documentId: string): Promise<DocumentoCompleto | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("documents")
    .select(
      "id, patient_id, title, kind, mime_type, size_bytes, page_count, source_format, " +
        "issued_on, created_at, processing_state, processing_error, " +
        "review_state, reviewed_at, review_note, " +
        "uploader:profiles!documents_uploaded_by_fkey(full_name), " +
        "revisore:profiles!documents_reviewed_by_fkey(full_name)",
    )
    .eq("id", documentId)
    .maybeSingle();

  const riga = data as {
    id: string;
    patient_id: string;
    title: string;
    kind: string;
    mime_type: string | null;
    size_bytes: number | null;
    page_count: number | null;
    source_format: string | null;
    issued_on: string | null;
    created_at: string;
    processing_state: string;
    processing_error: string | null;
    review_state: string;
    reviewed_at: string | null;
    review_note: string | null;
    uploader: { full_name: string } | null;
    revisore: { full_name: string } | null;
  } | null;

  // Nessuna riga significa una cosa sola: chi chiede non ha titolo su
  // questo documento. Non c'è altro da distinguere.
  if (!riga) return null;

  // ── L'estrazione più recente ────────────────────────────────────
  const { data: estrazioni } = await supabase
    .from("document_extractions")
    .select(
      "id, document_type, document_date, laboratory, read_via, ocr_engine, text_confidence, " +
        "overall_confidence, requires_review, patient_name_on_document, warnings, " +
        "extracted_text, created_at, analysis:document_analyses(summary)",
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1);

  const estrazione = ((estrazioni ?? []) as unknown as {
    id: string;
    document_type: string;
    document_date: string | null;
    laboratory: string | null;
    read_via: string;
    ocr_engine: string | null;
    text_confidence: number | null;
    overall_confidence: number | null;
    requires_review: boolean;
    patient_name_on_document: string | null;
    warnings: { codice: string; messaggio: string; riferimento?: string }[] | null;
    extracted_text: string | null;
    created_at: string;
    analysis: { summary: string | null } | null;
  }[])[0];

  if (!estrazione) {
    return {
      ...comuni(riga),
      estrazione: null,
      biomarcatori: [],
      intuizioni: [],
      raccomandazioni: [],
      note: [],
      revisioniAnalisi: [],
      registro: await registroDi(supabase, documentId),
    };
  }

  const [biomarcatori, intuizioni, raccomandazioni, note, revisioni, registro] = await Promise.all([
    supabase
      .from("document_biomarkers")
      .select(
        "id, canonical_name, display_name, document_label, category, metric_code, value, raw_value, " +
          "unit, original_unit, original_value, ref_low, ref_high, ref_source, ref_text, state, " +
          "confidence, requires_review, notes, citation, source_page, measured_on, " +
          "corrected_value, corrected_at, correttore:profiles!document_biomarkers_corrected_by_fkey(full_name)",
      )
      .eq("extraction_id", estrazione.id)
      .limit(300),

    supabase
      .from("document_insights")
      .select("id, bucket, observation, severity, evidence, trend, confidence, refs")
      .eq("extraction_id", estrazione.id)
      .limit(200),

    supabase
      .from("document_recommendations")
      .select(
        "id, action, rationale, priority, refs, decision, decided_at, decision_note, " +
          "decisore:profiles!document_recommendations_decided_by_fkey(full_name)",
      )
      .eq("extraction_id", estrazione.id)
      .limit(100),

    supabase
      .from("document_notes")
      .select("id, kind, subtype, label, detail, dose, posology, citation, confidence")
      .eq("extraction_id", estrazione.id)
      .limit(200),

    supabase
      .from("document_reviews")
      .select("id, decision, note, created_at, revisore:profiles(full_name)")
      .eq("extraction_id", estrazione.id)
      .order("created_at", { ascending: false })
      .limit(20),

    registroDi(supabase, documentId),
  ]);

  return {
    ...comuni(riga),
    estrazione: {
      id: estrazione.id,
      tipoDocumento: estrazione.document_type,
      dataDocumento: estrazione.document_date,
      laboratorio: estrazione.laboratory,
      letturaVia: estrazione.read_via,
      motoreOcr: estrazione.ocr_engine,
      fiduciaTesto: estrazione.text_confidence,
      confidenza: estrazione.overall_confidence,
      richiedeRevisione: estrazione.requires_review,
      nomeSulDocumento: estrazione.patient_name_on_document,
      avvertenze: estrazione.warnings ?? [],
      sintesi: estrazione.analysis?.summary ?? null,
      creataIl: estrazione.created_at,
      testo: estrazione.extracted_text,
    },

    biomarcatori: ((biomarcatori.data ?? []) as unknown as BiomarcatoreGrezzo[]).map(
      toBiomarcatore,
    ),

    intuizioni: ((intuizioni.data ?? []) as unknown as {
      id: string;
      bucket: "positivo" | "negativo" | "da_rivedere";
      observation: string;
      severity: Gravita;
      evidence: string[];
      trend: DirezioneTrend | null;
      confidence: number;
      refs: string[];
    }[]).map((r) => ({
      id: r.id,
      gruppo: r.bucket,
      osservazione: r.observation,
      gravita: r.severity,
      prove: r.evidence ?? [],
      trend: r.trend,
      confidenza: Number(r.confidence),
      riferimenti: r.refs ?? [],
    })),

    raccomandazioni: ((raccomandazioni.data ?? []) as unknown as {
      id: string;
      action: string;
      rationale: string | null;
      priority: Gravita;
      refs: string[];
      decision: "accolta" | "respinta" | "rimandata" | null;
      decided_at: string | null;
      decision_note: string | null;
      decisore: { full_name: string } | null;
    }[]).map((r) => ({
      id: r.id,
      azione: r.action,
      motivo: r.rationale,
      priorita: r.priority,
      riferimenti: r.refs ?? [],
      decisione: r.decision,
      decisaDa: r.decisore?.full_name ?? null,
      decisaIl: r.decided_at,
      notaDecisione: r.decision_note,
    })),

    note: ((note.data ?? []) as unknown as {
      id: string;
      kind: "farmaco" | "integratore" | "nota";
      subtype: string | null;
      label: string;
      detail: string | null;
      dose: string | null;
      posology: string | null;
      citation: string | null;
      confidence: number;
    }[]).map((r) => ({
      id: r.id,
      tipo: r.kind,
      sottotipo: r.subtype,
      etichetta: r.label,
      dettaglio: r.detail,
      dose: r.dose,
      posologia: r.posology,
      citazione: r.citation,
      confidenza: Number(r.confidence),
    })),

    revisioniAnalisi: ((revisioni.data ?? []) as unknown as {
      id: string;
      decision: string;
      note: string | null;
      created_at: string;
      revisore: { full_name: string } | null;
    }[]).map((r) => ({
      id: r.id,
      decisione: r.decision,
      nota: r.note,
      revisore: r.revisore?.full_name ?? null,
      quando: r.created_at,
    })),

    registro,
  };
});

/* ── Servizio ─────────────────────────────────────────────────────── */

interface BiomarcatoreGrezzo {
  id: string;
  canonical_name: string;
  display_name: string;
  document_label: string | null;
  category: string;
  metric_code: string | null;
  value: number | null;
  raw_value: string | null;
  unit: string | null;
  original_unit: string | null;
  original_value: number | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_source: string;
  ref_text: string | null;
  state: StatoValore;
  confidence: number;
  requires_review: boolean;
  notes: string[] | null;
  citation: string | null;
  source_page: number | null;
  measured_on: string | null;
  corrected_value: number | null;
  corrected_at: string | null;
  correttore: { full_name: string } | null;
}

function toBiomarcatore(r: BiomarcatoreGrezzo): BiomarcatoreInCartella {
  const categoria = (r.category as CategoriaClinica) ?? "altro";

  return {
    id: r.id,
    canonicalName: r.canonical_name,
    nome: r.display_name,
    etichettaDocumento: r.document_label,
    categoria,
    etichettaCategoria: ETICHETTE_CATEGORIA[categoria] ?? "Altro",
    metricCode: r.metric_code,
    valore: r.value === null ? null : Number(r.value),
    valoreGrezzo: r.raw_value,
    valoreCorretto: r.corrected_value === null ? null : Number(r.corrected_value),
    unita: r.unit,
    unitaOriginale: r.original_unit,
    valoreOriginale: r.original_value === null ? null : Number(r.original_value),
    intervallo: {
      min: r.ref_low === null ? null : Number(r.ref_low),
      max: r.ref_high === null ? null : Number(r.ref_high),
      fonte: r.ref_source,
      testo: r.ref_text,
    },
    stato: r.state,
    confidenza: Number(r.confidence),
    richiedeVerifica: r.requires_review,
    note: r.notes ?? [],
    citazione: r.citation,
    pagina: r.source_page,
    data: r.measured_on,
    correttoDa: r.correttore?.full_name ?? null,
    correttoIl: r.corrected_at,
  };
}

function comuni(riga: {
  id: string;
  patient_id: string;
  title: string;
  kind: string;
  mime_type: string | null;
  size_bytes: number | null;
  page_count: number | null;
  source_format: string | null;
  issued_on: string | null;
  created_at: string;
  processing_state: string;
  processing_error: string | null;
  review_state: string;
  reviewed_at: string | null;
  review_note: string | null;
  uploader: { full_name: string } | null;
  revisore: { full_name: string } | null;
}) {
  return {
    id: riga.id,
    patientId: riga.patient_id,
    titolo: riga.title,
    tipo: riga.kind,
    formato: riga.source_format,
    mime: riga.mime_type,
    dimensione: riga.size_bytes,
    pagine: riga.page_count,
    emessoIl: riga.issued_on,
    caricatoIl: riga.created_at,
    caricatoDa: riga.uploader?.full_name ?? null,
    statoLavorazione: riga.processing_state,
    erroreLavorazione: riga.processing_error,
    statoRevisione: riga.review_state,
    revisionatoDa: riga.revisore?.full_name ?? null,
    revisionatoIl: riga.reviewed_at,
    notaRevisione: riga.review_note,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function registroDi(supabase: any, documentId: string): Promise<RigaRegistro[]> {
  const { data } = await supabase
    .from("document_audit")
    .select("id, action, previous_value, new_value, metadata, created_at, attore:profiles(full_name)")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })
    .limit(80);

  return ((data ?? []) as unknown as {
    id: number;
    action: string;
    previous_value: string | null;
    new_value: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    attore: { full_name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    azione: r.action,
    attore: r.attore?.full_name ?? null,
    quando: r.created_at,
    prima: r.previous_value,
    dopo: r.new_value,
    dettagli: r.metadata ?? {},
  }));
}

/* ── L'elenco per il paziente ─────────────────────────────────────── */

export interface DocumentoInElenco {
  id: string;
  titolo: string;
  tipo: string;
  formato: string | null;
  dimensione: number | null;
  emessoIl: string | null;
  caricatoIl: string;
  caricatoDa: string | null;
  /** Vero se l'ha caricato la clinica e non il paziente. */
  dallaClinica: boolean;
  statoLavorazione: string;
  statoRevisione: string;
  nuovoPerIlPaziente: boolean;
  quantiValori: number;
}

/**
 * Tutti i documenti di un paziente.
 *
 * «Tutti» è la parola che conta. Prima la Patient App ne mostrava sei —
 * il pezzo di dashboard chiamato «documenti recenti» — e non esisteva
 * nessun posto in cui vedere gli altri. La Row Level Security li aveva
 * sempre resi accessibili: mancava l'interfaccia.
 *
 * Chi carica un referto e chi lo riceve dalla clinica devono poter
 * vedere lo stesso elenco. Una cartella clinica di cui il paziente vede
 * una finestra di sei righe non è la sua cartella.
 */
export const getDocumentiDelPaziente = cache(
  async (patientId: string): Promise<DocumentoInElenco[]> => {
    if (!isSupabaseConfigured()) return [];

    const supabase = await createSupabaseServerClient();

    const [documenti, conteggi] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, title, kind, source_format, size_bytes, issued_on, created_at, " +
            "processing_state, review_state, is_new_for_patient, uploaded_by, " +
            "uploader:profiles!documents_uploaded_by_fkey(full_name, role)",
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(200),

      supabase
        .from("document_biomarkers")
        .select("document_id")
        .eq("patient_id", patientId)
        .limit(4000),
    ]);

    const per = new Map<string, number>();
    for (const r of (conteggi.data ?? []) as { document_id: string }[]) {
      per.set(r.document_id, (per.get(r.document_id) ?? 0) + 1);
    }

    return ((documenti.data ?? []) as unknown as {
      id: string;
      title: string;
      kind: string;
      source_format: string | null;
      size_bytes: number | null;
      issued_on: string | null;
      created_at: string;
      processing_state: string;
      review_state: string;
      is_new_for_patient: boolean;
      uploader: { full_name: string; role: string } | null;
    }[]).map((r) => ({
      id: r.id,
      titolo: r.title,
      tipo: r.kind,
      formato: r.source_format,
      dimensione: r.size_bytes,
      emessoIl: r.issued_on,
      caricatoIl: r.created_at,
      caricatoDa: r.uploader?.full_name ?? null,
      dallaClinica: (r.uploader?.role ?? "patient") !== "patient",
      statoLavorazione: r.processing_state,
      statoRevisione: r.review_state,
      nuovoPerIlPaziente: r.is_new_for_patient,
      quantiValori: per.get(r.id) ?? 0,
    }));
  },
);

/** Il `patient_id` di chi sta guardando, se è un paziente. */
export async function mioPatientId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_patient_id");

  return (data as string | null) ?? null;
}
