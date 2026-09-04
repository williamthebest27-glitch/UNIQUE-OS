import { CANCELLATION_HOURS } from "@/lib/credits/rules";

/**
 * I titoli delle sezioni del paziente.
 *
 * Stanno qui e non nelle pagine perché li usano in due: la pagina vera e
 * lo scheletro che compare mentre la pagina arriva. Se divergessero, chi
 * clicca vedrebbe per un istante un titolo e poi un altro — che è il modo
 * più veloce per far sembrare rotto qualcosa che funziona.
 */
export const SEZIONI_PAZIENTE = {
  dashboard: {
    title: "Home",
    subtitle: null,
  },
  percorso: {
    title: "Il tuo percorso",
    subtitle:
      "Lo Score nel tempo, il protocollo in corso e le azioni che lo fanno avanzare.",
  },
  documenti: {
    title: "Documenti e risultati",
    subtitle:
      "Referti, esami e piani di cura. Ogni file resta accessibile solo a te e ai professionisti che ti seguono.",
  },
  appuntamenti: {
    title: "Appuntamenti",
    subtitle: `Le tue visite e le disponibilità in clinica. Disdicendo con almeno ${CANCELLATION_HOURS} ore di anticipo il credito torna disponibile.`,
  },
  crediti: {
    title: "Membership e crediti",
    subtitle: "Il tuo piano, i movimenti e i crediti ancora a disposizione.",
  },
} as const;

export type SezionePaziente = keyof typeof SEZIONI_PAZIENTE;
