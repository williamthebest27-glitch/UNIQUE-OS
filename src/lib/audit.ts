import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Chi ha guardato.
 *
 * Gli eventi di dominio raccontano cosa è **cambiato**: una visita
 * completata, un punteggio ricalcolato, un referto approvato. È il
 * novanta per cento di ciò che serve a far funzionare un sistema, e
 * zero per cento di ciò che serve a rispondere alla domanda che un
 * garante fa davvero: *chi ha aperto la cartella di questa persona, e
 * quando.*
 *
 * Aprire una cartella senza toccare niente non produce nessun evento.
 * È esattamente l'accesso che va tracciato — perché è quello che nessun
 * altro meccanismo lascerebbe vedere.
 *
 * Due proprietà, entrambe deliberate:
 *
 *   **Non fallisce mai.** `log_clinical_access` inghiotte i propri
 *   errori nel database, e qui non si aspetta nemmeno il risultato.
 *   Una traccia che può rompere una pagina clinica viene tolta dopo il
 *   secondo incidente, e da quel momento non traccia più niente.
 *
 *   **Non la scrive il client.** `audit_log` non ha policy di insert:
 *   l'unica strada è la funzione security definer. Un registro che il
 *   registrato può riscrivere non è un registro.
 */

/** Cosa si è fatto. Un verbo al passato, sempre lo stesso per lo stesso gesto. */
export type AzioneTracciata =
  | "patient.view"
  | "patient.section.view"
  | "document.view"
  | "score.view"
  | "copilot.query"
  | "briefing.view"
  | "export.view";

interface Traccia {
  azione: AzioneTracciata;
  /** La tabella toccata: `patient`, `document`, `score`. */
  entita: string;
  patientId: string;
  entityId?: string | null;
  /** Contesto utile a leggere la riga fra un anno. Niente dati clinici. */
  dettagli?: Record<string, string | number | boolean | null>;
}

/**
 * Registra una lettura di dati sanitari.
 *
 * Non si attende: il `void` sulla promessa è voluto. Una riga di
 * registro non deve stare fra il medico e la cartella che ha chiesto,
 * nemmeno per i quaranta millisecondi di un round trip.
 */
export function traccia({ azione, entita, patientId, entityId, dettagli }: Traccia): void {
  if (!isSupabaseConfigured() || !patientId) return;

  void (async () => {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.rpc("log_clinical_access", {
        p_action: azione,
        p_entity: entita,
        p_patient: patientId,
        p_entity_id: entityId ?? null,
        p_metadata: dettagli ?? {},
      });
    } catch (error) {
      // Muto per costruzione. Vale la pena saperlo nei log del server,
      // non vale la pena farlo sapere a chi sta leggendo una cartella.
      console.error("[audit] traccia non registrata:", error);
    }
  })();
}

/* ── Lettura ──────────────────────────────────────────────────────── */

export interface RigaAudit {
  id: number;
  azione: string;
  entita: string;
  entityId: string | null;
  attore: string | null;
  quando: string;
  dettagli: Record<string, unknown>;
}

/**
 * Etichette in italiano.
 *
 * Un registro leggibile solo da chi conosce i nomi delle azioni è un
 * registro che nessuno legge, e allora tanto vale non tenerlo.
 */
export const ETICHETTE_AUDIT: Record<string, string> = {
  "patient.view": "Ha aperto la cartella",
  "patient.section.view": "Ha consultato una sezione della cartella",
  "document.view": "Ha aperto un referto",
  "document.review": "Ha cambiato lo stato di revisione di un referto",
  "score.view": "Ha consultato il Longevity Score",
  "copilot.query": "Ha interrogato il copilot clinico",
  "briefing.view": "Ha letto la sintesi pre-visita",
  "export.view": "Ha esportato dati",
};

export function etichettaAudit(azione: string): string {
  return ETICHETTE_AUDIT[azione] ?? azione;
}

/**
 * Gli accessi alla cartella di un paziente.
 *
 * La policy `audit_select_care_team` la restringe a chi ha titolo su
 * quel paziente: qui non c'è un controllo di ruolo perché non
 * servirebbe a niente — se questa query fosse sbagliata, Postgres non
 * restituirebbe comunque righe di pazienti altrui.
 */
export async function accessiAlPaziente(
  patientId: string,
  limite = 30,
): Promise<RigaAudit[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, metadata, created_at, actor:profiles(full_name)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as unknown as {
    id: number;
    action: string;
    entity: string;
    entity_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    actor: { full_name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    azione: r.action,
    entita: r.entity,
    entityId: r.entity_id,
    attore: r.actor?.full_name ?? null,
    quando: r.created_at,
    dettagli: r.metadata ?? {},
  }));
}
