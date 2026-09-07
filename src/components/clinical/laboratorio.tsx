"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avanzaEsame, chiediEsame } from "@/lib/clinical/laboratorio-actions";
import { statoTestoIniziale, type StatoTesto } from "@/lib/clinical/state";
import {
  ETICHETTE_ESAME,
  PANNELLI,
  VERBI_ESAME,
  prossimiStatiEsame,
  type StatoEsame,
} from "@/lib/clinical/laboratorio";
import { ETICHETTE_PRIORITA, PRIORITA } from "@/lib/comunicazioni/tipi";
import { cx } from "@/components/ui/primitives";

/**
 * I moduli del laboratorio.
 *
 * La regola che governa la richiesta: **un pannello è un clic.** I sette
 * pannelli pronti riempiono nome e parametri attesi insieme, perché è
 * così che si chiede un esame — «fammi un profilo lipidico», non «fammi
 * LDL, HDL, trigliceridi e ApoB». I codici restano modificabili sotto,
 * per il caso in cui serva un parametro in più.
 *
 * I parametri attesi non sono decorazione: sono ciò che permette di
 * accorgersi che un valore **non** è arrivato. Un referto senza ApoB su
 * una richiesta che lo chiedeva è un buco che qualcuno deve vedere.
 */

const CAMPO =
  "w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

const ETICHETTA =
  "block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500";

const PULSANTE =
  "rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 " +
  "transition-colors hover:bg-ink-800 disabled:opacity-50";

const QUIETO =
  "rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 " +
  "transition-colors hover:bg-bone-50 hover:text-brand-700 disabled:opacity-50";

function Esito({ stato }: { stato: StatoTesto }) {
  if (stato.esito === "iniziale") return null;

  return (
    <p
      role="status"
      className={cx(
        "mt-2 text-sm leading-relaxed",
        stato.esito === "ok" ? "text-signal-positive" : "text-signal-alert",
      )}
    >
      {stato.messaggio}
    </p>
  );
}

/* ── Chiedere un esame ────────────────────────────────────────────── */

export function ModuloRichiestaEsame({
  pazienteId,
  etichette,
}: {
  pazienteId: string;
  /** Il nome leggibile di ogni codice, dal catalogo delle metriche. */
  etichette: Record<string, string>;
}) {
  const [stato, azione, inCorso] = useActionState(chiediEsame, statoTestoIniziale);
  const [pannello, setPannello] = useState("");
  const [codici, setCodici] = useState<string[]>([]);
  const form = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      setPannello("");
      setCodici([]);
      router.refresh();
    }
  }, [stato, router]);

  const scegli = (p: (typeof PANNELLI)[number]) => {
    setPannello(p.nome);
    setCodici(p.codici);
  };

  return (
    <form ref={form} action={azione} className="space-y-4">
      <input type="hidden" name="pazienteId" value={pazienteId} />
      {codici.map((c) => (
        <input key={c} type="hidden" name="codici" value={c} />
      ))}

      <div>
        <span className={ETICHETTA}>Pannelli pronti</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PANNELLI.map((p) => (
            <button
              key={p.nome}
              type="button"
              onClick={() => scegli(p)}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                pannello === p.nome
                  ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-100"
                  : "text-ink-500 ring-1 ring-bone-200 hover:bg-bone-100 hover:text-ink-900",
              )}
            >
              {p.nome}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={ETICHETTA}>Cosa chiedi</span>
        <input
          name="pannello"
          value={pannello}
          onChange={(e) => setPannello(e.target.value)}
          disabled={inCorso}
          placeholder="Profilo lipidico"
          className={cx(CAMPO, "mt-1.5")}
        />
      </label>

      {codici.length > 0 ? (
        <div>
          <span className={ETICHETTA}>Parametri attesi</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {codici.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCodici(codici.filter((x) => x !== c))}
                title="Togli"
                className="inline-flex items-center gap-1.5 rounded-full bg-bone-100 px-3 py-1 text-xs text-ink-600 transition-colors hover:text-signal-alert"
              >
                {etichette[c] ?? c}
                <span aria-hidden="true" className="text-ink-300">
                  ×
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
            Servono ad accorgersi di cosa <strong className="font-medium text-ink-600">non</strong> è
            arrivato: un referto senza uno di questi è un buco che qualcuno deve vedere.
          </p>
        </div>
      ) : null}

      <label className="block">
        <span className={ETICHETTA}>Quesito clinico</span>
        <textarea
          name="domanda"
          rows={2}
          disabled={inCorso}
          placeholder="Controllo a sei mesi dopo introduzione della statina. Anemia nota."
          className={cx(CAMPO, "mt-1.5 resize-y")}
        />
        <span className="mt-1 block text-xs leading-relaxed text-ink-400">
          È la riga che il laboratorio legge per capire se il valore che sta per
          firmare ha senso.
        </span>
      </label>

      <label className="block max-w-[220px]">
        <span className={ETICHETTA}>Priorità</span>
        <select name="priorita" defaultValue="normal" className={cx(CAMPO, "mt-1.5")}>
          {PRIORITA.map((p) => (
            <option key={p} value={p}>
              {ETICHETTE_PRIORITA[p]}
            </option>
          ))}
        </select>
      </label>

      <div>
        <button type="submit" disabled={inCorso} className={PULSANTE}>
          {inCorso ? "Invio…" : "Chiedi l’esame"}
        </button>
        <Esito stato={stato} />
      </div>
    </form>
  );
}

/* ── Farla avanzare ───────────────────────────────────────────────── */

/**
 * I passaggi di una richiesta.
 *
 * Solo i pulsanti che il database accetterebbe: `prossimiStatiEsame` è
 * la copia per l'interfaccia della macchina a stati che vive in
 * `advance_lab_order`. Un pulsante che produce un errore insegna a non
 * fidarsi degli altri.
 *
 * «Valida» ha un aspetto diverso dagli altri perché è una cosa diversa:
 * è la firma che fa entrare i valori in cartella, e la può dare solo un
 * medico. Annullare chiede il perché, come ogni gesto che toglie
 * qualcosa.
 */
export function AzioniEsame({
  richiestaId,
  pazienteId,
  stato: statoEsame,
}: {
  richiestaId: string;
  pazienteId: string;
  stato: StatoEsame;
}) {
  const [esito, azione, inCorso] = useActionState(avanzaEsame, statoTestoIniziale);
  const [apri, setApri] = useState<StatoEsame | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (esito.esito === "ok") {
      setApri(null);
      router.refresh();
    }
  }, [esito, router]);

  const possibili = prossimiStatiEsame(statoEsame);

  if (possibili.length === 0) {
    return (
      <p className="text-xs text-ink-400">
        {statoEsame === "validated"
          ? "Validato: i valori sono in cartella."
          : "Richiesta annullata."}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {possibili.map((s) =>
          s === "cancelled" ? (
            <button
              key={s}
              type="button"
              onClick={() => setApri(apri === s ? null : s)}
              aria-expanded={apri === s}
              className={cx(QUIETO, apri === s && "bg-bone-100 text-brand-700")}
            >
              {VERBI_ESAME[s]}
            </button>
          ) : (
            <form key={s} action={azione}>
              <input type="hidden" name="richiestaId" value={richiestaId} />
              <input type="hidden" name="pazienteId" value={pazienteId} />
              <input type="hidden" name="stato" value={s} />
              <button
                type="submit"
                disabled={inCorso}
                className={s === "validated" ? PULSANTE : QUIETO}
              >
                {VERBI_ESAME[s]}
              </button>
            </form>
          ),
        )}
      </div>

      {apri === "cancelled" ? (
        <form action={azione} className="mt-2.5">
          <input type="hidden" name="richiestaId" value={richiestaId} />
          <input type="hidden" name="pazienteId" value={pazienteId} />
          <input type="hidden" name="stato" value="cancelled" />

          <label className="block">
            <span className={ETICHETTA}>Perché</span>
            <input
              name="nota"
              autoFocus
              disabled={inCorso}
              placeholder="Chiesto due volte per errore."
              className={cx(CAMPO, "mt-1.5")}
            />
          </label>

          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={inCorso} className={PULSANTE}>
              {inCorso ? "…" : "Annulla la richiesta"}
            </button>
            <button type="button" onClick={() => setApri(null)} className={QUIETO}>
              Lascia stare
            </button>
          </div>
        </form>
      ) : null}

      {statoEsame === "resulted" ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Validare è una firma: fa entrare i valori in cartella e li rende visibili
          al Longevity Score. La può dare un medico — «{ETICHETTE_ESAME.resulted}»
          significa che il numero è uscito da uno strumento, non che qualcuno ne
          risponde.
        </p>
      ) : null}

      <Esito stato={esito} />
    </div>
  );
}
