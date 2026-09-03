import { byService, totals, type Raggruppamento, type Totali, type VisitEconomics } from "./engine.ts";

/**
 * "Quanto dobbiamo pagare ai professionisti questo mese?"
 *
 * Il report deve essere **verificabile**: non un totale da accettare, ma
 * un totale che si può ricostruire riga per riga. Per questo ogni
 * compenso porta con sé le visite che lo compongono e le rettifiche che
 * lo correggono, ciascuna con il proprio motivo.
 *
 * Una mancata presentazione è pagata come una visita svolta: il
 * professionista ha tenuto lo slot ed è rimasto in clinica. È una scelta
 * contrattuale, non tecnica, e va confermata da Unique — se cambia, si
 * cambia qui.
 */

export interface PayoutAdjustment {
  id: string;
  professionalId: string;
  amountCents: number;
  reason: string;
}

export interface ProfessionalPayout {
  professionalId: string;
  professionalName: string;
  visite: VisitEconomics[];
  totali: Totali;
  perServizio: Raggruppamento<string>[];
  /** Rettifiche manuali, ciascuna con il proprio motivo. */
  rettifiche: PayoutAdjustment[];
  rettificheCents: number;
  /** Compenso più rettifiche: l'importo da liquidare. */
  totaleDaPagareCents: number;
  noShow: number;
}

export interface PayoutReport {
  /** Mese in formato YYYY-MM. */
  periodo: string;
  righe: ProfessionalPayout[];
  totaleDaPagareCents: number;
  fatturatoLordoCents: number;
  margineUniqueCents: number;
}

/** Le visite di un mese solare, per come sono state registrate. */
export function filterMonth(rows: VisitEconomics[], periodo: string): VisitEconomics[] {
  return rows.filter((r) => r.occurredAt.slice(0, 7) === periodo);
}

export function computePayouts(
  rows: VisitEconomics[],
  periodo: string,
  nomi: Map<string, string>,
  rettifiche: PayoutAdjustment[] = [],
): PayoutReport {
  const delMese = filterMonth(rows, periodo);

  const perProfessionista = new Map<string, VisitEconomics[]>();
  for (const row of delMese) {
    // Una visita senza professionista non genera compenso: entra nel
    // fatturato, non nel report dei pagamenti.
    if (!row.professionalId) continue;
    const lista = perProfessionista.get(row.professionalId) ?? [];
    lista.push(row);
    perProfessionista.set(row.professionalId, lista);
  }

  // Anche chi non ha lavorato può avere una rettifica da liquidare.
  for (const r of rettifiche) {
    if (!perProfessionista.has(r.professionalId)) {
      perProfessionista.set(r.professionalId, []);
    }
  }

  const righe: ProfessionalPayout[] = [...perProfessionista.entries()].map(
    ([professionalId, visite]) => {
      const mie = rettifiche.filter((r) => r.professionalId === professionalId);
      const rettificheCents = mie.reduce((acc, r) => acc + r.amountCents, 0);
      const t = totals(visite);

      return {
        professionalId,
        professionalName: nomi.get(professionalId) ?? "Professionista",
        visite,
        totali: t,
        perServizio: byService(visite),
        rettifiche: mie,
        rettificheCents,
        totaleDaPagareCents: t.professionalPayCents + rettificheCents,
        noShow: visite.filter((v) => v.materialCents === 0 && v.grossCents > 0).length,
      };
    },
  );

  righe.sort((a, b) => b.totaleDaPagareCents - a.totaleDaPagareCents);

  const complessivi = totals(delMese);

  return {
    periodo,
    righe,
    totaleDaPagareCents: righe.reduce((acc, r) => acc + r.totaleDaPagareCents, 0),
    fatturatoLordoCents: complessivi.grossCents,
    margineUniqueCents: complessivi.uniqueMarginCents,
  };
}
