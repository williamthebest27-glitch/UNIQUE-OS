/**
 * Il vocabolario della terapia.
 *
 * Vive fuori dalle azioni e dalle letture perché lo usano in tre: le
 * pagine server, i moduli client e le funzioni di scrittura. Un modulo
 * `"use server"` può esportare solo funzioni async, quindi ogni costante
 * condivisa deve stare altrove — la stessa ragione per cui esistono
 * `clinical/state.ts` e `comunicazioni/tipi.ts`.
 */

/* ── Via di somministrazione ──────────────────────────────────────── */

export const VIE = [
  "oral",
  "sublingual",
  "topical",
  "subcutaneous",
  "intramuscular",
  "intravenous",
  "inhalation",
  "rectal",
  "ophthalmic",
  "other",
] as const;

export type Via = (typeof VIE)[number];

export const ETICHETTE_VIA: Record<Via, string> = {
  oral: "Orale",
  sublingual: "Sublinguale",
  topical: "Topica",
  subcutaneous: "Sottocutanea",
  intramuscular: "Intramuscolare",
  intravenous: "Endovenosa",
  inhalation: "Inalatoria",
  rectal: "Rettale",
  ophthalmic: "Oftalmica",
  other: "Altra",
};

/** La sigla che si scrive accanto alla dose, dove lo spazio è poco. */
export const SIGLE_VIA: Record<Via, string> = {
  oral: "PO",
  sublingual: "SL",
  topical: "TOP",
  subcutaneous: "SC",
  intramuscular: "IM",
  intravenous: "EV",
  inhalation: "INAL",
  rectal: "RET",
  ophthalmic: "OFT",
  other: "—",
};

export function isVia(v: string): v is Via {
  return (VIE as readonly string[]).includes(v);
}

/* ── Stato della prescrizione ─────────────────────────────────────── */

export const STATI_TERAPIA = ["active", "suspended", "completed", "cancelled"] as const;
export type StatoTerapia = (typeof STATI_TERAPIA)[number];

export const ETICHETTE_STATO_TERAPIA: Record<StatoTerapia, string> = {
  active: "In corso",
  suspended: "Sospesa",
  completed: "Conclusa",
  cancelled: "Annullata",
};

export function tonoStatoTerapia(
  s: StatoTerapia,
): "neutral" | "brand" | "gold" | "attention" | "positive" {
  switch (s) {
    case "active":
      return "brand";
    case "suspended":
      return "attention";
    case "completed":
      return "positive";
    case "cancelled":
      return "neutral";
  }
}

export function isStatoTerapia(v: string): v is StatoTerapia {
  return (STATI_TERAPIA as readonly string[]).includes(v);
}

/* ── Stato della singola dose ─────────────────────────────────────── */

export const STATI_DOSE = [
  "due",
  "given",
  "refused",
  "skipped",
  "not_needed",
] as const;
export type StatoDose = (typeof STATI_DOSE)[number];

export const ETICHETTE_DOSE: Record<StatoDose, string> = {
  due: "Da somministrare",
  given: "Somministrata",
  refused: "Rifiutata",
  skipped: "Saltata",
  not_needed: "Non necessaria",
};

/**
 * Il verbo, per il pulsante.
 *
 * «Somministrata» è come si chiama lo stato; «Somministra» è cosa fa il
 * pulsante. Usare lo stesso testo per entrambi costringe a leggere due
 * volte per capire se una riga dice cosa è successo o cosa succederà.
 */
export const VERBI_DOSE: Record<Exclude<StatoDose, "due">, string> = {
  given: "Somministra",
  refused: "Ha rifiutato",
  skipped: "Salta",
  not_needed: "Non serviva",
};

/**
 * Quali stati chiedono un motivo.
 *
 * Lo impone anche il database, con un trigger. Qui serve a chiedere il
 * campo **prima** del clic invece di far rimbalzare un errore dopo — la
 * regola resta una sola, e questa ne è la copia per l'interfaccia.
 */
export function richiedeMotivo(s: StatoDose): boolean {
  return s === "refused" || s === "skipped";
}

export function tonoDose(
  s: StatoDose,
): "neutral" | "brand" | "gold" | "attention" | "positive" {
  switch (s) {
    case "given":
      return "positive";
    case "refused":
      return "brand";
    case "skipped":
      return "attention";
    case "not_needed":
      return "neutral";
    case "due":
      return "neutral";
  }
}

export function isStatoDose(v: string): v is StatoDose {
  return (STATI_DOSE as readonly string[]).includes(v);
}

/* ── Orari ────────────────────────────────────────────────────────── */

/**
 * Gli schemi che coprono quasi tutte le prescrizioni.
 *
 * Non sono un vincolo: il campo resta libero e chi ha uno schema strano
 * lo scrive. Sono lì perché «tre volte al giorno» digitato a mano
 * diventa `8,14,20` in una cartella e `08:00 14:00 20:00` in un'altra, e
 * due formati per la stessa cosa sono due modi di ordinare male un
 * elenco.
 */
export const SCHEMI_ORARI: { etichetta: string; orari: string[] }[] = [
  { etichetta: "Una volta al giorno — mattino", orari: ["08:00"] },
  { etichetta: "Una volta al giorno — sera", orari: ["20:00"] },
  { etichetta: "Due volte al giorno", orari: ["08:00", "20:00"] },
  { etichetta: "Tre volte al giorno", orari: ["08:00", "14:00", "20:00"] },
  { etichetta: "Quattro volte al giorno", orari: ["06:00", "12:00", "18:00", "00:00"] },
  { etichetta: "Al bisogno", orari: [] },
];

/** Da `08:00:00` a `08:00`: i secondi non li legge nessuno. */
export function oraCorta(t: string): string {
  return t.slice(0, 5);
}

/**
 * Gli orari scritti a mano, normalizzati.
 *
 * Accetta `8`, `8:00`, `08.00`, separati da virgole o spazi, e restituisce
 * `HH:MM` ordinati e senza doppioni. Quello che non è un'ora lo scarta in
 * silenzio: un campo di testo che rifiuta tutto perché c'è una virgola di
 * troppo è un campo che si smette di usare.
 */
export function normalizzaOrari(testo: string): string[] {
  const trovati = new Set<string>();

  for (const pezzo of testo.split(/[,;\s]+/)) {
    const m = pezzo.trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
    if (!m) continue;

    const ore = Number(m[1]);
    const minuti = m[2] === undefined ? 0 : Number(m[2]);
    if (ore > 23 || minuti > 59) continue;

    trovati.add(
      `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`,
    );
  }

  return [...trovati].sort();
}
