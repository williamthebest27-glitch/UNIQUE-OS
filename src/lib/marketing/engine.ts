/**
 * I conti del marketing.
 *
 * Funzioni pure, senza import: le stesse ragioni degli altri motori del
 * progetto — si testano senza database, e un numero che finisce in una
 * decisione di budget deve essere verificabile riga per riga.
 *
 * Tre avvertenze che valgono per tutto il file, e che l'interfaccia deve
 * ripetere a chi legge:
 *
 * **Zero non è gratis.** Una campagna senza lead non ha un costo per lead
 * pari a zero: non ne ha uno. Ogni rapporto con denominatore nullo torna
 * `null`, e chi mostra un `null` deve scrivere "non ancora misurabile",
 * non "0 €".
 *
 * **Il ritardo di attribuzione.** La spesa è di questa finestra, il
 * paziente può arrivare il mese prossimo. Un CAC calcolato su sette
 * giorni è quasi sempre una calunnia verso la campagna.
 *
 * **L'attribuzione è al primo contatto.** Il lead porta con sé la
 * campagna che lo ha prodotto e nient'altro. Chi lo ha convinto dopo non
 * lo sappiamo: un modello multi-touch inventato sarebbe peggio di uno
 * semplice dichiarato.
 */

export interface SpesaCampagna {
  campaignId: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  /** I lead dichiarati dalla piattaforma pubblicitaria. */
  platformLeads: number;
}

export interface AttribuzioneCampagna {
  campaignId: string;
  leads: number;
  qualified: number;
  booked: number;
  patients: number;
  members: number;
  revenueCents: number;
}

export interface AnagraficaCampagna {
  id: string;
  name: string;
  channel: string;
  status: string;
  objective: string | null;
  serviceName: string | null;
}

export interface MetricheCampagna {
  id: string;
  name: string;
  channel: string;
  status: string;
  objective: string | null;
  serviceName: string | null;

  spendCents: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  booked: number;
  patients: number;
  members: number;
  revenueCents: number;

  /** Costo per lead. Null se la campagna non ha ancora prodotto lead. */
  cplCents: number | null;
  /** Costo di acquisizione di un paziente. Null se non ne ha ancora portati. */
  cacCents: number | null;
  /** Costo per membership attivata. */
  cpMembershipCents: number | null;
  /** Ricavo per euro speso. Null senza spesa. */
  roas: number | null;
  /** Quota di lead diventati pazienti. */
  conversione: number | null;
  /** Quota di pazienti diventati membri. */
  tassoMembership: number | null;
  /** Quanti click su cento impression. */
  ctr: number | null;
  /** Divergenza fra i lead dichiarati dalla piattaforma e i nostri. */
  scartoTracciamento: number;
}

function rapporto(numeratore: number, denominatore: number): number | null {
  if (denominatore <= 0) return null;
  return numeratore / denominatore;
}

/** Unisce anagrafica, spesa e attribuzione in una riga di metriche. */
export function metricheCampagna(
  anagrafica: AnagraficaCampagna,
  spesa: SpesaCampagna | undefined,
  attribuzione: AttribuzioneCampagna | undefined,
): MetricheCampagna {
  const spendCents = spesa?.spendCents ?? 0;
  const impressions = spesa?.impressions ?? 0;
  const clicks = spesa?.clicks ?? 0;
  const platformLeads = spesa?.platformLeads ?? 0;

  const leads = attribuzione?.leads ?? 0;
  const patients = attribuzione?.patients ?? 0;
  const members = attribuzione?.members ?? 0;
  const revenueCents = attribuzione?.revenueCents ?? 0;

  return {
    id: anagrafica.id,
    name: anagrafica.name,
    channel: anagrafica.channel,
    status: anagrafica.status,
    objective: anagrafica.objective,
    serviceName: anagrafica.serviceName,

    spendCents,
    impressions,
    clicks,
    leads,
    qualified: attribuzione?.qualified ?? 0,
    booked: attribuzione?.booked ?? 0,
    patients,
    members,
    revenueCents,

    cplCents: rapporto(spendCents, leads),
    cacCents: rapporto(spendCents, patients),
    cpMembershipCents: rapporto(spendCents, members),
    roas: rapporto(revenueCents, spendCents),
    conversione: rapporto(patients, leads),
    tassoMembership: rapporto(members, patients),
    ctr: rapporto(clicks, impressions),
    scartoTracciamento: platformLeads - leads,
  };
}

export interface TotaliMarketing {
  spendCents: number;
  leads: number;
  patients: number;
  members: number;
  revenueCents: number;
  cplCents: number | null;
  cacCents: number | null;
  roas: number | null;
  conversione: number | null;
}

/**
 * I totali del periodo.
 *
 * Sommare i CPL delle campagne e dividerli per il loro numero darebbe una
 * media in cui una campagna da 50 € pesa quanto una da 5.000. Qui si
 * sommano spesa e lead e si divide alla fine: è la media pesata, l'unica
 * che significhi qualcosa.
 */
export function totaliMarketing(campagne: readonly MetricheCampagna[]): TotaliMarketing {
  const spendCents = campagne.reduce((s, c) => s + c.spendCents, 0);
  const leads = campagne.reduce((s, c) => s + c.leads, 0);
  const patients = campagne.reduce((s, c) => s + c.patients, 0);
  const members = campagne.reduce((s, c) => s + c.members, 0);
  const revenueCents = campagne.reduce((s, c) => s + c.revenueCents, 0);

  return {
    spendCents,
    leads,
    patients,
    members,
    revenueCents,
    cplCents: rapporto(spendCents, leads),
    cacCents: rapporto(spendCents, patients),
    roas: rapporto(revenueCents, spendCents),
    conversione: rapporto(patients, leads),
  };
}

export interface Scostamento {
  campaignId: string;
  name: string;
  cplCents: number;
  /** +0.31 = costa il 31% in più della media pesata. */
  scarto: number;
}

/**
 * Le campagne che costano più della media, e di quanto.
 *
 * È la frase che il Brain deve poter dire da solo: "la campagna Meta
 * Longevity Agosto sta generando lead a un costo superiore del 31% alla
 * media". Sotto la soglia di lead minimi non si dice niente: con tre lead
 * il costo per lead è rumore, non un'informazione.
 */
export function campagneFuoriMedia(
  campagne: readonly MetricheCampagna[],
  opzioni: { soglia?: number; leadMinimi?: number } = {},
): Scostamento[] {
  const soglia = opzioni.soglia ?? 0.25;
  const leadMinimi = opzioni.leadMinimi ?? 5;

  const misurabili = campagne.filter((c) => c.cplCents !== null && c.leads >= leadMinimi);
  if (misurabili.length < 2) return [];

  const media = totaliMarketing(misurabili).cplCents;
  if (media === null || media === 0) return [];

  return misurabili
    .map((c) => ({
      campaignId: c.id,
      name: c.name,
      cplCents: c.cplCents as number,
      scarto: ((c.cplCents as number) - media) / media,
    }))
    .filter((s) => s.scarto >= soglia)
    .sort((a, b) => b.scarto - a.scarto);
}

/**
 * Le campagne che portano i pazienti migliori.
 *
 * Non è la classifica per numero di lead — quella premia chi compra
 * traffico a poco prezzo. Ordina per valore generato per paziente, e
 * scarta chi non ne ha ancora portati abbastanza per dire qualcosa.
 */
export function migliorQualita(
  campagne: readonly MetricheCampagna[],
  pazientiMinimi = 3,
): MetricheCampagna[] {
  return campagne
    .filter((c) => c.patients >= pazientiMinimi)
    .slice()
    .sort((a, b) => {
      const va = a.revenueCents / a.patients;
      const vb = b.revenueCents / b.patients;
      if (vb !== va) return vb - va;
      return (b.tassoMembership ?? 0) - (a.tassoMembership ?? 0);
    });
}

/* ── Contenuti ────────────────────────────────────────────────────── */

export interface ContenutoGrezzo {
  id: string;
  title: string;
  format: string;
  channel: string;
  hook: string | null;
  angle: string | null;
  topic: string | null;
  publishedOn: string | null;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  leadsAttributed: number;
}

export interface ContenutoValutato extends ContenutoGrezzo {
  /** Interazioni su copertura: quanto ha coinvolto chi lo ha visto. */
  engagement: number | null;
  /** Lead ogni mille visualizzazioni: quanto ha convertito. */
  leadPerMille: number | null;
  /**
   * Il punteggio con cui si ordina.
   *
   * Le interazioni contano, ma un contenuto che porta persone conta di
   * più: un reel salvato da mille persone che non scrivono a nessuno ha
   * fatto il suo mestiere a metà.
   */
  punteggio: number;
}

export function valutaContenuti(
  contenuti: readonly ContenutoGrezzo[],
): ContenutoValutato[] {
  return contenuti
    .map((c) => {
      const base = c.reach > 0 ? c.reach : c.views;
      const interazioni = c.likes + c.comments + c.saves + c.shares;
      const engagement = rapporto(interazioni, base);
      const leadPerMille = base > 0 ? (c.leadsAttributed / base) * 1000 : null;

      return {
        ...c,
        engagement,
        leadPerMille,
        punteggio: (engagement ?? 0) * 100 + (leadPerMille ?? 0) * 10,
      };
    })
    .sort((a, b) => b.punteggio - a.punteggio);
}

/**
 * Cosa hanno in comune i contenuti che hanno funzionato.
 *
 * Non è un'analisi statistica: è il conteggio degli angoli e dei formati
 * fra i primi della classifica, che è quanto basta per dare al Content
 * Brain un vincolo vero invece di un'ispirazione generica.
 */
export function ricorrenzeVincenti(
  contenuti: readonly ContenutoValutato[],
  quanti = 5,
): { angoli: [string, number][]; formati: [string, number][] } {
  const migliori = contenuti.slice(0, quanti);

  const conta = (valori: (string | null)[]) => {
    const mappa = new Map<string, number>();
    for (const v of valori) {
      if (!v) continue;
      mappa.set(v, (mappa.get(v) ?? 0) + 1);
    }
    return [...mappa.entries()].sort((a, b) => b[1] - a[1]);
  };

  return {
    angoli: conta(migliori.map((c) => c.angle)),
    formati: conta(migliori.map((c) => c.format)),
  };
}
