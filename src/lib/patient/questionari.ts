/**
 * I questionari.
 *
 * Ci sono cose che nessun esame del sangue misura: come dormi, quanto ti
 * senti sotto pressione, se le persone attorno ti sostengono. Il
 * questionario è il modo in cui entrano nel percorso.
 *
 * Le domande sono un documento, non uno schema: cambiano nel tempo, e chi
 * ha risposto ieri porta con sé le domande di ieri. Per questo il
 * `patient_assessment` si tiene una copia delle domande, e questo file
 * sa leggerle senza fidarsi della loro forma — un campo mancante fa
 * scartare la domanda, non esplodere la pagina.
 */

export type TipoDomanda = "scale" | "single" | "multi" | "number" | "text";

export interface Domanda {
  id: string;
  testo: string;
  tipo: TipoDomanda;
  obbligatoria: boolean;
  opzioni: string[];
  min: number | null;
  max: number | null;
  unita: string | null;
  /** Estremi della scala, come li legge una persona: "Mai" … "Sempre". */
  estremi: [string, string] | null;
}

export type Risposta = string | number | string[] | null;

const TIPI: TipoDomanda[] = ["scale", "single", "multi", "number", "text"];

/**
 * Da JSON a domande.
 *
 * Il JSON arriva dal database e potrebbe essere qualunque cosa: qui si
 * scarta ciò che non è una domanda utilizzabile invece di renderizzarlo a
 * metà. Una domanda senza id o senza testo non è una domanda.
 */
export function leggiDomande(grezzo: unknown): Domanda[] {
  if (!Array.isArray(grezzo)) return [];

  return grezzo.flatMap((voce): Domanda[] => {
    if (typeof voce !== "object" || voce === null) return [];
    const q = voce as Record<string, unknown>;

    const id = typeof q.id === "string" ? q.id : null;
    const testo = typeof q.text === "string" ? q.text : null;
    if (!id || !testo) return [];

    const tipo = TIPI.includes(q.type as TipoDomanda) ? (q.type as TipoDomanda) : "text";
    const opzioni = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string") : [];

    // Una domanda a scelta senza opzioni non si può presentare.
    if ((tipo === "single" || tipo === "multi") && opzioni.length === 0) return [];

    const etichette = Array.isArray(q.labels)
      ? q.labels.filter((l): l is string => typeof l === "string")
      : [];

    return [
      {
        id,
        testo,
        tipo,
        obbligatoria: q.required === undefined ? true : q.required === true,
        opzioni,
        min: typeof q.min === "number" ? q.min : null,
        max: typeof q.max === "number" ? q.max : null,
        unita: typeof q.unit === "string" ? q.unit : null,
        estremi: etichette.length === 2 ? [etichette[0], etichette[1]] : null,
      },
    ];
  });
}

/** Una risposta c'è davvero? Stringa vuota e array vuoto non contano. */
export function rispostaPresente(valore: Risposta | undefined): boolean {
  if (valore === null || valore === undefined) return false;
  if (typeof valore === "string") return valore.trim().length > 0;
  if (Array.isArray(valore)) return valore.length > 0;
  return Number.isFinite(valore);
}

export interface EsitoValidazione {
  ok: boolean;
  /** Errori per id di domanda, da mostrare accanto al campo. */
  errori: Record<string, string>;
  mancanti: string[];
}

/**
 * Le risposte reggono?
 *
 * Vale come cortesia verso chi compila — l'errore compare accanto al
 * campo giusto, non in cima. Il conteggio che conta lo rifà il database
 * dentro `save_assessment`: un modulo che dichiara "completo" con metà
 * risposte è un modulo, non un fatto.
 */
export function valida(
  domande: readonly Domanda[],
  risposte: Readonly<Record<string, Risposta>>,
  perConsegnare: boolean,
): EsitoValidazione {
  const errori: Record<string, string> = {};
  const mancanti: string[] = [];

  for (const d of domande) {
    const valore = risposte[d.id];
    const presente = rispostaPresente(valore);

    if (!presente) {
      if (d.obbligatoria) mancanti.push(d.id);
      continue;
    }

    if (d.tipo === "number" || d.tipo === "scale") {
      const numero = typeof valore === "number" ? valore : Number(String(valore).replace(",", "."));
      if (!Number.isFinite(numero)) {
        errori[d.id] = "Serve un numero.";
      } else if (d.min !== null && numero < d.min) {
        errori[d.id] = `Non può essere meno di ${d.min}${d.unita ? ` ${d.unita}` : ""}.`;
      } else if (d.max !== null && numero > d.max) {
        errori[d.id] = `Non può essere più di ${d.max}${d.unita ? ` ${d.unita}` : ""}.`;
      }
    }

    if (d.tipo === "single" && typeof valore === "string" && !d.opzioni.includes(valore)) {
      errori[d.id] = "Scegli una delle risposte proposte.";
    }

    if (d.tipo === "multi" && Array.isArray(valore)) {
      const fuori = valore.filter((v) => !d.opzioni.includes(v));
      if (fuori.length > 0) errori[d.id] = "Una delle scelte non è fra quelle proposte.";
    }
  }

  if (perConsegnare) {
    for (const id of mancanti) errori[id] = "Questa risposta serve per consegnare.";
  }

  return { ok: Object.keys(errori).length === 0, errori, mancanti };
}

/** Quanto è avanti chi compila: sulle obbligatorie, che sono quelle che bloccano. */
export function completamento(
  domande: readonly Domanda[],
  risposte: Readonly<Record<string, Risposta>>,
): number {
  const obbligatorie = domande.filter((d) => d.obbligatoria);
  if (obbligatorie.length === 0) return 100;
  const fatte = obbligatorie.filter((d) => rispostaPresente(risposte[d.id])).length;
  return Math.round((fatte / obbligatorie.length) * 100);
}

/**
 * Le risposte come le manda un modulo HTML: tutto stringhe.
 *
 * I numeri tornano numeri e le scelte multiple tornano array, così quello
 * che finisce nel database ha la forma della domanda e non quella del
 * browser.
 */
export function daFormData(
  domande: readonly Domanda[],
  leggi: (nome: string) => string[] | undefined,
): Record<string, Risposta> {
  const risposte: Record<string, Risposta> = {};

  for (const d of domande) {
    const valori = leggi(`q_${d.id}`) ?? [];
    if (valori.length === 0) continue;

    if (d.tipo === "multi") {
      const scelte = valori.filter((v) => v.trim().length > 0);
      if (scelte.length > 0) risposte[d.id] = scelte;
      continue;
    }

    const grezzo = valori[0]?.trim() ?? "";
    if (grezzo.length === 0) continue;

    if (d.tipo === "number" || d.tipo === "scale") {
      const numero = Number(grezzo.replace(",", "."));
      risposte[d.id] = Number.isFinite(numero) ? numero : grezzo;
    } else {
      risposte[d.id] = grezzo;
    }
  }

  return risposte;
}
