/**
 * Unit economics.
 *
 * Il modello è quello descritto nella visione:
 *
 *   prezzo − materiali = base compensabile
 *   base × quota      = compenso al professionista
 *   base − compenso   = margine Unique
 *
 * I materiali si tolgono **prima** della divisione, quindi pesano su
 * entrambi in proporzione. È una scelta contrattuale, non un dettaglio:
 * toglierli dopo sposterebbe tutto il costo su Unique.
 *
 * Funzioni pure: nessuna query, nessun arrotondamento nascosto. Gli
 * importi restano in centesimi finché non vanno mostrati, così non si
 * accumulano errori di virgola mobile lungo una somma di mille visite.
 */

export interface ServiceEconomics {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  materialCostCents: number;
}

export interface CompensationRule {
  id: string;
  /** Null significa "qualunque professionista". */
  professionalId: string | null;
  /** Null significa "qualunque servizio". */
  serviceId: string | null;
  professionalShare: number;
  /** La regola vale dalla n-esima visita del mese in poi. */
  minMonthlyVisits: number;
}

export interface Visit {
  appointmentId: string;
  serviceId: string;
  professionalId: string | null;
  professionalName?: string;
  patientId: string;
  occurredAt: string;
  /** Un no-show è fatturato ma non erogato: i materiali non si consumano. */
  outcome: "completed" | "no_show";
}

export interface VisitEconomics {
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  professionalId: string | null;
  patientId: string;
  occurredAt: string;
  grossCents: number;
  materialCents: number;
  compensableCents: number;
  professionalShare: number;
  professionalPayCents: number;
  uniqueMarginCents: number;
  ruleId: string | null;
}

/* ── Risoluzione della regola di compenso ─────────────────────────── */

/**
 * Quanto è specifica una regola: vince quella che nomina più cose.
 * Professionista e servizio insieme battono il solo professionista, che
 * batte il solo servizio, che batte la regola generale.
 */
function specificity(rule: CompensationRule): number {
  return (rule.professionalId ? 2 : 0) + (rule.serviceId ? 1 : 0);
}

export function resolveRule(
  rules: CompensationRule[],
  professionalId: string | null,
  serviceId: string,
  monthlyVisitIndex: number,
): CompensationRule | null {
  const applicabili = rules.filter(
    (r) =>
      (r.professionalId === null || r.professionalId === professionalId) &&
      (r.serviceId === null || r.serviceId === serviceId) &&
      r.minMonthlyVisits <= monthlyVisitIndex,
  );

  if (applicabili.length === 0) return null;

  // Prima la specificità, poi lo scaglione più alto fra quelli raggiunti.
  return applicabili.reduce((migliore, candidato) => {
    const ds = specificity(candidato) - specificity(migliore);
    if (ds !== 0) return ds > 0 ? candidato : migliore;
    return candidato.minMonthlyVisits > migliore.minMonthlyVisits ? candidato : migliore;
  });
}

/* ── Economia di una visita ───────────────────────────────────────── */

export function computeVisitEconomics(
  visit: Visit,
  service: ServiceEconomics,
  rules: CompensationRule[],
  monthlyVisitIndex: number,
): VisitEconomics {
  const gross = service.priceCents;
  // Un paziente che non si presenta viene addebitato, ma la fiala non è
  // stata aperta: il costo dei materiali non c'è.
  const materials = visit.outcome === "no_show" ? 0 : service.materialCostCents;
  const compensable = Math.max(0, gross - materials);

  const rule = resolveRule(rules, visit.professionalId, visit.serviceId, monthlyVisitIndex);
  const share = rule?.professionalShare ?? 0;

  const pay = Math.round(compensable * share);

  return {
    appointmentId: visit.appointmentId,
    serviceId: visit.serviceId,
    serviceName: service.name,
    professionalId: visit.professionalId,
    patientId: visit.patientId,
    occurredAt: visit.occurredAt,
    grossCents: gross,
    materialCents: materials,
    compensableCents: compensable,
    professionalShare: share,
    professionalPayCents: pay,
    // Ciò che resta a Unique dopo materiali e compenso. Per costruzione
    // è la quota complementare della base compensabile.
    uniqueMarginCents: gross - materials - pay,
    ruleId: rule?.id ?? null,
  };
}

/**
 * Economia di un elenco di visite.
 *
 * Lo scaglione si conta per professionista e per mese solare: la
 * ventunesima visita di marzo di un professionista è la ventunesima
 * anche se erogata su servizi diversi.
 */
export function computeAll(
  visits: Visit[],
  services: Map<string, ServiceEconomics>,
  rules: CompensationRule[],
): VisitEconomics[] {
  const ordinate = [...visits].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const conteggio = new Map<string, number>();
  const risultato: VisitEconomics[] = [];

  for (const visit of ordinate) {
    const service = services.get(visit.serviceId);
    // Un servizio fuori catalogo non ha prezzo: non si inventa.
    if (!service) continue;

    const chiave = `${visit.professionalId ?? "—"}|${visit.occurredAt.slice(0, 7)}`;
    const indice = (conteggio.get(chiave) ?? 0) + 1;
    conteggio.set(chiave, indice);

    risultato.push(computeVisitEconomics(visit, service, rules, indice));
  }

  return risultato;
}

/* ── Aggregazioni ─────────────────────────────────────────────────── */

export interface Totali {
  visite: number;
  grossCents: number;
  materialCents: number;
  /** Prezzo meno materiali: la base su cui si calcola la quota. */
  compensableCents: number;
  professionalPayCents: number;
  uniqueMarginCents: number;
  /** Margine Unique sul fatturato lordo, 0–1. */
  marginRatio: number;
}

export function totals(rows: VisitEconomics[]): Totali {
  const t = rows.reduce(
    (acc, r) => ({
      visite: acc.visite + 1,
      grossCents: acc.grossCents + r.grossCents,
      materialCents: acc.materialCents + r.materialCents,
      compensableCents: acc.compensableCents + r.compensableCents,
      professionalPayCents: acc.professionalPayCents + r.professionalPayCents,
      uniqueMarginCents: acc.uniqueMarginCents + r.uniqueMarginCents,
    }),
    {
      visite: 0,
      grossCents: 0,
      materialCents: 0,
      compensableCents: 0,
      professionalPayCents: 0,
      uniqueMarginCents: 0,
    },
  );

  return {
    ...t,
    marginRatio: t.grossCents === 0 ? 0 : t.uniqueMarginCents / t.grossCents,
  };
}

export interface Raggruppamento<K extends string> {
  key: K;
  label: string;
  totali: Totali;
}

function groupBy(
  rows: VisitEconomics[],
  keyOf: (r: VisitEconomics) => string,
  labelOf: (r: VisitEconomics) => string,
): Raggruppamento<string>[] {
  const gruppi = new Map<string, { label: string; rows: VisitEconomics[] }>();

  for (const row of rows) {
    const k = keyOf(row);
    const g = gruppi.get(k) ?? { label: labelOf(row), rows: [] };
    g.rows.push(row);
    gruppi.set(k, g);
  }

  return [...gruppi.entries()]
    .map(([key, g]) => ({ key, label: g.label, totali: totals(g.rows) }))
    .sort((a, b) => b.totali.grossCents - a.totali.grossCents);
}

export function byService(rows: VisitEconomics[]) {
  return groupBy(rows, (r) => r.serviceId, (r) => r.serviceName);
}

export function byProfessional(rows: VisitEconomics[], nomi: Map<string, string>) {
  return groupBy(
    rows,
    (r) => r.professionalId ?? "—",
    (r) => (r.professionalId ? (nomi.get(r.professionalId) ?? "—") : "Senza professionista"),
  );
}

export function byPatient(rows: VisitEconomics[], nomi: Map<string, string>) {
  return groupBy(rows, (r) => r.patientId, (r) => nomi.get(r.patientId) ?? "Paziente");
}

/* ── Margine della membership ─────────────────────────────────────── */

export interface MembershipMargin {
  revenueCents: number;
  /** Compensi e materiali delle visite pagate con i crediti del piano. */
  deliveryCostCents: number;
  marginCents: number;
  marginRatio: number;
  visite: number;
}

/**
 * Quanto rende davvero una membership.
 *
 * Il ricavo è il prezzo del piano; il costo è ciò che è servito a
 * erogare le visite consumate con i suoi crediti. Un piano venduto bene
 * ma consumato molto può avere margine negativo, ed è un'informazione
 * che vale la pena vedere prima di rinnovarlo alle stesse condizioni.
 */
export function membershipMargin(
  revenueCents: number,
  rows: VisitEconomics[],
): MembershipMargin {
  const costo = rows.reduce(
    (acc, r) => acc + r.professionalPayCents + r.materialCents,
    0,
  );

  return {
    revenueCents,
    deliveryCostCents: costo,
    marginCents: revenueCents - costo,
    marginRatio: revenueCents === 0 ? 0 : (revenueCents - costo) / revenueCents,
    visite: rows.length,
  };
}
