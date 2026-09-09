/**
 * Da un referto letto ai pezzi che si possono cercare.
 *
 * Nessun import: come il resto del motore proprietario, le regole con
 * cui si taglia un documento devono poter essere verificate senza
 * database, senza rete e senza modelli.
 *
 * ---
 *
 * **Perché tagliare, invece di indicizzare il documento intero.**
 *
 * Un referto di dodici pagine che «contiene la parola tiroide» non è una
 * risposta. La risposta è il paragrafo in cui la contiene, e la
 * differenza si sente nel momento in cui il Brain deve *citare*: «lo
 * dice il referto del 12 agosto» è un'affermazione che nessuno può
 * controllare senza rileggere dodici pagine, «lo dice il referto del 12
 * agosto, pagina 4» è verificabile in dieci secondi.
 *
 * C'è anche una ragione meno visibile e altrettanto seria: un documento
 * intero dato in pasto a un modello linguistico è un documento intero
 * che esce dall'infrastruttura quando il modello è esterno. Cercare
 * prima e mandare poi solo i pezzi pertinenti riduce di molto ciò che
 * viaggia — ed è una riduzione che vale anche legalmente.
 *
 * **Dove si taglia.** Sui confini che il testo dichiara già: prima i
 * capoversi, e solo dentro un capoverso troppo lungo si scende alle
 * frasi. Tagliare a lunghezza fissa spezzerebbe «Colesterolo LDL: 118 /
 * mg/dL» in due frammenti, e nessuno dei due direbbe più niente.
 *
 * **La sovrapposizione.** Ogni frammento ripete la coda del precedente.
 * Serve a una cosa sola e importante: una frase che cade a cavallo di
 * due frammenti resta intera in almeno uno dei due. Senza, la ricerca
 * perde proprio le informazioni che stanno sui confini — e i confini,
 * in un referto, cadono spesso fra il nome di un esame e il suo valore.
 */

export interface Frammento {
  ordinale: number;
  testo: string;
  /** La pagina di provenienza, quando il testo la dichiara. */
  pagina: number | null;
}

export interface OpzioniFrammentazione {
  /** Lunghezza a cui un frammento si considera pieno. */
  massimo?: number;
  /** Quanto della coda precedente si ripete in testa al successivo. */
  sovrapposizione?: number;
  /** Sotto questa lunghezza un frammento non vale la riga in tabella. */
  minimo?: number;
  /** Oltre questo numero non se ne producono altri. */
  massimoFrammenti?: number;
}

const PREDEFINITI = {
  /*
   * Ottocento caratteri: due o tre capoversi di un referto.
   *
   * Più corti, e una tabella di valori si spezza fra il nome dell'esame
   * e il numero. Più lunghi, e il frammento smette di essere una
   * citazione: diventa «da qualche parte qui dentro», che è il problema
   * che si stava risolvendo.
   */
  massimo: 800,
  sovrapposizione: 120,
  /*
   * Sotto i trenta caratteri non c'è niente da cercare: sono le righe
   * di intestazione, i numeri di pagina, le sigle rimaste sole dopo il
   * riconoscimento ottico.
   */
  minimo: 30,
  /*
   * Un tetto esiste perché un PDF scansionato male produce migliaia di
   * righe di rumore, e nessuno vuole duemila frammenti di rumore
   * indicizzati per un documento solo.
   */
  massimoFrammenti: 400,
} as const;

/**
 * Le pagine, quando il lettore le ha segnate.
 *
 * Il motore documentale separa le pagine con un'interruzione di pagina
 * (`\f`), che è il carattere che i lettori di PDF usano da sempre.
 * Quando non c'è — un file di testo, un Word, un OCR che non l'ha
 * emessa — la pagina resta ignota, e dichiararla ignota è meglio che
 * inventare un numero: una citazione con la pagina sbagliata è peggio
 * di una senza.
 */
function perPagina(testo: string): { testo: string; pagina: number | null }[] {
  if (!testo.includes("\f")) return [{ testo, pagina: null }];

  return testo
    .split("\f")
    .map((t, i) => ({ testo: t, pagina: i + 1 }))
    .filter((p) => p.testo.trim().length > 0);
}

/** I blocchi che il testo dichiara: capoversi, e le frasi di quelli lunghi. */
function blocchi(testo: string, massimo: number): string[] {
  const capoversi = testo
    .split(/\n\s*\n+/)
    .map((c) => c.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  const pezzi: string[] = [];

  for (const capoverso of capoversi) {
    if (capoverso.length <= massimo) {
      pezzi.push(capoverso);
      continue;
    }

    /*
     * Un capoverso più lungo del massimo si spezza sulle frasi. Il
     * lookbehind tiene la punteggiatura attaccata alla frase che
     * chiude: «Valori nella norma.» resta una frase, non diventa
     * «Valori nella norma» più un punto orfano.
     */
    const frasi = capoverso.split(/(?<=[.;!?])\s+/);
    let corrente = "";

    for (const frase of frasi) {
      if (corrente && corrente.length + frase.length + 1 > massimo) {
        pezzi.push(corrente);
        corrente = frase;
      } else {
        corrente = corrente ? `${corrente} ${frase}` : frase;
      }
    }

    if (corrente) pezzi.push(corrente);
  }

  /*
   * Resta il caso senza confini: una singola frase lunghissima, che
   * l'OCR produce quando non riconosce la punteggiatura. Qui non c'è
   * niente da rispettare e si taglia a lunghezza.
   */
  return pezzi.flatMap((p) => {
    if (p.length <= massimo) return [p];
    const tagliati: string[] = [];
    for (let i = 0; i < p.length; i += massimo) tagliati.push(p.slice(i, i + massimo));
    return tagliati;
  });
}

/** La coda del frammento precedente, tagliata su una parola intera. */
function coda(testo: string, quanti: number): string {
  if (quanti <= 0 || testo.length <= quanti) return testo;
  const pezzo = testo.slice(-quanti);
  const spazio = pezzo.indexOf(" ");
  return spazio === -1 ? pezzo : pezzo.slice(spazio + 1);
}

export function frammenta(
  testo: string | null | undefined,
  opzioni: OpzioniFrammentazione = {},
): Frammento[] {
  const massimo = opzioni.massimo ?? PREDEFINITI.massimo;
  const sovrapposizione = opzioni.sovrapposizione ?? PREDEFINITI.sovrapposizione;
  const minimo = opzioni.minimo ?? PREDEFINITI.minimo;
  const tetto = opzioni.massimoFrammenti ?? PREDEFINITI.massimoFrammenti;

  if (!testo || testo.trim().length === 0) return [];

  const frammenti: Frammento[] = [];

  for (const pagina of perPagina(testo)) {
    let corrente = "";

    const chiudi = () => {
      const pulito = corrente.trim();
      corrente = "";
      if (pulito.length < minimo) return;
      frammenti.push({
        ordinale: frammenti.length,
        testo: pulito,
        pagina: pagina.pagina,
      });
    };

    for (const blocco of blocchi(pagina.testo, massimo)) {
      if (frammenti.length >= tetto) break;

      if (corrente && corrente.length + blocco.length + 1 > massimo) {
        const precedente = corrente;
        chiudi();

        /*
         * La coda del precedente apre il successivo: una frase a
         * cavallo dei due resta intera almeno una volta.
         *
         * Ma la coda occupa spazio, e se il blocco che sta per entrare
         * è già quasi lungo quanto il massimo, aggiungerla lo farebbe
         * sforare — che è esattamente il guasto che il test «una frase
         * senza punteggiatura si taglia comunque» ha trovato: un
         * frammento da 317 caratteri con il massimo a 200.
         *
         * In quel caso si rinuncia alla sovrapposizione. Non si perde
         * niente di importante: un blocco che riempie da solo il
         * frammento è già un pezzo di testo intero e autosufficiente, e
         * la sovrapposizione serve a salvare le frasi *corte* che
         * cadono su un confine.
         */
        const tail = coda(precedente, sovrapposizione);
        corrente = tail.length + 1 + blocco.length <= massimo ? tail : "";
      }

      corrente = corrente ? `${corrente} ${blocco}` : blocco;
    }

    if (frammenti.length < tetto) chiudi();
  }

  // L'ordinale è unico per documento e non per pagina: è la chiave con
  // cui i frammenti si rimettono in fila quando se ne cita più d'uno.
  return frammenti.slice(0, tetto).map((f, i) => ({ ...f, ordinale: i }));
}
