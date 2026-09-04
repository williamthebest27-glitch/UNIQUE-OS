import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getControlCenter, type ControlData } from "@/lib/data/control";
import { getMarketing } from "@/lib/data/marketing";
import { getCrmBoard } from "@/lib/data/crm";
import type { VisitEconomics } from "@/lib/economics/engine";
import type { Interrogazione, Misura } from "@/lib/brain/interrogazione";
import type { RigaRisultato, Risultato, Unita } from "@/lib/brain/risposte-interrogazione";

/**
 * Il risolutore: da un'interrogazione ai numeri.
 *
 * Non calcola niente di nuovo. Prende le righe economiche visita per
 * visita — già prodotte dal motore di unit economics, con prezzo,
 * materiali, compenso e margine — e le raggruppa come la domanda chiede.
 * Il marketing e il CRM forniscono le loro aggregazioni. È il motivo per
 * cui questo file è corto: i conti difficili erano già fatti e testati,
 * qui si sceglie solo quali righe sommare.
 *
 * Tutto passa dal client di sessione e dai motori che già rispettano la
 * Row Level Security: un'interrogazione non apre nessuna porta che non
 * fosse già aperta.
 *
 * Ciò che non si può fare si dice in `limiti`, non si approssima: "non
 * ho i crediti per mese, solo quelli di oggi" è una risposta; un numero
 * di oggi spacciato per il mese è un errore.
 */

const UNITA: Record<Misura, Unita> = {
  fatturato: "euro",
  margine: "euro",
  compensi: "euro",
  spesa: "euro",
  visite: "numero",
  pazienti: "numero",
  lead: "numero",
  membership: "numero",
  crediti: "numero",
  no_show: "numero",
  documenti: "numero",
  task: "numero",
  conversione: "percento",
};

const NOMI_DISCIPLINA: Record<string, string> = {
  physician: "medicina",
  nutritionist: "nutrizione",
  osteopath: "osteopatia",
  psychologist: "psicologia",
  trainer: "preparazione",
  nurse: "infermieristica",
  other: "altro",
};

function meseIndietro(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return mese === 1 ? `${anno - 1}-12` : `${anno}-${String(mese - 1).padStart(2, "0")}`;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/* ── Le misure sulle righe economiche ─────────────────────────────── */

function valoreDi(misura: Misura, righe: VisitEconomics[]): number {
  switch (misura) {
    case "fatturato":
      return righe.reduce((s, r) => s + r.grossCents, 0);
    case "margine":
      return righe.reduce((s, r) => s + r.uniqueMarginCents, 0);
    case "compensi":
      return righe.reduce((s, r) => s + r.professionalPayCents, 0);
    case "visite":
      return righe.length;
    case "pazienti":
      return new Set(righe.map((r) => r.patientId)).size;
    default:
      return 0;
  }
}

const SU_RIGHE: Misura[] = ["fatturato", "margine", "compensi", "visite", "pazienti"];

interface Contesto {
  controllo: ControlData;
  disciplinaDiServizio: Map<string, string>;
}

/**
 * Raggruppa le righe economiche per la dimensione chiesta.
 *
 * "Visite" come dettaglio accanto alle cifre: un servizio che fattura
 * poco con molte visite e uno che fattura poco con tre visite sono due
 * situazioni diverse, e il numero da solo non lo dice.
 */
function raggruppaRighe(
  righe: VisitEconomics[],
  dimensione: Interrogazione["raggruppa"],
  misura: Misura,
  ctx: Contesto,
): RigaRisultato[] {
  const chiave = (r: VisitEconomics): [string, string] => {
    switch (dimensione) {
      case "servizio":
        return [r.serviceId, r.serviceName];
      case "professionista":
        return [
          r.professionalId ?? "—",
          r.professionalId
            ? (ctx.controllo.capacita.nomiProfessionisti.get(r.professionalId) ?? "Senza nome")
            : "Senza professionista",
        ];
      case "disciplina": {
        const d = ctx.disciplinaDiServizio.get(r.serviceId) ?? "other";
        return [d, NOMI_DISCIPLINA[d] ?? d];
      }
      case "paziente":
        return [r.patientId, "Paziente"];
      default:
        return ["tutto", "Totale"];
    }
  };

  const gruppi = new Map<string, { etichetta: string; righe: VisitEconomics[] }>();
  for (const r of righe) {
    const [k, etichetta] = chiave(r);
    const g = gruppi.get(k) ?? { etichetta, righe: [] };
    g.righe.push(r);
    gruppi.set(k, g);
  }

  return [...gruppi.values()].map((g) => ({
    etichetta: g.etichetta,
    valore: valoreDi(misura, g.righe),
    dettaglio: misura === "visite" ? undefined : `${g.righe.length} visite`,
  }));
}

function applicaFiltri(
  righe: VisitEconomics[],
  q: Interrogazione,
  ctx: Contesto,
): { righe: VisitEconomics[]; applicati: string[]; limiti: string[] } {
  let filtrate = righe;
  const applicati: string[] = [];
  const limiti: string[] = [];

  for (const f of q.filtri) {
    if (f.dimensione === "disciplina") {
      filtrate = filtrate.filter((r) => ctx.disciplinaDiServizio.get(r.serviceId) === f.valore);
      applicati.push(`disciplina: ${NOMI_DISCIPLINA[f.valore] ?? f.valore}`);
    }

    if (f.dimensione === "professionista") {
      const cercato = f.valore.toLowerCase();
      const trovati = [...ctx.controllo.capacita.nomiProfessionisti.entries()].filter(([, nome]) =>
        nome.toLowerCase().includes(cercato),
      );

      if (trovati.length === 0) {
        limiti.push(
          `Non trovo un professionista che si chiami "${f.valore}": il numero qui sopra è di tutti.`,
        );
      } else {
        const ids = new Set(trovati.map(([id]) => id));
        filtrate = filtrate.filter((r) => r.professionalId !== null && ids.has(r.professionalId));
        applicati.push(`professionista: ${trovati.map(([, n]) => n).join(", ")}`);
      }
    }

    if (f.dimensione === "canale" && SU_RIGHE.includes(q.misura)) {
      limiti.push(
        "Il canale di provenienza non è collegato alle visite: si può leggere sui lead e sulle conversioni, non sul fatturato.",
      );
    }
  }

  return { righe: filtrate, applicati, limiti };
}

/* ── Il risolutore ────────────────────────────────────────────────── */

export async function risolvi(q: Interrogazione): Promise<Risultato | null> {
  const oggi = ROMA.format(new Date());
  const periodo = q.periodo ?? oggi.slice(0, 7);
  const unita = UNITA[q.misura];

  /* ── Misure sulle visite ────────────────────────────────────── */
  if (SU_RIGHE.includes(q.misura)) {
    const [controllo, precedente, serviziRes] = await Promise.all([
      getControlCenter(periodo),
      // Il periodo precedente serve al confronto e alla spiegazione: si
      // legge sempre, perché un numero senza confronto dice poco.
      getControlCenter(meseIndietro(periodo)),
      (await createSupabaseServerClient()).from("services").select("id, discipline"),
    ]);

    if (!controllo) return null;

    const disciplinaDiServizio = new Map(
      ((serviziRes.data ?? []) as { id: string; discipline: string | null }[]).map((s) => [
        s.id,
        s.discipline ?? "other",
      ]),
    );

    const ctx: Contesto = { controllo, disciplinaDiServizio };
    const { righe, applicati, limiti } = applicaFiltri(controllo.righeEconomiche, q, ctx);

    const risultato: Risultato = {
      misura: q.misura,
      periodo,
      unita,
      totale: valoreDi(q.misura, righe),
      righe: q.raggruppa ? raggruppaRighe(righe, q.raggruppa, q.misura, ctx) : [],
      filtriApplicati: applicati,
      limiti,
    };

    if (precedente) {
      const ctxPrecedente: Contesto = { controllo: precedente, disciplinaDiServizio };
      const filtratePrecedenti = applicaFiltri(precedente.righeEconomiche, q, ctxPrecedente).righe;
      risultato.precedente = {
        totale: valoreDi(q.misura, filtratePrecedenti),
        righe: q.raggruppa
          ? raggruppaRighe(filtratePrecedenti, q.raggruppa, q.misura, ctxPrecedente)
          : [],
      };
    }

    // Una spiegazione senza raggruppamento non ha su cosa scomporre: si
    // sceglie il servizio, che è la dimensione che spiega di più.
    if (q.spiegazione && !q.raggruppa && precedente) {
      risultato.righe = raggruppaRighe(righe, "servizio", q.misura, ctx);
      risultato.precedente = {
        totale: risultato.precedente?.totale ?? null,
        righe: raggruppaRighe(
          applicaFiltri(precedente.righeEconomiche, q, { controllo: precedente, disciplinaDiServizio }).righe,
          "servizio",
          q.misura,
          { controllo: precedente, disciplinaDiServizio },
        ),
      };
    }

    if (q.raggruppa === "sede") {
      risultato.limiti.push("La suddivisione per sede arriverà con la seconda sede: oggi è una sola.");
    }

    return risultato;
  }

  /* ── Lead e conversione: CRM e marketing ─────────────────────── */
  if (q.misura === "lead" || q.misura === "conversione") {
    const [board, marketing, controllo] = await Promise.all([
      getCrmBoard(),
      getMarketing(periodo),
      getControlCenter(periodo),
    ]);

    const limiti: string[] = [];
    const applicati: string[] = [];
    let righe: RigaRisultato[] = [];
    let totale: number | null = null;

    if (q.raggruppa === "campagna" || q.filtri.some((f) => f.dimensione === "campagna")) {
      if (!marketing) return null;
      righe = marketing.campagne.map((c) => ({
        etichetta: c.name,
        valore: q.misura === "lead" ? c.leads : (c.conversione ?? 0),
        dettaglio: q.misura === "lead" ? `${c.patients} pazienti` : `${c.leads} lead`,
      }));
      totale = q.misura === "lead" ? marketing.totali.leads : marketing.totali.conversione;
      applicati.push("solo lead attribuiti a una campagna");
    } else {
      if (!board) return null;

      const canaleFiltro = q.filtri.find((f) => f.dimensione === "canale")?.valore;
      const perCanale = canaleFiltro
        ? board.perCanale.filter((c) => c.key === canaleFiltro)
        : board.perCanale;

      if (canaleFiltro && perCanale.length === 0) {
        limiti.push(`Nessun lead dal canale "${canaleFiltro}".`);
      } else if (canaleFiltro) {
        applicati.push(`canale: ${perCanale[0].label}`);
      }

      righe = perCanale.map((c) => ({
        etichetta: c.label,
        valore: q.misura === "lead" ? c.lead : c.conversionRate,
        dettaglio: q.misura === "lead" ? `${c.convertiti} convertiti` : `${c.lead} lead`,
      }));

      totale =
        q.misura === "lead"
          ? perCanale.reduce((s, c) => s + c.lead, 0)
          : (controllo?.mese.conversionRate ?? null);

      // Il CRM non è per mese: i lead per canale sono tutti quelli
      // registrati. Va detto, o "settembre" nella risposta sarebbe falso.
      limiti.push("I lead per canale sono quelli complessivi nel CRM, non solo del mese.");
    }

    return {
      misura: q.misura,
      periodo,
      unita,
      totale,
      righe: q.raggruppa || q.filtri.length > 0 ? righe : [],
      filtriApplicati: applicati,
      limiti,
    };
  }

  /* ── Spesa e membership: marketing e control ─────────────────── */
  if (q.misura === "spesa") {
    const marketing = await getMarketing(periodo);
    if (!marketing) return null;

    return {
      misura: q.misura,
      periodo,
      unita,
      totale: marketing.totali.spendCents,
      righe:
        q.raggruppa === "campagna" || q.raggruppa === "canale"
          ? marketing.campagne.map((c) => ({
              etichetta: q.raggruppa === "canale" ? c.channel : c.name,
              valore: c.spendCents,
              dettaglio: `${c.leads} lead`,
            }))
          : [],
      filtriApplicati: [],
      limiti: [],
    };
  }

  if (q.misura === "membership") {
    const [controllo, precedente, marketing] = await Promise.all([
      getControlCenter(periodo),
      getControlCenter(meseIndietro(periodo)),
      q.raggruppa === "campagna" ? getMarketing(periodo) : Promise.resolve(null),
    ]);
    if (!controllo) return null;

    return {
      misura: q.misura,
      periodo,
      unita,
      totale: controllo.mese.nuoviMembri,
      righe:
        marketing?.campagne.map((c) => ({
          etichetta: c.name,
          valore: c.members,
          dettaglio: `${c.patients} pazienti`,
        })) ?? [],
      precedente: precedente ? { totale: precedente.mese.nuoviMembri, righe: [] } : undefined,
      filtriApplicati: [],
      limiti: ["Le membership contate sono quelle nuove nel mese; le attive in totale stanno nella capacità."],
    };
  }

  /* ── Misure di giornata e conteggi semplici ──────────────────── */
  const supabase = await createSupabaseServerClient();

  if (q.misura === "crediti" || q.misura === "no_show") {
    const controllo = await getControlCenter(periodo);
    if (!controllo) return null;
    return {
      misura: q.misura,
      periodo: oggi.slice(0, 7),
      unita,
      totale: q.misura === "crediti" ? controllo.oggi.creditiUtilizzati : controllo.oggi.noShow,
      righe: [],
      filtriApplicati: ["solo oggi"],
      limiti: [
        q.misura === "crediti"
          ? "I crediti utilizzati li ho solo per la giornata di oggi: il conteggio per mese non è ancora esposto."
          : "Le mancate presentazioni le ho solo per oggi.",
      ],
    };
  }

  if (q.misura === "documenti") {
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${periodo}-01T00:00:00Z`)
      .lt("created_at", `${meseAvanti(periodo)}-01T00:00:00Z`);
    return {
      misura: q.misura,
      periodo,
      unita,
      totale: count ?? 0,
      righe: [],
      filtriApplicati: [],
      limiti: [],
    };
  }

  if (q.misura === "task") {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    return {
      misura: q.misura,
      periodo: oggi.slice(0, 7),
      unita,
      totale: count ?? 0,
      righe: [],
      filtriApplicati: ["aperti adesso"],
      limiti: [],
    };
  }

  return null;
}

function meseAvanti(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return mese === 12 ? `${anno + 1}-01` : `${anno}-${String(mese + 1).padStart(2, "0")}`;
}
