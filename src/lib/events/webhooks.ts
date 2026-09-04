import "server-only";
import { createSupabaseServiceClient, isServiceRoleConfigured } from "@/lib/supabase/service";
import { backoffMinuti, firmaPayload } from "@/lib/events/firma";

/**
 * La consegna degli eventi verso l'esterno.
 *
 * Unique OS non vuole essere un monolite: booking, pagamenti, WhatsApp,
 * email, Meta restano i migliori strumenti disponibili per il loro
 * mestiere. Perché possano reagire a ciò che succede qui, gli eventi
 * escono firmati verso gli endpoint iscritti.
 *
 * L'invio non avviene nel trigger che ha generato l'evento: una chiamata
 * HTTP dentro una transazione tiene aperta la transazione finché il
 * destinatario risponde — e un destinatario lento bloccherebbe la
 * chiusura di una visita. Il trigger accoda, questo codice spedisce.
 *
 * La consegna è **at-least-once**: se la richiesta va a buon fine ma la
 * risposta si perde, il tentativo si ripete. Chi riceve deve essere
 * idempotente sull'id della consegna.
 */

const MAX_TENTATIVI = 6;

export interface EsitoConsegna {
  consegnate: number;
  fallite: number;
  rimandate: number;
}

interface DeliveryRow {
  id: string;
  attempts: number;
  endpoint: { id: string; url: string; secret: string; is_active: boolean } | null;
  event: {
    id: number;
    event_name: string;
    entity: string;
    entity_id: string | null;
    patient_id: string | null;
    location_id: string | null;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  } | null;
}

/**
 * Spedisce le consegne in attesa.
 *
 * Da richiamare a intervalli regolari (pg_cron, un job esterno, o la
 * rotta `/api/integrazioni/eventi`). Usa la chiave service-role perché
 * gira senza un utente collegato: non c'è una sessione da cui ereditare i
 * permessi, e la coda non appartiene a nessuno.
 */
export async function consegnaEventiInAttesa(limite = 50): Promise<EsitoConsegna> {
  if (!isServiceRoleConfigured()) return { consegnate: 0, fallite: 0, rimandate: 0 };

  const supabase = createSupabaseServiceClient();
  const adesso = new Date().toISOString();

  const { data } = await supabase
    .from("webhook_deliveries")
    .select(
      "id, attempts, endpoint:webhook_endpoints(id, url, secret, is_active), " +
        "event:domain_events(id, event_name, entity, entity_id, patient_id, location_id, payload, occurred_at)",
    )
    .eq("status", "pending")
    .lte("next_retry_at", adesso)
    .order("next_retry_at", { ascending: true })
    .limit(limite);

  const righe = (data ?? []) as unknown as DeliveryRow[];
  const esito: EsitoConsegna = { consegnate: 0, fallite: 0, rimandate: 0 };

  for (const riga of righe) {
    const endpoint = riga.endpoint;
    const evento = riga.event;

    // Endpoint spento o evento sparito: la consegna non ha più senso.
    if (!endpoint?.is_active || !evento) {
      await supabase
        .from("webhook_deliveries")
        .update({ status: "skipped", last_error: "Endpoint disattivato o evento assente." })
        .eq("id", riga.id);
      continue;
    }

    const body = JSON.stringify({
      id: evento.id,
      event: evento.event_name,
      entity: evento.entity,
      entity_id: evento.entity_id,
      patient_id: evento.patient_id,
      location_id: evento.location_id,
      payload: evento.payload ?? {},
      occurred_at: evento.occurred_at,
      delivery_id: riga.id,
    });

    const timestamp = String(Math.floor(Date.now() / 1000));
    const tentativi = riga.attempts + 1;

    try {
      const risposta = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-unique-event": evento.event_name,
          "x-unique-delivery": riga.id,
          "x-unique-signature": firmaPayload(endpoint.secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);

      await supabase
        .from("webhook_deliveries")
        .update({
          status: "delivered",
          attempts: tentativi,
          delivered_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", riga.id);

      await supabase
        .from("webhook_endpoints")
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", endpoint.id);

      esito.consegnate += 1;
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      const esaurito = tentativi >= MAX_TENTATIVI;

      await supabase
        .from("webhook_deliveries")
        .update({
          status: esaurito ? "failed" : "pending",
          attempts: tentativi,
          last_error: messaggio.slice(0, 500),
          next_retry_at: new Date(Date.now() + backoffMinuti(tentativi) * 60_000).toISOString(),
        })
        .eq("id", riga.id);

      if (esaurito) esito.fallite += 1;
      else esito.rimandate += 1;
    }
  }

  return esito;
}
