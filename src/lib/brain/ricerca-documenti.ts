import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { frammenta } from "@/lib/brain/frammenti";

/**
 * Il Brain che cerca dentro i referti.
 *
 * Due funzioni: una scrive l'indice quando un documento viene letto,
 * l'altra lo interroga quando qualcuno fa una domanda.
 *
 * ---
 *
 * **Il recupero non è un permesso.**
 *
 * È la regola che rende sicuro tutto il resto, e va detta prima del
 * codice. `search_document_chunks` è `security invoker`: gira con i
 * permessi di chi la chiama, quindi la Row Level Security di
 * `document_chunks` si applica *dentro* la query. Non c'è nessun punto
 * in cui questo file «filtra i risultati per il paziente giusto» —
 * perché un filtro applicato dopo è un filtro che si può dimenticare, e
 * quella dimenticanza, qui, significa il referto di una persona nella
 * risposta data a un'altra.
 *
 * L'ordine è: **utente → ruolo → relazione clinica → righe leggibili →
 * e solo allora il Brain**. Il parametro `patientId` di `cerca()` non
 * concede niente: restringe soltanto, dentro ciò che era già leggibile.
 *
 * **Il client di sessione, mai quello privilegiato.** Se un domani
 * qualcuno importasse qui `createSupabaseServiceClient`, il recupero
 * diventerebbe cieco ai permessi senza che nessun test se ne accorga.
 * Non c'è, e non deve esserci.
 */

/*
 * Il client con cui si scrive l'indice.
 *
 * La pipeline documentale tipizza il proprio client come `any` — è la
 * sola via per farci passare indifferentemente il client di sessione e
 * quello privilegiato, che hanno tipi generati diversi. Qui si accetta
 * la stessa cosa, con un nome che dice cos'è invece di lasciare un
 * `any` nudo in mezzo a una firma.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type ClientScrittura = any;

export interface Passaggio {
  chunkId: string;
  documentId: string;
  patientId: string;
  titolo: string;
  /** La data del documento, non quella del caricamento. */
  documentoIl: string | null;
  pagina: number | null;
  testo: string;
  rilevanza: number;
}

/* ── Scrivere l'indice ────────────────────────────────────────────── */

/**
 * Indicizza il testo di un'estrazione.
 *
 * Chiamata dalla pipeline documentale subito dopo aver salvato
 * l'estrazione. Non solleva mai: un referto che non si riesce a
 * indicizzare resta un referto perfettamente valido in cartella, e far
 * fallire il caricamento per un problema di ricerca sarebbe scambiare
 * l'accessorio per l'essenziale.
 *
 * ---
 *
 * **Il client arriva da fuori, e non è un dettaglio.**
 *
 * La pipeline usa il client di sessione quando carica un professionista
 * e la chiave privilegiata quando carica un paziente — perché un
 * paziente non può scrivere dati clinici non ancora validati. La policy
 * `chunks_write` passa da `can_write_clinical`, che il paziente non
 * soddisfa: aprendo qui un client di sessione per conto proprio, i
 * referti caricati dai pazienti non sarebbero mai finiti nell'indice, e
 * il guasto sarebbe stato invisibile — nessun errore, solo un Brain che
 * non trova mai niente su metà dei documenti.
 *
 * Restituisce quanti frammenti ha scritto, che è ciò che la pipeline
 * riassume a chi ha caricato.
 */
export async function indicizzaEstrazione(
  supabase: ClientScrittura,
  extractionId: string,
  documentId: string,
  patientId: string,
  testo: string | null | undefined,
): Promise<number> {
  const frammenti = frammenta(testo);
  if (frammenti.length === 0) return 0;

  try {
    /*
     * Si cancella prima di scrivere.
     *
     * Rileggere un documento produce una **nuova** estrazione accanto
     * alla precedente — è una scelta della pipeline, e serve a
     * confrontare due letture dello stesso file. I frammenti però sono
     * legati all'estrazione, non al documento: senza questa riga una
     * rilettura raddoppierebbe i risultati di ricerca, e il Brain
     * citerebbe due volte la stessa frase come se fossero due fonti.
     */
    await supabase.from("document_chunks").delete().eq("extraction_id", extractionId);

    const { error } = await supabase.from("document_chunks").insert(
      frammenti.map((f) => ({
        extraction_id: extractionId,
        document_id: documentId,
        patient_id: patientId,
        ordinale: f.ordinale,
        pagina: f.pagina,
        testo: f.testo,
      })),
    );

    if (error) {
      console.error("[brain] indicizzazione non riuscita:", error.message);
      return 0;
    }

    return frammenti.length;
  } catch (errore) {
    console.error(
      "[brain] indicizzazione non riuscita:",
      errore instanceof Error ? errore.message : String(errore),
    );
    return 0;
  }
}

/* ── Interrogare l'indice ─────────────────────────────────────────── */

interface RigaRicerca {
  chunk_id: string;
  document_id: string;
  patient_id: string;
  pagina: number | null;
  testo: string;
  titolo: string;
  documento_il: string | null;
  rilevanza: number;
}

/**
 * I passaggi pertinenti, fra quelli che chi chiede può leggere.
 *
 * `patientId` restringe alla cartella di una persona: è quello che si
 * vuole dentro una cartella clinica. Lasciandolo nullo si cerca in
 * tutto ciò che sarebbe comunque leggibile — utile al medico che cerca
 * un protocollo fra i propri assistiti, inutile e innocuo al paziente,
 * che di cartelle ne ha una.
 */
export async function cerca(
  domanda: string,
  patientId: string | null = null,
  quanti = 8,
): Promise<Passaggio[]> {
  const pulita = domanda.trim();
  if (pulita.length < 3) return [];

  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc("search_document_chunks", {
      p_query: pulita,
      p_patient: patientId,
      p_limit: quanti,
    });

    if (error) {
      console.error("[brain] ricerca nei documenti non riuscita:", error.message);
      return [];
    }

    return ((data ?? []) as RigaRicerca[]).map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      patientId: r.patient_id,
      titolo: r.titolo,
      documentoIl: r.documento_il,
      pagina: r.pagina,
      testo: r.testo,
      rilevanza: Number(r.rilevanza),
    }));
  } catch (errore) {
    console.error(
      "[brain] ricerca nei documenti non riuscita:",
      errore instanceof Error ? errore.message : String(errore),
    );
    return [];
  }
}

/**
 * Le fonti, senza ripetere due volte lo stesso documento.
 *
 * Un referto lungo produce spesso tre frammenti pertinenti, e citarlo
 * tre volte fa sembrare che tre documenti dicano la stessa cosa. Si
 * tiene la pagina del passaggio più rilevante, che è quella da aprire.
 */
export function fontiDistinte(
  passaggi: Passaggio[],
): { documentId: string; titolo: string; documentoIl: string | null; pagina: number | null }[] {
  const viste = new Map<string, Passaggio>();
  for (const p of passaggi) {
    const gia = viste.get(p.documentId);
    if (!gia || p.rilevanza > gia.rilevanza) viste.set(p.documentId, p);
  }

  return [...viste.values()]
    .sort((a, b) => b.rilevanza - a.rilevanza)
    .map((p) => ({
      documentId: p.documentId,
      titolo: p.titolo,
      documentoIl: p.documentoIl,
      pagina: p.pagina,
    }));
}
