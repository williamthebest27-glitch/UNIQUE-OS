import type { Discipline } from "@/lib/professionals/disciplines";

/**
 * Il profilo operativo di chi apre l'area clinica.
 *
 * Non è un ruolo in più. I ruoli di Unique sono sei e stanno nel
 * database — `app_role` decide cosa si può leggere, e non si tocca. Il
 * profilo decide **cosa si vede per primo**, che è un'altra domanda: due
 * persone con lo stesso ruolo `professional` e gli stessi permessi
 * aprono la giornata su due lavori diversi, e mostrare a entrambe la
 * stessa schermata significa che almeno una deve scorrere per trovare la
 * propria.
 *
 * Da qui la regola che governa questo file: **il profilo cambia la
 * composizione, mai i permessi.** Se avesse anche solo un effetto sui
 * dati, sarebbe un controllo di accesso scritto nel browser — e i
 * controlli di accesso stanno nella Row Level Security, dove non si
 * possono aggirare cambiando un parametro nell'indirizzo.
 *
 * ---
 *
 * Un medico che chiedesse «dove sono i ricoveri» non troverebbe niente,
 * ed è corretto: Unique è una clinica ambulatoriale di longevità, non un
 * ospedale per acuti. Non ci sono reparti di degenza, non ci sono
 * campioni da tracciare in provetta e non c'è un'accettazione con i
 * codici colore. Inventare quelle schermate su tabelle che non esistono
 * avrebbe prodotto un mockup, cioè la cosa peggiore in un sistema
 * clinico: un posto dove si va a cercare un dato che non c'è mai stato.
 */

export const PROFILI = ["medico", "infermiere", "diagnostica", "clinico"] as const;
export type ProfiloOperativo = (typeof PROFILI)[number];

export const ETICHETTE_PROFILO: Record<ProfiloOperativo, string> = {
  medico: "Medico",
  infermiere: "Infermieristica",
  diagnostica: "Diagnostica",
  clinico: "Area clinica",
};

/**
 * La domanda a cui la schermata risponde, scritta in pagina.
 *
 * Una dashboard che non dice a cosa serve viene letta come «tutto quello
 * che il sistema sa», e allora ogni assenza sembra un guasto. Dicendolo,
 * l'assenza diventa una scelta.
 */
export const DOMANDA_PROFILO: Record<ProfiloOperativo, string> = {
  medico:
    "Cosa sta succedendo ai tuoi pazienti e cosa devi decidere adesso.",
  infermiere:
    "Chi entra oggi, cosa c'è da somministrare e da registrare, e cosa passa al turno dopo.",
  diagnostica:
    "Quali esami sono stati richiesti, quali risultati aspettano una validazione e quali referti nessuno ha ancora letto.",
  clinico: "Il lavoro della giornata sui pazienti che segui.",
};

/**
 * Da disciplina e reparti al profilo.
 *
 * L'ordine dei controlli non è casuale: **il reparto vince sulla
 * disciplina.** Un medico assegnato alla Diagnostica passa la giornata a
 * refertare, non in ambulatorio, e la sua schermata deve dirlo. La
 * disciplina resta il ripiego per chi in nessun reparto ci sta — che
 * oggi è la maggioranza, e domani non lo sarà.
 *
 * `clinico` è il profilo generico e non un errore: nutrizionisti,
 * osteopati, psicologi e preparatori hanno una giornata fatta di visite
 * e di piani, ed è esattamente ciò che il command center clinico mostra
 * già. Dare a ciascuno una dashboard su misura senza avere dati diversi
 * da mostrargli avrebbe prodotto quattro copie della stessa schermata
 * con quattro titoli.
 */
export function profiloDi({
  discipline,
  reparti,
}: {
  discipline: Discipline | null;
  /** Gli slug dei reparti di cui la persona fa parte. */
  reparti: string[];
}): ProfiloOperativo {
  if (reparti.includes("diagnostica")) return "diagnostica";
  if (reparti.includes("infermieristica")) return "infermiere";
  if (reparti.includes("medicina")) return "medico";

  if (discipline === "nurse") return "infermiere";
  if (discipline === "physician") return "medico";

  return "clinico";
}

/**
 * Cosa la schermata di questo profilo mette in cima.
 *
 * Un elenco e non una serie di `if` sparsi in pagina: l'ordine dei
 * blocchi *è* la decisione di prodotto, e va potuta leggere in un posto
 * solo. Chi aggiunge un blocco domani lo inserisce qui e vede subito a
 * chi lo sta mostrando.
 */
export const BLOCCHI_PROFILO: Record<ProfiloOperativo, readonly string[]> = {
  medico: ["adesso", "comunicazioni", "giornata", "pazienti", "prossimi", "notifiche"],
  infermiere: [
    "giornata",
    "somministrazioni",
    "parametri",
    "consegne",
    "attivita",
    "comunicazioni",
    "notifiche",
  ],
  diagnostica: [
    "richieste",
    "validazioni",
    "refertazione",
    "giornata",
    "comunicazioni",
    "notifiche",
  ],
  clinico: ["adesso", "giornata", "pazienti", "comunicazioni", "prossimi", "notifiche"],
};

export function mostra(profilo: ProfiloOperativo, blocco: string): boolean {
  return BLOCCHI_PROFILO[profilo].includes(blocco);
}

/** L'ordine in cui i blocchi compaiono, per chi li dispone in pagina. */
export function ordine(profilo: ProfiloOperativo, blocco: string): number {
  const i = BLOCCHI_PROFILO[profilo].indexOf(blocco);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
