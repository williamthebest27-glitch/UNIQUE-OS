import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import { definizione, type ClasseAzione } from "@/lib/approvals/policy";

/**
 * Dalle informazioni alle azioni.
 *
 * Ogni azione che il Brain può chiedere di fare vive qui in due metà:
 *
 * **L'anteprima** — cosa cambierebbe, calcolato adesso sui dati veri.
 * Conteggi ed esempi, non promesse. È ciò che una persona legge prima di
 * dire di sì, e senza di essa "vuoi applicare l'aggiornamento?" sarebbe
 * una domanda a scatola chiusa.
 *
 * **L'esecuzione** — che rilegge lo stato invece di fidarsi
 * dell'anteprima. Fra la proposta e l'approvazione può essere passato un
 * giorno, e in un giorno il prezzo può averlo cambiato una persona.
 *
 * Un principio attraversa tutte le azioni: **niente esce da Unique senza
 * che una persona lo mandi.** Le riattivazioni preparano i contatti, non
 * li fanno. Il giorno in cui i canali saranno collegati, l'invio sarà una
 * sua azione, con la sua classe e la sua approvazione.
 */

export interface Anteprima {
  titolo: string;
  sommario: string;
  /** Cosa verrebbe toccato, in italiano. */
  impatto: string[];
  /** I numeri e gli esempi dell'anteprima. */
  dettagli: Record<string, unknown>;
  classe: ClasseAzione;
}

export interface EsitoEsecuzione {
  descrizione: string;
  dati: Record<string, unknown>;
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

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

/* ── Ricerche condivise ───────────────────────────────────────────── */

export interface PazienteInattivo {
  patientId: string;
  nome: string;
  ultimoContatto: string | null;
  giorni: number | null;
}

/**
 * I pazienti fermi da troppo tempo.
 *
 * `criterio` cambia cosa conta come segno di vita: una visita svolta,
 * oppure un credito consumato. Sono due domande diverse — "chi non
 * viene" e "chi paga un abbonamento che non usa" — e la seconda è quella
 * che costa una membership.
 */
export async function pazientiInattivi(
  supabase: SupabaseClient,
  giorni: number,
  criterio: "visite" | "crediti",
  limite: number,
): Promise<PazienteInattivo[]> {
  const soglia = new Date(Date.now() - giorni * 86_400_000);

  const [pazientiRes, attivitaRes] = await Promise.all([
    supabase
      .from("patients")
      .select("id, profile:profiles(full_name)")
      .limit(2000),
    criterio === "visite"
      ? supabase
          .from("appointments")
          .select("patient_id, starts_at")
          .eq("status", "completed")
          .order("starts_at", { ascending: false })
          .limit(5000)
      : supabase
          .from("credit_entries")
          .select("patient_id, created_at")
          .eq("entry_type", "consumption")
          .order("created_at", { ascending: false })
          .limit(5000),
  ]);

  const ultimo = new Map<string, string>();
  for (const riga of (attivitaRes.data ?? []) as Record<string, string>[]) {
    const id = riga.patient_id;
    const quando = criterio === "visite" ? riga.starts_at : riga.created_at;
    if (!ultimo.has(id)) ultimo.set(id, quando);
  }

  const pazienti = (pazientiRes.data ?? []) as unknown as {
    id: string;
    profile: { full_name: string } | null;
  }[];

  return pazienti
    .map((p) => {
      const quando = ultimo.get(p.id) ?? null;
      return {
        patientId: p.id,
        nome: p.profile?.full_name ?? "Paziente",
        ultimoContatto: quando,
        giorni: quando
          ? Math.floor((Date.now() - Date.parse(quando)) / 86_400_000)
          : null,
      };
    })
    .filter((p) => p.ultimoContatto === null || Date.parse(p.ultimoContatto) < soglia.getTime())
    .sort((a, b) => (b.giorni ?? 9999) - (a.giorni ?? 9999))
    .slice(0, limite);
}

/** Il profilo a cui assegnare qualcosa, dato un ruolo. */
async function primoProfiloConRuolo(
  supabase: SupabaseClient,
  ruolo: string,
): Promise<{ id: string; full_name: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", ruolo)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { id: string; full_name: string } | null) ?? null;
}

/* ── Anteprime ────────────────────────────────────────────────────── */

export async function costruisciAnteprima(
  azione: string,
  payload: Record<string, unknown>,
): Promise<Anteprima> {
  const def = definizione(azione);
  if (!def) throw new Error(`Azione sconosciuta: ${azione}.`);

  const supabase = await createSupabaseServerClient();
  const base = { titolo: def.titolo, impatto: def.sistemi, classe: def.classe };

  switch (azione) {
    case "crea_task": {
      const titolo = String(payload.titolo ?? "").trim();
      const ruolo = String(payload.ruolo_incaricato ?? "reception");
      const incaricato = await primoProfiloConRuolo(supabase, ruolo);

      return {
        ...base,
        sommario: `"${titolo}" a ${incaricato?.full_name ?? `chi ha ruolo ${ruolo}`}${
          payload.scadenza ? `, entro il ${String(payload.scadenza)}` : ", senza scadenza"
        }.`,
        dettagli: {
          titolo,
          incaricato: incaricato?.full_name ?? null,
          ruolo_incaricato: ruolo,
          scadenza: payload.scadenza ?? null,
          priorita: payload.priorita ?? 2,
        },
      };
    }

    case "avvisa_staff": {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["admin", "owner"]);

      return {
        ...base,
        sommario: `Una notifica "${String(payload.titolo ?? "")}" a ${count ?? 0} persone della direzione.`,
        dettagli: { destinatari: count ?? 0, gravita: payload.gravita ?? "important" },
      };
    }

    case "aggiorna_prezzo_servizio": {
      const slug = String(payload.servizio ?? "");
      const nuovo = Number(payload.prezzo_cents ?? 0);
      const dal = String(payload.valido_dal ?? oggi());

      const [servizioRes, futureRes, listinoRes] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, price_cents")
          .eq("slug", slug)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("starts_at", new Date().toISOString())
          .in("status", ["scheduled", "confirmed"]),
        supabase
          .from("knowledge_current")
          .select("version, data")
          .eq("slug", "listino-servizi")
          .maybeSingle(),
      ]);

      const servizio = servizioRes.data as
        | { id: string; name: string; price_cents: number }
        | null;

      if (!servizio) throw new Error(`Servizio "${slug}" non trovato in listino.`);

      const listino = listinoRes.data as { version: number; data: Record<string, unknown> } | null;

      return {
        ...base,
        sommario:
          `${servizio.name}: da ${euro(servizio.price_cents)} a ${euro(nuovo)}, dal ${dal}. ` +
          `La knowledge base passa alla versione ${(listino?.version ?? 0) + 1}: da quel momento nessun sistema risponde più con il prezzo vecchio.`,
        dettagli: {
          servizio: servizio.name,
          slug,
          prezzo_attuale_cents: servizio.price_cents,
          prezzo_nuovo_cents: nuovo,
          variazione_percentuale:
            servizio.price_cents > 0
              ? Math.round(((nuovo - servizio.price_cents) / servizio.price_cents) * 100)
              : null,
          valido_dal: dal,
          appuntamenti_futuri: futureRes.count ?? 0,
          nota: "Le prestazioni già erogate e fatturate non vengono toccate.",
        },
      };
    }

    case "pubblica_conoscenza": {
      const slug = String(payload.slug ?? "");
      const { data } = await supabase
        .from("knowledge_current")
        .select("title, version, valid_from, summary")
        .eq("slug", slug)
        .maybeSingle();

      const corrente = data as
        | { title: string; version: number; valid_from: string; summary: string | null }
        | null;

      return {
        ...base,
        sommario: corrente
          ? `"${corrente.title}" passa dalla versione ${corrente.version} alla ${corrente.version + 1}. La precedente si chiude il giorno prima.`
          : `Nuova informazione "${slug}", prima versione.`,
        dettagli: {
          slug,
          versione_attuale: corrente?.version ?? null,
          in_vigore_dal: corrente?.valid_from ?? null,
          nuovo_testo: String(payload.testo ?? "").slice(0, 400),
        },
      };
    }

    case "prepara_riattivazione": {
      const giorni = Number(payload.giorni ?? 60);
      const criterio = payload.criterio === "crediti" ? "crediti" : "visite";
      const limite = Math.min(Number(payload.limite ?? 50), 200);

      const inattivi = await pazientiInattivi(supabase, giorni, criterio, limite);
      const ruolo = String(payload.ruolo_incaricato ?? "reception");
      const incaricato = await primoProfiloConRuolo(supabase, ruolo);

      return {
        ...base,
        sommario:
          `${inattivi.length} pazienti senza ${criterio === "crediti" ? "crediti utilizzati" : "visite"} da più di ${giorni} giorni. ` +
          `Verrebbe creato un contatto per ciascuno, assegnato a ${incaricato?.full_name ?? `chi ha ruolo ${ruolo}`}. Nessun messaggio parte da solo.`,
        dettagli: {
          criterio,
          giorni,
          quanti: inattivi.length,
          incaricato: incaricato?.full_name ?? null,
          // Un campione, non l'elenco: l'anteprima serve a capire, e
          // duecento nomi in una schermata non si leggono.
          esempi: inattivi.slice(0, 8).map((p) => ({
            nome: p.nome,
            giorni_di_silenzio: p.giorni,
          })),
        },
      };
    }

    default:
      throw new Error(`Nessuna anteprima definita per "${azione}".`);
  }
}

/* ── Esecuzione ───────────────────────────────────────────────────── */

/**
 * Esegue un'azione già autorizzata.
 *
 * Rilegge sempre lo stato: l'anteprima è una fotografia, e fra la
 * fotografia e l'esecuzione qualcuno può aver cambiato il mondo.
 */
export async function eseguiAzione(
  azione: string,
  payload: Record<string, unknown>,
  contesto: { proposalId: string; attoreId: string },
): Promise<EsitoEsecuzione> {
  const supabase = await createSupabaseServerClient();

  switch (azione) {
    case "crea_task": {
      const ruolo = String(payload.ruolo_incaricato ?? "reception");
      const incaricato = await primoProfiloConRuolo(supabase, ruolo);

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: String(payload.titolo ?? "Attività"),
          detail: payload.dettaglio ? String(payload.dettaglio) : null,
          owner_id: incaricato?.id ?? contesto.attoreId,
          patient_id: payload.paziente_id ? String(payload.paziente_id) : null,
          due_on: payload.scadenza ? String(payload.scadenza) : null,
          priority: Number(payload.priorita ?? 2),
          origin: "brain",
          category: payload.categoria ? String(payload.categoria) : null,
          proposal_id: contesto.proposalId,
          created_by: contesto.attoreId,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Task non creato: ${error.message}`);

      return {
        descrizione: `Task assegnato a ${incaricato?.full_name ?? "te"}.`,
        dati: { task_id: (data as { id: string }).id },
      };
    }

    case "avvisa_staff": {
      const { data, error } = await supabase.rpc("notify_staff", {
        p_title: String(payload.titolo ?? "Avviso"),
        p_body: String(payload.corpo ?? ""),
        p_link: "/control",
        p_severity: String(payload.gravita ?? "important"),
        p_category: "brain",
      });

      if (error) throw new Error(`Avviso non inviato: ${error.message}`);
      return { descrizione: `Avviso inviato a ${data ?? 0} persone.`, dati: { destinatari: data } };
    }

    case "aggiorna_prezzo_servizio": {
      const slug = String(payload.servizio ?? "");
      const nuovo = Number(payload.prezzo_cents ?? 0);
      const dal = String(payload.valido_dal ?? oggi());
      if (!slug || !Number.isFinite(nuovo) || nuovo < 0) {
        throw new Error("Prezzo o servizio non validi.");
      }

      const { data: servizioData } = await supabase
        .from("services")
        .select("id, name, price_cents")
        .eq("slug", slug)
        .maybeSingle();

      const servizio = servizioData as
        | { id: string; name: string; price_cents: number }
        | null;
      if (!servizio) throw new Error(`Servizio "${slug}" non trovato.`);

      const { error: erroreServizio } = await supabase
        .from("services")
        .update({ price_cents: nuovo })
        .eq("id", servizio.id);

      if (erroreServizio) throw new Error(`Listino non aggiornato: ${erroreServizio.message}`);

      /*
       * Il listino in knowledge base va aggiornato **e pubblicato** nella
       * stessa operazione. Lasciarlo in bozza significherebbe che il sito
       * dice 65 e il Brain risponde 60 — che è esattamente il problema
       * che la knowledge base versionata esiste per evitare.
       */
      let versioneId: string | null = null;

      const { data: correnteData } = await supabase
        .from("knowledge_current")
        .select("entry_id, version, title, body, summary, data")
        .eq("slug", "listino-servizi")
        .maybeSingle();

      const corrente = correnteData as
        | {
            entry_id: string;
            version: number;
            title: string;
            body: string;
            summary: string | null;
            data: Record<string, unknown>;
          }
        | null;

      if (corrente) {
        const prezzi = {
          ...((corrente.data.prezzi_cents as Record<string, number> | undefined) ?? {}),
          [slug]: nuovo,
        };

        const { data: versione, error: erroreVersione } = await supabase
          .from("knowledge_versions")
          .insert({
            entry_id: corrente.entry_id,
            version: corrente.version + 1,
            status: "draft",
            title: corrente.title,
            body: corrente.body.replace(
              new RegExp(`(${servizio.name}:\\s*)[\\d.,]+\\s*€`),
              `$1${(nuovo / 100).toLocaleString("it-IT")} €`,
            ),
            summary: corrente.summary,
            data: { ...corrente.data, prezzi_cents: prezzi },
            valid_from: dal,
            author_id: contesto.attoreId,
            change_note: `${servizio.name}: da ${euro(servizio.price_cents)} a ${euro(nuovo)}. Applicato dal Brain su autorizzazione.`,
          })
          .select("id")
          .single();

        if (erroreVersione) {
          throw new Error(`Listino aggiornato, knowledge base no: ${erroreVersione.message}`);
        }

        versioneId = (versione as { id: string }).id;
        const { error: errorePubblicazione } = await supabase.rpc("publish_knowledge_version", {
          p_version: versioneId,
        });
        if (errorePubblicazione) {
          throw new Error(
            `Versione creata ma non pubblicata: ${errorePubblicazione.message}. Il listino e la knowledge base sono disallineati.`,
          );
        }
      }

      await emitEvent("brain.action_executed", {
        entity: "service",
        entityId: servizio.id,
        payload: {
          azione,
          da_cents: servizio.price_cents,
          a_cents: nuovo,
          proposta: contesto.proposalId,
        },
        client: supabase,
      });

      return {
        descrizione: `${servizio.name}: ${euro(servizio.price_cents)} → ${euro(nuovo)}. Knowledge base aggiornata e in vigore.`,
        dati: {
          servizio: servizio.name,
          da_cents: servizio.price_cents,
          a_cents: nuovo,
          versione_knowledge: versioneId,
        },
      };
    }

    case "pubblica_conoscenza": {
      const slug = String(payload.slug ?? "");
      const testo = String(payload.testo ?? "");
      if (!slug || testo.length < 10) throw new Error("Servono la voce e il testo.");

      const { data: entryData } = await supabase
        .from("knowledge_entries")
        .select("id, title")
        .eq("slug", slug)
        .maybeSingle();

      const entry = entryData as { id: string; title: string } | null;
      if (!entry) throw new Error(`Voce "${slug}" inesistente.`);

      const { data: ultimaData } = await supabase
        .from("knowledge_versions")
        .select("version")
        .eq("entry_id", entry.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const ultima = (ultimaData as { version: number } | null)?.version ?? 0;

      const { data: versione, error } = await supabase
        .from("knowledge_versions")
        .insert({
          entry_id: entry.id,
          version: ultima + 1,
          status: "draft",
          title: entry.title,
          body: testo,
          summary: payload.sintesi ? String(payload.sintesi) : null,
          valid_from: String(payload.valido_dal ?? oggi()),
          author_id: contesto.attoreId,
          change_note: payload.nota ? String(payload.nota) : "Aggiornata tramite Unique Brain.",
        })
        .select("id")
        .single();

      if (error) throw new Error(`Versione non creata: ${error.message}`);

      const versioneId = (versione as { id: string }).id;
      const { error: erroreRpc } = await supabase.rpc("publish_knowledge_version", {
        p_version: versioneId,
      });
      if (erroreRpc) throw new Error(`Versione non pubblicata: ${erroreRpc.message}`);

      return {
        descrizione: `"${entry.title}" è ora alla versione ${ultima + 1}.`,
        dati: { slug, versione: ultima + 1, versione_id: versioneId },
      };
    }

    case "prepara_riattivazione": {
      const giorni = Number(payload.giorni ?? 60);
      const criterio = payload.criterio === "crediti" ? "crediti" : "visite";
      const limite = Math.min(Number(payload.limite ?? 50), 200);
      const ruolo = String(payload.ruolo_incaricato ?? "reception");

      const [inattivi, incaricato] = await Promise.all([
        pazientiInattivi(supabase, giorni, criterio, limite),
        primoProfiloConRuolo(supabase, ruolo),
      ]);

      if (inattivi.length === 0) {
        return { descrizione: "Nessun paziente rientra nel criterio.", dati: { creati: 0 } };
      }

      const righe = inattivi.map((p) => ({
        title: `Ricontattare ${p.nome}`,
        detail:
          criterio === "crediti"
            ? `Non utilizza crediti da ${p.giorni ?? "sempre"} giorni. Verificare se la membership sta funzionando per lui.`
            : `Ultima visita ${p.giorni ? `${p.giorni} giorni fa` : "mai"}. Proporre il passo successivo del percorso.`,
        patient_id: p.patientId,
        owner_id: incaricato?.id ?? contesto.attoreId,
        priority: 2,
        origin: "brain",
        category: "riattivazione",
        proposal_id: contesto.proposalId,
        created_by: contesto.attoreId,
        due_on: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      }));

      const { error } = await supabase.from("tasks").insert(righe);
      if (error) throw new Error(`Contatti non creati: ${error.message}`);

      await supabase.rpc("notify_staff", {
        p_title: "Riattivazione preparata",
        p_body: `${righe.length} pazienti da ricontattare, assegnati a ${incaricato?.full_name ?? "te"}. Nessun messaggio è stato inviato.`,
        p_link: "/control/task",
        p_severity: "important",
        p_category: "brain",
      });

      return {
        descrizione: `${righe.length} contatti preparati e assegnati. Nessun messaggio è partito.`,
        dati: { creati: righe.length, criterio, giorni },
      };
    }

    default:
      throw new Error(`Nessuna esecuzione definita per "${azione}".`);
  }
}
