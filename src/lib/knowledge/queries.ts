import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { KnowledgeKind, KnowledgeStatus, VersioneDatata } from "@/lib/knowledge/validity";
import { daRiconfermare, provenienza } from "@/lib/knowledge/validity";

/**
 * La lettura della knowledge base.
 *
 * Una regola sola, e vale per l'interfaccia come per il Brain: si legge
 * da `knowledge_current`. Ciò che non è lì non è vero oggi, e non deve
 * poter finire in una risposta per distrazione di chi ha scritto la
 * query.
 */

export interface VoceCorrente {
  entryId: string;
  slug: string;
  kind: KnowledgeKind;
  audience: "internal" | "public";
  title: string;
  summary: string | null;
  body: string;
  data: Record<string, unknown>;
  version: number;
  validFrom: string;
  validTo: string | null;
  ownerId: string | null;
  ownerName: string | null;
  tags: string[];
  approvedAt: string | null;
  changeNote: string | null;
  /** Vero se ha superato l'intervallo di riconferma per il suo tipo. */
  daRiconfermare: boolean;
  /** "versione 2, in vigore dal 2026-03-15", pronta da citare. */
  provenienza: string;
}

export interface VersioneStorica extends VersioneDatata {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  data: Record<string, unknown>;
  changeNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  authorName: string | null;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function oggi(): string {
  return ROMA.format(new Date());
}

interface RigaCorrente {
  entry_id: string;
  slug: string;
  kind: KnowledgeKind;
  audience: "internal" | "public";
  title: string;
  summary: string | null;
  body: string;
  data: Record<string, unknown> | null;
  version: number;
  valid_from: string;
  valid_to: string | null;
  owner_id: string | null;
  tags: string[] | null;
  approved_at: string | null;
  change_note: string | null;
}

function toVoce(row: RigaCorrente, nomi: Map<string, string>): VoceCorrente {
  const giorno = oggi();
  const datata: VersioneDatata = {
    version: row.version,
    status: "active",
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };

  return {
    entryId: row.entry_id,
    slug: row.slug,
    kind: row.kind,
    audience: row.audience,
    title: row.title,
    summary: row.summary,
    body: row.body,
    data: row.data ?? {},
    version: row.version,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (nomi.get(row.owner_id) ?? null) : null,
    tags: row.tags ?? [],
    approvedAt: row.approved_at,
    changeNote: row.change_note,
    daRiconfermare: daRiconfermare(datata, row.kind, giorno),
    provenienza: provenienza(datata, row.kind, giorno),
  };
}

/** Tutto ciò che è vero oggi, per la schermata della knowledge base. */
export async function elencoConoscenza(kind?: KnowledgeKind): Promise<VoceCorrente[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("knowledge_current")
    .select(
      "entry_id, slug, kind, audience, title, summary, body, data, version, valid_from, valid_to, owner_id, tags, approved_at, change_note",
    )
    .order("kind", { ascending: true })
    .order("title", { ascending: true })
    .limit(200);

  if (kind) query = query.eq("kind", kind);

  const { data } = await query;
  const righe = (data ?? []) as RigaCorrente[];

  // I nomi dei proprietari si risolvono in una query sola, non una per
  // riga: chi risponde di un'informazione va mostrato sempre, e non deve
  // costare venti round trip.
  const ids = [...new Set(righe.map((r) => r.owner_id).filter((v): v is string => Boolean(v)))];
  const nomi = new Map<string, string>();

  if (ids.length > 0) {
    const { data: profili } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of (profili ?? []) as { id: string; full_name: string }[]) {
      nomi.set(p.id, p.full_name);
    }
  }

  return righe.map((r) => toVoce(r, nomi));
}

/**
 * Ricerca a testo pieno fra ciò che è vero oggi.
 *
 * È la funzione che usa il Brain: se una risposta non trova appoggio
 * qui, il Brain deve dire che non lo sa invece di ricostruirlo.
 */
export async function cercaConoscenza(query: string, limite = 6): Promise<VoceCorrente[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("search_knowledge", {
    p_query: query,
    p_limit: limite,
  });

  const righe = (data ?? []) as {
    entry_id: string;
    slug: string;
    kind: KnowledgeKind;
    title: string;
    summary: string | null;
    body: string;
    data: Record<string, unknown> | null;
    version: number;
    valid_from: string;
  }[];

  const giorno = oggi();

  return righe.map((r) => {
    const datata: VersioneDatata = {
      version: r.version,
      status: "active",
      validFrom: r.valid_from,
      validTo: null,
    };
    return {
      entryId: r.entry_id,
      slug: r.slug,
      kind: r.kind,
      audience: "internal",
      title: r.title,
      summary: r.summary,
      body: r.body,
      data: r.data ?? {},
      version: r.version,
      validFrom: r.valid_from,
      validTo: null,
      ownerId: null,
      ownerName: null,
      tags: [],
      approvedAt: null,
      changeNote: null,
      daRiconfermare: daRiconfermare(datata, r.kind, giorno),
      provenienza: provenienza(datata, r.kind, giorno),
    };
  });
}

/** Una voce con tutta la sua storia: è qui che si legge "quanto costava prima". */
export async function voceConStoria(slug: string): Promise<{
  corrente: VoceCorrente | null;
  entryId: string;
  slug: string;
  kind: KnowledgeKind;
  title: string;
  audience: "internal" | "public";
  tags: string[];
  versioni: VersioneStorica[];
} | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const { data: entryData } = await supabase
    .from("knowledge_entries")
    .select("id, slug, kind, title, audience, tags, owner_id")
    .eq("slug", slug)
    .maybeSingle();

  const entry = entryData as {
    id: string;
    slug: string;
    kind: KnowledgeKind;
    title: string;
    audience: "internal" | "public";
    tags: string[] | null;
    owner_id: string | null;
  } | null;

  if (!entry) return null;

  const [versioniRes, correnteRes] = await Promise.all([
    supabase
      .from("knowledge_versions")
      .select(
        "id, version, status, title, body, summary, data, valid_from, valid_to, change_note, created_at, approved_at, author:profiles!knowledge_versions_author_id_fkey(full_name)",
      )
      .eq("entry_id", entry.id)
      .order("version", { ascending: false }),
    supabase
      .from("knowledge_current")
      .select(
        "entry_id, slug, kind, audience, title, summary, body, data, version, valid_from, valid_to, owner_id, tags, approved_at, change_note",
      )
      .eq("entry_id", entry.id)
      .maybeSingle(),
  ]);

  const versioni = ((versioniRes.data ?? []) as unknown as {
    id: string;
    version: number;
    status: KnowledgeStatus;
    title: string;
    body: string;
    summary: string | null;
    data: Record<string, unknown> | null;
    valid_from: string;
    valid_to: string | null;
    change_note: string | null;
    created_at: string;
    approved_at: string | null;
    author: { full_name: string } | null;
  }[]).map((v) => ({
    id: v.id,
    version: v.version,
    status: v.status,
    title: v.title,
    body: v.body,
    summary: v.summary,
    data: v.data ?? {},
    validFrom: v.valid_from,
    validTo: v.valid_to,
    changeNote: v.change_note,
    createdAt: v.created_at,
    approvedAt: v.approved_at,
    authorName: v.author?.full_name ?? null,
  }));

  const correnteRow = correnteRes.data as RigaCorrente | null;

  return {
    entryId: entry.id,
    slug: entry.slug,
    kind: entry.kind,
    title: entry.title,
    audience: entry.audience,
    tags: entry.tags ?? [],
    versioni,
    corrente: correnteRow ? toVoce(correnteRow, new Map()) : null,
  };
}

/**
 * Il pacchetto di conoscenza che accompagna una generazione.
 *
 * Il Content Brain e la chat del founder non ricevono "la knowledge base"
 * — ricevono le voci che servono, con la loro provenienza attaccata, così
 * che ciò che scrivono possa citare da dove viene.
 */
export async function conoscenzaPerSlug(slugs: string[]): Promise<VoceCorrente[]> {
  if (!isSupabaseConfigured() || slugs.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("knowledge_current")
    .select(
      "entry_id, slug, kind, audience, title, summary, body, data, version, valid_from, valid_to, owner_id, tags, approved_at, change_note",
    )
    .in("slug", slugs);

  return ((data ?? []) as RigaCorrente[]).map((r) => toVoce(r, new Map()));
}
