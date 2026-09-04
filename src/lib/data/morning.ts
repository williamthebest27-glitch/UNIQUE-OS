import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentProfile } from "@/lib/auth";

/**
 * Il briefing del mattino.
 *
 * "Non voglio ricevere centinaia di notifiche." La risposta non è
 * mandarne meno a caso: è dare a ciascuna un destino diverso.
 *
 *   critico     interrompe. Va guardato adesso.
 *   importante  si vede in giornata.
 *   informativo finisce qui dentro e non suona mai.
 *
 * I numeri della giornata non sono notifiche: sono lo sfondo su cui le
 * notifiche significano qualcosa. Due pagamenti falliti su ottanta
 * incassi e due su cinque sono la stessa riga e due problemi diversi.
 */

export interface AvvisoBreve {
  id: string;
  titolo: string;
  corpo: string | null;
  link: string | null;
  categoria: string | null;
  quando: string;
}

export interface BriefMattutino {
  giorno: string;
  critici: AvvisoBreve[];
  importanti: AvvisoBreve[];
  /** Quante informative sono arrivate: il digest è un numero, non un elenco. */
  informative: number;

  pazientiOggi: number;
  revenuePrevistaCents: number;
  nuoviLead: number;
  pagamentiFalliti: number;
  daRicontattare: number;
  scoreDaApprovare: number;
  documentiDaLeggere: number;
  proposteInAttesa: number;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface RigaNotifica {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  category: string | null;
  created_at: string;
  severity: "critical" | "important" | "info";
}

function toAvviso(r: RigaNotifica): AvvisoBreve {
  return {
    id: r.id,
    titolo: r.title,
    corpo: r.body,
    link: r.link_url,
    categoria: r.category,
    quando: r.created_at,
  };
}

export async function getBriefMattutino(): Promise<BriefMattutino | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) return null;

  const supabase = await createSupabaseServerClient();
  const giorno = ROMA.format(new Date());
  const inizio = `${giorno}T00:00:00Z`;
  const fine = `${giorno}T23:59:59Z`;
  const settimana = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    avvisiRes,
    appuntamentiRes,
    serviziRes,
    leadRes,
    pagamentiRes,
    taskRes,
    proposteScoreRes,
    documentiRes,
    proposteRes,
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link_url, category, created_at, severity")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("appointments")
      .select("patient_id, service_id, status")
      .gte("starts_at", inizio)
      .lte("starts_at", fine)
      .limit(300),
    supabase.from("services").select("id, price_cents"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("first_seen_at", inizio),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", settimana),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lte("due_on", giorno),
    supabase
      .from("measurement_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString()),
    supabase
      .from("brain_proposals")
      .select("id", { count: "exact", head: true })
      .eq("state", "pending"),
  ]);

  const avvisi = (avvisiRes.data ?? []) as RigaNotifica[];

  const prezzi = new Map(
    ((serviziRes.data ?? []) as { id: string; price_cents: number }[]).map((s) => [
      s.id,
      s.price_cents,
    ]),
  );

  const appuntamenti = (appuntamentiRes.data ?? []) as {
    patient_id: string;
    service_id: string | null;
    status: string;
  }[];

  const attesi = appuntamenti.filter((a) => a.status !== "cancelled");

  return {
    giorno,
    critici: avvisi.filter((a) => a.severity === "critical").map(toAvviso),
    importanti: avvisi.filter((a) => a.severity === "important").map(toAvviso),
    informative: avvisi.filter((a) => a.severity === "info").length,

    pazientiOggi: new Set(attesi.map((a) => a.patient_id)).size,
    // Prevista, non incassata: è la somma dei listini delle visite di
    // oggi. Chi non si presenta la fa scendere, ed è giusto così.
    revenuePrevistaCents: attesi.reduce(
      (somma, a) => somma + (a.service_id ? (prezzi.get(a.service_id) ?? 0) : 0),
      0,
    ),
    nuoviLead: leadRes.count ?? 0,
    pagamentiFalliti: pagamentiRes.count ?? 0,
    daRicontattare: taskRes.count ?? 0,
    scoreDaApprovare: proposteScoreRes.count ?? 0,
    documentiDaLeggere: documentiRes.count ?? 0,
    proposteInAttesa: proposteRes.count ?? 0,
  };
}
