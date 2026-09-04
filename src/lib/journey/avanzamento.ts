import {
  JOURNEY_STAGES,
  STAGE_LABELS,
  type JourneyInput,
  type JourneyStage,
} from "./stages.ts";

/**
 * Il percorso disegnato, e cosa serve per avanzare.
 *
 * `computeJourneyStage` dice **dove** si è; questo file dice **come si
 * è arrivati** e **cosa manca per il passo dopo**. Sono domande diverse
 * e serve tenerle separate: la prima ha una risposta sola e la seconda
 * dipende da chi guarda — un medico vuole sapere che manca lo Score, la
 * reception che manca la firma sulla membership.
 *
 * La linea principale non contiene «inattivo» né «perso». Non sono
 * tappe: sono uscite. Metterle in fila con le altre suggerirebbe che
 * dopo la retention si diventa inattivi, e la freccia di un diagramma
 * insegna più di una didascalia.
 */

/** La linea principale, nell'ordine in cui si percorre. */
export const LINEA_PRINCIPALE: JourneyStage[] = [
  "lead",
  "first_visit_booked",
  "score_done",
  "plan_proposed",
  "membership_proposed",
  "membership_active",
  "program_active",
  "reassessment_due",
  "retention",
];

/** Gli stati che stanno fuori dalla linea: si esce, non si avanza. */
export const FUORI_LINEA: JourneyStage[] = ["inactive", "lost"];

export type StatoPasso = "fatta" | "corrente" | "futura";

export interface PassoPercorso {
  stage: JourneyStage;
  label: string;
  stato: StatoPasso;
}

/**
 * La mappa, con il passo corrente acceso.
 *
 * Quando la fase è fuori linea nessun passo risulta corrente: è la
 * verità: un paziente perso non è «a metà del percorso», è fuori. Una
 * mappa che lo mostrasse fermo alla terza tappa direbbe che sta ancora
 * arrivando.
 */
export function mappaPercorso(corrente: JourneyStage): PassoPercorso[] {
  const indice = LINEA_PRINCIPALE.indexOf(corrente);

  return LINEA_PRINCIPALE.map((stage, i) => ({
    stage,
    label: STAGE_LABELS[stage],
    stato:
      indice === -1
        ? "futura"
        : i < indice
          ? "fatta"
          : i === indice
            ? "corrente"
            : "futura",
  }));
}

/** Il passo successivo sulla linea, o null se si è in fondo o fuori. */
export function prossimaFase(corrente: JourneyStage): JourneyStage | null {
  const indice = LINEA_PRINCIPALE.indexOf(corrente);
  if (indice === -1) return null;
  return LINEA_PRINCIPALE[indice + 1] ?? null;
}

/** Il passo precedente sulla linea, o null se si è all'inizio o fuori. */
export function fasePrecedente(corrente: JourneyStage): JourneyStage | null {
  const indice = LINEA_PRINCIPALE.indexOf(corrente);
  if (indice <= 0) return null;
  return LINEA_PRINCIPALE[indice - 1];
}

export interface Condizione {
  /** Vero se il fatto c'è già. */
  fatto: boolean;
  testo: string;
  /** Cosa fare quando manca. Null quando non tocca a noi. */
  azione: string | null;
}

export interface Avanzamento {
  corrente: JourneyStage;
  precedente: JourneyStage | null;
  prossima: JourneyStage | null;
  /** Vero quando la fase è un'uscita e non una tappa. */
  fuoriLinea: boolean;
  condizioni: Condizione[];
}

/**
 * Cosa manca per il passo dopo.
 *
 * Le condizioni sono i **fatti** che `computeJourneyStage` guarda per
 * decidere, riscritti al positivo. Non c'è una seconda tabella di regole
 * da tenere allineata: se domani cambia la definizione di una fase,
 * cambia in `stages.ts` e questa funzione racconta la nuova.
 */
export function avanzamento(input: JourneyInput, corrente: JourneyStage): Avanzamento {
  const fuoriLinea = FUORI_LINEA.includes(corrente);
  const prossima = prossimaFase(corrente);

  const condizioni: Condizione[] = [];

  if (fuoriLinea) {
    condizioni.push({
      fatto: false,
      testo:
        corrente === "lost"
          ? "Il lead è segnato come perso: rientra solo riaprendolo nel CRM."
          : "Nessuna attività da oltre sei mesi: il percorso riparte da un contatto.",
      azione: "Contattare il paziente",
    });
    return { corrente, precedente: null, prossima: null, fuoriLinea, condizioni };
  }

  switch (prossima) {
    case "first_visit_booked":
      condizioni.push({
        fatto: input.hasBookedFirstVisit,
        testo: "Prima visita prenotata.",
        azione: "Fissare la prima visita",
      });
      break;

    case "score_done":
      condizioni.push({
        fatto: input.hasScore,
        testo: "Longevity Score effettuato.",
        azione: "Raccogliere le misure e calcolare il punteggio",
      });
      break;

    case "plan_proposed":
      condizioni.push({
        fatto: input.hasScore,
        testo: "Longevity Score effettuato.",
        azione: "Calcolare il punteggio",
      });
      condizioni.push({
        fatto: input.hasPlan,
        testo: "Piano consigliato.",
        azione: "Proporre un percorso dalla sezione Piano",
      });
      break;

    case "membership_proposed":
      condizioni.push({
        fatto: input.membershipProposedAt !== null,
        testo: "Membership proposta.",
        azione: "Preparare la proposta di membership",
      });
      break;

    case "membership_active":
      condizioni.push({
        fatto: input.membershipActive,
        testo: "Membership attiva.",
        azione: "Attivare la membership dal banco",
      });
      break;

    case "program_active":
      condizioni.push({
        fatto: input.membershipActive,
        testo: "Membership attiva.",
        azione: "Attivare la membership",
      });
      condizioni.push({
        fatto: input.programActive,
        testo: "Percorso avviato.",
        azione: "Avviare il percorso dalla sezione Piano",
      });
      break;

    case "reassessment_due":
      condizioni.push({
        fatto: false,
        testo: "Il reassessment scatta da solo quando il punteggio invecchia.",
        azione: null,
      });
      break;

    case "retention":
      condizioni.push({
        fatto: input.lastScoreOn !== null,
        testo: "Punteggio aggiornato.",
        azione: "Ripetere il Longevity Score",
      });
      break;

    default:
      condizioni.push({
        fatto: true,
        testo: "Il percorso è al suo stadio più avanzato.",
        azione: null,
      });
  }

  return {
    corrente,
    precedente: fasePrecedente(corrente),
    prossima,
    fuoriLinea,
    condizioni,
  };
}

/** Tutte le fasi esistono nella mappa o fra le uscite: nessuna si perde. */
export function fasiCoperte(): boolean {
  return JOURNEY_STAGES.every(
    (s) => LINEA_PRINCIPALE.includes(s) || FUORI_LINEA.includes(s),
  );
}
