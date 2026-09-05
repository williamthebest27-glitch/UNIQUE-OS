"use client";

import { useActionState, useCallback, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui/primitives";
import { formatFileSize } from "@/lib/format";
import { caricaDocumento } from "@/lib/documents/actions";
import {
  ACCEPT_ATTRIBUTE,
  DIMENSIONE_MASSIMA_BYTE,
  statoUploadIniziale,
  type StatoUpload,
} from "@/lib/documents/state";

/**
 * Il caricamento di un referto.
 *
 * Tre modi di consegnare lo stesso file, perché tre sono le situazioni
 * reali: **trascinarlo** dal desktop di un computer, **sceglierlo** da
 * una cartella, **fotografarlo** dal telefono. Il terzo è quello che il
 * paziente userà di più — apre l'applicazione in sala d'attesa,
 * inquadra il foglio, carica — ed è il motivo per cui il pulsante della
 * fotocamera non è nascosto in un menu.
 *
 * ---
 *
 * **L'avanzamento è vero.** La barra segue `upload.onprogress`, non un
 * timer: quando dice sessanta per cento, sessanta per cento dei byte
 * sono arrivati. Una barra finta che si muove da sola è peggio di
 * nessuna barra — insegna a non fidarsi di quella vera, e la prossima
 * volta che si ferma davvero nessuno se ne accorge.
 *
 * Dopo la trasmissione c'è la lettura, che dura quanto dura e non ha un
 * avanzamento misurabile: lì la barra si ferma e cambia il testo. Dire
 * «sto analizzando» è onesto; far continuare a crescere una percentuale
 * inventata no.
 *
 * **Senza JavaScript funziona lo stesso.** Il modulo è un `<form>` con
 * la sua server action: senza JS si vede un campo file e un pulsante, e
 * il documento si carica. Perde la barra, non la funzione.
 */

const CATEGORIE = [
  ["other", "Non lo so / altro"],
  ["lab_report", "Esame di laboratorio"],
  ["imaging", "Diagnostica per immagini"],
  ["prescription", "Prescrizione"],
  ["care_plan", "Piano di cura"],
  ["consent", "Consenso"],
] as const;

type Fase = "attesa" | "trasmissione" | "lettura" | "fatto" | "errore";

export function Dropzone({
  patientId,
  /** Dove portare chi ha appena caricato: la cartella del paziente o la propria. */
  baseDocumenti = "/documenti",
}: {
  patientId?: string;
  baseDocumenti?: string;
}) {
  const router = useRouter();
  const idFile = useId();
  const idTitolo = useId();
  const idCategoria = useId();

  const inputFile = useRef<HTMLInputElement>(null);
  const inputFotocamera = useRef<HTMLInputElement>(null);
  const richiesta = useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sopra, setSopra] = useState(false);
  const [fase, setFase] = useState<Fase>("attesa");
  const [percentuale, setPercentuale] = useState(0);
  const [esito, setEsito] = useState<StatoUpload | null>(null);
  const [inAggiornamento, aggiorna] = useTransition();

  // Il percorso senza JavaScript. Con JS non viene mai eseguito — il
  // gestore di `submit` lo previene — ma deve restare l'`action` del
  // modulo, o senza JS il browser manderebbe il file alla rotta JSON e
  // chi ha caricato si troverebbe davanti una riga di codice.
  const [statoSenzaJs, azioneSenzaJs] = useActionState(caricaDocumento, statoUploadIniziale);

  const scegli = useCallback((scelto: File | null | undefined) => {
    if (!scelto) return;

    if (scelto.size > DIMENSIONE_MASSIMA_BYTE) {
      setFase("errore");
      setEsito({
        esito: "errore",
        messaggio: `«${scelto.name}» pesa ${formatFileSize(scelto.size)}: il limite è ${Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB.`,
      });
      return;
    }

    setFile(scelto);
    setFase("attesa");
    setEsito(null);
    setPercentuale(0);
  }, []);

  const azzera = useCallback(() => {
    richiesta.current?.abort();
    richiesta.current = null;
    setFile(null);
    setFase("attesa");
    setPercentuale(0);
    setEsito(null);
    if (inputFile.current) inputFile.current.value = "";
    if (inputFotocamera.current) inputFotocamera.current.value = "";
  }, []);

  /**
   * La trasmissione.
   *
   * `XMLHttpRequest` e non `fetch` per una ragione sola: `fetch` non
   * dice quanti byte sono partiti. È una API più vecchia e meno bella,
   * ed è l'unica che permette di essere onesti sull'avanzamento.
   */
  const invia = useCallback(
    (modulo: HTMLFormElement) => {
      if (!file) return;

      const dati = new FormData(modulo);
      dati.set("file", file);

      const xhr = new XMLHttpRequest();
      richiesta.current = xhr;

      setFase("trasmissione");
      setPercentuale(0);

      xhr.upload.addEventListener("progress", (evento) => {
        if (!evento.lengthComputable) return;
        const quanto = Math.round((evento.loaded / evento.total) * 100);
        setPercentuale(quanto);
        // Arrivato l'ultimo byte comincia la lettura, che non ha una
        // percentuale: si cambia testo invece di inventarne una.
        if (quanto >= 100) setFase("lettura");
      });

      xhr.addEventListener("load", () => {
        richiesta.current = null;

        let risposta: StatoUpload;
        try {
          risposta = JSON.parse(xhr.responseText) as StatoUpload;
        } catch {
          risposta = {
            esito: "errore",
            messaggio: "Il server ha risposto in un modo che non ho capito. Riprova.",
          };
        }

        setEsito(risposta);
        setFase(risposta.esito === "ok" ? "fatto" : "errore");

        if (risposta.esito === "ok") {
          setFile(null);
          if (inputFile.current) inputFile.current.value = "";
          if (inputFotocamera.current) inputFotocamera.current.value = "";
          // La cartella dietro è cambiata: il documento nuovo deve
          // comparire senza che nessuno ricarichi la pagina a mano.
          aggiorna(() => router.refresh());
        }
      });

      xhr.addEventListener("error", () => {
        richiesta.current = null;
        setFase("errore");
        setEsito({
          esito: "errore",
          messaggio: "La connessione si è interrotta. Il file non è stato caricato: riprova.",
        });
      });

      xhr.addEventListener("abort", () => {
        richiesta.current = null;
        setFase("attesa");
        setPercentuale(0);
      });

      xhr.open("POST", "/api/documenti");
      xhr.send(dati);
    },
    [file, router],
  );

  const inCorso = fase === "trasmissione" || fase === "lettura";

  return (
    <form
      action={azioneSenzaJs}
      onSubmit={(evento) => {
        // Con JavaScript si passa da qui: si ferma la server action e si
        // trasmette con XMLHttpRequest, che è l'unico modo di sapere
        // quanti byte sono partiti. Senza JavaScript questo gestore non
        // esiste, e il modulo parte da solo verso la server action.
        if (!file) return;
        evento.preventDefault();
        invia(evento.currentTarget);
      }}
      className="space-y-4"
    >
      {patientId ? <input type="hidden" name="patientId" value={patientId} /> : null}

      {/* ── L'area ────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!inCorso) setSopra(true);
        }}
        onDragLeave={() => setSopra(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSopra(false);
          if (inCorso) return;
          scegli(e.dataTransfer.files?.[0]);
        }}
        className={cx(
          "relative rounded-card border border-dashed px-6 py-8 text-center transition-colors",
          sopra
            ? "border-brand-500 bg-brand-50"
            : file
              ? "border-bone-300 bg-bone-50"
              : "border-bone-300 bg-bone-50 hover:border-brand-300",
        )}
      >
        {file ? (
          <FileScelto file={file} onTogli={azzera} bloccato={inCorso} />
        ) : (
          <>
            <FoglioIcona className="mx-auto h-9 w-9 text-ink-300" />

            <p className="mt-3 text-[15px] font-medium text-ink-900">
              Trascina qui il tuo referto
            </p>
            <p className="mt-1 text-sm text-ink-400">
              PDF, foto, Word, Excel o CSV — fino a{" "}
              {Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputFile.current?.click()}
                className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
              >
                Scegli un file
              </button>

              {/*
                Sul telefono apre la fotocamera, sul computer una
                finestra di scelta immagini. In entrambi i casi porta a
                qualcosa di utile, quindi non lo si nasconde dietro un
                controllo di dispositivo — che sbaglia, e quando sbaglia
                toglie l'unica strada comoda.
              */}
              <button
                type="button"
                onClick={() => inputFotocamera.current?.click()}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-700 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
              >
                <FotocameraIcona className="mr-1.5 inline h-4 w-4 align-[-2px]" />
                Fotografa il referto
              </button>
            </div>
          </>
        )}

        {/*
          Il campo vero. Resta nel documento — e visibile a uno screen
          reader — perché senza JavaScript è l'unico modo di scegliere
          un file: nasconderlo con `display: none` lo toglierebbe anche
          alla navigazione da tastiera.
        */}
        <label htmlFor={idFile} className="sr-only">
          File del documento
        </label>
        <input
          ref={inputFile}
          id={idFile}
          name="file"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={inCorso}
          onChange={(e) => scegli(e.target.files?.[0])}
          className="sr-only"
        />

        <input
          ref={inputFotocamera}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={inCorso}
          onChange={(e) => scegli(e.target.files?.[0])}
          className="sr-only"
          aria-label="Fotografa il referto"
        />
      </div>

      {/* ── Avanzamento ───────────────────────────────────────── */}
      {inCorso ? (
        <Avanzamento fase={fase} percentuale={percentuale} onAnnulla={azzera} />
      ) : null}

      {/* ── I dettagli, solo quando servono ───────────────────── */}
      {file && !inCorso ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={idTitolo} className="block text-[13px] font-medium text-ink-700">
              Titolo <span className="font-normal text-ink-400">(facoltativo)</span>
            </label>
            <input
              id={idTitolo}
              name="title"
              type="text"
              placeholder="Se lo lasci vuoto usiamo il nome del file"
              className="mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor={idCategoria} className="block text-[13px] font-medium text-ink-700">
              Categoria <span className="font-normal text-ink-400">(la riconosciamo noi)</span>
            </label>
            <select
              id={idCategoria}
              name="kind"
              defaultValue="other"
              className="mt-1.5 w-full rounded-xl bg-bone-50 px-3 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-brand-500"
            >
              {CATEGORIE.map(([valore, etichetta]) => (
                <option key={valore} value={valore}>
                  {etichetta}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {file && !inCorso ? (
        <button
          type="submit"
          className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-medium text-bone-50 transition-colors hover:bg-brand-900 sm:w-auto"
        >
          Carica e analizza
        </button>
      ) : null}

      {/*
        Senza JavaScript nessuno stato React esiste: il campo file non
        avvisa nessuno di essere stato riempito, quindi né i dettagli né
        il pulsante comparirebbero mai. Qui ci sono, sempre, e il modulo
        resta usabile — con un campo file spoglio invece dell'area da
        trascinare, che è esattamente ciò che il browser sa fare da solo.
      */}
      <noscript>
        <div className="space-y-3 rounded-xl bg-bone-50 p-4 ring-1 ring-bone-200">
          <p className="text-sm text-ink-500">
            Scegli il file qui sopra, poi premi «Carica».
          </p>
          <input
            type="text"
            name="title"
            placeholder="Titolo (facoltativo)"
            className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-bone-50"
          >
            Carica
          </button>
        </div>
      </noscript>

      {/* ── Esito ─────────────────────────────────────────────── */}
      {(() => {
        // Con JavaScript l'esito arriva dalla trasmissione; senza,
        // dalla server action. È lo stesso oggetto e si mostra allo
        // stesso modo.
        const daMostrare = esito ?? (statoSenzaJs.esito !== "iniziale" ? statoSenzaJs : null);
        if (!daMostrare || inCorso) return null;

        return (
          <Esito
            esito={daMostrare}
            baseDocumenti={baseDocumenti}
            inAggiornamento={inAggiornamento}
          />
        );
      })()}
    </form>
  );
}

/* ── Le parti ─────────────────────────────────────────────────────── */

function FileScelto({
  file,
  onTogli,
  bloccato,
}: {
  file: File;
  onTogli: () => void;
  bloccato: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-left">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-bone-200">
        <FoglioIcona className="h-5 w-5 text-brand-700" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink-900">{file.name}</p>
        <p className="mt-0.5 text-sm text-ink-400 tnum">
          {etichettaTipo(file)} · {formatFileSize(file.size)}
        </p>
      </div>

      {!bloccato ? (
        <button
          type="button"
          onClick={onTogli}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-ink-400 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
        >
          Togli
        </button>
      ) : null}
    </div>
  );
}

function Avanzamento({
  fase,
  percentuale,
  onAnnulla,
}: {
  fase: Fase;
  percentuale: number;
  onAnnulla: () => void;
}) {
  const inLettura = fase === "lettura";

  return (
    <div className="rounded-xl bg-bone-50 px-4 py-3 ring-1 ring-bone-200">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink-700">
          {inLettura ? "Sto leggendo il documento…" : "Caricamento in corso…"}
        </p>
        {inLettura ? (
          <span className="text-xs text-ink-400">richiede qualche secondo</span>
        ) : (
          <span className="text-sm text-ink-500 tnum">{percentuale}%</span>
        )}
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-bone-200"
        role="progressbar"
        aria-valuenow={inLettura ? undefined : percentuale}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={inLettura ? "Lettura del documento in corso" : "Caricamento del file"}
      >
        <div
          className={cx(
            "h-full rounded-full bg-brand-700 transition-[width] duration-200 ease-out",
            // In lettura la barra resta piena e non finge di avanzare:
            // il lavoro c'è, ma non si può misurare, e mentirlo
            // renderebbe inutile anche la percentuale vera di prima.
            inLettura && "animate-pulse",
          )}
          style={{ width: `${inLettura ? 100 : percentuale}%` }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-400">
        {inLettura
          ? "Riconosco il formato, leggo il testo, estraggo gli esami e li confronto con i tuoi valori precedenti."
          : "Il file viaggia cifrato e finisce in un archivio privato."}
      </p>

      {!inLettura ? (
        <button
          type="button"
          onClick={onAnnulla}
          className="mt-2 text-xs text-ink-400 underline-offset-4 hover:text-brand-700 hover:underline"
        >
          Annulla
        </button>
      ) : null}
    </div>
  );
}

function Esito({
  esito,
  baseDocumenti,
  inAggiornamento,
}: {
  esito: StatoUpload;
  baseDocumenti: string;
  inAggiornamento: boolean;
}) {
  const andata = esito.esito === "ok";

  return (
    <div
      role="status"
      className={cx(
        "rounded-xl px-4 py-3 text-sm ring-1",
        andata
          ? "bg-brand-50 text-brand-700 ring-brand-100"
          : "bg-[#fdf6e8] text-signal-attention ring-[#f0e0bd]",
      )}
    >
      <p className="font-medium">
        {andata ? "Documento analizzato." : esito.messaggio}
      </p>

      {andata && esito.messaggio ? (
        <p className="mt-0.5 text-ink-500">{esito.messaggio}</p>
      ) : null}

      {esito.dettaglio ? (
        <p className="mt-1 leading-relaxed text-ink-500">{esito.dettaglio}</p>
      ) : null}

      {andata && esito.documentId ? (
        <a
          href={`${baseDocumenti}/${esito.documentId}`}
          className="mt-2 inline-block font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          {inAggiornamento ? "Apro…" : "Vedi cosa ho letto →"}
        </a>
      ) : null}
    </div>
  );
}

/* ── Dettagli ─────────────────────────────────────────────────────── */

/** Il tipo del file, detto come lo direbbe una persona. */
function etichettaTipo(file: File): string {
  const estensione = file.name.split(".").pop()?.toLowerCase() ?? "";

  const nomi: Record<string, string> = {
    pdf: "PDF",
    jpg: "Foto",
    jpeg: "Foto",
    png: "Immagine",
    webp: "Immagine",
    doc: "Word",
    docx: "Word",
    xls: "Excel",
    xlsx: "Excel",
    csv: "Tabella CSV",
  };

  return nomi[estensione] ?? estensione.toUpperCase() ?? "Documento";
}

function FoglioIcona({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 13h6M9 16.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FotocameraIcona({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8.5h2.6l1.2-2h8.4l1.2 2H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
