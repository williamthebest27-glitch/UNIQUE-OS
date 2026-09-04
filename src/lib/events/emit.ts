import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventName } from "@/lib/events/catalog";

/**
 * Emettere un evento dall'applicazione.
 *
 * Quasi tutti gli eventi nascono nel database, dai trigger: un
 * appuntamento completato genera `appointment.completed` da qualunque
 * strada arrivi la modifica, anche dal gestionale esterno. Questa
 * funzione serve ai fatti che nel database non hanno una tabella —
 * un'azione eseguita dal Brain, una versione pubblicata in knowledge
 * base — e passa comunque dalla stessa funzione `emit_event`, così la
 * riga è indistinguibile dalle altre.
 *
 * Non solleva: un evento perso non deve far fallire l'operazione che lo
 * ha generato. Al contrario, un'operazione fallita non deve lasciare in
 * giro l'evento che la annunciava — per questo si emette **dopo**.
 */
export async function emitEvent(
  event: EventName,
  options: {
    entity: string;
    entityId?: string | null;
    patientId?: string | null;
    locationId?: string | null;
    payload?: Record<string, unknown>;
    /** Client già pronto, se chi chiama ne ha uno in mano. */
    client?: SupabaseClient;
  },
): Promise<void> {
  try {
    const supabase = options.client ?? (await createSupabaseServerClient());
    await supabase.rpc("emit_event", {
      p_event: event,
      p_entity: options.entity,
      p_entity_id: options.entityId ?? null,
      p_patient: options.patientId ?? null,
      p_location: options.locationId ?? null,
      p_payload: options.payload ?? {},
    });
  } catch {
    // Volutamente silenzioso: vedi sopra.
  }
}

export interface DomainEventRow {
  id: number;
  eventName: string;
  entity: string;
  entityId: string | null;
  patientId: string | null;
  locationId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Gli ultimi eventi, per il Brain e per il feed di integrazione.
 *
 * Le query passano dal client di sessione: se chi guarda non è direzione,
 * la Row Level Security restituisce zero righe. Non c'è un controllo di
 * ruolo qui perché non serve — e un controllo in più darebbe l'illusione
 * che sia quello a proteggere il dato.
 */
export async function recentEvents(options: {
  limit?: number;
  since?: string;
  names?: readonly string[];
  patientId?: string;
  client?: SupabaseClient;
} = {}): Promise<DomainEventRow[]> {
  const supabase = options.client ?? (await createSupabaseServerClient());

  let query = supabase
    .from("domain_events")
    .select("id, event_name, entity, entity_id, patient_id, location_id, payload, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.since) query = query.gte("occurred_at", options.since);
  if (options.names?.length) query = query.in("event_name", options.names as string[]);
  if (options.patientId) query = query.eq("patient_id", options.patientId);

  const { data } = await query;

  return ((data ?? []) as {
    id: number;
    event_name: string;
    entity: string;
    entity_id: string | null;
    patient_id: string | null;
    location_id: string | null;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  }[]).map((row) => ({
    id: row.id,
    eventName: row.event_name,
    entity: row.entity,
    entityId: row.entity_id,
    patientId: row.patient_id,
    locationId: row.location_id,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
  }));
}

/** Quante volte è successo ciascun fatto, in una finestra di tempo. */
export async function countEvents(
  since: string,
  client?: SupabaseClient,
): Promise<Map<string, number>> {
  const supabase = client ?? (await createSupabaseServerClient());

  const { data } = await supabase
    .from("domain_events")
    .select("event_name")
    .gte("occurred_at", since)
    .limit(5000);

  const conteggio = new Map<string, number>();
  for (const row of (data ?? []) as { event_name: string }[]) {
    conteggio.set(row.event_name, (conteggio.get(row.event_name) ?? 0) + 1);
  }
  return conteggio;
}
