/**
 * Unique Document Intelligence Engine.
 *
 * Riceve un file — referto, foglio di calcolo, foto di un esame — e ne
 * restituisce dati clinici strutturati, con la citazione da cui ogni
 * numero viene e la fiducia con cui è stato letto.
 *
 * ```
 *  CARICAMENTO
 *      ↓  validazione       actions.ts
 *      ↓  riconoscimento    rilevatore.ts
 *      ↓  apertura          lettore.ts → pdf / word / excel / immagine
 *      ↓  OCR               ocr.ts        (solo per immagini e scansioni)
 *      ↓  layout e tabelle  tabelle.ts
 *      ↓  normalizzazione   normalizzatore.ts + catalogo.ts
 *      ↓  dati clinici      estrattore-medico.ts
 *      ↓  stato e fiducia   stato.ts
 *      ↓  JSON strutturato  processore.ts
 *      ↓  BRAIN             lib/brain/documento.ts
 *      ↓  REVISIONE UMANA   lib/documents/
 * ```
 *
 * Ogni riga di quello schema è un file, e ogni file si può sostituire
 * senza toccare gli altri: il contratto fra le fasi è in `tipi.ts`.
 *
 * ---
 *
 * **Le tre regole che valgono per tutto il modulo.**
 *
 * 1. *Non si inventa niente.* Un valore che non si legge esce come
 *    `null` con la ragione scritta. «Glucosio 1?5» non diventa 105.
 *
 * 2. *L'intervallo del laboratorio vince.* Quando il documento stampa i
 *    propri valori di riferimento, sono quelli il metro. Il catalogo di
 *    Unique interviene solo dove il documento tace, e ogni valore porta
 *    scritto con quale dei due è stato giudicato.
 *
 * 3. *Fatto, interpretazione e inferenza restano distinti.* Il valore è
 *    un fatto e ha una citazione; lo stato è un'interpretazione e ha un
 *    intervallo; l'intuizione del Brain è un'inferenza e ha delle prove.
 *    Nessuno dei tre si presenta come l'altro, e la decisione clinica
 *    non è nessuno dei tre: è la firma di una persona.
 */

export {
  CATALOGO,
  QUANTI_BIOMARCATORI,
  VERSO_METRICA,
  perCategoria,
  vocePerCanonical,
  type VoceCatalogo,
} from "./catalogo.ts";

export {
  ACCEPT_DOCUMENT_INTELLIGENCE,
  MIME_ACCETTATI,
  estensioneDi,
  richiedeOcr,
  rileva,
} from "./rilevatore.ts";

export { improntaDi, type EsitoDuplicato } from "./impronta.ts";

export {
  canonicalizza,
  convertiValore,
  leggiNumero,
  normalizzaUnita,
  ripulisciEtichetta,
  stessaUnita,
} from "./normalizzatore.ts";

export {
  calcolaStato,
  descriviStato,
  scegliIntervallo,
  scostamento,
  statoRichiedeRevisione,
  type ContestoPaziente,
} from "./stato.ts";

export { estraiDatiClinici, type EsitoEstrazione } from "./estrattore-medico.ts";

export {
  CONFIDENZA_INUTILIZZABILE,
  CONFIDENZA_MINIMA_AUTOMATICA,
  confidenzaComplessiva,
  decideRevisione,
  nomiCompatibili,
  processa,
  type DatiFile,
  type OpzioniProcessore,
} from "./processore.ts";

export {
  intervalloDaTesto,
  numeroDaCella,
  ruoliDelleColonne,
  tabellaDaTestoAllineato,
} from "./tabelle.ts";

export * from "./tipi.ts";
