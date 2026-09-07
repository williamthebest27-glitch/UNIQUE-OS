/**
 * Il vocabolario dei consensi.
 *
 * Viveva in `data/paziente-sezioni.ts` insieme alle funzioni di lettura,
 * e finché a leggerlo erano solo pagine server andava bene. Il momento
 * in cui un componente client ne ha avuto bisogno — il modulo che
 * registra un consenso dalla cartella — quell'import ha trascinato nel
 * bundle del browser `next/headers` e il client Supabase di sessione,
 * e la build si è fermata dicendo esattamente questo.
 *
 * È lo stesso motivo per cui esistono `clinical/state.ts` e
 * `comunicazioni/tipi.ts`: **le costanti che attraversano il confine
 * client/server vivono in un file che non importa niente.** Qui dentro
 * non c'è un solo import, e non deve entrarcene mai uno.
 */

export type TipoConsenso =
  | "privacy_policy"
  | "health_data"
  | "marketing"
  | "research";

export const TIPI_CONSENSO: readonly TipoConsenso[] = [
  "privacy_policy",
  "health_data",
  "marketing",
  "research",
];

/**
 * Senza questi due non si può curare nessuno.
 *
 * Non è una formalità: senza `health_data` non si possono conservare
 * referti né calcolare il punteggio, e la Row Level Security non c'entra
 * — è la base giuridica del trattamento a mancare. Restano revocabili,
 * perché un consenso che non si può revocare non è un consenso; ciò che
 * cambia è che revocandoli la cartella smette di poter fare il suo
 * mestiere, e va detto prima.
 */
export const CONSENSI_OBBLIGATORI: readonly TipoConsenso[] = [
  "privacy_policy",
  "health_data",
];

export const ETICHETTE_CONSENSO: Record<
  TipoConsenso,
  { titolo: string; spiegazione: string }
> = {
  privacy_policy: {
    titolo: "Informativa privacy",
    spiegazione: "Come trattiamo i tuoi dati e per quanto tempo li conserviamo.",
  },
  health_data: {
    titolo: "Trattamento dei dati sanitari",
    spiegazione:
      "Senza questo consenso non possiamo calcolare il tuo punteggio né conservare referti e misure.",
  },
  marketing: {
    titolo: "Comunicazioni commerciali",
    spiegazione:
      "Novità, iniziative ed eventi. Puoi revocarlo quando vuoi, senza perdere nulla.",
  },
  research: {
    titolo: "Ricerca in forma anonima",
    spiegazione:
      "I tuoi dati, privati del nome, contribuiscono a migliorare il modello dello Score.",
  },
};

/**
 * Da dove arriva una decisione.
 *
 * Serve a leggere una riga fra un anno: «concesso» non dice niente,
 * «modulo cartaceo firmato il 3 settembre» sì. È anche la sola cosa che
 * distingue un consenso raccolto da un consenso trascritto.
 */
export const ORIGINI_CONSENSO: Record<string, string> = {
  patient_app: "dall’app del paziente",
  clinical: "registrato in cartella",
  paper: "modulo cartaceo",
  reception: "al banco",
};

export function isTipoConsenso(v: string): v is TipoConsenso {
  return (TIPI_CONSENSO as readonly string[]).includes(v);
}
