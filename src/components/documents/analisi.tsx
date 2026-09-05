import type { ReactNode } from "react";
import { ETICHETTE_GRAVITA, ETICHETTE_TREND, type Gravita } from "@/lib/brain/documento";
import type {
  BiomarcatoreInCartella,
  IntuizioneInCartella,
  NotaInCartella,
  RaccomandazioneInCartella,
  RigaRegistro,
} from "@/lib/data/documento";
import {
  ETICHETTE_FONTE_INTERVALLO,
  ETICHETTE_LAVORAZIONE,
  ETICHETTE_STATO,
  ORDINE_CATEGORIE,
  SPIEGAZIONI_LAVORAZIONE,
  tonoStato,
  type CategoriaClinica,
  type StatoLavorazione,
  type StatoValore,
} from "@/lib/document-intelligence/tipi";
import { formatShortDate } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

/**
 * Come si mostra ciò che il motore ha letto.
 *
 * Il principio che guida ogni scelta di questo file: **si vede sempre da
 * dove viene un numero.** Accanto a ogni valore ci sono l'intervallo con
 * cui è stato giudicato, la fonte di quell'intervallo, la fiducia della
 * lettura e — aprendo una riga — la citazione dal documento.
 *
 * Non è trasparenza per principio. È che un medico deve poter
 * contestare un valore in due secondi, e un paziente deve poter capire
 * perché un numero è segnato in giallo. Un'interfaccia che mostra
 * «Ferritina 8 — bassa» senza dire rispetto a cosa chiede fiducia senza
 * dare gli strumenti per verificarla, ed è così che si costruisce un
 * sistema che nessuno controlla.
 */

/* ── Lo stato della lavorazione ───────────────────────────────────── */

export function StatoDocumento({ stato }: { stato: string }) {
  const chiave = stato as StatoLavorazione;
  const etichetta = ETICHETTE_LAVORAZIONE[chiave] ?? "In attesa";

  const tono =
    chiave === "FAILED"
      ? "bg-[#fdf6e8] text-signal-attention ring-[#f0e0bd]"
      : chiave === "COMPLETED"
        ? "bg-[#e9f6ee] text-signal-positive ring-[#cdebd8]"
        : chiave === "REVIEW_REQUIRED"
          ? "bg-brand-50 text-brand-700 ring-brand-100"
          : "bg-bone-100 text-ink-500 ring-bone-200";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        tono,
      )}
      title={SPIEGAZIONI_LAVORAZIONE[chiave] ?? undefined}
    >
      {etichetta}
    </span>
  );
}

/* ── Lo stato di un valore ────────────────────────────────────────── */

export function PastigliaStato({ stato }: { stato: StatoValore }) {
  const tono = tonoStato(stato);

  const classi = {
    positive: "bg-[#e9f6ee] text-signal-positive ring-[#cdebd8]",
    attention: "bg-[#fdf6e8] text-signal-attention ring-[#f0e0bd]",
    alert: "bg-brand-50 text-signal-alert ring-brand-100",
    neutral: "bg-bone-100 text-ink-500 ring-bone-200",
  } as const;

  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ring-1",
        classi[tono],
      )}
    >
      {ETICHETTE_STATO[stato]}
    </span>
  );
}

/**
 * La fiducia, detta in parole prima che in numeri.
 *
 * «0.62» non dice niente a chi non ha in mente la scala. «Da
 * verificare» sì, e il numero resta lì accanto per chi lo vuole.
 */
export function Fiducia({ valore }: { valore: number }) {
  const parola =
    valore >= 0.9 ? "lettura sicura" : valore >= 0.75 ? "buona" : valore >= 0.5 ? "da verificare" : "incerta";

  return (
    <span className="text-xs text-ink-400" title={`Confidenza dell'estrazione: ${valore}`}>
      {parola} <span className="tnum">{Math.round(valore * 100)}%</span>
    </span>
  );
}

/* ── I valori ─────────────────────────────────────────────────────── */

/**
 * I biomarcatori, raggruppati come su un referto.
 *
 * L'ordine dei gruppi è quello di un referto di laboratorio vero —
 * emocromo, glicemia, lipidi, fegato, reni — e non l'alfabeto: chi
 * legge referti tutti i giorni sa già dove guardare, e cambiargli
 * l'ordine sotto gli occhi lo costringe a rileggere tutto.
 */
export function ElencoBiomarcatori({
  biomarcatori,
  azioni,
}: {
  biomarcatori: BiomarcatoreInCartella[];
  /** I controlli del professionista su una riga. Assenti per il paziente. */
  azioni?: (b: BiomarcatoreInCartella) => ReactNode;
}) {
  if (biomarcatori.length === 0) {
    return (
      <p className="px-6 py-7 text-center text-sm text-ink-400">
        Nessun parametro riconosciuto in questo documento.
      </p>
    );
  }

  const gruppi = new Map<CategoriaClinica, BiomarcatoreInCartella[]>();
  for (const b of biomarcatori) {
    gruppi.set(b.categoria, [...(gruppi.get(b.categoria) ?? []), b]);
  }

  const ordinati = [...gruppi.entries()].sort(
    (a, b) => ORDINE_CATEGORIE.indexOf(a[0]) - ORDINE_CATEGORIE.indexOf(b[0]),
  );

  return (
    <div className="divide-y divide-bone-200/80">
      {ordinati.map(([categoria, righe]) => (
        <div key={categoria} className="px-6 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-400">
            {righe[0].etichettaCategoria}
          </h3>

          <ul className="mt-2 space-y-2">
            {righe.map((b) => (
              <Valore key={b.id} biomarcatore={b} azioni={azioni?.(b)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Valore({
  biomarcatore: b,
  azioni,
}: {
  biomarcatore: BiomarcatoreInCartella;
  azioni?: ReactNode;
}) {
  const mostrato = b.valoreCorretto ?? b.valore;
  const corretto = b.valoreCorretto !== null;

  return (
    <li className="rounded-xl bg-bone-50 px-3.5 py-3 ring-1 ring-bone-200/70">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium text-ink-900">{b.nome}</span>

        {mostrato !== null ? (
          <span className="text-[15px] text-ink-700 tnum">
            {mostrato}
            {b.unita ? <span className="ml-1 text-sm text-ink-400">{b.unita}</span> : null}
          </span>
        ) : (
          // Il caso che il motore promette di non falsificare: ha visto
          // un numero e non l'ha capito. Si dice, con il testo grezzo
          // accanto, invece di scegliere la cifra più probabile.
          <span className="text-sm font-medium text-signal-attention">
            valore non letto
            {b.valoreGrezzo ? (
              <span className="ml-1 font-normal text-ink-400">
                (sul documento: «{b.valoreGrezzo}»)
              </span>
            ) : null}
          </span>
        )}

        <PastigliaStato stato={b.stato} />

        {corretto ? (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            corretto da {b.correttoDa ?? "un professionista"}
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-3">
          <Fiducia valore={b.confidenza} />
          {azioni}
        </span>
      </div>

      {/* ── Il metro ────────────────────────────────────────────── */}
      <p className="mt-1 text-xs text-ink-400">
        {b.intervallo.min !== null || b.intervallo.max !== null ? (
          <>
            Riferimento{" "}
            <span className="tnum text-ink-500">
              {b.intervallo.min !== null && b.intervallo.max !== null
                ? `${b.intervallo.min}–${b.intervallo.max}`
                : b.intervallo.max !== null
                  ? `fino a ${b.intervallo.max}`
                  : `da ${b.intervallo.min}`}
              {b.unita ? ` ${b.unita}` : ""}
            </span>{" "}
            ·{" "}
            {ETICHETTE_FONTE_INTERVALLO[
              b.intervallo.fonte as keyof typeof ETICHETTE_FONTE_INTERVALLO
            ] ?? b.intervallo.fonte}
          </>
        ) : (
          "Nessun intervallo di riferimento: il valore è registrato, non giudicato."
        )}
        {b.unitaOriginale && b.valoreOriginale !== null ? (
          <>
            {" "}
            · convertito da{" "}
            <span className="tnum">
              {b.valoreOriginale} {b.unitaOriginale}
            </span>
          </>
        ) : null}
        {b.data ? <> · {formatShortDate(b.data)}</> : null}
      </p>

      {b.note.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {b.note.map((nota, i) => (
            <li key={i} className="text-xs leading-relaxed text-signal-attention">
              {nota}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        La citazione. Chiusa di default perché su quaranta esami sarebbe
        un muro, aperta con un clic perché è ciò che permette di
        verificare senza riaprire il PDF.
      */}
      {b.citazione ? (
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none text-xs text-ink-400 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Dov&apos;è scritto
          </summary>
          <p className="mt-1 rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-600 ring-1 ring-bone-200">
            {b.citazione}
            {b.pagina ? <span className="ml-2 text-ink-300">pagina {b.pagina}</span> : null}
          </p>
          {b.etichettaDocumento && b.etichettaDocumento !== b.nome ? (
            <p className="mt-1 text-[11px] text-ink-400">
              Sul documento è scritto «{b.etichettaDocumento}»; l&apos;ho riconosciuto come{" "}
              {b.nome}.
            </p>
          ) : null}
        </details>
      ) : null}
    </li>
  );
}

/* ── Le intuizioni ────────────────────────────────────────────────── */

const TONO_GRAVITA: Record<Gravita, string> = {
  CRITICO: "border-l-signal-alert",
  RILEVANTE: "border-l-signal-attention",
  ATTENZIONE: "border-l-gold-300",
  INFO: "border-l-bone-300",
};

export function ElencoIntuizioni({ intuizioni }: { intuizioni: IntuizioneInCartella[] }) {
  if (intuizioni.length === 0) {
    return (
      <p className="px-6 py-7 text-center text-sm text-ink-400">
        Nessuna osservazione da questo documento.
      </p>
    );
  }

  return (
    <ul className="space-y-2 px-6 py-4">
      {intuizioni.map((i) => (
        <li
          key={i.id}
          className={cx(
            "rounded-r-xl border-l-2 bg-bone-50 px-3.5 py-3",
            TONO_GRAVITA[i.gravita],
          )}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-700">
              {i.osservazione}
            </p>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-400">
              {ETICHETTE_GRAVITA[i.gravita]}
            </span>
          </div>

          {i.trend && i.trend !== "UNKNOWN" ? (
            <p className="mt-1 text-xs text-ink-500">
              Andamento: <span className="font-medium">{ETICHETTE_TREND[i.trend]}</span>
            </p>
          ) : null}

          {/*
            Le prove. Sono la differenza fra un supporto decisionale e
            un'opinione: senza, non c'è modo di controllare l'inferenza
            in meno tempo di quanto ci vorrebbe a rifarla a mano.
          */}
          {i.prove.length > 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
              <span className="font-medium text-ink-500">Su cosa si fonda:</span>{" "}
              {i.prove.join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Le raccomandazioni ───────────────────────────────────────────── */

export function ElencoRaccomandazioni({
  raccomandazioni,
  azioni,
}: {
  raccomandazioni: RaccomandazioneInCartella[];
  azioni?: (r: RaccomandazioneInCartella) => ReactNode;
}) {
  if (raccomandazioni.length === 0) {
    return (
      <p className="px-6 py-7 text-center text-sm text-ink-400">
        Nessuna azione proposta per questo documento.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-bone-200/80">
      {raccomandazioni.map((r) => (
        <li key={r.id} className="px-6 py-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-[16rem] flex-1">
              <p className="text-[15px] text-ink-900">{r.azione}</p>
              {r.motivo ? (
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{r.motivo}</p>
              ) : null}

              {r.decisione ? (
                <p className="mt-2 text-xs text-ink-400">
                  <span
                    className={cx(
                      "font-medium",
                      r.decisione === "accolta"
                        ? "text-signal-positive"
                        : r.decisione === "respinta"
                          ? "text-ink-500"
                          : "text-signal-attention",
                    )}
                  >
                    {r.decisione === "accolta"
                      ? "Accolta"
                      : r.decisione === "respinta"
                        ? "Respinta"
                        : "Rimandata"}
                  </span>
                  {r.decisaDa ? ` da ${r.decisaDa}` : ""}
                  {r.decisaIl ? ` · ${formatShortDate(r.decisaIl)}` : ""}
                  {r.notaDecisione ? ` · «${r.notaDecisione}»` : ""}
                </p>
              ) : (
                <p className="mt-2 text-xs text-ink-400">
                  In attesa della valutazione di un professionista.
                </p>
              )}
            </div>

            {azioni?.(r)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Terapia e note ───────────────────────────────────────────────── */

export function ElencoNote({ note }: { note: NotaInCartella[] }) {
  if (note.length === 0) return null;

  const farmaci = note.filter((n) => n.tipo === "farmaco");
  const integratori = note.filter((n) => n.tipo === "integratore");
  const cliniche = note.filter((n) => n.tipo === "nota");

  return (
    <div className="space-y-4 px-6 py-4">
      {farmaci.length > 0 ? <Terapia titolo="Farmaci citati" voci={farmaci} /> : null}
      {integratori.length > 0 ? (
        <Terapia titolo="Integratori citati" voci={integratori} />
      ) : null}

      {cliniche.length > 0 ? (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-400">
            Testo del referto
          </h3>
          <ul className="mt-2 space-y-2">
            {cliniche.map((n) => (
              <li key={n.id} className="rounded-xl bg-bone-50 px-3.5 py-3 ring-1 ring-bone-200/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                  {n.sottotipo ?? "Nota"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-700">{n.dettaglio}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Terapia({ titolo, voci }: { titolo: string; voci: NotaInCartella[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-400">
        {titolo}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {voci.map((v) => (
          <li key={v.id} className="text-sm text-ink-700">
            <span className="font-medium">{v.etichetta}</span>
            {v.dose ? <span className="ml-2 text-ink-500 tnum">{v.dose}</span> : null}
            {v.posologia ? <span className="ml-2 text-ink-400">{v.posologia}</span> : null}
          </li>
        ))}
      </ul>
      {/*
        Un elenco letto da un documento non è una terapia in corso: è
        ciò che c'era scritto su quel foglio. La differenza conta,
        perché una prescrizione di sei mesi fa può essere finita.
      */}
      <p className="mt-1.5 text-xs text-ink-400">
        Letti dal documento. Non sostituiscono la terapia registrata in cartella.
      </p>
    </div>
  );
}

/* ── Il registro ──────────────────────────────────────────────────── */

const AZIONI: Record<string, string> = {
  "document.uploaded": "Documento caricato",
  "processing.state": "Stato della lavorazione",
  "extraction.completed": "Dati estratti",
  "biomarker.corrected": "Valore corretto",
  "analysis.reviewed": "Analisi revisionata",
  "recommendation.decided": "Decisione su una raccomandazione",
};

export function Registro({ righe }: { righe: RigaRegistro[] }) {
  if (righe.length === 0) {
    return (
      <p className="px-6 py-7 text-center text-sm text-ink-400">
        Nessun passaggio registrato per questo documento.
      </p>
    );
  }

  return (
    <ol className="space-y-0 px-6 py-4">
      {righe.map((r, indice) => (
        <li key={r.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* La linea che unisce i passaggi: è una storia, non un elenco. */}
          {indice < righe.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-[3px] top-2 h-full w-px bg-bone-200"
            />
          ) : null}

          <span
            aria-hidden="true"
            className="relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-bone-300"
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-700">
              {AZIONI[r.azione] ?? r.azione}
              {r.prima && r.dopo ? (
                <span className="text-ink-400">
                  {" "}
                  · da <span className="text-ink-500">{r.prima}</span> a{" "}
                  <span className="text-ink-500">{r.dopo}</span>
                </span>
              ) : r.dopo ? (
                <span className="text-ink-400"> · {r.dopo}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-ink-400 tnum">
              {new Date(r.quando).toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {r.attore ? <span className="ml-2">· {r.attore}</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Le avvertenze ────────────────────────────────────────────────── */

export function Avvertenze({
  avvertenze,
}: {
  avvertenze: { codice: string; messaggio: string }[];
}) {
  if (avvertenze.length === 0) return null;

  return (
    <ul className="space-y-1.5 px-6 py-4">
      {avvertenze.map((a, i) => (
        <li
          key={i}
          className="rounded-xl bg-[#fdf6e8] px-3.5 py-2.5 text-sm leading-relaxed text-signal-attention ring-1 ring-[#f0e0bd]"
        >
          {a.messaggio}
        </li>
      ))}
    </ul>
  );
}
