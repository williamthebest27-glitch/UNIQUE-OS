import "server-only";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { motoreConversazione } from "@/lib/brain/fornitore";
import { generaStrutturato, ollamaRaggiungibile } from "@/lib/brain/ollama";

/**
 * Il riconoscimento ottico, con i motori intercambiabili.
 *
 * Un referto scansionato è un'immagine di parole. Fino a oggi Unique lo
 * dichiarava e si fermava — «un referto letto male è peggio di un
 * referto non letto», ed era la scelta giusta finché non c'era modo di
 * leggerlo bene. Questo modulo apre quella porta senza rinunciare al
 * principio: **si legge, e si dichiara quanto ci si fida di ogni riga.**
 *
 * ---
 *
 * **Perché un registro di motori invece di una libreria sola.** Le tre
 * strade hanno costi diversi e nessuna vince sempre:
 *
 *   `modello` — un modello con la vista legge un referto meglio di
 *   qualunque OCR classico, perché capisce che una tabella è una
 *   tabella. Costa una chiamata, e con `UNIQUE_BRAIN=ollama` gira sul
 *   server della clinica senza che niente esca.
 *
 *   `tesseract` — riconoscimento locale puro, senza modelli e senza
 *   rete. È il ripiego quando nessun modello è acceso, ed è opzionale:
 *   se il pacchetto non è installato il motore si dichiara non
 *   disponibile invece di far fallire il caricamento.
 *
 *   `assente` — la verità di oggi in una installazione senza modelli.
 *   Non è un errore: è un esito, e va detto a chi ha caricato il file.
 *
 * Il resto della pipeline non sa quale abbia letto: riceve righe con una
 * fiducia, e decide di conseguenza.
 */

export type NomeMotoreOcr = "modello" | "tesseract" | "assente";

/** Una riga riconosciuta, con quanto il motore si fida di averla letta. */
export interface RigaOcr {
  testo: string;
  fiducia: number;
}

export interface RisultatoOcr {
  ok: boolean;
  motore: NomeMotoreOcr;
  righe: RigaOcr[];
  testo: string;
  /** Media pesata delle righe. Zero quando non si è letto niente. */
  fiducia: number;
  motivo?: string;
}

export interface RichiestaOcr {
  dati: Uint8Array;
  /** Il MIME dell'immagine, o `application/pdf` per una scansione. */
  mimeType: string;
  /** Il nome del file: entra nel prompt del modello, aiuta a contestualizzare. */
  nomeFile: string;
  /** Lingue attese, in codice ISO a tre lettere. */
  lingue?: string[];
}

interface MotoreOcr {
  nome: NomeMotoreOcr;
  /** Vero se questo motore può lavorare, adesso, in questa installazione. */
  disponibile: () => Promise<{ ok: boolean; motivo?: string }>;
  leggi: (richiesta: RichiestaOcr) => Promise<RisultatoOcr>;
}

/* ── Il motore a modello ──────────────────────────────────────────── */

/**
 * Lo schema che il modello deve rispettare.
 *
 * Una riga per riga del documento, ciascuna con la propria fiducia. Non
 * si chiede al modello di interpretare niente: solo di **trascrivere**.
 * L'interpretazione è il mestiere del resto del modulo, che è codice
 * deterministico e verificabile — e mescolare le due cose qui
 * significherebbe rinunciare a sapere quale delle due ha sbagliato.
 */
const TrascrizioneOcr = z.object({
  righe: z.array(
    z.object({
      testo: z
        .string()
        .describe(
          "La riga trascritta alla lettera. Le colonne separate da due spazi.",
        ),
      fiducia: z
        .number()
        .describe(
          "Da 0 a 1, quanto sei sicuro di aver letto correttamente questa riga. Onesta.",
        ),
    }),
  ),
});

const ISTRUZIONI_OCR = `Sei un sistema di riconoscimento ottico per documenti sanitari.

Il tuo unico compito è **trascrivere** ciò che vedi. Non interpretare, non
riassumere, non correggere, non riordinare.

Regole non negoziabili:
- Trascrivi riga per riga, nell'ordine in cui compaiono sulla pagina.
- Dove il documento ha colonne, separale con due spazi. Una tabella deve
  restare una tabella.
- Copia i numeri esattamente come li vedi, comprese virgole e punti.
- **Se un carattere non è leggibile, scrivi «?» al suo posto.** Non
  indovinare. Un "1?5" onesto vale infinitamente più di un "125"
  inventato: il primo verrà messo in revisione, il secondo entrerebbe in
  una cartella clinica come un fatto.
- La fiducia di una riga è una stima onesta della sua leggibilità. Una
  riga con un carattere incerto non può avere fiducia alta.
- Non aggiungere niente che non sia sulla pagina. Nessuna intestazione
  inventata, nessuna nota.`;

const motoreModello: MotoreOcr = {
  nome: "modello",

  async disponibile() {
    const motore = motoreConversazione();

    if (motore === "proprio") {
      return {
        ok: false,
        motivo:
          "Nessun modello acceso: con il solo motore proprietario un documento scansionato non si legge.",
      };
    }

    if (motore === "ollama") {
      const stato = await ollamaRaggiungibile();
      return stato.ok
        ? { ok: true }
        : { ok: false, motivo: stato.motivo ?? "Il modello locale non risponde." };
    }

    return { ok: true };
  },

  async leggi(richiesta) {
    const motore = motoreConversazione();
    const base64 = Buffer.from(richiesta.dati).toString("base64");

    if (motore === "ollama") {
      // Il modello locale legge le immagini se ne ha la vista. Un PDF
      // scansionato no: Ollama non apre PDF, e mandarglielo fallirebbe
      // con un messaggio che non spiega niente.
      if (richiesta.mimeType === "application/pdf") {
        return fallito(
          "modello",
          "Il modello locale non apre i PDF: per una scansione serve una foto o un'immagine della pagina.",
        );
      }

      const esito = await generaStrutturato({
        sistema: ISTRUZIONI_OCR,
        richiesta: `Trascrivi il documento «${richiesta.nomeFile}».`,
        schema: TrascrizioneOcr,
        immagini: [base64],
        timeoutMs: 240_000,
      });

      return componi("modello", esito.righe);
    }

    // ── Modello esterno ───────────────────────────────────────────
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

    const client = new Anthropic();

    const blocco =
      richiesta.mimeType === "application/pdf"
        ? ({
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: base64,
            },
          })
        : ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: richiesta.mimeType as
                | "image/png"
                | "image/jpeg"
                | "image/webp"
                | "image/gif",
              data: base64,
            },
          });

    const risposta = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: [
        {
          // Le istruzioni non cambiano fra un documento e l'altro.
          type: "text",
          text: ISTRUZIONI_OCR,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { format: zodOutputFormat(TrascrizioneOcr), effort: "high" },
      messages: [
        {
          role: "user",
          content: [
            blocco,
            { type: "text", text: `Trascrivi il documento «${richiesta.nomeFile}».` },
          ],
        },
      ],
    });

    if (risposta.stop_reason === "refusal") {
      return fallito("modello", "Il modello ha rifiutato di trascrivere il documento.");
    }

    if (!risposta.parsed_output) {
      return fallito("modello", "Il modello non ha restituito una trascrizione leggibile.");
    }

    return componi("modello", risposta.parsed_output.righe);
  },
};

/* ── Il motore locale ─────────────────────────────────────────────── */

/**
 * Tesseract, se è installato.
 *
 * È una dipendenza **opzionale**: non sta in `package.json` perché
 * porterebbe con sé una decina di megabyte e i dati di lingua, e la
 * maggior parte delle installazioni di Unique userà un modello. Chi la
 * vuole la installa e accende `UNIQUE_OCR=tesseract`; chi non la vuole
 * non se ne accorge.
 *
 * L'import è dentro un `try` e con un nome costruito a pezzi: senza,
 * il bundler di Next proverebbe a risolvere il pacchetto durante la
 * compilazione e fallirebbe il build di chi non ce l'ha.
 */
const motoreTesseract: MotoreOcr = {
  nome: "tesseract",

  async disponibile() {
    try {
      await caricaTesseract();
      return { ok: true };
    } catch {
      return {
        ok: false,
        motivo:
          "Il riconoscimento locale non è installato. Esegui «npm install tesseract.js» oppure accendi un modello.",
      };
    }
  },

  async leggi(richiesta) {
    if (richiesta.mimeType === "application/pdf") {
      return fallito(
        "tesseract",
        "Il riconoscimento locale legge immagini, non PDF. Esporta le pagine come immagini, oppure usa un modello.",
      );
    }

    let worker: WorkerTesseract | null = null;

    try {
      const tesseract = await caricaTesseract();
      const lingue = (richiesta.lingue ?? ["ita", "eng"]).join("+");

      /*
       * L'API a worker, e non la scorciatoia `recognize()`.
       *
       * La scorciatoia restituisce solo il testo intero e una
       * confidenza sola per tutta la pagina. Serve invece il dettaglio
       * per riga: su una scansione storta la prima metà del foglio si
       * legge benissimo e l'ultima riga no — ed è lì che sta il valore
       * che conta. `blocks: true` è l'unico modo di ottenerlo, e si può
       * chiedere solo da qui.
       */
      /*
       * I dati di lingua vanno in una cartella temporanea, non nella
       * radice del progetto.
       *
       * È il valore predefinito di tesseract.js: alla prima lettura
       * scarica `ita.traineddata` e `eng.traineddata` — otto megabyte —
       * e li scrive nella directory di lavoro. In sviluppo significa due
       * file binari che compaiono nel repository; **in produzione
       * significa un errore**, perché su un runtime serverless il
       * filesystem è in sola lettura tranne la cartella temporanea.
       *
       * Scoperto facendo girare il riconoscimento la prima volta: i due
       * file sono comparsi accanto a `package.json`.
       *
       * La cartella va creata a mano: tesseract.js non la crea, e senza
       * di essa non fallisce — semplicemente non mette niente in cache e
       * riscarica gli otto megabyte a ogni lettura. Un guasto silenzioso
       * che si manifesta solo come lentezza.
       */
      const cache = join(tmpdir(), "unique-os-ocr");
      await mkdir(cache, { recursive: true }).catch(() => {});

      worker = await tesseract.createWorker(lingue, undefined, { cachePath: cache });
      const { data } = await worker.recognize(
        Buffer.from(richiesta.dati),
        {},
        { blocks: true, text: true },
      );

      const righe: RigaOcr[] = [];
      for (const blocco of data.blocks ?? []) {
        for (const paragrafo of blocco.paragraphs ?? []) {
          for (const riga of paragrafo.lines ?? []) {
            righe.push({
              testo: riga.text.replace(/\s+/g, " ").trim(),
              // Tesseract dà la confidenza in centesimi.
              fiducia: Math.max(0, Math.min(1, riga.confidence / 100)),
            });
          }
        }
      }

      // Ripiego: se i blocchi non arrivano — versione diversa, pagina
      // che il motore non sa segmentare — resta il testo intero, con la
      // confidenza di pagina applicata a ogni riga. Meno preciso, ma
      // meglio che perdere la lettura.
      if (righe.length === 0 && typeof data.text === "string") {
        const fiducia = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
        return componi(
          "tesseract",
          data.text
            .split(/\r?\n/)
            .map((t) => t.replace(/\s+/g, " ").trim())
            .filter((t) => t.length > 0)
            .map((testo) => ({ testo, fiducia })),
        );
      }

      return componi("tesseract", righe);
    } catch (errore) {
      return fallito(
        "tesseract",
        `Il riconoscimento locale non è riuscito: ${errore instanceof Error ? errore.message : String(errore)}`,
      );
    } finally {
      // Un worker non terminato tiene in vita un processo figlio e la
      // memoria del modello. Su un server che elabora documenti tutto il
      // giorno, dimenticarlo si vede dopo un'ora.
      await worker?.terminate().catch(() => {});
    }
  },
};

interface RigaTesseract {
  text: string;
  confidence: number;
}

interface WorkerTesseract {
  recognize: (
    immagine: Buffer,
    opzioni: Record<string, unknown>,
    uscita: { blocks: boolean; text: boolean },
  ) => Promise<{
    data: {
      text: string;
      confidence?: number;
      blocks: { paragraphs: { lines: RigaTesseract[] }[] }[] | null;
    };
  }>;
  terminate: () => Promise<unknown>;
}

interface ApiTesseract {
  createWorker: (
    lingue: string,
    oem?: number,
    opzioni?: { cachePath?: string },
  ) => Promise<WorkerTesseract>;
}

async function caricaTesseract(): Promise<ApiTesseract> {
  // Il nome spezzato tiene il pacchetto fuori dall'analisi statica del
  // bundler: chi non l'ha installato compila lo stesso.
  const nome = ["tesseract", ".js"].join("");
  const modulo = (await import(/* webpackIgnore: true */ nome)) as
    | ApiTesseract
    | { default: ApiTesseract };

  // Il pacchetto espone sia named export sia `default` a seconda di come
  // viene risolto: si prende quello che ha davvero la funzione.
  return "createWorker" in modulo ? modulo : modulo.default;
}

/* ── Il registro ──────────────────────────────────────────────────── */

const MOTORI: Record<Exclude<NomeMotoreOcr, "assente">, MotoreOcr> = {
  modello: motoreModello,
  tesseract: motoreTesseract,
};

/**
 * L'ordine in cui si provano i motori.
 *
 * `UNIQUE_OCR` forza una scelta — utile per provare, e per una clinica
 * che vuole il riconoscimento locale e basta. Senza, si prova prima il
 * modello: su un referto legge meglio, e quando è quello locale non
 * esce niente lo stesso.
 */
function ordineMotori(): NomeMotoreOcr[] {
  const scelto = (process.env.UNIQUE_OCR ?? "").trim().toLowerCase();

  if (scelto === "tesseract") return ["tesseract"];
  if (scelto === "modello") return ["modello"];
  if (scelto === "nessuno" || scelto === "assente") return [];

  return ["modello", "tesseract"];
}

/** Quale motore leggerebbe, adesso. Serve all'interfaccia, per dirlo prima. */
export async function motoreOcrAttivo(): Promise<{ nome: NomeMotoreOcr; motivo?: string }> {
  for (const nome of ordineMotori()) {
    const motore = MOTORI[nome as Exclude<NomeMotoreOcr, "assente">];
    if (!motore) continue;
    const stato = await motore.disponibile();
    if (stato.ok) return { nome };
  }

  return {
    nome: "assente",
    motivo:
      "Nessun riconoscimento ottico disponibile: un documento scansionato resta in cartella e va letto da una persona.",
  };
}

/**
 * Riconosce il testo di un'immagine o di una scansione.
 *
 * Non solleva mai. Un OCR che fallisce restituisce `ok: false` con il
 * motivo, e il documento prosegue: resta in cartella, e chi l'ha
 * caricato legge perché non è stato analizzato. Sollevare qui vorrebbe
 * dire perdere un referto per un limite del riconoscimento.
 */
export async function riconosciTesto(richiesta: RichiestaOcr): Promise<RisultatoOcr> {
  const ordine = ordineMotori();

  if (ordine.length === 0) {
    return fallito("assente", "Il riconoscimento ottico è disattivato in questa installazione.");
  }

  const motivi: string[] = [];

  for (const nome of ordine) {
    const motore = MOTORI[nome as Exclude<NomeMotoreOcr, "assente">];
    if (!motore) continue;

    const stato = await motore.disponibile();
    if (!stato.ok) {
      if (stato.motivo) motivi.push(stato.motivo);
      continue;
    }

    try {
      const esito = await motore.leggi(richiesta);
      if (esito.ok) return esito;
      if (esito.motivo) motivi.push(esito.motivo);
    } catch (errore) {
      motivi.push(
        `${nome}: ${errore instanceof Error ? errore.message : String(errore)}`,
      );
    }
  }

  return fallito(
    "assente",
    motivi.length > 0
      ? motivi.join(" ")
      : "Nessun motore di riconoscimento ottico ha potuto leggere il documento.",
  );
}

/* ── Servizio ─────────────────────────────────────────────────────── */

function componi(motore: NomeMotoreOcr, righe: RigaOcr[]): RisultatoOcr {
  const utili = righe
    .map((r) => ({
      testo: r.testo.replace(/\s+$/g, ""),
      fiducia: Number.isFinite(r.fiducia) ? Math.max(0, Math.min(1, r.fiducia)) : 0.5,
    }))
    .filter((r) => r.testo.trim().length > 0);

  if (utili.length === 0) {
    return fallito(motore, "Il documento non contiene testo riconoscibile.");
  }

  // Media pesata sulla lunghezza: una riga di due caratteri letta male
  // non deve pesare quanto una riga di ottanta letta bene.
  const caratteri = utili.reduce((n, r) => n + r.testo.length, 0);
  const fiducia =
    caratteri === 0
      ? 0
      : utili.reduce((n, r) => n + r.fiducia * r.testo.length, 0) / caratteri;

  return {
    ok: true,
    motore,
    righe: utili,
    testo: utili.map((r) => r.testo).join("\n"),
    fiducia: Number(fiducia.toFixed(3)),
  };
}

function fallito(motore: NomeMotoreOcr, motivo: string): RisultatoOcr {
  return { ok: false, motore, righe: [], testo: "", fiducia: 0, motivo };
}
