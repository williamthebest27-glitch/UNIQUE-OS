import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getControlCenter } from "@/lib/data/control";
import { getMarketing } from "@/lib/data/marketing";
import { getBriefMattutino } from "@/lib/data/morning";
import { cercaConoscenza } from "@/lib/knowledge/queries";
import { countEvents } from "@/lib/events/emit";
import { describeEvent } from "@/lib/events/catalog";
import { pazientiInattivi } from "@/lib/approvals/executor";
import { creaProposta } from "@/lib/approvals/proposals";
import { DOMANDE_ESEMPIO, riconosciIntento, type Intento } from "@/lib/brain/intenti";
import type { TracciaStrumento } from "@/lib/brain/tools";
import {
  componiAiuto,
  componiAndamento,
  componiCampagneCostose,
  componiCampagneQualita,
  componiCapacita,
  componiConoscenza,
  componiContenuti,
  componiEventi,
  componiNonCapito,
  componiPazientiFermi,
  componiProposta,
  componiSpesa,
  componiTask,
  type RispostaComposta,
} from "@/lib/brain/narrativa";

/**
 * Il motore proprietario di Unique Brain.
 *
 * Riconosce l'intento, chiede i numeri a chi li sa già calcolare, e
 * compone la risposta. Nessun modello, nessuna rete, nessun dato che esce
 * dall'infrastruttura.
 *
 * La struttura è deliberatamente la stessa del percorso con il modello —
 * una risposta e un elenco di chiamate fatte — perché l'interfaccia non
 * debba sapere quale dei due ha risposto, e perché passare dall'uno
 * all'altro non cambi cosa vede chi legge.
 *
 * I permessi non li controlla questo file: ogni funzione che interroga
 * passa dal client di sessione, quindi dalla Row Level Security. Un
 * amministratore di sede vede i suoi numeri, e il motore non ha modo di
 * saperne di più.
 */

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function meseIndietro(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return mese === 1
    ? `${anno - 1}-12`
    : `${anno}-${String(mese - 1).padStart(2, "0")}`;
}

export interface RispostaMotore {
  risposta: string;
  tracce: TracciaStrumento[];
  /** L'intento riconosciuto, o null: serve a capire perché ha risposto così. */
  intento: string | null;
}

function esito(
  composta: RispostaComposta,
  intento: Intento | null,
  tracce: TracciaStrumento[],
): RispostaMotore {
  const testo =
    composta.fonti.length > 0
      ? composta.testo
      : composta.testo;

  return { risposta: testo, tracce, intento: intento?.id ?? null };
}

export async function rispondiConMotoreProprio(domanda: string): Promise<RispostaMotore> {
  const oggi = ROMA.format(new Date());
  const intento = riconosciIntento(domanda, oggi);
  const tracce: TracciaStrumento[] = [];

  const traccia = (strumento: string, argomenti: Record<string, unknown>, riga: string) => {
    tracce.push({ strumento, argomenti, esito: riga });
  };

  if (!intento) {
    return esito(componiNonCapito(DOMANDE_ESEMPIO), null, tracce);
  }

  const periodo = intento.parametri.periodo ?? oggi.slice(0, 7);

  switch (intento.id) {
    case "aiuto":
      return esito(componiAiuto(DOMANDE_ESEMPIO), intento, tracce);

    /* ── I numeri dell'azienda ──────────────────────────────────── */
    case "andamento":
    case "fatturato":
    case "conversione": {
      const [dati, precedente, brief] = await Promise.all([
        getControlCenter(periodo),
        // Il confronto col mese prima è la metà del significato di un
        // numero: senza, "21.430 €" non dice se è tanto o poco.
        getControlCenter(meseIndietro(periodo)),
        getBriefMattutino(),
      ]);

      if (!dati) {
        traccia("andamento_azienda", { periodo }, "nessun accesso ai dati di direzione");
        return esito(
          {
            testo:
              "Non ho accesso ai numeri di direzione con questo profilo. È la Row Level Security a deciderlo, e non posso aggirarla.",
            fonti: [],
          },
          intento,
          tracce,
        );
      }

      traccia(
        "andamento_azienda",
        { periodo },
        `${dati.mese.visite} visite, ${dati.mese.nuoviMembri} nuovi membri`,
      );

      const composta = componiAndamento({
        periodo,
        oggi,
        fatturatoCents: dati.mese.fatturatoCents,
        fatturatoPrecedenteCents: precedente?.mese.fatturatoCents ?? null,
        visite: dati.mese.visite,
        nuoviPazienti: dati.oggi.pazienti,
        nuoviMembri: dati.mese.nuoviMembri,
        churn: dati.mese.churn,
        lead: dati.mese.lead,
        conversione: dati.mese.conversionRate,
        margineCents: dati.mese.totaliEconomici.uniqueMarginCents,
        margineQuota: dati.mese.totaliEconomici.marginRatio,
        compensiDaLiquidareCents: dati.compensi.totaleDaPagareCents,
        collo: dati.capacita.collo
          ? {
              professionista:
                dati.capacita.nomiProfessionisti.get(dati.capacita.collo.professionalId) ??
                "Un professionista",
              saturazione: dati.capacita.collo.saturazione,
            }
          : null,
        pagamentiFalliti: brief?.pagamentiFalliti ?? 0,
        proposteInAttesa: brief?.proposteInAttesa ?? 0,
      });

      return esito(composta, intento, tracce);
    }

    case "capacita": {
      const dati = await getControlCenter(periodo);
      if (!dati) {
        return esito(
          { testo: "Non ho accesso ai dati di capacità con questo profilo.", fonti: [] },
          intento,
          tracce,
        );
      }

      traccia("capacita", { periodo }, dati.capacita.collo ? "collo di bottiglia individuato" : "orari non configurati");

      return esito(
        componiCapacita({
          collo: dati.capacita.collo
            ? {
                professionista:
                  dati.capacita.nomiProfessionisti.get(dati.capacita.collo.professionalId) ??
                  "Un professionista",
                saturazione: dati.capacita.collo.saturazione,
              }
            : null,
          membriAttivi: dati.capacita.membriAttivi,
          margineCrescita: dati.capacita.margineCrescita,
        }),
        intento,
        tracce,
      );
    }

    /* ── Marketing ──────────────────────────────────────────────── */
    case "spesa_marketing": {
      const dati = await getMarketing(periodo);
      if (!dati) {
        return esito(
          { testo: "Non ho accesso ai dati di marketing con questo profilo.", fonti: [] },
          intento,
          tracce,
        );
      }

      traccia("marketing", { periodo }, `${dati.campagne.length} campagne attive`);

      return esito(
        componiSpesa({
          periodo,
          oggi,
          spesaCents: dati.totali.spendCents,
          lead: dati.totali.leads,
          pazienti: dati.totali.patients,
          cplCents: dati.totali.cplCents,
          cacCents: dati.totali.cacCents,
          roas: dati.totali.roas,
          ricavoCents: dati.totali.revenueCents,
          campagneAttive: dati.campagne.length,
        }),
        intento,
        tracce,
      );
    }

    case "campagne_qualita": {
      const dati = await getMarketing(periodo);
      if (!dati) {
        return esito(
          { testo: "Non ho accesso ai dati di marketing con questo profilo.", fonti: [] },
          intento,
          tracce,
        );
      }

      traccia("marketing", { periodo }, `${dati.perQualita.length} campagne confrontabili`);

      return esito(
        componiCampagneQualita(
          dati.perQualita.map((c) => ({
            nome: c.name,
            canale: c.channel,
            pazienti: c.patients,
            valoreMedioCents: Math.round(c.revenueCents / Math.max(1, c.patients)),
            tassoMembership: c.tassoMembership,
            cplCents: c.cplCents,
            spesaCents: c.spendCents,
          })),
          periodo,
          oggi,
        ),
        intento,
        tracce,
      );
    }

    case "campagne_costose": {
      const dati = await getMarketing(periodo);
      if (!dati) {
        return esito(
          { testo: "Non ho accesso ai dati di marketing con questo profilo.", fonti: [] },
          intento,
          tracce,
        );
      }

      traccia("marketing", { periodo }, `${dati.fuoriMedia.length} campagne sopra la media`);

      return esito(
        componiCampagneCostose(
          dati.fuoriMedia.map((s) => ({
            nome: s.name,
            cplCents: s.cplCents,
            scarto: s.scarto,
          })),
          dati.totali.cplCents,
          periodo,
          oggi,
        ),
        intento,
        tracce,
      );
    }

    case "contenuti": {
      const dati = await getMarketing(periodo);
      if (!dati) {
        return esito(
          { testo: "Non ho accesso ai contenuti con questo profilo.", fonti: [] },
          intento,
          tracce,
        );
      }

      traccia("marketing", { periodo }, `${dati.contenuti.length} contenuti valutati`);

      return esito(
        componiContenuti(
          dati.contenuti.map((c) => ({
            titolo: c.title,
            formato: c.format,
            angolo: c.angle,
            lead: c.leadsAttributed,
            leadPerMille: c.leadPerMille,
            engagement: c.engagement,
          })),
          dati.ricorrenze,
        ),
        intento,
        tracce,
      );
    }

    /* ── Pazienti ───────────────────────────────────────────────── */
    case "pazienti_fermi":
    case "membership": {
      const giorni = intento.parametri.giorni ?? 60;
      const criterio = intento.parametri.criterio ?? "visite";
      const supabase = await createSupabaseServerClient();
      const elenco = await pazientiInattivi(supabase, giorni, criterio, 50);

      traccia("pazienti_fermi", { giorni, criterio }, `${elenco.length} pazienti fermi`);

      return esito(
        componiPazientiFermi({
          quanti: elenco.length,
          giorni,
          criterio,
          esempi: elenco.map((p) => ({ nome: p.nome, giorni: p.giorni })),
        }),
        intento,
        tracce,
      );
    }

    /* ── Operatività ────────────────────────────────────────────── */
    case "task": {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("tasks")
        .select("id, due_on, origin")
        .eq("status", "open")
        .limit(200);

      const righe = (data ?? []) as { due_on: string | null; origin: string }[];
      const perOrigine = new Map<string, number>();
      for (const t of righe) perOrigine.set(t.origin, (perOrigine.get(t.origin) ?? 0) + 1);

      traccia("task_aperti", {}, `${righe.length} task aperti`);

      return esito(
        componiTask({
          aperti: righe.length,
          scaduti: righe.filter((t) => t.due_on !== null && t.due_on < oggi).length,
          perOrigine: [...perOrigine.entries()].sort((a, b) => b[1] - a[1]),
        }),
        intento,
        tracce,
      );
    }

    case "eventi": {
      const giorni = intento.parametri.giorni ?? 7;
      const da = new Date(Date.now() - giorni * 86_400_000).toISOString();
      const conteggi = await countEvents(da);

      const totale = [...conteggi.values()].reduce((s, n) => s + n, 0);
      traccia("eventi", { giorni }, `${totale} eventi`);

      return esito(
        componiEventi({
          giorni,
          totale,
          principali: [...conteggi.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([nome, n]) => [describeEvent(nome).label, n] as [string, number]),
        }),
        intento,
        tracce,
      );
    }

    /* ── Un'azione, non una risposta ────────────────────────────── */
    case "prepara_riattivazione": {
      const giorni = intento.parametri.giorni ?? 60;
      const criterio = intento.parametri.criterio ?? "visite";

      try {
        const proposta = await creaProposta(
          "prepara_riattivazione",
          { giorni, criterio, limite: 50, ruolo_incaricato: "reception" },
          { conversationId: null },
        );

        traccia(
          "proponi_azione",
          { azione: "prepara_riattivazione", giorni, criterio },
          `proposta creata: ${proposta.titolo}`,
        );

        return esito(
          componiProposta({
            titolo: proposta.titolo,
            sommario: proposta.sommario,
            impatto: proposta.impatto,
          }),
          intento,
          tracce,
        );
      } catch (errore) {
        const messaggio = errore instanceof Error ? errore.message : String(errore);
        traccia("proponi_azione", { azione: "prepara_riattivazione" }, `non riuscita: ${messaggio}`);
        return esito(
          {
            testo: `Non sono riuscito a preparare l'azione: ${messaggio}`,
            fonti: [],
          },
          intento,
          tracce,
        );
      }
    }

    /* ── Knowledge base ─────────────────────────────────────────── */
    case "conoscenza": {
      const ricerca = intento.parametri.ricerca?.trim() || domanda;
      const voci = await cercaConoscenza(ricerca, 4);

      traccia(
        "conoscenza",
        { ricerca },
        voci.length === 0 ? "nessuna voce trovata" : voci.map((v) => v.slug).join(", "),
      );

      return esito(
        componiConoscenza(
          voci.map((v) => ({
            titolo: v.title,
            slug: v.slug,
            provenienza: v.provenienza,
            daRiconfermare: v.daRiconfermare,
            // Abbastanza da rispondere, non tutta la voce: chi vuole il
            // testo intero apre la knowledge base.
            estratto: v.body.slice(0, 700),
          })),
          ricerca,
        ),
        intento,
        tracce,
      );
    }

    default:
      return esito(componiNonCapito(DOMANDE_ESEMPIO), intento, tracce);
  }
}
