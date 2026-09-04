/**
 * L'impalcatura di un contenuto, senza modello linguistico.
 *
 * Qui va detto con precisione che cosa si ottiene e che cosa no, perché
 * la scrittura è l'unica cosa in cui un modello vince davvero: le parole
 * belle le trova lui, e nessun sistema a regole gliele porta via.
 *
 * Quello che il codice fa meglio è tutto il resto, ed è molto:
 *
 * - **la struttura**, che per ogni formato è sempre la stessa e la
 *   sbaglia solo chi la improvvisa;
 * - **i fatti**, presi dalla knowledge base nella versione in vigore e
 *   **citati**, non riscritti — una parafrasi senza modello rischia di
 *   cambiare il significato, e su un contenuto sanitario il significato è
 *   tutto;
 * - **gli angoli che hanno funzionato**, presi dai contenuti veri invece
 *   che dall'intuizione;
 * - **i vincoli di brand**, applicati alla struttura invece che ricordati
 *   a voce;
 * - **cosa manca**, dichiarato riga per riga.
 *
 * Il risultato è una traccia con dentro le cose vere, non un post finito.
 * Chiamarlo copy sarebbe una bugia, e in un sistema che serve a decidere
 * le bugie costano più del lavoro che risparmiano.
 */

export type FormatoImpalcatura =
  | "carosello-instagram"
  | "reel"
  | "landing"
  | "campagna-meta"
  | "email"
  | "script-vendita"
  | "articolo"
  | "studio-in-contenuti";

export interface FattoConoscenza {
  slug: string;
  titolo: string;
  tipo: string;
  corpo: string;
  provenienza: string;
  daRiconfermare: boolean;
  dati: Record<string, unknown>;
}

export interface AngoloVincente {
  angolo: string;
  volte: number;
}

export interface GancioVincente {
  testo: string;
  formato: string;
  lead: number;
}

export interface BloccoImpalcatura {
  ruolo: string;
  /** Testo già utilizzabile, quando viene da un fatto. Null se va scritto. */
  testo: string | null;
  /** Cosa deve metterci una persona. Null se il blocco è già pieno. */
  daScrivere: string | null;
  /** Indicazione di produzione o di struttura. */
  nota: string | null;
}

export interface Impalcatura {
  titolo: string;
  blocchi: BloccoImpalcatura[];
  callToAction: string;
  ganciSuggeriti: string[];
  vincoli: string[];
  fonti: { slug: string; usata_per: string }[];
  avvertenze: string[];
}

/* ── Leggere i fatti dalla knowledge base ─────────────────────────── */

/**
 * I paragrafi con l'etichetta in grassetto, come sono scritti in
 * knowledge base: `**Mission.** Rendere misurabile…`.
 *
 * Si estrae la coppia etichetta/testo e si cita testualmente. Non si
 * riassume: riassumere senza capire è il modo più rapido per far dire a
 * una clinica una cosa che non ha detto.
 */
export function paragrafiEtichettati(corpo: string): { etichetta: string; testo: string }[] {
  const risultato: { etichetta: string; testo: string }[] = [];

  for (const blocco of corpo.split(/\n{2,}/)) {
    const trovato = blocco.match(/^\*\*(.+?)\.?\*\*\s*(.+)$/s);
    if (trovato) {
      risultato.push({
        etichetta: trovato[1].trim(),
        testo: trovato[2].replace(/\s+/g, " ").trim(),
      });
    }
  }

  return risultato;
}

/** Le voci di un elenco puntato, come compaiono nelle FAQ e nei listini. */
export function vociElenco(corpo: string): string[] {
  return corpo
    .split(/\r?\n/)
    .filter((r) => /^[-·•*]\s+/.test(r.trim()))
    .map((r) => r.trim().replace(/^[-·•*]\s+/, ""))
    .filter((r) => r.length > 0);
}

/** Le domande e risposte di una voce FAQ, scritte come `**Domanda?** Risposta`. */
export function domandeRisposte(corpo: string): { domanda: string; risposta: string }[] {
  return paragrafiEtichettati(corpo)
    .filter((p) => p.etichetta.includes("?") || /^(serve|posso|il|in quanto|perché)/i.test(p.etichetta))
    .map((p) => ({ domanda: p.etichetta.replace(/\?*$/, "?"), risposta: p.testo }));
}

function fatto(fatti: readonly FattoConoscenza[], slug: string): FattoConoscenza | undefined {
  return fatti.find((f) => f.slug === slug);
}

/* ── I vincoli, per formato ───────────────────────────────────────── */

interface Forma {
  titolo: string;
  massimoCaratteri: number;
  vincoli: string[];
}

const FORME: Record<FormatoImpalcatura, Forma> = {
  "carosello-instagram": {
    titolo: "Carosello Instagram",
    massimoCaratteri: 1400,
    vincoli: [
      "Da sei a otto tavole: una sola idea per tavola.",
      "La prima tavola deve reggere da sola, senza le altre.",
      "Una sola call to action, sull'ultima tavola.",
    ],
  },
  reel: {
    titolo: "Script per reel",
    massimoCaratteri: 900,
    vincoli: [
      "Venti-quaranta secondi: circa settanta parole.",
      "Il gancio sta nei primi tre secondi, e non è una presentazione.",
      "Tre punti al massimo, poi si chiude.",
    ],
  },
  landing: {
    titolo: "Landing page",
    massimoCaratteri: 4000,
    vincoli: [
      "Una sola call to action, ripetuta.",
      "Le obiezioni si affrontano nella pagina, non dopo la telefonata.",
      "Nessun modulo prima che sia chiaro cosa si ottiene.",
    ],
  },
  "campagna-meta": {
    titolo: "Campagna Meta",
    massimoCaratteri: 2000,
    vincoli: [
      "Tre angoli diversi, non tre varianti dello stesso.",
      "Ogni angolo ha un suo gancio e la stessa call to action.",
      "Nessun claim che il brand book vieta: la revisione della piattaforma è l'ultimo dei problemi.",
    ],
  },
  email: {
    titolo: "Email alla lista",
    massimoCaratteri: 1800,
    vincoli: [
      "Oggetto sotto i cinquanta caratteri.",
      "Una sola call to action.",
      "Niente in oggetto che riveli una condizione di salute: chi riceve potrebbe non essere solo davanti allo schermo.",
    ],
  },
  "script-vendita": {
    titolo: "Script per la telefonata",
    massimoCaratteri: 2500,
    vincoli: [
      "Prima si ascolta, poi si propone.",
      "Le obiezioni vere sono quelle che tornano: stanno nelle FAQ.",
      "Nessuna promessa clinica al telefono, come in nessun altro posto.",
    ],
  },
  articolo: {
    titolo: "Articolo per il sito",
    massimoCaratteri: 8000,
    vincoli: [
      "Ogni affermazione scientifica porta una fonte citabile.",
      "Il titolo dice cosa impara chi legge, non cosa fa la clinica.",
    ],
  },
  "studio-in-contenuti": {
    titolo: "Uno studio in cinque contenuti",
    massimoCaratteri: 3000,
    vincoli: [
      "Lo studio si cita sempre: rivista, anno, autori.",
      "Un contenuto per ogni idea dello studio, non cinque modi di dire la stessa cosa.",
      "Ciò che lo studio non dimostra non si scrive.",
    ],
  },
};

/* ── L'impalcatura ────────────────────────────────────────────────── */

export function costruisciImpalcatura(input: {
  formato: FormatoImpalcatura;
  brief: string;
  fatti: readonly FattoConoscenza[];
  angoli: readonly AngoloVincente[];
  ganci: readonly GancioVincente[];
}): Impalcatura {
  const forma = FORME[input.formato];
  const identita = fatto(input.fatti, "brand-identita");
  const servizio = input.fatti.find((f) => f.tipo === "servizio");
  const faq = input.fatti.find((f) => f.tipo === "faq");
  const listino = fatto(input.fatti, "listino-servizi");

  const blocchi: BloccoImpalcatura[] = [];
  const fonti: { slug: string; usata_per: string }[] = [];
  const avvertenze: string[] = [];

  /* ── Il gancio ─────────────────────────────────────────────── */
  const ganciOrdinati = [...input.ganci].sort((a, b) => b.lead - a.lead);

  blocchi.push({
    ruolo: "gancio",
    testo: null,
    daScrivere:
      "Una frase che nomini il problema di chi legge, non il servizio. " +
      (ganciOrdinati.length > 0
        ? `I ganci che hanno portato più persone finora: "${ganciOrdinati[0].testo}".`
        : "Non ho ganci passati da cui partire: nessun contenuto registrato ha ancora portato lead."),
    nota:
      input.angoli.length > 0
        ? `Fra i contenuti migliori ricorre l'angolo "${input.angoli[0].angolo}".`
        : null,
  });

  /* ── Il corpo, dai fatti ───────────────────────────────────── */
  if (servizio) {
    const paragrafi = paragrafiEtichettati(servizio.corpo);
    fonti.push({ slug: servizio.slug, usata_per: "descrizione del servizio" });

    for (const paragrafo of paragrafi.slice(0, 3)) {
      blocchi.push({
        ruolo: paragrafo.etichetta.toLowerCase(),
        // Citato, non riscritto: è la knowledge base a dirlo così.
        testo: paragrafo.testo,
        daScrivere: "Accorcia mantenendo il senso. Non aggiungere ciò che non c'è.",
        nota: `Da ${servizio.slug} — ${servizio.provenienza}`,
      });
    }

    const cosaNonE = paragrafi.find((p) => /non è|cosa non/i.test(p.etichetta));
    if (cosaNonE) {
      blocchi.push({
        ruolo: "il limite dichiarato",
        testo: cosaNonE.testo,
        daScrivere: null,
        nota:
          "Questo blocco non si toglie. È ciò che distingue una misura da una promessa, e regge tutto il resto.",
      });
    } else {
      avvertenze.push(
        "La voce di servizio non dichiara cosa il servizio non è: un contenuto sanitario senza quel limite è più fragile di quanto sembri.",
      );
    }
  } else {
    blocchi.push({
      ruolo: "corpo",
      testo: null,
      daScrivere:
        "Non trovo una voce di servizio in knowledge base per questo argomento. Scrivila lì prima: un contenuto che dice cose non ancora scritte è un contenuto che nessuno può verificare.",
      nota: null,
    });
    avvertenze.push("Nessun fatto disponibile: l'impalcatura è vuota nella parte che conta.");
  }

  /* ── Obiezioni, dalle FAQ vere ─────────────────────────────── */
  if (faq && ["landing", "script-vendita", "campagna-meta"].includes(input.formato)) {
    const coppie = domandeRisposte(faq.corpo);
    if (coppie.length > 0) {
      fonti.push({ slug: faq.slug, usata_per: "obiezioni e risposte" });
      for (const coppia of coppie.slice(0, 4)) {
        blocchi.push({
          ruolo: `obiezione — ${coppia.domanda}`,
          testo: coppia.risposta,
          daScrivere: null,
          nota: `Da ${faq.slug}: sono le domande che arrivano davvero.`,
        });
      }
    }
  }

  /* ── Il prezzo, solo se è in listino ───────────────────────── */
  const prezzi = (listino?.dati.prezzi_cents ?? {}) as Record<string, number>;
  if (["landing", "campagna-meta", "email"].includes(input.formato)) {
    if (Object.keys(prezzi).length > 0) {
      fonti.push({ slug: "listino-servizi", usata_per: "prezzo" });
      blocchi.push({
        ruolo: "prezzo",
        testo: null,
        daScrivere:
          "Se il prezzo compare, deve essere quello del listino in vigore. Nessun'altra cifra.",
        nota: `Listino: ${listino?.provenienza ?? "in vigore"}`,
      });
    } else {
      blocchi.push({
        ruolo: "prezzo",
        testo: null,
        daScrivere:
          "Non ho un listino leggibile: non scrivere cifre, rimanda alla segreteria.",
        nota: null,
      });
    }
  }

  /* ── Chiusura ──────────────────────────────────────────────── */
  blocchi.push({
    ruolo: "chiusura",
    testo: null,
    daScrivere: "Un passo concreto e uno solo. Niente riassunti di ciò che si è appena letto.",
    nota: null,
  });

  /* ── Vincoli e avvertenze ──────────────────────────────────── */
  const vincoli = [...forma.vincoli];

  if (identita) {
    const tono = paragrafiEtichettati(identita.corpo).find((p) => /tono di voce/i.test(p.etichetta));
    if (tono) {
      vincoli.push(`Tono di voce: ${tono.testo}`);
      fonti.push({ slug: identita.slug, usata_per: "tono di voce" });
    }

    const vietati = paragrafiEtichettati(identita.corpo).find((p) => /non diciamo|vietat/i.test(p.etichetta));
    if (vietati) vincoli.push(`Da non scrivere mai: ${vietati.testo}`);
  } else {
    avvertenze.push(
      "Manca la voce di identità del brand: senza, il tono di voce non è verificabile.",
    );
  }

  for (const f of input.fatti.filter((x) => x.daRiconfermare)) {
    avvertenze.push(
      `"${f.titolo}" non viene riconfermata da tempo (${f.provenienza}): prima di costruirci sopra un contenuto, verifica che valga ancora.`,
    );
  }

  avvertenze.push(
    "Ogni affermazione che sfiora la salute va riletta da un medico prima della pubblicazione.",
  );

  return {
    titolo: `${forma.titolo} — ${input.brief.slice(0, 60)}`,
    blocchi,
    callToAction:
      input.formato === "script-vendita"
        ? "Proposta di appuntamento, una sola."
        : "Prenota il tuo Longevity Score.",
    ganciSuggeriti: ganciOrdinati.slice(0, 3).map((g) => g.testo),
    vincoli,
    fonti,
    avvertenze,
  };
}

/** Il tetto di caratteri del formato, per il controllo di conformità. */
export function massimoCaratteri(formato: FormatoImpalcatura): number {
  return FORME[formato].massimoCaratteri;
}
