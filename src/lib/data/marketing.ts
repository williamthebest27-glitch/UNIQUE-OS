import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";
import {
  campagneFuoriMedia,
  metricheCampagna,
  migliorQualita,
  ricorrenzeVincenti,
  totaliMarketing,
  valutaContenuti,
  type AttribuzioneCampagna,
  type ContenutoGrezzo,
  type ContenutoValutato,
  type MetricheCampagna,
  type Scostamento,
  type SpesaCampagna,
  type TotaliMarketing,
} from "@/lib/marketing/engine";

/**
 * Il cruscotto del marketing.
 *
 * Come per il Control Center: qui si legge il database e si passa il
 * testimone al motore puro. Nessuna aritmetica in questo file — è il
 * motivo per cui i numeri del marketing sono coperti da test e queste
 * righe no.
 *
 * La finestra è il mese: la spesa è quella del mese, i lead sono quelli
 * nati nel mese, il valore generato è **tutto** quello prodotto da quei
 * lead, anche se incassato dopo. È una scelta, e va detta: un CAC
 * calcolato con la spesa di agosto e gli incassi di agosto racconta male
 * una campagna che porta pazienti che comprano a settembre.
 */

export interface QualitaCampagna {
  avgVisits: number;
  avgRevenueCents: number;
  membersRatio: number;
}

export interface CruscottoMarketing {
  periodo: string;
  campagne: MetricheCampagna[];
  totali: TotaliMarketing;
  fuoriMedia: Scostamento[];
  perQualita: MetricheCampagna[];
  qualita: Map<string, QualitaCampagna>;
  contenuti: ContenutoValutato[];
  ricorrenze: { angoli: [string, number][]; formati: [string, number][] };
}

function finestra(periodo: string): { inizio: string; fine: string } {
  const [anno, mese] = periodo.split("-").map(Number);
  const fine =
    mese === 12
      ? `${anno}-12-31`
      : new Date(Date.UTC(anno, mese, 0)).toISOString().slice(0, 10);
  return { inizio: `${periodo}-01`, fine };
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function getMarketing(periodo?: string): Promise<CruscottoMarketing | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner", "marketing"].includes(profile.role)) return null;

  const supabase = await createSupabaseServerClient();
  const mese = periodo ?? ROMA.format(new Date()).slice(0, 7);
  const { inizio, fine } = finestra(mese);

  const [campagneRes, spesaRes, attribuzioneRes, qualitaRes, contenutiRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, channel, status, objective, service:services(name)")
      .order("started_on", { ascending: false })
      .limit(120),
    supabase
      .from("campaign_daily_stats")
      .select("campaign_id, spend_cents, impressions, clicks, platform_leads")
      .gte("day", inizio)
      .lte("day", fine)
      .limit(5000),
    supabase.rpc("campaign_attribution", { p_from: inizio, p_to: fine }),
    supabase.rpc("campaign_patient_quality", { p_from: inizio, p_to: fine }),
    supabase
      .from("content_pieces")
      .select(
        "id, title, format, channel, hook, angle, topic, published_on, views, reach, likes, comments, saves, shares, leads_attributed",
      )
      .order("published_on", { ascending: false })
      .limit(60),
  ]);

  /* ── Spesa, sommata per campagna ─────────────────────────────── */
  const spese = new Map<string, SpesaCampagna>();
  for (const riga of (spesaRes.data ?? []) as {
    campaign_id: string;
    spend_cents: number;
    impressions: number;
    clicks: number;
    platform_leads: number;
  }[]) {
    const corrente = spese.get(riga.campaign_id) ?? {
      campaignId: riga.campaign_id,
      spendCents: 0,
      impressions: 0,
      clicks: 0,
      platformLeads: 0,
    };
    corrente.spendCents += riga.spend_cents;
    corrente.impressions += riga.impressions;
    corrente.clicks += riga.clicks;
    corrente.platformLeads += riga.platform_leads;
    spese.set(riga.campaign_id, corrente);
  }

  /* ── Cosa hanno prodotto ─────────────────────────────────────── */
  const attribuzioni = new Map<string, AttribuzioneCampagna>();
  for (const riga of (attribuzioneRes.data ?? []) as {
    campaign_id: string;
    leads: number;
    qualified: number;
    booked: number;
    patients: number;
    members: number;
    revenue_cents: number;
  }[]) {
    attribuzioni.set(riga.campaign_id, {
      campaignId: riga.campaign_id,
      leads: riga.leads,
      qualified: riga.qualified,
      booked: riga.booked,
      patients: riga.patients,
      members: riga.members,
      revenueCents: Number(riga.revenue_cents ?? 0),
    });
  }

  const qualita = new Map<string, QualitaCampagna>();
  for (const riga of (qualitaRes.data ?? []) as {
    campaign_id: string;
    avg_visits: number;
    avg_revenue_cents: number;
    members_ratio: number;
  }[]) {
    qualita.set(riga.campaign_id, {
      avgVisits: Number(riga.avg_visits ?? 0),
      avgRevenueCents: Number(riga.avg_revenue_cents ?? 0),
      membersRatio: Number(riga.members_ratio ?? 0),
    });
  }

  const campagne = ((campagneRes.data ?? []) as unknown as {
    id: string;
    name: string;
    channel: string;
    status: string;
    objective: string | null;
    service: { name: string } | null;
  }[]).map((c) =>
    metricheCampagna(
      {
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        objective: c.objective,
        serviceName: c.service?.name ?? null,
      },
      spese.get(c.id),
      attribuzioni.get(c.id),
    ),
  );

  // Le campagne senza spesa né lead nel mese non sono un'informazione:
  // sono righe di anagrafica, e riempirebbero la schermata di zeri.
  const attive = campagne.filter((c) => c.spendCents > 0 || c.leads > 0);

  const contenuti = valutaContenuti(
    ((contenutiRes.data ?? []) as {
      id: string;
      title: string;
      format: string;
      channel: string;
      hook: string | null;
      angle: string | null;
      topic: string | null;
      published_on: string | null;
      views: number;
      reach: number;
      likes: number;
      comments: number;
      saves: number;
      shares: number;
      leads_attributed: number;
    }[]).map<ContenutoGrezzo>((c) => ({
      id: c.id,
      title: c.title,
      format: c.format,
      channel: c.channel,
      hook: c.hook,
      angle: c.angle,
      topic: c.topic,
      publishedOn: c.published_on,
      views: c.views,
      reach: c.reach,
      likes: c.likes,
      comments: c.comments,
      saves: c.saves,
      shares: c.shares,
      leadsAttributed: c.leads_attributed,
    })),
  );

  return {
    periodo: mese,
    campagne: attive,
    totali: totaliMarketing(attive),
    fuoriMedia: campagneFuoriMedia(attive),
    perQualita: migliorQualita(attive),
    qualita,
    contenuti,
    ricorrenze: ricorrenzeVincenti(contenuti),
  };
}

/** I contenuti che hanno funzionato meglio, per il Content Brain. */
export async function contenutiMigliori(quanti = 5): Promise<ContenutoValutato[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("content_pieces")
    .select(
      "id, title, format, channel, hook, angle, topic, published_on, views, reach, likes, comments, saves, shares, leads_attributed",
    )
    .order("published_on", { ascending: false })
    .limit(40);

  const valutati = valutaContenuti(
    ((data ?? []) as {
      id: string;
      title: string;
      format: string;
      channel: string;
      hook: string | null;
      angle: string | null;
      topic: string | null;
      published_on: string | null;
      views: number;
      reach: number;
      likes: number;
      comments: number;
      saves: number;
      shares: number;
      leads_attributed: number;
    }[]).map<ContenutoGrezzo>((c) => ({
      id: c.id,
      title: c.title,
      format: c.format,
      channel: c.channel,
      hook: c.hook,
      angle: c.angle,
      topic: c.topic,
      publishedOn: c.published_on,
      views: c.views,
      reach: c.reach,
      likes: c.likes,
      comments: c.comments,
      saves: c.saves,
      shares: c.shares,
      leadsAttributed: c.leads_attributed,
    })),
  );

  return valutati.slice(0, quanti);
}
