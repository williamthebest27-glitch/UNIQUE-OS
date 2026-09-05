import { estraiData } from "../clinical/lettura-referto.ts";
import { canonicalizza, convertiValore, leggiNumero, normalizzaUnita, ripulisciEtichetta } from "./normalizzatore.ts";
import { calcolaStato, scegliIntervallo, statoRichiedeRevisione, type ContestoPaziente } from "./stato.ts";
import { intervalloDaTesto, ruoliDelleColonne } from "./tabelle.ts";
import type {
  Avvertenza,
  Biomarcatore,
  ContenutoEstratto,
  Farmaco,
  Integratore,
  NotaClinica,
  Tabella,
  TipoDocumento,
} from "./tipi.ts";

/**
 * Da testo a dati clinici.
 *
 * Questo file è il punto in cui un documento smette di essere un file e
 * diventa una riga di cartella. Fa tre letture, in quest'ordine, e la
 * prima che riesce vince:
 *
 *   **Le tabelle.** Quando il documento ne ha una con le colonne
 *   riconoscibili — esame, risultato, unità, riferimento — è la lettura
 *   più affidabile che esista: il valore è quello nella colonna dei
 *   valori, e nessuna espressione regolare deve indovinare niente.
 *
 *   **Le righe.** Il ripiego per i referti impaginati in modo che le
 *   colonne non si riconoscano. Si cerca l'esame, si taglia via
 *   l'intervallo, si prende il primo numero. È il metodo che il motore
 *   clinico di Unique già usa, e funziona sulla maggior parte dei
 *   referti italiani.
 *
 *   **Il contesto.** Data, laboratorio, nome del paziente, farmaci,
 *   conclusioni: non sono valori, ma senza di loro un referto è una
 *   lista di numeri senza padrone.
 *
 * ---
 *
 * **Cosa questo file non fa mai.** Non inventa. Un valore che non si
 * legge esce con `valore: null` e la nota che lo dice; una riga senza
 * esame riconosciuto non diventa un esame; un intervallo che non si
 * capisce non diventa un intervallo plausibile. Ogni scorciatoia qui
 * produrrebbe un dato che sembra vero, e un dato che sembra vero non lo
 * ricontrolla nessuno.
 */

export interface ContestoEstrazione extends ContestoPaziente {
  /** Oggi, iniettabile per rendere i test deterministici. */
  oggi: string;
  /** Le fiducie per riga dichiarate dal riconoscimento ottico. */
  fiduciaPerRiga?: Map<string, number>;
}

export interface EsitoEstrazione {
  tipoDocumento: TipoDocumento;
  dataDocumento: string | null;
  laboratorio: string | null;
  paziente: { nome: string | null; dataNascita: string | null; confidenza: number };
  biomarcatori: Biomarcatore[];
  farmaci: Farmaco[];
  integratori: Integratore[];
  note: NotaClinica[];
  avvertenze: Avvertenza[];
  /** Righe con dei numeri che nessun esame del catalogo ha reclamato. */
  nonRiconosciute: string[];
}

/* ── Il punto d'ingresso ──────────────────────────────────────────── */

export function estraiDatiClinici(
  contenuto: ContenutoEstratto,
  contesto: ContestoEstrazione,
): EsitoEstrazione {
  const righe = contenuto.testo
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const avvertenze: Avvertenza[] = [];

  const dataDocumento = estraiData(contenuto.testo, contesto.oggi);
  if (!dataDocumento) {
    avvertenze.push({
      codice: "data-assente",
      messaggio:
        "Nessuna data leggibile nel documento: i valori vengono datati al giorno del caricamento, e va verificato.",
    });
  }

  // ── I biomarcatori ──────────────────────────────────────────────
  const daTabelle = biomarcatoriDaTabelle(contenuto.tabelle, dataDocumento, contesto);
  const daRighe = biomarcatoriDaRighe(righe, dataDocumento, contesto);

  // Le due letture si fondono, e in caso di conflitto vince quella con
  // più fiducia. Le tabelle di solito vincono, ma non per decreto: un
  // riconoscimento di colonne incerto non deve battere una riga letta
  // bene.
  const biomarcatori = unisci(daTabelle.trovati, daRighe.trovati);

  for (const b of biomarcatori) {
    if (b.valore === null) {
      avvertenze.push({
        codice: "valore-illeggibile",
        messaggio: `${b.display_name}: il valore non è stato letto con sicurezza e non è stato indovinato.`,
        riferimento: b.canonical_name,
      });
    } else if (b.confidenza < 0.5) {
      avvertenze.push({
        codice: "confidenza-bassa",
        messaggio: `${b.display_name}: lettura poco affidabile, da verificare sul documento originale.`,
        riferimento: b.canonical_name,
      });
    }
  }

  // ── Il contesto ─────────────────────────────────────────────────
  const tipoDocumento = riconosciTipo(contenuto, biomarcatori.length);
  const farmaci = estraiFarmaci(righe);
  const integratori = estraiIntegratori(righe);
  const note = estraiNote(contenuto);

  if (biomarcatori.length === 0 && contenuto.leggibile) {
    avvertenze.push({
      codice: "tabella-non-riconosciuta",
      messaggio:
        tipoDocumento === "LAB_REPORT"
          ? "Il documento sembra un referto ma non ho riconosciuto nessun esame del catalogo. Va letto da una persona."
          : "Nessun valore di laboratorio in questo documento.",
    });
  }

  return {
    tipoDocumento,
    dataDocumento,
    laboratorio: estraiLaboratorio(righe, contenuto),
    paziente: estraiPaziente(righe),
    biomarcatori,
    farmaci,
    integratori,
    note,
    avvertenze,
    nonRiconosciute: [...new Set([...daRighe.nonRiconosciute])].slice(0, 30),
  };
}

/* ── Lettura dalle tabelle ────────────────────────────────────────── */

function biomarcatoriDaTabelle(
  tabelle: Tabella[],
  dataDocumento: string | null,
  contesto: ContestoEstrazione,
): { trovati: Biomarcatore[] } {
  const trovati: Biomarcatore[] = [];

  for (const tabella of tabelle) {
    // Sotto questa soglia la griglia è un'ipotesi, non una struttura: la
    // lettura a righe è più prudente e sa dire di non aver capito.
    if (tabella.confidenza < 0.5) continue;

    const ruoli = ruoliDelleColonne(tabella);
    if (ruoli.esame === null || ruoli.risultato === null) continue;

    for (const riga of tabella.righe) {
      const etichetta = riga[ruoli.esame]?.testo ?? "";
      if (etichetta.length < 2) continue;

      const riconoscimento = canonicalizza(etichetta);
      if (!riconoscimento) continue;

      const cellaRisultato = riga[ruoli.risultato]?.testo ?? "";
      if (cellaRisultato.length === 0) continue;

      const citazione = riga.map((c) => c.testo).filter(Boolean).join("  ").slice(0, 200);

      // L'unità può stare nella sua colonna oppure appiccicata al valore.
      const unitaColonna = ruoli.unita !== null ? riga[ruoli.unita]?.testo ?? null : null;
      const unita = normalizzaUnita(unitaColonna) ?? unitaDaTesto(cellaRisultato);

      const testoRiferimento = ruoli.riferimento !== null ? riga[ruoli.riferimento]?.testo ?? "" : "";
      const intervalloDocumento = testoRiferimento ? intervalloDaTesto(testoRiferimento) : null;

      const biomarcatore = componi({
        riconoscimento,
        etichettaDocumento: etichetta,
        testoValore: cellaRisultato,
        unita,
        intervalloDocumento: intervalloDocumento
          ? { ...intervalloDocumento, testo: testoRiferimento }
          : null,
        citazione,
        pagina: tabella.pagina,
        data: dataDocumento,
        contesto,
        // Una tabella con le colonne riconosciute è la lettura più
        // solida: si sa quale colonna è il risultato, non lo si deduce.
        bonus: ruoli.via === "intestazioni" ? 0.03 : 0,
      });

      if (biomarcatore) trovati.push(biomarcatore);
    }
  }

  return { trovati };
}

/* ── Lettura dalle righe ──────────────────────────────────────────── */

/**
 * Dove finisce il valore e comincia l'intervallo di riferimento.
 *
 * Su "Colesterolo 187 mg/dL v.r. 130-200" ci sono tre numeri e due sono
 * la normalità. Tagliare al primo marcatore elimina il caso più
 * frequente di lettura sbagliata — ma qui, a differenza del lettore
 * dello Score, **la coda non si butta**: contiene l'intervallo del
 * laboratorio, che è il metro migliore che il documento offra.
 */
const MARCATORI_RIFERIMENTO =
  /\b(v\.?\s?r\.?|valori\s+di\s+riferimento|valori\s+normali|rif\.?|range|intervallo|normale|desiderabile|attes[oi]|reference)\b|\(/i;

const UNITA_RICONOSCIUTE =
  /(mg\/dl|mg\/l|g\/dl|g\/l|mmol\/l|mmol\/mol|nmol\/l|pmol\/l|µmol\/l|umol\/l|µu\/ml|uu\/ml|miu\/ml|mui\/l|ng\/ml|ng\/dl|ng\/l|pg\/ml|µg\/dl|ug\/dl|µg\/l|ug\/l|u\/l|ui\/l|u\/ml|mm\/h|mmhg|bpm|ml\/kg\/min|meq\/l|mg\/24h|kg\/m2|kg\/m²|fl|kg|cm|%)/i;

function unitaDaTesto(testo: string): string | null {
  const trovata = UNITA_RICONOSCIUTE.exec(testo);
  return trovata ? normalizzaUnita(trovata[0]) : null;
}

function biomarcatoriDaRighe(
  righe: string[],
  dataDocumento: string | null,
  contesto: ContestoEstrazione,
): { trovati: Biomarcatore[]; nonRiconosciute: string[] } {
  const trovati: Biomarcatore[] = [];
  const nonRiconosciute: string[] = [];

  for (const riga of righe) {
    // ── La pressione, che è una frazione e sono due misure ────────
    const pressione = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(riga);
    if (pressione && /pressione|p\.?\s?a\.?|arteriosa|mmhg/i.test(riga)) {
      for (const [etichetta, valore] of [
        ["Pressione sistolica", Number(pressione[1])],
        ["Pressione diastolica", Number(pressione[2])],
      ] as const) {
        const riconoscimento = canonicalizza(etichetta);
        if (!riconoscimento) continue;
        const b = componi({
          riconoscimento,
          etichettaDocumento: etichetta,
          testoValore: String(valore),
          unita: "mmHg",
          intervalloDocumento: null,
          citazione: riga.slice(0, 200),
          pagina: null,
          data: dataDocumento,
          contesto,
          bonus: -0.05,
        });
        if (b) trovati.push(b);
      }
      continue;
    }

    // ── L'esame ───────────────────────────────────────────────────
    const riconoscimento = canonicalizza(riga);
    if (!riconoscimento) {
      // Una riga con un numero e nessun esame riconosciuto si segnala
      // invece di sparire: se è un esame che seguiamo, va nel catalogo.
      if (/\d/.test(riga) && riga.length < 140 && /[a-z]{4}/i.test(riga)) {
        nonRiconosciute.push(riga.slice(0, 140));
      }
      continue;
    }

    const minuscola = riga.toLowerCase();
    const posizione = minuscola.indexOf(riconoscimento.sinonimo);
    const dopoNome = riga.slice(posizione + riconoscimento.sinonimo.length);

    // ── Il taglio ─────────────────────────────────────────────────
    const marcatore = dopoNome.search(MARCATORI_RIFERIMENTO);
    const primaDelRiferimento = marcatore > 0 ? dopoNome.slice(0, marcatore) : dopoNome;
    const codaRiferimento = marcatore > 0 ? dopoNome.slice(marcatore) : "";

    const numeri = primaDelRiferimento.match(/[<>≤≥]?\s*-?\d[\d.,]*/g);
    if (!numeri || numeri.length === 0) continue;

    const unita = unitaDaTesto(primaDelRiferimento) ?? unitaDaTesto(dopoNome);

    // ── L'intervallo, cercato in due posti ────────────────────────
    // Prima nella coda dopo il marcatore, che è il caso pulito. Poi,
    // se il marcatore non c'era, in ciò che resta dopo il valore: molti
    // referti scrivono "Glicemia 102 mg/dL 70 - 100" senza dire altro.
    let intervalloDocumento = intervalloNelTesto(codaRiferimento);
    if (!intervalloDocumento) {
      const dopoValore = primaDelRiferimento.slice(
        primaDelRiferimento.indexOf(numeri[0]) + numeri[0].length,
      );
      intervalloDocumento = intervalloNelTesto(dopoValore);
    }

    const b = componi({
      riconoscimento,
      etichettaDocumento: ripulisciEtichetta(riga.slice(0, posizione + riconoscimento.sinonimo.length)),
      testoValore: numeri[0].replace(/\s/g, ""),
      unita,
      intervalloDocumento,
      citazione: riga.slice(0, 200),
      pagina: null,
      data: dataDocumento,
      contesto,
      bonus: 0,
    });

    if (b) trovati.push(b);
  }

  return { trovati, nonRiconosciute };
}

/** Cerca un intervallo dentro un pezzo di testo, in qualunque forma. */
function intervalloNelTesto(
  testo: string,
): { min: number | null; max: number | null; testo: string } | null {
  if (!testo || testo.trim().length === 0) return null;

  const pulito = testo.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

  // La forma completa: "70 - 100", eventualmente con l'unità in mezzo.
  const doppio = /(-?[\d.,]+)\s*[-–—]\s*(-?[\d.,]+)/.exec(pulito);
  if (doppio) {
    const intervallo = intervalloDaTesto(`${doppio[1]} - ${doppio[2]}`);
    if (intervallo) return { ...intervallo, testo: doppio[0] };
  }

  const soloEstremo = /([<>≤≥]\s*[\d.,]+)/.exec(pulito);
  if (soloEstremo) {
    const intervallo = intervalloDaTesto(soloEstremo[1].replace(/\s/g, ""));
    if (intervallo) return { ...intervallo, testo: soloEstremo[1] };
  }

  return null;
}

/* ── Composizione di un biomarcatore ──────────────────────────────── */

function componi(input: {
  riconoscimento: NonNullable<ReturnType<typeof canonicalizza>>;
  etichettaDocumento: string;
  testoValore: string;
  unita: string | null;
  intervalloDocumento: { min: number | null; max: number | null; testo?: string } | null;
  citazione: string;
  pagina: number | null;
  data: string | null;
  contesto: ContestoEstrazione;
  bonus: number;
}): Biomarcatore | null {
  const { voce } = input.riconoscimento;

  const fiduciaRiga = input.contesto.fiduciaPerRiga?.get(input.citazione) ?? 1;
  const numero = leggiNumero(input.testoValore, fiduciaRiga);

  const note: string[] = [];
  if (numero.motivo) note.push(numero.motivo);

  // ── Valore non letto ────────────────────────────────────────────
  // Il caso che la visione chiede esplicitamente: «Glucosio 1?5» non
  // diventa né 105 né 125. Il biomarcatore esiste — sappiamo che
  // l'esame è stato fatto — ma senza valore e con la richiesta di
  // verifica accesa.
  if (numero.valore === null) {
    return {
      canonical_name: voce.canonical,
      display_name: voce.display,
      etichetta_documento: input.etichettaDocumento.slice(0, 120),
      metric_code: voce.metricCode ?? null,
      categoria: voce.categoria,
      valore: null,
      valore_testuale: input.testoValore.slice(0, 60),
      unita: normalizzaUnita(input.unita),
      intervallo: scegliIntervallo(voce, input.intervalloDocumento, input.contesto),
      stato: "UNKNOWN",
      confidenza: Number(Math.min(numero.fiducia, input.riconoscimento.fiducia).toFixed(3)),
      richiedeVerifica: true,
      note,
      citazione: input.citazione,
      pagina: input.pagina,
      data: input.data,
    };
  }

  // ── Conversione ─────────────────────────────────────────────────
  const convertito = convertiValore(voce, numero.valore, input.unita);
  if (convertito.nota) note.push(convertito.nota);

  // ── Plausibilità ────────────────────────────────────────────────
  // Un valore fuori dall'intervallo fisiologico non è un paziente
  // grave: è quasi sempre un errore di lettura o di unità. Non si
  // scarta la riga — sarebbe perdere in silenzio — ma si toglie il
  // valore e si dichiara il perché.
  const [minimo, massimo] = voce.plausibile;
  const implausibile = convertito.valore < minimo || convertito.valore > massimo;

  if (implausibile) {
    note.push(
      `Il valore letto (${convertito.valore}${convertito.unita ? ` ${convertito.unita}` : ""}) è fuori dall'intervallo fisiologicamente possibile per ${voce.display}: quasi sempre è un errore di lettura o di unità di misura.`,
    );
  }

  const intervallo = scegliIntervallo(voce, input.intervalloDocumento, input.contesto);
  const stato = implausibile ? "UNKNOWN" : calcolaStato(convertito.valore, intervallo, voce);

  // ── La confidenza ───────────────────────────────────────────────
  // Il minimo fra le tre incertezze indipendenti: aver riconosciuto
  // l'esame, aver letto il numero, aver capito l'unità. La più debole
  // delle tre è quella che conta — una media le nasconderebbe.
  const confidenza = implausibile
    ? Math.min(0.3, input.riconoscimento.fiducia)
    : Math.min(input.riconoscimento.fiducia, numero.fiducia, convertito.fiducia) + input.bonus;

  const arrotondata = Number(Math.max(0, Math.min(1, confidenza)).toFixed(3));

  return {
    canonical_name: voce.canonical,
    display_name: voce.display,
    etichetta_documento: input.etichettaDocumento.slice(0, 120),
    metric_code: voce.metricCode ?? null,
    categoria: voce.categoria,
    valore: implausibile ? null : convertito.valore,
    valore_testuale: implausibile ? input.testoValore.slice(0, 60) : null,
    unita: convertito.unita || null,
    intervallo,
    stato,
    confidenza: arrotondata,
    richiedeVerifica:
      implausibile ||
      arrotondata < 0.6 ||
      numero.soglia !== null ||
      statoRichiedeRevisione(stato),
    note,
    citazione: input.citazione,
    pagina: input.pagina,
    data: input.data,
    conversione: convertito.conversione,
  };
}

/**
 * Quando lo stesso esame compare due volte, tiene la lettura migliore.
 *
 * Succede sempre: l'intestazione ripetuta a ogni pagina, la stessa
 * tabella letta sia per colonne sia per righe, il riepilogo in fondo al
 * referto. A parità di fiducia vince chi porta un intervallo del
 * laboratorio: è l'informazione che rende il valore giudicabile.
 */
function unisci(...gruppi: Biomarcatore[][]): Biomarcatore[] {
  const per = new Map<string, Biomarcatore>();

  for (const gruppo of gruppi) {
    for (const b of gruppo) {
      const esistente = per.get(b.canonical_name);
      if (!esistente) {
        per.set(b.canonical_name, b);
        continue;
      }

      const meglio =
        b.confidenza > esistente.confidenza ||
        (b.confidenza === esistente.confidenza &&
          b.intervallo.fonte === "documento" &&
          esistente.intervallo.fonte !== "documento") ||
        // Un valore letto batte un valore non letto, a parità di tutto:
        // due letture dello stesso esame di cui una ha capito il numero.
        (esistente.valore === null && b.valore !== null);

      if (meglio) per.set(b.canonical_name, b);
    }
  }

  return [...per.values()];
}

/* ── Tipo di documento ────────────────────────────────────────────── */

/**
 * Che documento è.
 *
 * Prima il contenuto, poi le parole. Un documento con otto biomarcatori
 * è un referto di laboratorio anche se non lo dice da nessuna parte, e
 * la presenza dei dati è un indizio più forte di qualunque parola
 * nell'intestazione — che può essere il nome della clinica.
 */
const INDIZI: readonly { tipo: TipoDocumento; parole: RegExp; peso: number }[] = [
  { tipo: "LAB_REPORT", parole: /\b(referto di laboratorio|analisi cliniche|chimica clinica|esami ematochimici|laboratorio analisi|prelievo)\b/i, peso: 3 },
  { tipo: "IMAGING_REPORT", parole: /\b(ecografia|risonanza magnetica|tac\b|tomografia|radiografia|rx\b|mammografia|ecocolordoppler|scintigrafia|densitometria)\b/i, peso: 4 },
  { tipo: "SPECIALIST_REPORT", parole: /\b(visita specialistica|referto specialistico|esame obiettivo|anamnesi patologica|si consiglia|quesito diagnostico|conclusioni diagnostiche)\b/i, peso: 3 },
  { tipo: "BODY_COMPOSITION", parole: /\b(composizione corporea|bioimpedenziometria|bia\b|dexa|massa grassa|massa magra|impedenziometr)/i, peso: 4 },
  { tipo: "PRESCRIPTION", parole: /\b(prescrizione|ricetta|posologia|si prescrive|terapia consigliata|compresse al giorno)\b/i, peso: 3 },
  { tipo: "ANAMNESIS", parole: /\b(anamnesi|storia clinica|questionario|familiarità|abitudini di vita)\b/i, peso: 2 },
  { tipo: "VITALS", parole: /\b(parametri vitali|pressione arteriosa|saturazione|temperatura corporea|frequenza respiratoria)\b/i, peso: 2 },
  { tipo: "CONSENT", parole: /\b(consenso informato|autorizzazione al trattamento|informativa privacy|acconsento)\b/i, peso: 4 },
  { tipo: "INVOICE", parole: /\b(fattura|imponibile|partita iva|iva \d|totale documento|codice fiscale destinatario)\b/i, peso: 4 },
];

function riconosciTipo(contenuto: ContenutoEstratto, quantiBiomarcatori: number): TipoDocumento {
  const testo = contenuto.testo.slice(0, 6000);
  const punteggi = new Map<TipoDocumento, number>();

  for (const indizio of INDIZI) {
    const trovati = testo.match(new RegExp(indizio.parole.source, "gi"));
    if (trovati) {
      punteggi.set(indizio.tipo, (punteggi.get(indizio.tipo) ?? 0) + trovati.length * indizio.peso);
    }
  }

  // I valori pesano più delle parole: sono un fatto, non un indizio.
  if (quantiBiomarcatori >= 3) {
    punteggi.set("LAB_REPORT", (punteggi.get("LAB_REPORT") ?? 0) + quantiBiomarcatori);
  }

  // Un foglio di calcolo con una tabella di valori è quasi sempre
  // un'esportazione di laboratorio o una serie di misure.
  if ((contenuto.formato === "xlsx" || contenuto.formato === "xls" || contenuto.formato === "csv") && quantiBiomarcatori >= 2) {
    punteggi.set("LAB_REPORT", (punteggi.get("LAB_REPORT") ?? 0) + 3);
  }

  const migliore = [...punteggi.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!migliore || migliore[1] < 2) {
    return quantiBiomarcatori >= 2 ? "LAB_REPORT" : "UNKNOWN";
  }

  return migliore[0];
}

/* ── Il contorno ──────────────────────────────────────────────────── */

/**
 * Il nome del paziente stampato sul documento.
 *
 * Serve a **verificare**, mai a identificare: il paziente lo decide chi
 * carica, e questo campo esiste solo perché il sistema possa dire «il
 * documento intesta a un nome diverso» quando qualcuno sbaglia cartella.
 * Fidarsi di un nome letto da un OCR per attribuire un referto sarebbe
 * il modo più diretto di mettere i dati di una persona in cartella di
 * un'altra.
 */
const ETICHETTA_PAZIENTE =
  /\b(?:paziente|sig\.?ra?|cognome e nome|nome e cognome|assistito|intestatario)\b\s*:?\s*/;

/** Un nome proprio: parole che cominciano per maiuscola, al massimo quattro. */
const NOME_PROPRIO = /^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ ]{1,2}[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,3})/;

function estraiPaziente(righe: string[]): {
  nome: string | null;
  dataNascita: string | null;
  confidenza: number;
} {
  let nome: string | null = null;
  let dataNascita: string | null = null;

  for (const riga of righe.slice(0, 40)) {
    if (!nome) {
      /*
       * L'etichetta si cerca su una copia in minuscolo e il nome si
       * legge dall'originale.
       *
       * Serve perché le due condizioni sono opposte: «Paziente» va
       * riconosciuto comunque sia scritto, mentre il nome deve
       * cominciare per maiuscola — ed è l'unico modo di distinguerlo
       * dal resto della riga. Un'unica espressione con il flag di
       * insensibilità le renderebbe entrambe insensibili, e il nome
       * finirebbe per inghiottire le parole che seguono.
       */
      const trovata = ETICHETTA_PAZIENTE.exec(riga.toLowerCase());

      if (trovata) {
        const dopo = riga.slice(trovata.index + trovata[0].length);
        // Due spazi o una tabulazione sono un cambio di colonna: su un
        // referto impaginato, «Rossi Mario     Data prelievo» sono due
        // campi distinti, non un nome di quattro parole.
        const soloQuestaColonna = dopo.split(/\s{2,}|\t/)[0].trim();
        const proprio = NOME_PROPRIO.exec(soloQuestaColonna);
        if (proprio) nome = proprio[1].trim();
      }
    }

    if (!dataNascita) {
      const trovato =
        /\b(?:nat[oa]\s+il|data di nascita|d\.?n\.?)\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/i.exec(riga);
      if (trovato) {
        const [g, m, a] = trovato[1].split(/[/\-.]/);
        dataNascita = `${a}-${m.padStart(2, "0")}-${g.padStart(2, "0")}`;
      }
    }

    if (nome && dataNascita) break;
  }

  return {
    nome,
    dataNascita,
    // Mai alta. È una lettura di cortesia, e trattarla come un'identità
    // sarebbe l'errore più grave che questo modulo possa fare.
    confidenza: nome ? (dataNascita ? 0.8 : 0.6) : 0,
  };
}

function estraiLaboratorio(righe: string[], contenuto: ContenutoEstratto): string | null {
  for (const riga of righe.slice(0, 12)) {
    if (/\b(laboratorio|analisi cliniche|centro diagnostico|poliambulatorio|istituto|ospedale|casa di cura|clinica)\b/i.test(riga)) {
      const pulita = riga.replace(/\s+/g, " ").trim();
      if (pulita.length >= 4 && pulita.length <= 90) return pulita;
    }
  }

  // Il PDF può portarlo nei metadati, dove l'ha scritto il gestionale
  // che l'ha generato.
  const titolo = contenuto.metadati.titolo;
  if (titolo && /labor|analis|diagnost/i.test(titolo)) return titolo.slice(0, 90);

  return null;
}

/* ── Terapia ──────────────────────────────────────────────────────── */

const POSOLOGIA =
  /\b(\d+(?:[.,]\d+)?\s*(?:cp|compress[ae]|capsul[ae]|gocce|gtt|fiale?|bustin[ae]|ml|mg|g|mcg|µg|ui|u\.?i\.?)\b[^,;.]{0,40})/i;

const FORME_FARMACO =
  /\b(compress[ae]|capsul[ae]|bustin[ae]|fiale?|sciroppo|gocce|cerotto|spray|pomata|supposte)\b/i;

const PAROLE_INTEGRATORE =
  /\b(integrator|omega\s*-?3|magnesio|vitamina|probiotic|creatina|collagene|coenzima|melatonina|zinco|curcuma|multivitaminic)\b/i;

/**
 * I farmaci elencati nel documento.
 *
 * Deliberatamente conservativo: si riconosce una riga come terapia solo
 * quando ha una forma farmaceutica o una posologia. Un elenco di
 * principi attivi senza dosi in un referto è quasi sempre l'anamnesi
 * farmacologica di *qualcun altro* citata in un esempio, o l'elenco
 * degli esami che il farmaco interferisce.
 *
 * Il sistema **non prescrive e non modifica terapie**: qui si legge
 * quello che c'è scritto, e nient'altro.
 */
function estraiFarmaci(righe: string[]): Farmaco[] {
  const farmaci: Farmaco[] = [];
  let inSezione = false;

  for (const riga of righe) {
    if (/\b(terapia|terapia in atto|farmaci|posologia|prescrizione|trattamento in corso)\b\s*:?\s*$/i.test(riga)) {
      inSezione = true;
      continue;
    }
    if (/^\s*(esami|conclusioni|anamnesi|risultati|note)\b/i.test(riga)) inSezione = false;

    const posologia = POSOLOGIA.exec(riga);
    const forma = FORME_FARMACO.test(riga);
    if (!inSezione && !forma && !posologia) continue;
    if (PAROLE_INTEGRATORE.test(riga)) continue; // lo prende `estraiIntegratori`

    const nome = riga
      .replace(/^[\s\d.•·*-]+/, "")
      .split(/[,;(]|\s{2,}/)[0]
      .trim();

    if (nome.length < 3 || nome.length > 70) continue;
    if (!/[a-zA-Z]{3}/.test(nome)) continue;

    farmaci.push({
      nome,
      // Il principio attivo si distingue dal nome commerciale solo con
      // un prontuario, che questo modulo non ha. Dichiararlo ignoto è
      // più utile che indovinarlo.
      principio_attivo: null,
      dose: /(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ui|ml))/i.exec(riga)?.[1] ?? null,
      posologia: posologia?.[1]?.trim() ?? null,
      citazione: riga.slice(0, 200),
      confidenza: inSezione ? 0.7 : 0.5,
    });
  }

  return deduplicaPerNome(farmaci).slice(0, 40);
}

function estraiIntegratori(righe: string[]): Integratore[] {
  const integratori: Integratore[] = [];

  for (const riga of righe) {
    if (!PAROLE_INTEGRATORE.test(riga)) continue;
    // Una riga che è un esame di laboratorio non è un integratore:
    // "Vitamina D 18 ng/mL" è un risultato, non una prescrizione.
    if (UNITA_RICONOSCIUTE.test(riga) && !FORME_FARMACO.test(riga)) continue;

    const nome = riga
      .replace(/^[\s\d.•·*-]+/, "")
      .split(/[,;(]|\s{2,}/)[0]
      .trim();

    if (nome.length < 3 || nome.length > 70) continue;

    integratori.push({
      nome,
      dose: /(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ui|ml|gocce))/i.exec(riga)?.[1] ?? null,
      posologia: POSOLOGIA.exec(riga)?.[1]?.trim() ?? null,
      citazione: riga.slice(0, 200),
      confidenza: 0.6,
    });
  }

  return deduplicaPerNome(integratori).slice(0, 40);
}

function deduplicaPerNome<T extends { nome: string; confidenza: number }>(voci: T[]): T[] {
  const per = new Map<string, T>();
  for (const voce of voci) {
    const chiave = voce.nome.toLowerCase();
    const esistente = per.get(chiave);
    if (!esistente || voce.confidenza > esistente.confidenza) per.set(chiave, voce);
  }
  return [...per.values()];
}

/* ── Note cliniche ────────────────────────────────────────────────── */

const SEZIONI: readonly { tipo: NotaClinica["tipo"]; titolo: RegExp }[] = [
  { tipo: "conclusione", titolo: /^\s*(conclusioni|conclusione|giudizio|valutazione conclusiva|impressione diagnostica|referto)\b/i },
  { tipo: "rilievo", titolo: /^\s*(reperti|rilievi|descrizione|esame obiettivo|quadro)\b/i },
  { tipo: "anamnesi", titolo: /^\s*(anamnesi|storia clinica|antecedenti)\b/i },
  { tipo: "indicazione", titolo: /^\s*(si consiglia|indicazioni|raccomandazioni|follow[- ]?up|controllo)\b/i },
  { tipo: "diagnosi-riportata", titolo: /^\s*(diagnosi|quesito diagnostico|ipotesi diagnostica)\b/i },
];

/**
 * Le parti di un referto che non sono numeri.
 *
 * Sono ciò che distingue un referto specialistico da una lista di
 * esami, e vanno conservate **testualmente**: il Brain le legge come
 * contesto, non le riscrive. Una conclusione diagnostica riassunta da
 * un modello è una diagnosi nuova, ed è esattamente ciò che questo
 * sistema non deve produrre.
 */
function estraiNote(contenuto: ContenutoEstratto): NotaClinica[] {
  const note: NotaClinica[] = [];
  const blocchi = contenuto.blocchi.length > 0
    ? contenuto.blocchi
    : contenuto.testo.split(/\r?\n/).map((testo) => ({ tipo: "paragrafo" as const, testo, pagina: null }));

  let sezione: NotaClinica["tipo"] | null = null;
  let accumulato: string[] = [];
  let pagina: number | null = null;

  const chiudi = () => {
    if (sezione && accumulato.length > 0) {
      const testo = accumulato.join(" ").replace(/\s+/g, " ").trim();
      if (testo.length >= 12) {
        note.push({ tipo: sezione, testo: testo.slice(0, 2000), pagina, confidenza: 0.8 });
      }
    }
    accumulato = [];
  };

  for (const blocco of blocchi) {
    const testo = blocco.testo.trim();
    if (testo.length === 0) continue;

    const trovata = SEZIONI.find((s) => s.titolo.test(testo));

    if (trovata) {
      chiudi();
      sezione = trovata.tipo;
      pagina = blocco.pagina;
      // Quando il titolo e il testo stanno sulla stessa riga —
      // "Conclusioni: quadro nella norma" — la parte dopo i due punti
      // è già contenuto.
      const dopoDuePunti = testo.split(/:\s*/).slice(1).join(": ").trim();
      if (dopoDuePunti.length > 0) accumulato.push(dopoDuePunti);
      continue;
    }

    if (!sezione) continue;

    // Una riga che è chiaramente un valore di laboratorio chiude la
    // sezione: siamo tornati nella tabella.
    if (UNITA_RICONOSCIUTE.test(testo) && /\d/.test(testo)) {
      chiudi();
      sezione = null;
      continue;
    }

    accumulato.push(testo);
    if (accumulato.join(" ").length > 2000) {
      chiudi();
      sezione = null;
    }
  }

  chiudi();
  return note.slice(0, 20);
}
