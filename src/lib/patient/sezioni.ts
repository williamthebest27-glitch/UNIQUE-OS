import { CANCELLATION_HOURS } from "@/lib/credits/rules";

/**
 * Le sezioni della Patient App, in un posto solo.
 *
 * Le usano in quattro: la colonna laterale, la barra in fondo su
 * telefono, il pannello "Altro" e lo scheletro che compare mentre una
 * pagina arriva. Se divergessero, chi clicca vedrebbe per un istante un
 * titolo e poi un altro — il modo più veloce per far sembrare rotto
 * qualcosa che funziona.
 *
 * L'ordine dei gruppi risponde alle domande del paziente nell'ordine in
 * cui se le fa: come sto, dove sono, cosa dicono i miei dati, cosa
 * succede adesso.
 */

export type IconaSezione =
  | "home"
  | "score"
  | "percorso"
  | "piano"
  | "risultati"
  | "progressi"
  | "questionari"
  | "documenti"
  | "appuntamenti"
  | "messaggi"
  | "membership"
  | "assistente"
  | "profilo"
  | "notifiche";

export interface VoceSezione {
  href: string;
  etichetta: string;
  icona: IconaSezione;
  /** Il titolo della pagina, quando è fisso. */
  titolo: string;
  sottotitolo?: string;
  /** Compare nella barra in fondo su telefono. */
  inBarra?: boolean;
}

export interface GruppoSezioni {
  titolo: string | null;
  voci: VoceSezione[];
}

export const GRUPPI_PAZIENTE: GruppoSezioni[] = [
  {
    titolo: null,
    voci: [
      { href: "/dashboard", etichetta: "Home", icona: "home", titolo: "Home", inBarra: true },
      {
        href: "/score",
        etichetta: "Longevity Score",
        icona: "score",
        titolo: "Unique Longevity Score",
        sottotitolo:
          "Sette pilastri, una trentina di parametri. Ogni pilastro dice da dove viene il suo numero.",
      },
      {
        href: "/percorso",
        etichetta: "Il tuo percorso",
        icona: "percorso",
        titolo: "Il tuo percorso",
        sottotitolo: "A che punto sei, cosa è già successo, cosa viene dopo.",
        inBarra: true,
      },
      {
        href: "/piano",
        etichetta: "Il tuo piano",
        icona: "piano",
        titolo: "Il tuo piano",
        sottotitolo:
          "Le cose da fare: prima quelle con una data vicina, poi il resto diviso per ciò a cui serve.",
      },
    ],
  },
  {
    titolo: "I tuoi dati",
    voci: [
      {
        href: "/risultati",
        etichetta: "Risultati",
        icona: "risultati",
        titolo: "Risultati e valori",
        sottotitolo:
          "Ogni parametro con il suo intervallo di riferimento e il confronto con la misura precedente. A interpretarli è il tuo medico.",
      },
      {
        href: "/progressi",
        etichetta: "Progressi",
        icona: "progressi",
        titolo: "I tuoi progressi",
        sottotitolo: "Come si sono mossi i tuoi numeri, nel tempo che scegli tu.",
      },
      {
        href: "/questionari",
        etichetta: "Questionari",
        icona: "questionari",
        titolo: "Questionari",
        sottotitolo: "Ci sono cose che nessun esame misura. Queste le sai solo tu.",
      },
      {
        href: "/documenti",
        etichetta: "Documenti",
        icona: "documenti",
        titolo: "Documenti",
        sottotitolo:
          "Referti, esami e piani di cura. Ogni file resta accessibile solo a te e ai professionisti che ti seguono.",
      },
    ],
  },
  {
    titolo: "Con la clinica",
    voci: [
      {
        href: "/appuntamenti",
        etichetta: "Appuntamenti",
        icona: "appuntamenti",
        titolo: "Appuntamenti",
        sottotitolo: `Le tue visite e le disponibilità in clinica. Disdicendo con almeno ${CANCELLATION_HOURS} ore di anticipo il credito torna disponibile.`,
        inBarra: true,
      },
      {
        href: "/messaggi",
        etichetta: "Messaggi",
        icona: "messaggi",
        titolo: "Messaggi",
        sottotitolo: "Una conversazione con chi ti segue. Le risposte cliniche arrivano dal tuo medico.",
        inBarra: true,
      },
      {
        href: "/crediti",
        etichetta: "Membership",
        icona: "membership",
        titolo: "Membership e crediti",
        sottotitolo: "Il tuo piano, i movimenti e i crediti ancora a disposizione.",
      },
    ],
  },
];

/** In fondo alla colonna: non sono sezioni, sono strumenti. */
export const STRUMENTI_PAZIENTE: VoceSezione[] = [
  {
    href: "/assistente",
    etichetta: "Chiedi a Unique",
    icona: "assistente",
    titolo: "Chiedi a Unique",
    sottotitolo:
      "Risponde con i tuoi dati e nient'altro. Non è un medico: le domande cliniche le gira a chi ti segue.",
  },
  {
    href: "/profilo",
    etichetta: "Profilo e privacy",
    icona: "profilo",
    titolo: "Profilo e privacy",
    sottotitolo: "I tuoi recapiti, come vuoi essere avvisato, e cosa hai acconsentito a farci trattare.",
  },
];

export const TUTTE_LE_VOCI: VoceSezione[] = [
  ...GRUPPI_PAZIENTE.flatMap((g) => g.voci),
  ...STRUMENTI_PAZIENTE,
  {
    href: "/notifiche",
    etichetta: "Notifiche",
    icona: "notifiche",
    titolo: "Notifiche",
    sottotitolo: "Tutto quello che è successo nel tuo percorso, dal più recente.",
  },
];

/** Le quattro voci a portata di pollice, più il pulsante «Altro». */
export const VOCI_IN_BARRA = TUTTE_LE_VOCI.filter((v) => v.inBarra);

/**
 * La sezione di un percorso, o null.
 *
 * Corrispondenza esatta soltanto: `/messaggi/abc` è una conversazione,
 * non l'elenco, e dargli il titolo dell'elenco sarebbe una bugia breve
 * ma visibile.
 */
export function sezioneDi(percorso: string): VoceSezione | null {
  return TUTTE_LE_VOCI.find((v) => v.href === percorso) ?? null;
}
