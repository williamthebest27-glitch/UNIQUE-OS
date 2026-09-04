/**
 * Quale informazione è vera oggi.
 *
 * Il database ha già la vista `knowledge_current`, che restituisce la
 * versione attiva e valida alla data corrente. Queste funzioni servono a
 * ciò che la vista non può fare: dire **perché** una versione è quella
 * giusta, accorgersi che una catena di versioni ha un buco o una
 * sovrapposizione, e segnalare le informazioni invecchiate prima che
 * qualcuno le usi credendole aggiornate.
 *
 * Nessun import: gira sotto `node --test` come i motori di calcolo, e per
 * la stessa ragione — sono le regole su cui poggia una risposta data a
 * un paziente, e vanno verificate senza un database di mezzo.
 */

export type KnowledgeStatus = "draft" | "active" | "superseded" | "archived";

export type KnowledgeKind =
  | "procedura"
  | "listino"
  | "servizio"
  | "faq"
  | "professionista"
  | "protocollo"
  | "brand"
  | "marketing"
  | "script"
  | "policy"
  | "contratto"
  | "documentazione";

export interface VersioneDatata {
  version: number;
  status: KnowledgeStatus;
  /** YYYY-MM-DD. */
  validFrom: string;
  /** YYYY-MM-DD, oppure null: vale finché non arriva la prossima. */
  validTo: string | null;
}

/**
 * Ogni quanto un'informazione va riconfermata, per tipo.
 *
 * Un listino che nessuno ha toccato da otto mesi non è necessariamente
 * sbagliato, ma nessuno può giurare che sia giusto — e un sistema che
 * risponde con sicurezza a partire da un'informazione che nessuno
 * garantisce è peggio di un sistema che dice "non lo so".
 */
export const REVISIONE_GIORNI: Record<KnowledgeKind, number> = {
  listino: 180,
  contratto: 180,
  policy: 365,
  procedura: 270,
  protocollo: 270,
  servizio: 365,
  faq: 270,
  professionista: 365,
  brand: 545,
  marketing: 365,
  script: 365,
  documentazione: 545,
};

function giorniFra(da: string, a: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** La versione in vigore alla data indicata, o null se non ce n'è una. */
export function versioneValida<T extends VersioneDatata>(
  versioni: readonly T[],
  data: string,
): T | null {
  const candidate = versioni.filter(
    (v) =>
      v.status === "active" &&
      v.validFrom <= data &&
      (v.validTo === null || v.validTo >= data),
  );

  if (candidate.length === 0) return null;

  // Se due si sovrappongono vince la più recente: rispondere con la più
  // nuova è l'errore meno grave fra quelli possibili.
  return candidate.reduce((migliore, v) =>
    v.validFrom > migliore.validFrom ||
    (v.validFrom === migliore.validFrom && v.version > migliore.version)
      ? v
      : migliore,
  );
}

/** La versione che era in vigore a una data passata. Serve per "quanto costava a giugno". */
export function versioneAllaData<T extends VersioneDatata>(
  versioni: readonly T[],
  data: string,
): T | null {
  const storiche = versioni.filter(
    (v) =>
      (v.status === "active" || v.status === "superseded") &&
      v.validFrom <= data &&
      (v.validTo === null || v.validTo >= data),
  );

  if (storiche.length === 0) return null;

  return storiche.reduce((migliore, v) =>
    v.validFrom > migliore.validFrom ? v : migliore,
  );
}

export interface AnomaliaCatena {
  tipo: "buco" | "sovrapposizione";
  da: string;
  a: string;
  versioni: number[];
}

/**
 * Buchi e sovrapposizioni nella storia di un'informazione.
 *
 * Un buco significa che a una certa data il sistema non sapeva rispondere;
 * una sovrapposizione, che sapeva rispondere in due modi. Entrambe sono
 * difetti della catena, e si vedono solo guardandola tutta insieme.
 */
export function anomalieCatena(versioni: readonly VersioneDatata[]): AnomaliaCatena[] {
  const ordinate = versioni
    .filter((v) => v.status === "active" || v.status === "superseded")
    .slice()
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.version - b.version);

  const anomalie: AnomaliaCatena[] = [];

  for (let i = 0; i < ordinate.length - 1; i += 1) {
    const corrente = ordinate[i];
    const successiva = ordinate[i + 1];

    if (corrente.validTo === null) {
      // Una versione aperta seguita da un'altra: si sovrappongono da
      // quando comincia la seconda.
      anomalie.push({
        tipo: "sovrapposizione",
        da: successiva.validFrom,
        a: successiva.validTo ?? "—",
        versioni: [corrente.version, successiva.version],
      });
      continue;
    }

    const distanza = giorniFra(corrente.validTo, successiva.validFrom);
    if (distanza > 1) {
      anomalie.push({
        tipo: "buco",
        da: corrente.validTo,
        a: successiva.validFrom,
        versioni: [corrente.version, successiva.version],
      });
    } else if (distanza < 1) {
      anomalie.push({
        tipo: "sovrapposizione",
        da: successiva.validFrom,
        a: corrente.validTo,
        versioni: [corrente.version, successiva.version],
      });
    }
  }

  return anomalie;
}

/** Da quanti giorni non si tocca un'informazione. */
export function etaGiorni(versione: VersioneDatata, oggi: string): number {
  return giorniFra(versione.validFrom, oggi);
}

/** Vero se l'informazione ha superato il suo intervallo di riconferma. */
export function daRiconfermare(
  versione: VersioneDatata,
  kind: KnowledgeKind,
  oggi: string,
): boolean {
  return etaGiorni(versione, oggi) > REVISIONE_GIORNI[kind];
}

/**
 * Come si presenta un'informazione a chi la legge.
 *
 * Restituisce la frase che accompagna il dato: la data da cui vale, e se
 * è il caso di riconfermarla. Una risposta senza questa riga è una
 * risposta che chiede di essere creduta sulla parola.
 */
export function provenienza(
  versione: VersioneDatata,
  kind: KnowledgeKind,
  oggi: string,
): string {
  const eta = etaGiorni(versione, oggi);
  const base = `versione ${versione.version}, in vigore dal ${versione.validFrom}`;

  if (daRiconfermare(versione, kind, oggi)) {
    return `${base} — non riconfermata da ${eta} giorni`;
  }
  return base;
}
