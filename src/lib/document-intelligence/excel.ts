import { Contenitore, sembraCfb } from "./cfb.ts";
import { numeroDaCella } from "./tabelle.ts";
import type { Blocco, Cella, ContenutoEstratto, Tabella } from "./tipi.ts";
import { Archivio } from "./zip.ts";
import { attributo, figli, leggiXml, testoDi, tutti, type Nodo } from "./xml.ts";

/**
 * Leggere un foglio di calcolo.
 *
 * Un Excel è il documento più facile da leggere e il più facile da
 * leggere **male**. Facile perché la struttura è dichiarata: fogli,
 * righe, celle, nessuna geometria da indovinare. Difficile perché quello
 * che sta scritto in una cella non è quello che si vede:
 *
 *   Il testo non è nella cella. Sta in una tabella condivisa, e la cella
 *   contiene un indice. Chi legge il valore grezzo trova "17".
 *
 *   Le date sono numeri. "12/03/2026" è 46094 giorni dal 1900, e solo il
 *   formato applicato alla cella dice che vanno letti come una data.
 *   Chi lo ignora scrive in cartella una glicemia di 46094.
 *
 *   Le formule hanno due facce: la formula e il suo ultimo risultato. Su
 *   un referto conta il risultato — è il numero che il laboratorio ha
 *   stampato — ma la formula va conservata, perché dice come è nato.
 *
 * Ognuno di questi tre punti, sbagliato, produce un numero plausibile e
 * falso. È il motivo per cui questo file è più lungo di quanto un foglio
 * di calcolo sembri meritare.
 */

/* ── XLSX ─────────────────────────────────────────────────────────── */

/** Il riferimento di una cella — "BC12" — in indici a base zero. */
function coordinate(riferimento: string): { riga: number; colonna: number } | null {
  const trovato = /^([A-Z]+)(\d+)$/.exec(riferimento.trim().toUpperCase());
  if (!trovato) return null;

  let colonna = 0;
  for (const lettera of trovato[1]) {
    colonna = colonna * 26 + (lettera.charCodeAt(0) - 64);
  }

  return { riga: Number(trovato[2]) - 1, colonna: colonna - 1 };
}

/**
 * Le stringhe condivise.
 *
 * Una cella con del testo dentro un `.xlsx` non contiene il testo:
 * contiene la sua posizione in questa tabella. Il testo può essere
 * spezzato in più frammenti quando ha formattazioni diverse — "Vitamina
 * **D**" — e vanno riuniti senza separatore, perché sono una parola sola.
 */
function stringheCondivise(archivio: Archivio): string[] {
  const grezzo = archivio.testo("xl/sharedStrings.xml");
  if (!grezzo) return [];

  const albero = leggiXml(grezzo);

  return tutti(albero, "si").map((si) => {
    // `rPh` è la lettura fonetica giapponese: è testo, ma non è il testo
    // della cella, e includerlo raddoppierebbe ogni valore.
    const pezzi = tutti(si, "t")
      .filter((t) => !dentroA(si, t, "rPh"))
      .map((t) => t.testo);
    return pezzi.join("");
  });
}

/** Vero se `cercato` sta dentro un discendente di `radice` chiamato `locale`. */
function dentroA(radice: Nodo, cercato: Nodo, locale: string): boolean {
  for (const contenitore of tutti(radice, locale)) {
    if (tutti(contenitore, cercato.locale).includes(cercato)) return true;
  }
  return false;
}

/**
 * Quali formati numerici sono date.
 *
 * I formati da 14 a 22 e da 45 a 47 sono date e orari predefiniti, uguali
 * in ogni installazione di Excel. Gli altri sono personalizzati, e li si
 * riconosce dal codice: se contiene `y`, `m` con `d`, o `h` con `s`, la
 * cella si legge come una data.
 */
function formatiData(archivio: Archivio): Set<number> {
  const date = new Set<number>([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

  const grezzo = archivio.testo("xl/styles.xml");
  if (!grezzo) return date;

  const albero = leggiXml(grezzo);

  // I formati personalizzati, dichiarati con il loro codice.
  const personalizzati = new Map<number, string>();
  for (const nodo of tutti(albero, "numFmt")) {
    const id = Number(attributo(nodo, "numFmtId") ?? "");
    const codice = attributo(nodo, "formatCode") ?? "";
    if (Number.isFinite(id)) personalizzati.set(id, codice);
  }

  for (const [id, codice] of personalizzati) {
    // Toglie il testo fra virgolette e i colori fra parentesi quadre:
    // `"kg"` non è un mese, e `[Red]` non è un giorno.
    const pulito = codice.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (/y/i.test(pulito) || (/d/i.test(pulito) && /m/i.test(pulito)) || /h.*s/i.test(pulito)) {
      date.add(id);
    }
  }

  // La corrispondenza fra stile della cella e formato numerico.
  const cellXfs = tutti(albero, "cellXfs")[0];
  const stiliData = new Set<number>();

  if (cellXfs) {
    figli(cellXfs, "xf").forEach((xf, indice) => {
      const id = Number(attributo(xf, "numFmtId") ?? "0");
      if (date.has(id)) stiliData.add(indice);
    });
  }

  return stiliData;
}

/**
 * Il numero seriale di Excel, tradotto in data.
 *
 * Excel conta i giorni dal 1° gennaio 1900 e crede che il 1900 sia
 * bisestile: non lo era. L'errore è dentro il formato da quarant'anni e
 * non lo correggeranno mai, quindi lo si riproduce — sottraendo due
 * giorni invece di uno — o tutte le date sbagliano di ventiquattro ore.
 */
function dataDaSeriale(seriale: number): string | null {
  if (!Number.isFinite(seriale) || seriale < 1 || seriale > 2_958_465) return null;

  const millisecondi = (seriale - 25569) * 86_400_000;
  const data = new Date(Math.round(millisecondi));
  if (Number.isNaN(data.getTime())) return null;

  return data.toISOString().slice(0, 10);
}

/** Il contenuto di un foglio: una griglia di testo già risolto. */
function leggiFoglio(
  xml: string,
  stringhe: string[],
  stiliData: Set<number>,
): { griglia: string[][]; formule: Map<string, string> } {
  const albero = leggiXml(xml);
  const griglia: string[][] = [];
  const formule = new Map<string, string>();

  for (const riga of tutti(albero, "row")) {
    const numeroRiga = Number(attributo(riga, "r") ?? "0") - 1;

    for (const cella of figli(riga, "c")) {
      const riferimento = attributo(cella, "r") ?? "";
      const posizione = coordinate(riferimento);
      const r = posizione?.riga ?? numeroRiga;
      const c = posizione?.colonna ?? 0;
      if (r < 0 || c < 0 || r > 1_048_575 || c > 16_383) continue;

      const tipo = attributo(cella, "t") ?? "n";
      const stile = Number(attributo(cella, "s") ?? "-1");

      // La formula si conserva a parte: il valore che conta è il suo
      // risultato, ma sapere che un numero è calcolato cambia quanto ci
      // si fida di ciò che il documento afferma.
      const nodoFormula = figli(cella, "f")[0];
      if (nodoFormula) {
        const testo = testoDi(nodoFormula).trim();
        if (testo) formule.set(riferimento, `=${testo}`);
      }

      let valore = "";

      if (tipo === "s") {
        // Indice nella tabella condivisa.
        const indice = Number(testoDi(figli(cella, "v")[0] ?? cella).trim());
        valore = Number.isFinite(indice) ? (stringhe[indice] ?? "") : "";
      } else if (tipo === "inlineStr") {
        const nodo = figli(cella, "is")[0];
        valore = nodo ? tutti(nodo, "t").map((t) => t.testo).join("") : "";
      } else if (tipo === "b") {
        valore = testoDi(figli(cella, "v")[0] ?? cella).trim() === "1" ? "VERO" : "FALSO";
      } else if (tipo === "e") {
        // Una formula in errore: `#DIV/0!`. Si riporta com'è — dire che
        // la cella è vuota nasconderebbe che il foglio ha un problema.
        valore = testoDi(figli(cella, "v")[0] ?? cella).trim();
      } else {
        const grezzo = testoDi(figli(cella, "v")[0] ?? cella).trim();
        if (grezzo && stiliData.has(stile)) {
          valore = dataDaSeriale(Number(grezzo)) ?? grezzo;
        } else {
          valore = grezzo;
        }
      }

      if (!griglia[r]) griglia[r] = [];
      griglia[r][c] = valore;
    }
  }

  // I buchi restano stringhe vuote e non `undefined`: una griglia con
  // buchi rompe qualunque cosa la percorra.
  const larghezza = Math.max(0, ...griglia.map((r) => (r ? r.length : 0)));
  const piena = Array.from({ length: griglia.length }, (_, i) =>
    Array.from({ length: larghezza }, (_, j) => griglia[i]?.[j] ?? ""),
  );

  return { griglia: piena, formule };
}

/** I fogli dichiarati nella cartella di lavoro, con il file che li contiene. */
function fogliDi(archivio: Archivio): { nome: string; percorso: string }[] {
  const workbook = archivio.testo("xl/workbook.xml");
  const relazioni = archivio.testo("xl/_rels/workbook.xml.rels");
  if (!workbook) return [];

  // Da id di relazione a percorso del file.
  const percorsi = new Map<string, string>();
  if (relazioni) {
    for (const nodo of tutti(leggiXml(relazioni), "Relationship")) {
      const id = attributo(nodo, "Id");
      const target = attributo(nodo, "Target");
      if (!id || !target) continue;
      const pulito = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
      percorsi.set(id, `xl/${pulito}`);
    }
  }

  const fogli: { nome: string; percorso: string }[] = [];

  tutti(leggiXml(workbook), "sheet").forEach((nodo, indice) => {
    const nome = attributo(nodo, "name") ?? `Foglio ${indice + 1}`;
    const id = attributo(nodo, "id"); // r:id
    const percorso = (id ? percorsi.get(id) : null) ?? `xl/worksheets/sheet${indice + 1}.xml`;
    if (archivio.ha(percorso)) fogli.push({ nome, percorso });
  });

  // Una cartella scritta da software non Microsoft può non dichiarare le
  // relazioni: allora si prendono i fogli così come stanno nell'archivio.
  if (fogli.length === 0) {
    for (const percorso of archivio.cerca((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
      fogli.push({ nome: percorso.replace(/^.*\/|\.xml$/g, ""), percorso });
    }
  }

  return fogli;
}

export function leggiXlsx(dati: Uint8Array): ContenutoEstratto {
  let archivio: Archivio;
  try {
    archivio = new Archivio(dati);
  } catch (errore) {
    return vuoto("xlsx", `Il file non è una cartella Excel valida: ${messaggio(errore)}`);
  }

  const stringhe = stringheCondivise(archivio);
  const stiliData = formatiData(archivio);
  const fogli = fogliDi(archivio);

  if (fogli.length === 0) {
    return vuoto("xlsx", "La cartella Excel non contiene fogli leggibili.");
  }

  const tabelle: Tabella[] = [];
  const blocchi: Blocco[] = [];
  const righeTesto: string[] = [];
  const metadati: Record<string, string> = { fogli: String(fogli.length) };
  let formuleTotali = 0;

  for (const foglio of fogli) {
    const xml = archivio.testo(foglio.percorso);
    if (!xml) continue;

    const { griglia, formule } = leggiFoglio(xml, stringhe, stiliData);
    formuleTotali += formule.size;

    const tabella = tabellaDaGriglia(griglia, "excel", foglio.nome);
    if (!tabella) continue;

    tabelle.push(tabella);

    // Il foglio entra anche nel testo: il lettore di referti lavora su
    // righe, e una riga di foglio è "Glicemia  102  mg/dL  70 - 100".
    blocchi.push({ tipo: "titolo", testo: foglio.nome, livello: 1, pagina: null });
    righeTesto.push(`— ${foglio.nome} —`);

    if (tabella.intestazioni.length > 0) {
      const riga = tabella.intestazioni.join("  ");
      righeTesto.push(riga);
      blocchi.push({ tipo: "riga-tabella", testo: riga, pagina: null });
    }

    for (const riga of tabella.righe) {
      const testo = riga.map((c) => c.testo).join("  ").replace(/\s+$/, "");
      if (!testo.trim()) continue;
      righeTesto.push(testo);
      blocchi.push({ tipo: "riga-tabella", testo, pagina: null });
    }
  }

  if (formuleTotali > 0) metadati.formule = String(formuleTotali);

  const testo = righeTesto.join("\n");

  return {
    formato: "xlsx",
    leggibile: testo.trim().length > 0,
    motivo: testo.trim().length > 0 ? undefined : "I fogli sono vuoti.",
    testo,
    blocchi,
    tabelle,
    pagine: fogli.length,
    via: "nativo",
    metadati,
    fiduciaTesto: 1,
  };
}

/* ── XLS (Excel 97-2003) ──────────────────────────────────────────── */

/**
 * Il formato binario: una sequenza di record.
 *
 * Ogni record è tipo, lunghezza, dati. Non serve capirli tutti — sono
 * centinaia — ma solo quelli che portano un valore: i numeri, le
 * stringhe, i risultati delle formule e i nomi dei fogli.
 */
const RECORD = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RK: 0x027e,
  MULRK: 0x00bd,
  NUMBER: 0x0203,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
  BLANK: 0x0201,
  MULBLANK: 0x00be,
} as const;

function u16(d: Uint8Array, i: number): number {
  return d[i] | (d[i + 1] << 8);
}

function u32(d: Uint8Array, i: number): number {
  return (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;
}

/**
 * Un numero in formato RK: la compressione dei numeri di Excel 97.
 *
 * Trenta bit invece di sessantaquattro, con due bit di flag: uno dice se
 * è un intero o i bit alti di un decimale, l'altro se va diviso per
 * cento. Serviva a risparmiare memoria nel 1997, e sopravvive nei file
 * che quei programmi ancora scrivono.
 */
function daRk(grezzo: number): number {
  let numero: number;

  if ((grezzo & 0x02) !== 0) {
    // Intero con segno su 30 bit.
    numero = grezzo >> 2;
  } else {
    // I 30 bit alti di un decimale a doppia precisione; i 34 bassi zero.
    const buffer = new ArrayBuffer(8);
    const vista = new DataView(buffer);
    vista.setUint32(4, grezzo & 0xffff_fffc, true);
    vista.setUint32(0, 0, true);
    numero = vista.getFloat64(0, true);
  }

  return (grezzo & 0x01) !== 0 ? numero / 100 : numero;
}

/** Le stringhe condivise di un `.xls`, con i record di continuazione. */
function sstDaRecord(pezzi: Uint8Array[]): string[] {
  if (pezzi.length === 0) return [];

  // I record CONTINUE proseguono il precedente, e una stringa può
  // spezzarsi a metà fra due: si concatena tutto e si legge di seguito.
  const totale = pezzi.reduce((n, p) => n + p.length, 0);
  const dati = new Uint8Array(totale);
  let scritti = 0;
  for (const pezzo of pezzi) {
    dati.set(pezzo, scritti);
    scritti += pezzo.length;
  }

  const quante = u32(dati, 4);
  const stringhe: string[] = [];
  let p = 8;

  for (let i = 0; i < quante && p + 3 <= dati.length; i += 1) {
    const lunghezza = u16(dati, p);
    const flag = dati[p + 2];
    p += 3;

    const larghe = (flag & 0x01) !== 0;
    const conFonetica = (flag & 0x04) !== 0;
    const conRicca = (flag & 0x08) !== 0;

    let saltaDopo = 0;
    if (conRicca) {
      saltaDopo += u16(dati, p) * 4;
      p += 2;
    }
    if (conFonetica) {
      saltaDopo += u32(dati, p);
      p += 4;
    }

    let testo = "";
    for (let k = 0; k < lunghezza; k += 1) {
      if (larghe) {
        if (p + 1 >= dati.length) break;
        testo += String.fromCharCode(u16(dati, p));
        p += 2;
      } else {
        if (p >= dati.length) break;
        testo += String.fromCharCode(dati[p]);
        p += 1;
      }
    }

    p += saltaDopo;
    stringhe.push(testo);
  }

  return stringhe;
}

export function leggiXls(dati: Uint8Array): ContenutoEstratto {
  if (!sembraCfb(dati)) return vuoto("xls", "Il file non è una cartella Excel 97-2003.");

  let flusso: Uint8Array | null;
  try {
    const contenitore = new Contenitore(dati);
    flusso = contenitore.flusso("Workbook") ?? contenitore.flusso("Book");
  } catch (errore) {
    return vuoto("xls", `Cartella Excel 97-2003 non leggibile: ${messaggio(errore)}`);
  }

  if (!flusso) return vuoto("xls", "Manca il flusso della cartella di lavoro.");

  // ── Primo giro: le stringhe condivise e i nomi dei fogli ────────
  const pezziSst: Uint8Array[] = [];
  const nomiFogli: string[] = [];
  let inSst = false;

  for (let p = 0; p + 4 <= flusso.length; ) {
    const tipo = u16(flusso, p);
    const lunghezza = u16(flusso, p + 2);
    const corpo = flusso.subarray(p + 4, p + 4 + lunghezza);
    p += 4 + lunghezza;

    if (tipo === RECORD.SST) {
      pezziSst.length = 0;
      pezziSst.push(corpo);
      inSst = true;
      continue;
    }

    if (tipo === RECORD.CONTINUE && inSst) {
      pezziSst.push(corpo);
      continue;
    }

    inSst = false;

    if (tipo === RECORD.BOUNDSHEET && corpo.length > 7) {
      const lunghezzaNome = corpo[6];
      const larghe = (corpo[7] & 0x01) !== 0;
      let nome = "";
      for (let k = 0; k < lunghezzaNome; k += 1) {
        nome += larghe
          ? String.fromCharCode(u16(corpo, 8 + k * 2))
          : String.fromCharCode(corpo[8 + k]);
      }
      nomiFogli.push(nome);
    }
  }

  const stringhe = sstDaRecord(pezziSst);

  // ── Secondo giro: le celle ──────────────────────────────────────
  // I record di cella non dicono a quale foglio appartengono: lo dice la
  // posizione fra un BOF e l'EOF che lo chiude. Si contano i BOF di tipo
  // foglio di lavoro per sapere dove si è.
  const fogli: string[][][] = [];
  let corrente: string[][] | null = null;
  let indiceFoglio = -1;

  const scrivi = (riga: number, colonna: number, valore: string) => {
    if (!corrente || riga < 0 || colonna < 0 || riga > 65_535 || colonna > 255) return;
    if (!corrente[riga]) corrente[riga] = [];
    corrente[riga][colonna] = valore;
  };

  // L'ultimo FORMULA visto: se il suo risultato è una stringa, arriva nel
  // record STRING immediatamente successivo.
  let ultimaFormula: { riga: number; colonna: number } | null = null;

  for (let p = 0; p + 4 <= flusso.length; ) {
    const tipo = u16(flusso, p);
    const lunghezza = u16(flusso, p + 2);
    const corpo = flusso.subarray(p + 4, p + 4 + lunghezza);
    p += 4 + lunghezza;

    if (tipo === RECORD.BOF && corpo.length >= 4) {
      // 0x0010 = foglio di lavoro. 0x0005 è la cartella stessa.
      if (u16(corpo, 2) === 0x0010) {
        indiceFoglio += 1;
        corrente = [];
        fogli[indiceFoglio] = corrente;
      }
      continue;
    }

    if (tipo === RECORD.EOF) {
      corrente = null;
      continue;
    }

    if (!corrente || corpo.length < 4) continue;

    const riga = u16(corpo, 0);
    const colonna = u16(corpo, 2);

    switch (tipo) {
      case RECORD.LABELSST: {
        const indice = u32(corpo, 6);
        scrivi(riga, colonna, stringhe[indice] ?? "");
        break;
      }
      case RECORD.LABEL: {
        const lunghezzaTesto = u16(corpo, 6);
        const larghe = (corpo[8] & 0x01) !== 0;
        let testo = "";
        for (let k = 0; k < lunghezzaTesto; k += 1) {
          testo += larghe
            ? String.fromCharCode(u16(corpo, 9 + k * 2))
            : String.fromCharCode(corpo[9 + k]);
        }
        scrivi(riga, colonna, testo);
        break;
      }
      case RECORD.RK: {
        scrivi(riga, colonna, formattaNumero(daRk(u32(corpo, 6))));
        break;
      }
      case RECORD.MULRK: {
        // Una sequenza di celle contigue sulla stessa riga.
        const ultima = u16(corpo, corpo.length - 2);
        for (let c = colonna, off = 4; c <= ultima && off + 6 <= corpo.length; c += 1, off += 6) {
          scrivi(riga, c, formattaNumero(daRk(u32(corpo, off + 2))));
        }
        break;
      }
      case RECORD.NUMBER: {
        const vista = new DataView(corpo.buffer, corpo.byteOffset + 6, 8);
        scrivi(riga, colonna, formattaNumero(vista.getFloat64(0, true)));
        break;
      }
      case RECORD.FORMULA: {
        // I byte 6-13 sono il risultato memorizzato. Quando i due byte
        // finali sono 0xFFFF il risultato non è un numero: è una
        // stringa, un booleano o un errore, e arriva altrove.
        if (corpo.length >= 14 && u16(corpo, 12) === 0xffff) {
          ultimaFormula = { riga, colonna };
        } else if (corpo.length >= 14) {
          const vista = new DataView(corpo.buffer, corpo.byteOffset + 6, 8);
          scrivi(riga, colonna, formattaNumero(vista.getFloat64(0, true)));
        }
        break;
      }
      case RECORD.STRING: {
        if (ultimaFormula && corpo.length >= 3) {
          const lunghezzaTesto = u16(corpo, 0);
          const larghe = (corpo[2] & 0x01) !== 0;
          let testo = "";
          for (let k = 0; k < lunghezzaTesto; k += 1) {
            testo += larghe
              ? String.fromCharCode(u16(corpo, 3 + k * 2))
              : String.fromCharCode(corpo[3 + k]);
          }
          scrivi(ultimaFormula.riga, ultimaFormula.colonna, testo);
          ultimaFormula = null;
        }
        break;
      }
      default:
        break;
    }
  }

  // ── Composizione ────────────────────────────────────────────────
  const tabelle: Tabella[] = [];
  const blocchi: Blocco[] = [];
  const righeTesto: string[] = [];

  fogli.forEach((griglia, indice) => {
    const nome = nomiFogli[indice] ?? `Foglio ${indice + 1}`;
    const larghezza = Math.max(0, ...griglia.map((r) => (r ? r.length : 0)));
    const piena = Array.from({ length: griglia.length }, (_, i) =>
      Array.from({ length: larghezza }, (_, j) => griglia[i]?.[j] ?? ""),
    );

    const tabella = tabellaDaGriglia(piena, "excel", nome);
    if (!tabella) return;

    tabelle.push(tabella);
    blocchi.push({ tipo: "titolo", testo: nome, livello: 1, pagina: null });
    righeTesto.push(`— ${nome} —`);

    if (tabella.intestazioni.length > 0) righeTesto.push(tabella.intestazioni.join("  "));
    for (const riga of tabella.righe) {
      const testo = riga.map((c) => c.testo).join("  ").replace(/\s+$/, "");
      if (!testo.trim()) continue;
      righeTesto.push(testo);
      blocchi.push({ tipo: "riga-tabella", testo, pagina: null });
    }
  });

  const testo = righeTesto.join("\n");

  return {
    formato: "xls",
    leggibile: testo.trim().length > 0,
    motivo:
      testo.trim().length > 0
        ? undefined
        : "Non sono riuscito a leggere le celle di questa cartella Excel 97-2003. Riesportala in .xlsx.",
    testo,
    blocchi,
    tabelle,
    pagine: Math.max(1, tabelle.length),
    via: "nativo",
    metadati: { fogli: String(Math.max(nomiFogli.length, tabelle.length)) },
    // Il formato antico non porta i formati numerici in modo affidabile:
    // una data può arrivare come numero seriale, e va guardata.
    fiduciaTesto: 0.9,
  };
}

/**
 * Un numero, scritto come lo scriverebbe una persona.
 *
 * Senza questo, un valore di 5,4 arriverebbe come "5.4000000000000004":
 * i decimali che il formato binario porta con sé sono rumore, non
 * precisione, e su un referto sembrerebbero una misura di laboratorio
 * fatta con dieci cifre significative.
 */
function formattaNumero(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(10)));
}

/* ── CSV ──────────────────────────────────────────────────────────── */

/**
 * Il separatore di un CSV, dedotto invece che assunto.
 *
 * In Italia Excel esporta con il punto e virgola, perché la virgola è
 * già il separatore decimale. Assumere la virgola su un file italiano
 * significa leggere una colonna sola con dentro tutto.
 */
function separatoreDi(prime: string[]): string {
  const candidati = [";", ",", "\t", "|"];
  let migliore = ",";
  let punteggio = 0;

  for (const candidato of candidati) {
    const conteggi = prime.map((r) => contaFuori(r, candidato));
    if (conteggi.length === 0 || conteggi[0] === 0) continue;
    // Regolare e frequente: tutte le righe con lo stesso numero di
    // separatori, e più separatori è meglio.
    const regolare = conteggi.every((c) => c === conteggi[0]);
    const valore = conteggi[0] * (regolare ? 2 : 1);
    if (valore > punteggio) { punteggio = valore; migliore = candidato; }
  }

  return migliore;
}

function contaFuori(riga: string, separatore: string): number {
  let dentro = false;
  let n = 0;
  for (const c of riga) {
    if (c === '"') dentro = !dentro;
    else if (c === separatore && !dentro) n += 1;
  }
  return n;
}

/**
 * Legge un CSV secondo le regole che i file veri rispettano.
 *
 * Le virgolette proteggono il separatore e gli a capo; due virgolette di
 * fila dentro un campo protetto sono una virgoletta. È lo standard, ed è
 * anche ciò che Excel produce.
 */
export function leggiCsv(dati: Uint8Array): ContenutoEstratto {
  // Il BOM lo scrive Excel per dichiarare l'UTF-8: va tolto, o la prima
  // intestazione comincia con un carattere invisibile e non combacia
  // più con niente.
  let sorgente = new TextDecoder("utf-8").decode(dati);
  if (sorgente.charCodeAt(0) === 0xfeff) sorgente = sorgente.slice(1);

  if (sorgente.trim().length === 0) return vuoto("csv", "Il file è vuoto.");

  const separatore = separatoreDi(sorgente.split(/\r?\n/).slice(0, 5));
  const griglia: string[][] = [];
  let riga: string[] = [];
  let campo = "";
  let protetto = false;

  for (let i = 0; i < sorgente.length; i += 1) {
    const c = sorgente[i];

    if (protetto) {
      if (c === '"') {
        if (sorgente[i + 1] === '"') { campo += '"'; i += 1; }
        else protetto = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { protetto = true; continue; }
    if (c === separatore) { riga.push(campo); campo = ""; continue; }

    if (c === "\n" || c === "\r") {
      if (c === "\r" && sorgente[i + 1] === "\n") i += 1;
      riga.push(campo);
      campo = "";
      if (riga.some((v) => v.trim().length > 0)) griglia.push(riga);
      riga = [];
      continue;
    }

    campo += c;
  }

  riga.push(campo);
  if (riga.some((v) => v.trim().length > 0)) griglia.push(riga);

  const larghezza = Math.max(0, ...griglia.map((r) => r.length));
  const piena = griglia.map((r) =>
    Array.from({ length: larghezza }, (_, i) => (r[i] ?? "").trim()),
  );

  const tabella = tabellaDaGriglia(piena, "csv", null);
  const righeTesto = piena.map((r) => r.join("  ").replace(/\s+$/, "")).filter((r) => r.trim());
  const testo = righeTesto.join("\n");

  return {
    formato: "csv",
    leggibile: testo.trim().length > 0,
    motivo: testo.trim().length > 0 ? undefined : "Il file non contiene righe leggibili.",
    testo,
    blocchi: righeTesto.map((t) => ({ tipo: "riga-tabella" as const, testo: t, pagina: null })),
    tabelle: tabella ? [tabella] : [],
    pagine: 1,
    via: "nativo",
    metadati: { separatore: separatore === "\t" ? "tabulazione" : separatore },
    fiduciaTesto: 1,
  };
}

/* ── Servizio ─────────────────────────────────────────────────────── */

/**
 * Una griglia di testo diventa una tabella.
 *
 * Le righe e le colonne del tutto vuote si tolgono: un foglio di calcolo
 * ha quasi sempre una riga bianca sotto l'intestazione, e tenerla
 * significherebbe cercare valori dentro il nulla.
 */
export function tabellaDaGriglia(
  griglia: string[][],
  origine: Tabella["origine"],
  nome: string | null,
): Tabella | null {
  const righeUtili = griglia.filter((r) => r.some((c) => c.trim().length > 0));
  if (righeUtili.length === 0) return null;

  const larghezza = Math.max(...righeUtili.map((r) => r.length));
  const colonneUtili: number[] = [];
  for (let c = 0; c < larghezza; c += 1) {
    if (righeUtili.some((r) => (r[c] ?? "").trim().length > 0)) colonneUtili.push(c);
  }
  if (colonneUtili.length === 0) return null;

  const celle: Cella[][] = righeUtili.map((r) =>
    colonneUtili.map((c) => {
      const testo = (r[c] ?? "").trim();
      return { testo, numero: numeroDaCella(testo) };
    }),
  );

  const prima = celle[0];
  const eIntestazione =
    celle.length > 1 &&
    prima.every((c) => c.numero === null) &&
    prima.filter((c) => c.testo.length > 0).length >= 2;

  return {
    origine,
    nome,
    pagina: null,
    intestazioni: eIntestazione ? prima.map((c) => c.testo) : [],
    righe: eIntestazione ? celle.slice(1) : celle,
    // Un foglio di calcolo *è* una tabella: qui non si sta indovinando
    // niente, e la confidenza lo riflette.
    confidenza: eIntestazione ? 0.99 : 0.9,
  };
}

function messaggio(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}

function vuoto(formato: "xlsx" | "xls" | "csv", motivo: string): ContenutoEstratto {
  return {
    formato,
    leggibile: false,
    motivo,
    testo: "",
    blocchi: [],
    tabelle: [],
    pagine: 0,
    via: "nativo",
    metadati: {},
    fiduciaTesto: 0,
  };
}
