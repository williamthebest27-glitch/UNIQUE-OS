import "server-only";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import { costruisciAnteprima, eseguiAzione } from "@/lib/approvals/executor";
import {
  calcolaScadenza,
  definizione,
  puoEseguire,
  type ClasseAzione,
  type RuoloApp,
  type StatoProposta,
} from "@/lib/approvals/policy";

/**
 * Il ciclo di una proposta: PREVIEW → APPROVE → EXECUTE.
 *
 * Tre momenti separati, e la separazione è il punto. Chi propone non
 * esegue, chi approva vede prima cosa succede, e chi esegue rilegge lo
 * stato invece di fidarsi di quanto era vero al momento della proposta.
 *
 * Ogni passaggio lascia una riga negli eventi di dominio. Se un giorno
 * qualcuno chiederà "chi ha cambiato il prezzo della visita il 14
 * settembre", la risposta è ricostruibile: chi ha proposto, chi ha
 * autorizzato, cosa mostrava l'anteprima, cosa è successo davvero.
 */

export interface Proposta {
  id: string;
  action: string;
  classe: ClasseAzione;
  titolo: string;
  sommario: string;
  impatto: string[];
  payload: Record<string, unknown>;
  anteprima: Record<string, unknown>;
  stato: StatoProposta;
  richiestaDa: string | null;
  decisaDa: string | null;
  decisaIl: string | null;
  notaDecisione: string | null;
  eseguitaIl: string | null;
  risultato: Record<string, unknown> | null;
  errore: string | null;
  scadeIl: string;
  createdAt: string;
  conversationId: string | null;
}

interface RigaProposta {
  id: string;
  action: string;
  action_class: ClasseAzione;
  title: string;
  summary: string;
  impact: string[] | null;
  payload: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  state: StatoProposta;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  expires_at: string;
  created_at: string;
  conversation_id: string | null;
}

const CAMPI =
  "id, action, action_class, title, summary, impact, payload, preview, state, " +
  "requested_by, decided_by, decided_at, decision_note, executed_at, result, error, " +
  "expires_at, created_at, conversation_id";

function toProposta(row: RigaProposta): Proposta {
  return {
    id: row.id,
    action: row.action,
    classe: row.action_class,
    titolo: row.title,
    sommario: row.summary,
    impatto: row.impact ?? [],
    payload: row.payload ?? {},
    anteprima: row.preview ?? {},
    stato: row.state,
    richiestaDa: row.requested_by,
    decisaDa: row.decided_by,
    decisaIl: row.decided_at,
    notaDecisione: row.decision_note,
    eseguitaIl: row.executed_at,
    risultato: row.result,
    errore: row.error,
    scadeIl: row.expires_at,
    createdAt: row.created_at,
    conversationId: row.conversation_id,
  };
}

/**
 * Propone un'azione, con l'anteprima già calcolata.
 *
 * L'anteprima si costruisce adesso e non al momento dell'approvazione:
 * chi decide deve vedere gli stessi numeri che ha visto il Brain quando
 * ha proposto. Se nel frattempo cambiano, la proposta scade — che è più
 * onesto di un'anteprima che si aggiorna da sola sotto gli occhi.
 */
export async function creaProposta(
  azione: string,
  payload: Record<string, unknown>,
  opzioni: { conversationId?: string | null } = {},
): Promise<Proposta> {
  const profile = await requireProfile();
  const def = definizione(azione);
  if (!def) throw new Error(`Azione sconosciuta: ${azione}.`);

  const anteprima = await costruisciAnteprima(azione, payload);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("brain_proposals")
    .insert({
      conversation_id: opzioni.conversationId ?? null,
      action: azione,
      // La classe viene dal catalogo, mai dai parametri: è il motivo per
      // cui il modello non può declassare la propria azione.
      action_class: def.classe,
      title: anteprima.titolo,
      summary: anteprima.sommario,
      impact: anteprima.impatto,
      payload,
      preview: anteprima.dettagli,
      state: "pending",
      requested_by: profile.id,
      expires_at: calcolaScadenza(),
    })
    .select(CAMPI)
    .single();

  if (error) throw new Error(`Proposta non registrata: ${error.message}`);

  const proposta = toProposta(data as unknown as RigaProposta);

  await emitEvent("brain.proposal_created", {
    entity: "proposal",
    entityId: proposta.id,
    payload: { azione, classe: def.classe },
    client: supabase,
  });

  return proposta;
}

export async function proposteInAttesa(limite = 20): Promise<Proposta[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brain_proposals")
    .select(CAMPI)
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as unknown as RigaProposta[]).map(toProposta);
}

export async function proposteRecenti(limite = 30): Promise<Proposta[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brain_proposals")
    .select(CAMPI)
    .neq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(limite);

  return ((data ?? []) as unknown as RigaProposta[]).map(toProposta);
}

export async function propostePerConversazione(conversationId: string): Promise<Proposta[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brain_proposals")
    .select(CAMPI)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  return ((data ?? []) as unknown as RigaProposta[]).map(toProposta);
}

/** Autorizza o rifiuta. La regola su chi può farlo sta nel database. */
export async function decidiProposta(
  id: string,
  approva: boolean,
  nota?: string,
): Promise<StatoProposta> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("decide_proposal", {
    p_proposal: id,
    p_approve: approva,
    p_note: nota ?? null,
  });

  if (error) throw new Error(error.message);
  return data as StatoProposta;
}

/**
 * Esegue una proposta autorizzata.
 *
 * Il controllo di stato, scadenza e ruolo si rifà qui anche se il
 * database lo ha già fatto all'approvazione: fra l'approvazione e
 * l'esecuzione può passare del tempo, e un permesso può essere stato
 * revocato nel frattempo.
 */
export async function eseguiProposta(id: string): Promise<Proposta> {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.from("brain_proposals").select(CAMPI).eq("id", id).maybeSingle();
  const riga = data as unknown as RigaProposta | null;
  if (!riga) throw new Error("Proposta non trovata.");

  const verifica = puoEseguire(
    { state: riga.state, action: riga.action, expiresAt: riga.expires_at },
    profile.role as RuoloApp,
  );
  if (!verifica.ok) throw new Error(verifica.motivo);

  try {
    const esito = await eseguiAzione(riga.action, riga.payload ?? {}, {
      proposalId: riga.id,
      attoreId: profile.id,
    });

    const { data: aggiornata } = await supabase
      .from("brain_proposals")
      .update({
        state: "executed",
        executed_at: new Date().toISOString(),
        result: { descrizione: esito.descrizione, ...esito.dati },
        error: null,
      })
      .eq("id", id)
      .select(CAMPI)
      .single();

    await emitEvent("brain.action_executed", {
      entity: "proposal",
      entityId: id,
      payload: { azione: riga.action, esito: esito.descrizione },
      client: supabase,
    });

    return toProposta(aggiornata as unknown as RigaProposta);
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);

    // Un fallimento resta scritto sulla proposta: un'azione che non è
    // andata a buon fine non deve poter sembrare mai tentata.
    await supabase
      .from("brain_proposals")
      .update({ state: "failed", error: messaggio.slice(0, 800) })
      .eq("id", id);

    await emitEvent("brain.action_failed", {
      entity: "proposal",
      entityId: id,
      payload: { azione: riga.action, errore: messaggio.slice(0, 300) },
      client: supabase,
    });

    throw errore;
  }
}
