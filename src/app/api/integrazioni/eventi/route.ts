import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createSupabaseServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/service";
import { consegnaEventiInAttesa } from "@/lib/events/webhooks";
import { describeEvent } from "@/lib/events/catalog";

/**
 * Il flusso degli eventi, verso l'esterno.
 *
 * Due modi di ricevere ciò che succede in Unique, perché i sistemi da
 * collegare non sono tutti uguali:
 *
 * **GET** — chi preferisce chiedere. Restituisce gli eventi dopo un certo
 * id, in ordine cronologico: il consumatore tiene il proprio cursore e
 * non perde nulla nemmeno se resta spento un giorno.
 *
 * **POST** — spinge la coda dei webhook verso chi si è iscritto. Va
 * richiamato da uno scheduler (Vercel Cron, pg_cron, un job qualsiasi):
 * la consegna non parte da sola perché un invio HTTP dentro la
 * transazione che ha completato una visita terrebbe aperta quella
 * transazione fino alla risposta.
 *
 * Entrambi passano dal token condiviso e dalla chiave service-role: qui
 * non c'è un utente collegato da cui ereditare i permessi.
 */

export const dynamic = "force-dynamic";

function tokenValido(fornito: string | null): boolean {
  const atteso = process.env.UNIQUE_SYNC_TOKEN ?? "";
  if (atteso.length === 0 || !fornito) return false;

  const a = Buffer.from(fornito);
  const b = Buffer.from(atteso);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!tokenValido(request.headers.get("x-unique-sync-token"))) {
    return NextResponse.json({ errore: "Token non valido." }, { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { errore: "SUPABASE_SERVICE_ROLE_KEY non impostata." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const dopo = Number(url.searchParams.get("dopo") ?? 0);
  const limite = Math.min(Number(url.searchParams.get("limite") ?? 100), 500);
  const nome = url.searchParams.get("evento");

  const supabase = createSupabaseServiceClient();

  let query = supabase
    .from("domain_events")
    .select("id, event_name, entity, entity_id, patient_id, location_id, payload, occurred_at")
    .order("id", { ascending: true })
    .limit(limite);

  if (Number.isFinite(dopo) && dopo > 0) query = query.gt("id", dopo);
  if (nome) query = query.eq("event_name", nome);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ errore: error.message }, { status: 500 });
  }

  const eventi = (data ?? []) as {
    id: number;
    event_name: string;
    entity: string;
    entity_id: string | null;
    patient_id: string | null;
    location_id: string | null;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  }[];

  return NextResponse.json({
    eventi: eventi.map((e) => ({
      id: e.id,
      evento: e.event_name,
      descrizione: describeEvent(e.event_name).label,
      entita: e.entity,
      entita_id: e.entity_id,
      // Il paziente esce come identificativo, mai come nome: chi integra
      // un calendario non ha bisogno di sapere chi è Alessandro.
      paziente_id: e.patient_id,
      sede_id: e.location_id,
      dati: e.payload ?? {},
      avvenuto_il: e.occurred_at,
    })),
    // Il cursore da rimandare alla prossima chiamata.
    ultimo_id: eventi.at(-1)?.id ?? dopo,
  });
}

export async function POST(request: NextRequest) {
  if (!tokenValido(request.headers.get("x-unique-sync-token"))) {
    return NextResponse.json({ errore: "Token non valido." }, { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { errore: "SUPABASE_SERVICE_ROLE_KEY non impostata." },
      { status: 503 },
    );
  }

  const esito = await consegnaEventiInAttesa();
  return NextResponse.json(esito);
}
