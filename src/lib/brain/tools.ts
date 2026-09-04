import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getControlCenter } from "@/lib/data/control";
import { getMarketing } from "@/lib/data/marketing";
import { cercaConoscenza } from "@/lib/knowledge/queries";
import { countEvents, recentEvents } from "@/lib/events/emit";
import { pazientiInattivi } from "@/lib/approvals/executor";
import { creaProposta } from "@/lib/approvals/proposals";
import { AZIONI } from "@/lib/approvals/policy";
import { formatEuro, formatPercent } from "@/lib/format";

/**
 * Gli strumenti del Brain.
 *
 * Il modello non ha accesso al database: ha accesso a queste funzioni.
 * La differenza conta per tre ragioni.
 *
 * **Passano tutte dalla Row Level Security.** Ogni query usa il client di
 * sessione di chi sta parlando. Non c'è modo di ottenere dal Brain un
 * dato che non si potrebbe leggere da soli.
 *
 * **Restituiscono numeri, non frasi.** Un totale calcolato dal motore
 * economico e passato al modello è verificabile; un totale che il modello
 * ricava da una lista di righe è una speranza.
 *
 * **Sono poche e larghe.** Dieci strumenti stretti costringono il modello
 * a comporre una risposta da dieci chiamate, e a sbagliarne una. Ognuno
 * di questi risponde a una domanda intera.
 *
 * Una sola scrive: `proponi_azione`, e non esegue niente — crea una
 * proposta che una persona deve leggere e autorizzare.
 */

export interface TracciaStrumento {
  strumento: string;
  argomenti: Record<string, unknown>;
  /** Una riga leggibile su cosa ha restituito. Finisce nella conversazione salvata. */
  esito: string;
}

function json(valore: unknown): string {
  return JSON.stringify(valore, null, 1);
}

const AZIONI_DISPONIBILI = Object.entries(AZIONI)
  .map(([nome, def]) => `- ${nome} (${def.classe}): ${def.descrizione}`)
  .join("\n");

export function strumentiDelBrain(contesto: {
  conversationId: string | null;
  tracce: TracciaStrumento[];
}) {
  const traccia = (strumento: string, argomenti: Record<string, unknown>, esito: string) => {
    contesto.tracce.push({ strumento, argomenti, esito });
  };

  const andamento = betaZodTool({
    name: "andamento_azienda",
    description:
      "I numeri di Unique per un mese: fatturato, pazienti, membership, conversione, visite, margine, compensi da liquidare, saturazione e collo di bottiglia della capacità. Usalo per qualsiasi domanda su come sta andando l'azienda.",
    inputSchema: z.object({
      periodo: z
        .string()
        .nullable()
        .describe("Mese in formato YYYY-MM. Null per il mese corrente."),
    }),
    run: async ({ periodo }) => {
      const dati = await getControlCenter(periodo ?? undefined);
      if (!dati) {
        traccia("andamento_azienda", { periodo }, "nessun accesso ai dati di direzione");
        return json({ errore: "Nessun accesso ai dati di direzione." });
      }

      const risposta = {
        periodo: dati.mese.periodo,
        oggi: dati.oggi,
        mese: {
          fatturato_cents: dati.mese.fatturatoCents,
          mrr_cents: dati.mese.mrrCents,
          nuovi_membri: dati.mese.nuoviMembri,
          churn: dati.mese.churn,
          lead: dati.mese.lead,
          conversione: dati.mese.conversionRate,
          visite: dati.mese.visite,
          retention: dati.mese.retention,
          valore_per_paziente_cents: dati.mese.ltvCents,
          margine_cents: dati.mese.totaliEconomici.uniqueMarginCents,
          margine_quota: dati.mese.totaliEconomici.marginRatio,
          compensi_da_liquidare_cents: dati.compensi.totaleDaPagareCents,
          per_servizio: dati.mese.perServizio.slice(0, 8).map((g) => ({
            servizio: g.label,
            visite: g.totali.visite,
            ricavo_cents: g.totali.grossCents,
            margine_cents: g.totali.uniqueMarginCents,
          })),
          per_professionista: dati.mese.perProfessionista.slice(0, 8).map((g) => ({
            professionista: g.label,
            visite: g.totali.visite,
            ricavo_cents: g.totali.grossCents,
            compenso_cents: g.totali.professionalPayCents,
          })),
        },
        capacita: {
          collo_di_bottiglia: dati.capacita.collo
            ? {
                professionista:
                  dati.capacita.nomiProfessionisti.get(dati.capacita.collo.professionalId) ??
                  "non identificato",
                saturazione: dati.capacita.collo.saturazione,
              }
            : null,
          membri_attivi: dati.capacita.membriAttivi,
          margine_di_crescita: dati.capacita.margineCrescita,
        },
      };

      traccia(
        "andamento_azienda",
        { periodo: dati.mese.periodo },
        `${formatEuro(dati.mese.fatturatoCents)} di fatturato, ${dati.mese.visite} visite, ${dati.mese.nuoviMembri} nuovi membri`,
      );
      return json(risposta);
    },
  });

  const marketing = betaZodTool({
    name: "marketing",
    description:
      "Campagne del mese con spesa, lead, costo per lead, costo per paziente, ROAS e qualità dei pazienti portati; le campagne fuori media; i contenuti che stanno convertendo. Un valore null significa non calcolabile, mai zero.",
    inputSchema: z.object({
      periodo: z.string().nullable().describe("Mese YYYY-MM. Null per il mese corrente."),
    }),
    run: async ({ periodo }) => {
      const dati = await getMarketing(periodo ?? undefined);
      if (!dati) {
        traccia("marketing", { periodo }, "nessun accesso ai dati di marketing");
        return json({ errore: "Nessun accesso ai dati di marketing." });
      }

      const risposta = {
        periodo: dati.periodo,
        totali: dati.totali,
        campagne: dati.campagne.map((c) => ({
          nome: c.name,
          canale: c.channel,
          stato: c.status,
          servizio: c.serviceName,
          spesa_cents: c.spendCents,
          lead: c.leads,
          cpl_cents: c.cplCents,
          pazienti: c.patients,
          cac_cents: c.cacCents,
          membership: c.members,
          roas: c.roas,
          scarto_tracciamento: c.scartoTracciamento,
        })),
        fuori_media: dati.fuoriMedia,
        migliori_per_qualita: dati.perQualita.slice(0, 5).map((c) => ({
          nome: c.name,
          pazienti: c.patients,
          valore_medio_cents: Math.round(c.revenueCents / Math.max(1, c.patients)),
          tasso_membership: c.tassoMembership,
        })),
        contenuti: dati.contenuti.slice(0, 8).map((c) => ({
          titolo: c.title,
          formato: c.format,
          angolo: c.angle,
          gancio: c.hook,
          coinvolgimento: c.engagement,
          lead_per_mille: c.leadPerMille,
          lead: c.leadsAttributed,
        })),
        ricorrenze_fra_i_migliori: dati.ricorrenze,
      };

      traccia(
        "marketing",
        { periodo: dati.periodo },
        `${formatEuro(dati.totali.spendCents)} spesi, ${dati.totali.leads} lead, ${dati.campagne.length} campagne`,
      );
      return json(risposta);
    },
  });

  const conoscenza = betaZodTool({
    name: "conoscenza",
    description:
      "Cerca nella knowledge base di Unique: procedure, listini, servizi, FAQ, brand book, linee guida, policy. Restituisce solo ciò che è vero oggi, con versione e data da cui vale. Usalo prima di rispondere su prezzi, regole o modi di fare di Unique: non ricostruirli a memoria.",
    inputSchema: z.object({
      domanda: z.string().describe("Le parole da cercare. In italiano."),
    }),
    run: async ({ domanda }) => {
      const voci = await cercaConoscenza(domanda, 5);

      traccia(
        "conoscenza",
        { domanda },
        voci.length === 0
          ? "nessuna voce trovata"
          : voci.map((v) => `${v.slug} (v${v.version})`).join(", "),
      );

      return json({
        voci: voci.map((v) => ({
          slug: v.slug,
          titolo: v.title,
          tipo: v.kind,
          provenienza: v.provenienza,
          da_riconfermare: v.daRiconfermare,
          contenuto: v.body.slice(0, 2000),
          dati: v.data,
        })),
      });
    },
  });

  const pazientiFermi = betaZodTool({
    name: "pazienti_fermi",
    description:
      "I pazienti senza segni di vita da un certo numero di giorni. Criterio 'visite' per chi non viene, 'crediti' per chi ha una membership che non usa — sono due domande diverse.",
    inputSchema: z.object({
      criterio: z.enum(["visite", "crediti"]),
      giorni: z.number().describe("Giorni di silenzio, per esempio 60 o 90."),
      limite: z.number().nullable().describe("Quanti nomi al massimo. Null per 50."),
    }),
    run: async ({ criterio, giorni, limite }) => {
      const supabase = await createSupabaseServerClient();
      const elenco = await pazientiInattivi(supabase, giorni, criterio, limite ?? 50);

      traccia(
        "pazienti_fermi",
        { criterio, giorni },
        `${elenco.length} pazienti fermi da oltre ${giorni} giorni`,
      );

      return json({
        criterio,
        giorni,
        quanti: elenco.length,
        pazienti: elenco.slice(0, 25).map((p) => ({
          nome: p.nome,
          giorni_di_silenzio: p.giorni,
        })),
      });
    },
  });

  const eventi = betaZodTool({
    name: "eventi",
    description:
      "Cosa è successo in Unique negli ultimi giorni: visite completate, disdette, pagamenti falliti, lead convertiti, documenti caricati. Usalo per capire il perché di un numero che si è mosso.",
    inputSchema: z.object({
      giorni: z.number().describe("Quanti giorni indietro guardare."),
      evento: z
        .string()
        .nullable()
        .describe("Un nome di evento specifico, per esempio payment.failed. Null per tutti."),
    }),
    run: async ({ giorni, evento }) => {
      const da = new Date(Date.now() - giorni * 86_400_000).toISOString();
      const [conteggi, ultimi] = await Promise.all([
        countEvents(da),
        recentEvents({ since: da, names: evento ? [evento] : undefined, limit: 40 }),
      ]);

      traccia(
        "eventi",
        { giorni, evento },
        `${[...conteggi.values()].reduce((s, n) => s + n, 0)} eventi in ${giorni} giorni`,
      );

      return json({
        conteggi: Object.fromEntries(conteggi),
        ultimi: ultimi.map((e) => ({
          evento: e.eventName,
          quando: e.occurredAt,
          dati: e.payload,
        })),
      });
    },
  });

  const task = betaZodTool({
    name: "task_aperti",
    description: "I task aperti, con incaricato, priorità e scadenza.",
    inputSchema: z.object({
      limite: z.number().nullable().describe("Quanti al massimo. Null per 30."),
    }),
    run: async ({ limite }) => {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, title, detail, due_on, priority, origin, category, owner:profiles!tasks_owner_id_fkey(full_name)",
        )
        .eq("status", "open")
        .order("priority", { ascending: true })
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(limite ?? 30);

      const righe = (data ?? []) as unknown as {
        title: string;
        detail: string | null;
        due_on: string | null;
        priority: number;
        origin: string;
        category: string | null;
        owner: { full_name: string } | null;
      }[];

      traccia("task_aperti", { limite }, `${righe.length} task aperti`);

      return json({
        quanti: righe.length,
        task: righe.map((t) => ({
          titolo: t.title,
          incaricato: t.owner?.full_name ?? "non assegnato",
          priorita: t.priority,
          scadenza: t.due_on,
          origine: t.origin,
          categoria: t.category,
        })),
      });
    },
  });

  const proponi = betaZodTool({
    name: "proponi_azione",
    description:
      `Prepara un'azione e la mette in attesa di autorizzazione. Non esegue nulla: costruisce l'anteprima ` +
      `— cosa cambierebbe, su quali sistemi, con quali numeri — e la mostra a chi deve decidere.\n\n` +
      `Azioni disponibili:\n${AZIONI_DISPONIBILI}\n\n` +
      `Parametri per azione:\n` +
      `- crea_task: titolo, dettaglio, ruolo_incaricato ('reception'|'admin'|'owner'|'marketing'), scadenza (YYYY-MM-DD), priorita (1 alta, 2 media, 3 bassa), paziente_id\n` +
      `- avvisa_staff: titolo, corpo, gravita ('critical'|'important'|'info')\n` +
      `- aggiorna_prezzo_servizio: servizio (slug del listino), prezzo_cents, valido_dal (YYYY-MM-DD)\n` +
      `- pubblica_conoscenza: slug, testo, sintesi, valido_dal, nota\n` +
      `- prepara_riattivazione: criterio ('visite'|'crediti'), giorni, limite, ruolo_incaricato\n\n` +
      `Proponi una cosa alla volta e spiega a parole cosa hai proposto.`,
    inputSchema: z.object({
      azione: z.string().describe("Il nome esatto dell'azione dall'elenco."),
      parametri: z
        .record(z.string(), z.unknown())
        .describe("I parametri dell'azione, secondo l'elenco."),
    }),
    run: async ({ azione, parametri }) => {
      try {
        const proposta = await creaProposta(azione, parametri as Record<string, unknown>, {
          conversationId: contesto.conversationId,
        });

        traccia("proponi_azione", { azione, parametri }, `proposta creata: ${proposta.titolo}`);

        return json({
          proposta_id: proposta.id,
          stato: "in attesa di autorizzazione",
          classe: proposta.classe,
          titolo: proposta.titolo,
          sommario: proposta.sommario,
          sistemi_toccati: proposta.impatto,
          anteprima: proposta.anteprima,
        });
      } catch (errore) {
        const messaggio = errore instanceof Error ? errore.message : String(errore);
        traccia("proponi_azione", { azione, parametri }, `non riuscita: ${messaggio}`);
        return json({ errore: messaggio });
      }
    },
  });

  const ricorda = betaZodTool({
    name: "ricorda",
    description:
      "Annota una decisione presa o una preferenza dichiarata, perché valga anche nelle prossime conversazioni. Usalo quando l'interlocutore stabilisce una regola ('non scrivere mai ai pazienti senza mostrarmelo prima') o prende una decisione che avrà effetto nel tempo. Non usarlo per riassumere la conversazione.",
    inputSchema: z.object({
      tipo: z.enum(["decision", "preference", "fact"]),
      affermazione: z.string().describe("Una frase sola, al presente, verificabile."),
      contesto: z.string().nullable().describe("Perché, se serve a capirla fra sei mesi."),
    }),
    run: async ({ tipo, affermazione, contesto: perche }) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("brain_memory").insert({
        kind: tipo,
        statement: affermazione,
        context: perche,
        source_conversation_id: contesto.conversationId,
      });

      traccia(
        "ricorda",
        { tipo, affermazione },
        error ? `non salvata: ${error.message}` : "annotata",
      );

      return json(error ? { errore: error.message } : { salvata: true });
    },
  });

  return [andamento, marketing, conoscenza, pazientiFermi, eventi, task, proponi, ricorda];
}

/** Le percentuali nei riassunti si scrivono come le legge una persona. */
export function percentuale(valore: number | null): string {
  return valore === null ? "non calcolabile" : formatPercent(valore);
}
