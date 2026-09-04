import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * L'agenda della clinica, come la guarda chi sta alla reception.
 *
 * Diversa da quella del professionista per due ragioni: attraversa tutti
 * i professionisti, e mostra le cose che servono ad accogliere — chi
 * arriva, per cosa, da chi, e se ha ancora crediti. Non mostra nulla di
 * clinico, e non per delicatezza: la reception non ha una ragione di cura
 * e la Row Level Security non le restituirebbe comunque referti o misure.
 */

export interface VisitaInAgenda {
  id: string;
  startsAt: string;
  endsAt: string;
  patientId: string;
  patientName: string;
  serviceName: string;
  professionalName: string | null;
  professionalId: string | null;
  roomId: string | null;
  roomName: string | null;
  status: string;
  attendance: string;
  creditsCost: number;
  source: string;
}

export interface GiornoInAgenda {
  data: string;
  visite: VisitaInAgenda[];
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function giornoRomano(iso: string | Date): string {
  return ROMA.format(typeof iso === "string" ? new Date(iso) : iso);
}

interface Riga {
  id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  attendance: string;
  credits_cost: number;
  source: string;
  professional_id: string | null;
  room_id: string | null;
  room: { name: string } | null;
  patient: { id: string; profile: { full_name: string } | null } | null;
  professional: { title: string | null; profile: { full_name: string } | null } | null;
}

export async function getAgendaSede(giorni = 7): Promise<GiornoInAgenda[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  const ora = new Date();
  const da = new Date(ora.getTime() - 12 * 3600 * 1000).toISOString();
  const a = new Date(ora.getTime() + giorni * 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from("appointments")
    .select(
      "id, service_name, starts_at, ends_at, status, attendance, credits_cost, source, professional_id, room_id, " +
        "room:rooms(name), " +
        "patient:patients(id, profile:profiles(full_name)), " +
        "professional:professionals(title, profile:profiles(full_name))",
    )
    .gte("starts_at", da)
    .lte("starts_at", a)
    .not("status", "in", "(cancelled)")
    .order("starts_at", { ascending: true })
    .limit(400);

  const oggi = giornoRomano(ora);
  const gruppi = new Map<string, VisitaInAgenda[]>();

  for (const row of (data ?? []) as unknown as Riga[]) {
    const giorno = giornoRomano(row.starts_at);
    if (giorno < oggi) continue;

    const lista = gruppi.get(giorno) ?? [];
    lista.push({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      patientId: row.patient?.id ?? "",
      patientName: row.patient?.profile?.full_name ?? "Paziente",
      serviceName: row.service_name,
      professionalName: row.professional?.profile?.full_name
        ? [row.professional.title, row.professional.profile.full_name].filter(Boolean).join(" ")
        : null,
      professionalId: row.professional_id,
      roomId: row.room_id,
      roomName: row.room?.name ?? null,
      status: row.status,
      attendance: row.attendance,
      creditsCost: Number(row.credits_cost ?? 0),
      source: row.source,
    });
    gruppi.set(giorno, lista);
  }

  return [...gruppi.entries()]
    .sort(([a1], [b1]) => a1.localeCompare(b1))
    .map(([data2, visite]) => ({ data: data2, visite }));
}

/** I numeri della giornata che servono al banco, non alla direzione. */
export interface PolsoGiornata {
  visite: number;
  daConfermare: number;
  noShow: number;
  nuoviPazienti: number;
}

export async function getPolsoGiornata(): Promise<PolsoGiornata | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const oggi = giornoRomano(new Date());

  const [visiteRes, nuoviRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, status, attendance")
      .gte("starts_at", `${oggi}T00:00:00Z`)
      .lt("starts_at", `${oggi}T23:59:59Z`)
      .limit(300),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${oggi}T00:00:00Z`),
  ]);

  const visite = (visiteRes.data ?? []) as { status: string; attendance: string }[];

  return {
    visite: visite.filter((v) => v.status !== "cancelled").length,
    daConfermare: visite.filter((v) => v.status === "scheduled").length,
    noShow: visite.filter((v) => v.status === "no_show" || v.attendance === "no_show").length,
    nuoviPazienti: nuoviRes.count ?? 0,
  };
}
