import { formatEuro, formatPercent } from "../format.ts";
import {
  scomponiVariazione,
  type Interrogazione,
  type Misura,
  type RigaConfronto,
} from "./interrogazione.ts";

/**
 * Da un'interrogazione risolta a una risposta in italiano.
 *
 * Il risolutore produce righe e totali; qui diventano frasi. Le stesse
 * regole della narrativa: prima il numero, poi il senso; ciò che manca si
 * dichiara; e nessuna cifra che il risolutore non abbia prodotto.
 */

export type Unita = "euro" | "numero" | "percento";

export interface RigaRisultato {
  etichetta: string;
  valore: number;
  /** Un dettaglio accanto, come "12 visite". */
  dettaglio?: string;
}

export interface Risultato {
  misura: Misura;
  periodo: string;
  unita: Unita;
  totale: number | null;
  righe: RigaRisultato[];
  /** Lo stesso calcolo sul periodo precedente, quando serve a spiegare. */
  precedente?: { totale: number | null; righe: RigaRisultato[] };
  /** I filtri che è stato possibile applicare, in italiano. */
  filtriApplicati: string[];
  /** Ciò che era stato chiesto e non si è potuto fare, e perché. */
  limiti: string[];
}

export const NOMI_MISURA: Record<Misura, string> = {
  fatturato: "fatturato",
  margine: "margine",
  visite: "visite",
  pazienti: "pazienti",
  lead: "lead",
  membership: "membership",
  crediti: "crediti utilizzati",
  spesa: "spesa pubblicitaria",
  compensi: "compensi",
  conversione: "conversione",
  no_show: "mancate presentazioni",
  documenti: "documenti",
  task: "task",
};

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function nomeMese(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return `${MESI[mese - 1]} ${anno}`;
}

export function formatta(valore: number, unita: Unita): string {
  if (unita === "euro") return formatEuro(valore);
  if (unita === "percento") return formatPercent(valore);
  return valore.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function articolo(misura: Misura): string {
  return ["conversione", "spesa", "membership"].includes(misura) ? "la" : "il";
}

const NOMI_DIMENSIONE: Record<string, string> = {
  servizio: "servizio",
  professionista: "professionista",
  disciplina: "disciplina",
  canale: "canale",
  campagna: "campagna",
  sede: "sede",
  paziente: "paziente",
};

/**
 * La risposta.
 *
 * Quattro forme, scelte da cosa è stato chiesto: un totale, una
 * classifica, un elenco per dimensione, una spiegazione. Il periodo si
 * dice sempre; i filtri applicati si ripetono, così chi legge sa che il
 * numero è già quello di Rossi e non di tutti.
 */
export function componiRisultato(q: Interrogazione, r: Risultato): { testo: string; fonti: string[] } {
  const nome = NOMI_MISURA[q.misura];
  const quando = nomeMese(r.periodo);
  const filtri = r.filtriApplicati.length > 0 ? ` (${r.filtriApplicati.join(", ")})` : "";
  const righe: string[] = [];

  /* ── Perché ─────────────────────────────────────────────────── */
  if (q.spiegazione && r.precedente) {
    const confronto: RigaConfronto[] = r.righe.map((riga) => ({
      chiave: riga.etichetta,
      etichetta: riga.etichetta,
      attuale: riga.valore,
      precedente: r.precedente?.righe.find((p) => p.etichetta === riga.etichetta)?.valore ?? 0,
    }));

    // Chi c'era prima e ora non c'è più conta come un calo intero.
    for (const p of r.precedente.righe) {
      if (!confronto.some((c) => c.etichetta === p.etichetta)) {
        confronto.push({ chiave: p.etichetta, etichetta: p.etichetta, attuale: 0, precedente: p.valore });
      }
    }

    const { totale, contributi } = scomponiVariazione(confronto);

    if (totale === 0 || contributi.length === 0) {
      return {
        testo: `${nome[0].toUpperCase()}${nome.slice(1)} invariat${q.misura === "conversione" ? "a" : "o"} fra ${nomeMese(r.precedente ? meseIndietro(r.periodo) : r.periodo)} e ${quando}: non c'è una variazione da spiegare.`,
        fonti: [`Confronto ${nomeMese(meseIndietro(r.periodo))} → ${quando}`],
      };
    }

    const verso = totale > 0 ? "salit" : "sces";
    righe.push(
      `${articolo(q.misura) === "la" ? "La" : "Il"} ${nome}${filtri} è ${verso}${q.misura === "conversione" ? "a" : "o"} di ${formatta(Math.abs(totale), r.unita)} fra ${nomeMese(meseIndietro(r.periodo))} e ${quando}.`,
    );

    righe.push(
      "Dove è successo:\n" +
        contributi
          .map(
            (c) =>
              `· ${c.etichetta}: ${c.delta > 0 ? "+" : "−"}${formatta(Math.abs(c.delta), r.unita)}` +
              `${c.quota > 0 ? ` — ${formatPercent(Math.min(c.quota, 1))} della variazione` : " — in controtendenza"}`,
          )
          .join("\n"),
    );

    righe.push(
      "Questa è la scomposizione aritmetica: dice dove la variazione è avvenuta, non perché le persone si sono comportate così. Per quello servono le visite mancate, le disdette e le campagne di quel periodo.",
    );

    return { testo: righe.join("\n\n"), fonti: [`Confronto ${nomeMese(meseIndietro(r.periodo))} → ${quando}`] };
  }

  /* ── Classifica o elenco ────────────────────────────────────── */
  if (q.raggruppa && r.righe.length > 0) {
    const ordinate = [...r.righe].sort((a, b) =>
      q.ordina === "basso" ? a.valore - b.valore : b.valore - a.valore,
    );
    const quante = q.limite ?? (q.ordina ? 1 : Math.min(ordinate.length, 8));
    const scelte = ordinate.slice(0, quante);

    if (q.ordina && quante === 1) {
      const prima = scelte[0];
      righe.push(
        `${NOMI_DIMENSIONE[q.raggruppa][0].toUpperCase()}${NOMI_DIMENSIONE[q.raggruppa].slice(1)} con ${articolo(q.misura)} ${nome} più ${q.ordina === "alto" ? "alt" : "bass"}${q.misura === "conversione" ? "a" : "o"} ${quando}${filtri}: **${prima.etichetta}**, ${formatta(prima.valore, r.unita)}${prima.dettaglio ? ` (${prima.dettaglio})` : ""}.`,
      );
      if (ordinate.length > 1) {
        righe.push(
          `Seguono ${ordinate
            .slice(1, 4)
            .map((x) => `${x.etichetta} (${formatta(x.valore, r.unita)})`)
            .join(", ")}.`,
        );
      }
    } else {
      righe.push(
        `${nome[0].toUpperCase()}${nome.slice(1)} per ${NOMI_DIMENSIONE[q.raggruppa]} ${quando}${filtri}` +
          `${r.totale !== null ? `, totale ${formatta(r.totale, r.unita)}` : ""}:\n` +
          scelte
            .map(
              (x) =>
                `· ${x.etichetta}: ${formatta(x.valore, r.unita)}${x.dettaglio ? ` (${x.dettaglio})` : ""}`,
            )
            .join("\n"),
      );
      if (ordinate.length > scelte.length) {
        righe.push(`E altri ${ordinate.length - scelte.length}.`);
      }
    }
  } else if (q.raggruppa && r.righe.length === 0) {
    righe.push(`Nessun dato per ${nome} per ${NOMI_DIMENSIONE[q.raggruppa]} ${quando}${filtri}.`);
  } else if (r.totale !== null) {
    /* ── Un totale ────────────────────────────────────────────── */
    righe.push(
      `${nome[0].toUpperCase()}${nome.slice(1)} ${quando}${filtri}: ${formatta(r.totale, r.unita)}.`,
    );
    if (r.precedente && r.precedente.totale !== null && r.precedente.totale !== 0) {
      const delta = (r.totale - r.precedente.totale) / r.precedente.totale;
      righe.push(
        Math.abs(delta) < 0.05
          ? "In linea con il mese precedente."
          : `${delta > 0 ? "+" : "−"}${formatPercent(Math.abs(delta))} rispetto a ${nomeMese(meseIndietro(r.periodo))} (${formatta(r.precedente.totale, r.unita)}).`,
      );
    }
  } else {
    righe.push(`Non ho un valore di ${nome} per ${quando}${filtri}.`);
  }

  if (r.limiti.length > 0) righe.push(r.limiti.join(" "));

  return { testo: righe.join("\n\n"), fonti: [`Dati ${quando}`] };
}

function meseIndietro(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return mese === 1 ? `${anno - 1}-12` : `${anno}-${String(mese - 1).padStart(2, "0")}`;
}
