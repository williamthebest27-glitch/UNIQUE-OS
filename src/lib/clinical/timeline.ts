/**
 * Le categorie della timeline clinica.
 *
 * Sono la risposta a «cosa voglio vedere adesso», e non coincidono con
 * le tabelle da cui i fatti arrivano. La distinzione vale la pena
 * scriverla perché è quella che rende utile il filtro:
 *
 *   `kind`     da dove viene la riga. Decide l'icona e il colore del
 *              pallino, e ce n'è uno per tabella sorgente.
 *
 *   `categoria` a quale domanda risponde. Un referto di laboratorio e un
 *              pannello di valori approvati sono due `kind` e la stessa
 *              categoria; una prescrizione in PDF e un passo del piano
 *              di cura vengono da due tabelle lontanissime e sono
 *              entrambi «terapie».
 *
 * Se le due coincidessero, il filtro «terapie» chiederebbe di sapere in
 * quale tabella Unique tiene le prescrizioni — che è una domanda che un
 * medico non deve porsi.
 */

export const CATEGORIE_TIMELINE = [
  "esami",
  "visite",
  "terapie",
  "referti",
  "comunicazioni",
  "documenti",
  "note",
  "punteggio",
  "percorso",
] as const;

export type CategoriaTimeline = (typeof CATEGORIE_TIMELINE)[number];

export const ETICHETTE_CATEGORIA_TIMELINE: Record<CategoriaTimeline, string> = {
  esami: "Esami",
  visite: "Visite",
  terapie: "Terapie",
  referti: "Referti",
  comunicazioni: "Comunicazioni",
  documenti: "Documenti",
  note: "Note",
  punteggio: "Score",
  percorso: "Percorso",
};

/**
 * Cosa comparirà scegliendo una categoria che oggi è vuota.
 *
 * Un filtro che restituisce zero righe senza dire perché è
 * indistinguibile da un filtro rotto. Queste frasi vanno nella riga
 * vuota, e sono l'unico momento in cui qualcuno legge un'istruzione.
 */
export const NOTE_CATEGORIA_TIMELINE: Record<CategoriaTimeline, string> = {
  esami:
    "I parametri approvati, raggruppati per giornata di prelievo. Un pannello è una riga, non ventiquattro.",
  visite: "Gli appuntamenti fissati, confermati e svolti.",
  terapie:
    "Prescrizioni, piani di cura e le azioni assegnate a questa persona.",
  referti: "Referti di laboratorio e imaging, dal più recente.",
  comunicazioni:
    "Le conversazioni con il paziente e, se ne fai parte, i consulti e le comunicazioni interne che lo riguardano.",
  documenti: "Consensi, fatture e tutto il resto della carta.",
  note: "Note cliniche e sintesi delle visite scritte dal care team.",
  punteggio: "Ogni rilevazione del Longevity Score, con la sua sintesi.",
  percorso: "L'inizio e la fine dei percorsi di cura.",
};

export function isCategoriaTimeline(v: string): v is CategoriaTimeline {
  return (CATEGORIE_TIMELINE as readonly string[]).includes(v);
}
