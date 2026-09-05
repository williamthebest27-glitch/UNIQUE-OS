import type { VoceCatalogo } from "./catalogo.ts";
import type { Intervallo, StatoValore } from "./tipi.ts";

/**
 * Che cosa significa questo numero.
 *
 * È il passaggio da **fatto** a **interpretazione**, e il modulo li
 * tiene separati apposta: il fatto è che la vitamina D è 18 ng/mL, e
 * quello sta scritto sul referto. Che sia bassa è un'interpretazione, e
 * dipende interamente da con che cosa la si confronta.
 *
 * ---
 *
 * **La regola che conta.** L'intervallo del documento ha sempre la
 * precedenza su quello del catalogo. Non è una preferenza: è che
 * l'intervallo stampato sul referto appartiene al laboratorio che ha
 * fatto l'analisi, e dipende dal metodo, dallo strumento e dalla
 * popolazione di riferimento. Due laboratori danno intervalli diversi
 * per lo stesso esame ed entrambi hanno ragione sul proprio.
 *
 * Un intervallo universale applicato a un referto che ne stampa un altro
 * produrrebbe due errori insieme: valori dichiarati fuori norma che il
 * laboratorio considera normali, e — peggio — valori dichiarati normali
 * che il laboratorio segnalava.
 *
 * Per questo `Intervallo` porta sempre `fonte`, e l'interfaccia la
 * mostra: chi legge deve sapere con che metro è stato misurato.
 */

/** Il contesto del paziente, per gli intervalli che ne dipendono. */
export interface ContestoPaziente {
  sesso?: "M" | "F" | null;
  eta?: number | null;
}

/**
 * L'intervallo con cui giudicare un valore, e da dove viene.
 *
 * L'ordine delle fonti è la regola sopra, resa codice: prima il
 * documento, poi il riferimento per sesso, poi quello generale. Se non
 * c'è nessuno dei tre, l'intervallo è `assente` — e lo stato sarà
 * `UNKNOWN`, che è la risposta onesta.
 */
export function scegliIntervallo(
  voce: VoceCatalogo | null,
  dalDocumento: { min: number | null; max: number | null; testo?: string } | null,
  contesto: ContestoPaziente = {},
): Intervallo {
  if (dalDocumento && (dalDocumento.min !== null || dalDocumento.max !== null)) {
    return {
      min: dalDocumento.min,
      max: dalDocumento.max,
      fonte: "documento",
      testo: dalDocumento.testo,
    };
  }

  if (!voce) return { min: null, max: null, fonte: "assente" };

  const sesso = contesto.sesso;
  if (sesso && voce.perSesso) {
    const riferimento = voce.perSesso[sesso];
    // Un intervallo a zero è il modo in cui il catalogo dice «qui non si
    // può dare un riferimento unico»: l'estradiolo nella donna dipende
    // dalla fase del ciclo, e un numero solo direbbe il falso.
    if (riferimento && !(riferimento.min === 0 && riferimento.max === 0)) {
      return { min: riferimento.min, max: riferimento.max, fonte: "catalogo" };
    }
  }

  if (voce.riferimento) {
    return { min: voce.riferimento.min, max: voce.riferimento.max, fonte: "catalogo" };
  }

  // Un riferimento che dipende dal sesso, su un paziente di cui non
  // conosciamo il sesso, non si applica: metà delle volte sarebbe
  // sbagliato, e non si saprebbe quale metà.
  return { min: null, max: null, fonte: "assente" };
}

/**
 * La fascia entro cui un valore è «al limite».
 *
 * Dieci per cento dell'ampiezza dell'intervallo, per lato. Un LDL di 114
 * su un massimo di 116 non è la stessa cosa di uno di 60: è dentro, ma
 * di poco, e chiamarli entrambi NORMAL nasconde l'unica delle due
 * informazioni che porta a fare qualcosa.
 *
 * Su un intervallo aperto da un lato — "< 150" — la fascia si calcola
 * sul solo estremo esistente.
 */
const FRAZIONE_LIMITE = 0.1;

function fasciaLimite(intervallo: Intervallo): number {
  const { min, max } = intervallo;

  if (min !== null && max !== null) return Math.abs(max - min) * FRAZIONE_LIMITE;
  if (max !== null) return Math.abs(max) * FRAZIONE_LIMITE;
  if (min !== null) return Math.abs(min) * FRAZIONE_LIMITE;
  return 0;
}

/**
 * Lo stato di un valore.
 *
 * L'ordine dei controlli è deliberato e non si può invertire:
 *
 *   1. **Critico prima di tutto.** Una soglia critica è un fatto
 *      clinico che vale anche quando il laboratorio non lo segnala: un
 *      potassio a 6,5 è un'emergenza qualunque cosa dica l'intervallo
 *      stampato sul foglio.
 *   2. Fuori dall'intervallo → LOW o HIGH.
 *   3. Dentro, ma a ridosso di un estremo → BORDERLINE.
 *   4. Dentro la fascia che Unique considera ottimale → OPTIMAL.
 *   5. Dentro e basta → NORMAL.
 *
 * Senza intervallo non si dà nessuno stato. `UNKNOWN` non è un
 * fallimento: è ciò che va detto quando non c'è un metro. Un valore
 * dichiarato «normale» sulla base di un riferimento che non esiste
 * sarebbe una rassicurazione inventata.
 */
export function calcolaStato(
  valore: number | null,
  intervallo: Intervallo,
  voce: VoceCatalogo | null,
): StatoValore {
  if (valore === null || !Number.isFinite(valore)) return "UNKNOWN";

  // ── 1. Le soglie critiche ───────────────────────────────────────
  const critico = voce?.critico;
  if (critico) {
    if (critico.sotto !== undefined && valore <= critico.sotto) return "CRITICAL";
    if (critico.sopra !== undefined && valore >= critico.sopra) return "CRITICAL";
  }

  const { min, max } = intervallo;
  if (min === null && max === null) return "UNKNOWN";

  // ── 2. Fuori ────────────────────────────────────────────────────
  if (min !== null && valore < min) return "LOW";
  if (max !== null && valore > max) return "HIGH";

  // ── 3. Al limite ────────────────────────────────────────────────
  const fascia = fasciaLimite(intervallo);
  if (fascia > 0) {
    if (min !== null && valore < min + fascia) return "BORDERLINE";
    if (max !== null && valore > max - fascia) return "BORDERLINE";
  }

  // ── 4. Ottimale ─────────────────────────────────────────────────
  // Solo quando il catalogo dichiara una fascia obiettivo. È una
  // posizione di Unique, non un dato del laboratorio, e vale la pena
  // distinguerla da «normale» perché è ciò che indirizza il percorso.
  if (voce?.ottimale) {
    const [da, a] = voce.ottimale;
    if (valore >= da && valore <= a) return "OPTIMAL";
  }

  // ── 5. Normale ──────────────────────────────────────────────────
  return "NORMAL";
}

/**
 * Se lo stato merita l'occhio di un professionista prima di entrare in
 * cartella.
 *
 * `CRITICAL` sempre. `LOW` e `HIGH` sì: sono la ragione per cui esiste
 * una coda di revisione. `BORDERLINE` no — è dentro l'intervallo, e
 * mandare in coda ogni valore vicino a un estremo riempirebbe la coda
 * fino a renderla inutile, che è il modo in cui le code di revisione
 * smettono di funzionare.
 */
export function statoRichiedeRevisione(stato: StatoValore): boolean {
  return stato === "CRITICAL" || stato === "LOW" || stato === "HIGH";
}

/**
 * Quanto un valore è fuori, in proporzione all'intervallo.
 *
 * Serve a ordinare: fra dieci valori alti, quello che sta due volte
 * sopra il massimo va guardato prima di quello che lo supera del tre per
 * cento. Zero significa dentro l'intervallo.
 */
export function scostamento(valore: number | null, intervallo: Intervallo): number {
  if (valore === null || !Number.isFinite(valore)) return 0;

  const { min, max } = intervallo;
  const ampiezza =
    min !== null && max !== null
      ? Math.abs(max - min)
      : Math.abs(max ?? min ?? 0) || 1;

  if (min !== null && valore < min) return (min - valore) / ampiezza;
  if (max !== null && valore > max) return (valore - max) / ampiezza;
  return 0;
}

/**
 * Come si descrive uno stato a chi lo legge, in una riga.
 *
 * Il testo nomina sempre la fonte dell'intervallo. Senza, «sotto
 * l'intervallo» è un'affermazione senza soggetto — e chi la legge non
 * può sapere se contestarla.
 */
export function descriviStato(
  stato: StatoValore,
  intervallo: Intervallo,
  unita: string | null,
): string {
  const conUnita = (n: number) => `${n}${unita ? ` ${unita}` : ""}`;

  const estremi =
    intervallo.min !== null && intervallo.max !== null
      ? `${conUnita(intervallo.min)}–${conUnita(intervallo.max)}`
      : intervallo.max !== null
        ? `fino a ${conUnita(intervallo.max)}`
        : intervallo.min !== null
          ? `da ${conUnita(intervallo.min)}`
          : null;

  const fonte =
    intervallo.fonte === "documento"
      ? "riferimento del laboratorio"
      : intervallo.fonte === "catalogo"
        ? "riferimento Unique"
        : null;

  const coda = estremi && fonte ? ` (${estremi}, ${fonte})` : "";

  switch (stato) {
    case "CRITICAL":
      return `Oltre la soglia di attenzione clinica${coda}.`;
    case "HIGH":
      return `Sopra l'intervallo${coda}.`;
    case "LOW":
      return `Sotto l'intervallo${coda}.`;
    case "BORDERLINE":
      return `Dentro l'intervallo ma vicino a un estremo${coda}.`;
    case "OPTIMAL":
      return `Nella fascia che consideriamo ottimale${coda}.`;
    case "NORMAL":
      return `Nell'intervallo${coda}.`;
    case "UNKNOWN":
      return "Nessun intervallo di riferimento: il valore è registrato, non giudicato.";
  }
}
