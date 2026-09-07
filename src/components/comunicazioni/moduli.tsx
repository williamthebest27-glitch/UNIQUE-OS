"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  aggiungiPartecipante,
  allegaDocumento,
  apriConversazione,
  avanzaConsulto,
  caricaAllegato,
  inviaMessaggio,
  richiediConsulto,
} from "@/lib/comunicazioni/azioni";
import { statoTestoIniziale, type StatoTesto } from "@/lib/clinical/state";
import {
  ETICHETTE_PRIORITA,
  ETICHETTE_STATO,
  ETICHETTE_TIPO,
  PRIORITA,
  TIPI_MESSAGGIO,
  prossimiStati,
  type Priorita,
  type StatoConsulto,
} from "@/lib/comunicazioni/tipi";
import { cx } from "@/components/ui/primitives";
import type { Collega, Reparto } from "@/lib/data/comunicazioni";

/**
 * I moduli delle comunicazioni interne.
 *
 * Tutti con `useActionState`, tutti con lo stesso stato — `StatoTesto`,
 * quello che già usano i moduli clinici — perché un esito che si legge
 * in tre posti diversi in tre modi diversi è tre volte da imparare.
 *
 * La regola che governa il campo di scrittura è una sola e vale la pena
 * scriverla: **il valore predefinito non chiede niente.** Tipo
 * «informazione» e priorità «normale» sono già selezionati, e chi ha
 * solo da scrivere una riga scrive e invia. Gli altri due campi
 * esistono per quando servono, e allora si aprono.
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

/* ── Ricerca ──────────────────────────────────────────────────────── */

/**
 * La ricerca.
 *
 * Un modulo `GET` e non un campo che filtra mentre si digita: il
 * risultato di una ricerca ha un indirizzo, si condivide con un collega
 * e torna indietro con il tasto del browser. Filtrare a ogni tasto
 * avrebbe fatto una richiesta per lettera e non avrebbe lasciato niente
 * dietro di sé.
 */
export function Ricerca({
  valore,
  vista,
  reparto,
}: {
  valore: string | null;
  vista: string | null;
  reparto: string | null;
}) {
  const id = useId();

  return (
    <form action="/pro/comunicazioni" method="get" className="flex gap-2">
      {/* Cercare non deve far perdere la coda in cui si stava. */}
      {vista ? <input type="hidden" name="vista" value={vista} /> : null}
      {reparto ? <input type="hidden" name="reparto" value={reparto} /> : null}

      <label htmlFor={id} className="sr-only">
        Cerca nelle comunicazioni
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={valore ?? ""}
        placeholder="Cerca per medico, reparto, paziente, contenuto…"
        className={cx(CAMPO, "flex-1")}
      />
      <button type="submit" className={QUIETO}>
        Cerca
      </button>
      {valore ? (
        <a href="/pro/comunicazioni" className={cx(QUIETO, "whitespace-nowrap")}>
          Azzera
        </a>
      ) : null}
    </form>
  );
}

/* ── Scrivere in una conversazione ────────────────────────────────── */

/**
 * Il campo di scrittura.
 *
 * `Invio` manda, `Maiusc+Invio` va a capo: è la convenzione di ogni
 * strumento di messaggistica, e disattenderla costringe a scoprirla.
 * Il modulo si svuota da sé solo quando l'invio è riuscito — un testo
 * perso perché la rete è caduta è il modo più rapido per far scrivere
 * tutto su un foglio prima di incollarlo.
 */
export function Compositore({
  conversationId,
  pazienteId,
  chiusa,
  scrivibile,
}: {
  conversationId: string;
  pazienteId?: string | null;
  chiusa: boolean;
  scrivibile: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(inviaMessaggio, statoTestoIniziale);
  const [apri, setApri] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      setApri(false);
      router.refresh();
    }
  }, [stato, router]);

  if (chiusa) {
    return (
      <p className="px-5 py-4 text-sm text-ink-400">
        Questa conversazione è chiusa. Riaprila per poter scrivere.
      </p>
    );
  }

  if (!scrivibile) {
    return (
      <p className="px-5 py-4 text-sm text-ink-400">
        Puoi leggere questa conversazione ma non scriverci: non ne fai parte.
      </p>
    );
  }

  return (
    <form ref={form} action={azione} className="px-5 py-4">
      <input type="hidden" name="conversationId" value={conversationId} />
      {pazienteId ? (
        <input type="hidden" name="pazienteId" value={pazienteId} />
      ) : null}

      <label className="block">
        <span className="sr-only">Messaggio</span>
        <textarea
          name="corpo"
          rows={3}
          disabled={inCorso}
          placeholder="Scrivi al reparto o al collega…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className={cx(CAMPO, "resize-y")}
        />
      </label>

      {/*
        Tipo e priorità sono chiusi finché non servono. Aperti sempre,
        avrebbero chiesto due decisioni a chi voleva scrivere una riga —
        e chi deve decidere due volte per dire «arrivo fra cinque minuti»
        smette di usare lo strumento.
      */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={inCorso} className={PULSANTE}>
          {inCorso ? "Invio…" : "Invia"}
        </button>

        <button
          type="button"
          onClick={() => setApri((v) => !v)}
          aria-expanded={apri}
          className="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-ink-700 hover:underline"
        >
          {apri ? "Nascondi tipo e priorità" : "Tipo e priorità"}
        </button>

        <span className="text-xs text-ink-300">Invio manda · Maiusc+Invio va a capo</span>
      </div>

      <div className={cx("mt-3 flex flex-wrap gap-3", !apri && "hidden")}>
        <label className="min-w-[180px] flex-1">
          <span className={ETICHETTA}>Tipo</span>
          <select name="tipo" defaultValue="info" className={cx(CAMPO, "mt-1.5")}>
            {TIPI_MESSAGGIO.map((t) => (
              <option key={t} value={t}>
                {ETICHETTE_TIPO[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[180px] flex-1">
          <span className={ETICHETTA}>Priorità</span>
          <select name="priorita" defaultValue="normal" className={cx(CAMPO, "mt-1.5")}>
            {PRIORITA.map((p) => (
              <option key={p} value={p}>
                {ETICHETTE_PRIORITA[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Esito stato={stato} />
    </form>
  );
}

/* ── Aprire una conversazione ─────────────────────────────────────── */

/**
 * Chi riceve.
 *
 * Caselle e non un `select multiple`: un elenco a selezione multipla su
 * telefono si apre a schermo intero e richiede di tenere premuto un
 * tasto che sulla tastiera di un telefono non esiste. Le caselle si
 * toccano.
 */
function Destinatari({
  colleghi,
  reparti,
}: {
  colleghi: Collega[];
  reparti: Reparto[];
}) {
  const [filtro, setFiltro] = useState("");
  const cerca = filtro.trim().toLowerCase();

  const visibili = cerca
    ? colleghi.filter(
        (c) =>
          c.nome.toLowerCase().includes(cerca) ||
          c.reparti.some((r) => r.toLowerCase().includes(cerca)),
      )
    : colleghi;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className={ETICHETTA}>Reparti</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reparti.length === 0 ? (
            <p className="text-sm text-ink-400">Nessun reparto configurato.</p>
          ) : (
            reparti.map((r) => (
              <label
                key={r.id}
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:checked]:ring-brand-100"
              >
                <input type="checkbox" name="reparti" value={r.id} className="sr-only" />
                {r.nome}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className={ETICHETTA}>Persone</legend>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtra per nome o reparto…"
          className={cx(CAMPO, "mt-2")}
        />

        <div className="mt-2 max-h-52 space-y-0.5 overflow-y-auto rounded-xl ring-1 ring-bone-200">
          {visibili.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ink-400">
              {colleghi.length === 0
                ? "Nessun collega nei reparti. La direzione li assegna da Reparti."
                : "Nessun nome corrisponde."}
            </p>
          ) : (
            visibili.map((c) => (
              <label
                key={c.profileId}
                className="flex cursor-pointer items-center gap-3 px-3.5 py-2 transition-colors hover:bg-bone-50 has-[:checked]:bg-brand-50"
              >
                <input
                  type="checkbox"
                  name="persone"
                  value={c.profileId}
                  className="accent-brand-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">{c.nome}</span>
                  {c.reparti.length > 0 ? (
                    <span className="block truncate text-xs text-ink-400">
                      {c.reparti.join(" · ")}
                    </span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </div>
      </fieldset>
    </div>
  );
}

export function ModuloNuovaConversazione({
  colleghi,
  reparti,
  pazienteId,
  pazienteNome,
}: {
  colleghi: Collega[];
  reparti: Reparto[];
  pazienteId?: string | null;
  pazienteNome?: string | null;
}) {
  const [stato, azione, inCorso] = useActionState(
    apriConversazione,
    statoTestoIniziale,
  );
  const router = useRouter();
  const form = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      router.refresh();
    }
  }, [stato, router]);

  return (
    <form ref={form} action={azione} className="space-y-4">
      {pazienteId ? <input type="hidden" name="pazienteId" value={pazienteId} /> : null}

      <label className="block">
        <span className={ETICHETTA}>Oggetto</span>
        <input
          name="titolo"
          disabled={inCorso}
          placeholder="Rivalutazione del piano dopo gli esami di settembre"
          className={cx(CAMPO, "mt-1.5")}
        />
      </label>

      <Destinatari colleghi={colleghi} reparti={reparti} />

      <label className="block">
        <span className={ETICHETTA}>Messaggio</span>
        <textarea
          name="corpo"
          rows={4}
          disabled={inCorso}
          placeholder="Scrivi la prima riga…"
          className={cx(CAMPO, "mt-1.5 resize-y")}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[170px] flex-1">
          <span className={ETICHETTA}>Tipo</span>
          <select name="tipo" defaultValue="info" className={cx(CAMPO, "mt-1.5")}>
            {TIPI_MESSAGGIO.map((t) => (
              <option key={t} value={t}>
                {ETICHETTE_TIPO[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[170px] flex-1">
          <span className={ETICHETTA}>Priorità</span>
          <select name="priorita" defaultValue="normal" className={cx(CAMPO, "mt-1.5")}>
            {PRIORITA.map((p) => (
              <option key={p} value={p}>
                {ETICHETTE_PRIORITA[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pazienteNome ? (
        <p className="text-xs leading-relaxed text-ink-400">
          Collegata a <span className="text-ink-600">{pazienteNome}</span>. Comparirà
          nelle comunicazioni cliniche della sua cartella, e la vedrà solo chi ha
          titolo su di lui.
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={inCorso} className={PULSANTE}>
          {inCorso ? "Apertura…" : "Apri la comunicazione"}
        </button>
        <Esito stato={stato} />
      </div>
    </form>
  );
}

/* ── Consulti ─────────────────────────────────────────────────────── */

export function ModuloConsulto({
  reparti,
  colleghi,
  pazienteId,
  pazienteNome,
  pazienti,
}: {
  /** Solo i reparti clinici: agli altri un consulto non si chiede. */
  reparti: Reparto[];
  colleghi: Collega[];
  pazienteId?: string | null;
  pazienteNome?: string | null;
  /** Quando il paziente non è già deciso dal contesto. */
  pazienti?: { id: string; nome: string }[];
}) {
  const [stato, azione, inCorso] = useActionState(richiediConsulto, statoTestoIniziale);
  const router = useRouter();
  const form = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      router.refresh();
    }
  }, [stato, router]);

  return (
    <form ref={form} action={azione} className="space-y-4">
      {pazienteId ? (
        <input type="hidden" name="pazienteId" value={pazienteId} />
      ) : (
        <label className="block">
          <span className={ETICHETTA}>Paziente</span>
          <select
            name="pazienteId"
            defaultValue=""
            className={cx(CAMPO, "mt-1.5")}
            disabled={inCorso}
          >
            <option value="">Scegli…</option>
            {(pazienti ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {pazienteNome ? (
        <p className="text-sm text-ink-500">
          Consulto su <span className="text-ink-900">{pazienteNome}</span>.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[200px] flex-1">
          <span className={ETICHETTA}>Reparto destinatario</span>
          <select
            name="repartoId"
            defaultValue=""
            disabled={inCorso}
            className={cx(CAMPO, "mt-1.5")}
          >
            <option value="">Scegli…</option>
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[200px] flex-1">
          <span className={ETICHETTA}>Specialista (facoltativo)</span>
          <select
            name="incaricato"
            defaultValue=""
            disabled={inCorso}
            className={cx(CAMPO, "mt-1.5")}
          >
            <option value="">Chiunque del reparto</option>
            {colleghi.map((c) => (
              <option key={c.profileId} value={c.profileId}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={ETICHETTA}>Motivo</span>
        <input
          name="motivo"
          disabled={inCorso}
          placeholder="Valutazione cardiologica prima di riprendere il carico"
          className={cx(CAMPO, "mt-1.5")}
        />
      </label>

      <label className="block">
        <span className={ETICHETTA}>Descrizione</span>
        <textarea
          name="descrizione"
          rows={4}
          disabled={inCorso}
          placeholder="Cosa serve sapere per rispondere: storia, valori, cosa è già stato provato…"
          className={cx(CAMPO, "mt-1.5 resize-y")}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[170px] flex-1">
          <span className={ETICHETTA}>Priorità</span>
          <select name="priorita" defaultValue="normal" className={cx(CAMPO, "mt-1.5")}>
            {PRIORITA.map((p) => (
              <option key={p} value={p}>
                {ETICHETTE_PRIORITA[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[170px] flex-1">
          <span className={ETICHETTA}>Scadenza (facoltativa)</span>
          <input type="date" name="scadenza" className={cx(CAMPO, "mt-1.5")} />
        </label>
      </div>

      <p className="text-xs leading-relaxed text-ink-400">
        Chi prende in carico il consulto può aprire la cartella di questa persona
        finché resta aperto, e per trenta giorni dopo la chiusura. Ogni apertura
        resta nel registro degli accessi.
      </p>

      <div>
        <button type="submit" disabled={inCorso} className={PULSANTE}>
          {inCorso ? "Invio…" : "Richiedi il consulto"}
        </button>
        <Esito stato={stato} />
      </div>
    </form>
  );
}

/**
 * I gesti su un consulto.
 *
 * I pulsanti disegnati sono solo quelli che il database accetterebbe:
 * `prossimiStati` è la copia per l'interfaccia della macchina a stati
 * che vive in `advance_consultation`. Un pulsante che produce un errore
 * insegna a non fidarsi degli altri.
 */
export function AzioniConsulto({
  consultoId,
  pazienteId,
  stato: statoConsulto,
}: {
  consultoId: string;
  pazienteId: string;
  stato: StatoConsulto;
}) {
  const [esito, azione, inCorso] = useActionState(avanzaConsulto, statoTestoIniziale);
  const [rispondi, setRispondi] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (esito.esito === "ok") {
      setRispondi(false);
      router.refresh();
    }
  }, [esito, router]);

  const possibili = prossimiStati(statoConsulto);
  if (possibili.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        Il consulto è chiuso. Resta leggibile: chiudere non cancella niente.
      </p>
    );
  }

  const verbi: Partial<Record<StatoConsulto, string>> = {
    taken: "Prendi in carico",
    in_review: "Metti in valutazione",
    answered: "Rispondi e chiudi la richiesta",
    closed: "Chiudi il consulto",
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {possibili.map((s) =>
          s === "answered" ? (
            <button
              key={s}
              type="button"
              onClick={() => setRispondi((v) => !v)}
              aria-expanded={rispondi}
              className={PULSANTE}
            >
              {verbi[s] ?? ETICHETTE_STATO[s]}
            </button>
          ) : (
            <form key={s} action={azione}>
              <input type="hidden" name="consultoId" value={consultoId} />
              <input type="hidden" name="pazienteId" value={pazienteId} />
              <input type="hidden" name="stato" value={s} />
              <button type="submit" disabled={inCorso} className={QUIETO}>
                {verbi[s] ?? ETICHETTE_STATO[s]}
              </button>
            </form>
          ),
        )}
      </div>

      {rispondi ? (
        <form action={azione} className="mt-3">
          <input type="hidden" name="consultoId" value={consultoId} />
          <input type="hidden" name="pazienteId" value={pazienteId} />
          <input type="hidden" name="stato" value="answered" />

          <label className="block">
            <span className={ETICHETTA}>Risposta</span>
            <textarea
              name="risposta"
              rows={5}
              disabled={inCorso}
              placeholder="Il parere, con i dati su cui si fonda…"
              className={cx(CAMPO, "mt-1.5 resize-y")}
            />
          </label>

          <p className="mt-1.5 text-xs text-ink-400">
            La risposta resta collegata alla richiesta e compare nella
            conversazione. Il consulto passa a «Risposto», non a «Chiuso»: chiudere
            è un gesto di chi ha chiesto.
          </p>

          <div className="mt-2.5 flex gap-2">
            <button type="submit" disabled={inCorso} className={PULSANTE}>
              {inCorso ? "Invio…" : "Invia la risposta"}
            </button>
            <button
              type="button"
              onClick={() => setRispondi(false)}
              className={QUIETO}
            >
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      <Esito stato={esito} />
    </div>
  );
}

/* ── Partecipanti e allegati ──────────────────────────────────────── */

export function AggiungiPartecipante({
  conversationId,
  colleghi,
  reparti,
}: {
  conversationId: string;
  colleghi: Collega[];
  reparti: Reparto[];
}) {
  const [stato, azione, inCorso] = useActionState(
    aggiungiPartecipante,
    statoTestoIniziale,
  );
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") router.refresh();
  }, [stato, router]);

  return (
    <form action={azione} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />

      <label className="min-w-[200px] flex-1">
        <span className={ETICHETTA}>Aggiungi</span>
        {/*
          Un campo solo per due cose diverse: due `select` affiancati
          avrebbero permesso di riempirli entrambi, e il database avrebbe
          rifiutato dopo il clic invece che prima.
        */}
        <select
          name="destinatario"
          defaultValue=""
          disabled={inCorso}
          className={cx(CAMPO, "mt-1.5")}
        >
          <option value="">Scegli una persona o un reparto…</option>
          <optgroup label="Reparti">
            {reparti.map((r) => (
              <option key={r.id} value={`reparto:${r.id}`}>
                {r.nome}
              </option>
            ))}
          </optgroup>
          <optgroup label="Persone">
            {colleghi.map((c) => (
              <option key={c.profileId} value={`persona:${c.profileId}`}>
                {c.nome}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <button type="submit" disabled={inCorso} className={QUIETO}>
        {inCorso ? "…" : "Aggiungi"}
      </button>

      <div className="w-full">
        <Esito stato={stato} />
      </div>
    </form>
  );
}

export function AllegaReferto({
  conversationId,
  pazienteId,
  documenti,
}: {
  conversationId: string;
  pazienteId: string | null;
  documenti: { id: string; titolo: string }[];
}) {
  const [stato, azione, inCorso] = useActionState(allegaDocumento, statoTestoIniziale);
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") router.refresh();
  }, [stato, router]);

  if (documenti.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        Nessun referto in cartella da allegare.
      </p>
    );
  }

  return (
    <form action={azione} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {pazienteId ? <input type="hidden" name="pazienteId" value={pazienteId} /> : null}

      <label className="min-w-[220px] flex-1">
        <span className={ETICHETTA}>Referto dalla cartella</span>
        <select
          name="documentId"
          defaultValue=""
          disabled={inCorso}
          className={cx(CAMPO, "mt-1.5")}
        >
          <option value="">Scegli…</option>
          {documenti.map((d) => (
            <option key={d.id} value={d.id}>
              {d.titolo}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={inCorso} className={QUIETO}>
        {inCorso ? "…" : "Allega"}
      </button>

      <div className="w-full">
        <p className="text-xs leading-relaxed text-ink-400">
          Non copia il file: allega un riferimento. Chi non ha titolo su quel
          referto continua a non poterlo aprire, anche da qui.
        </p>
        <Esito stato={stato} />
      </div>
    </form>
  );
}

/**
 * Caricare un file nella conversazione.
 *
 * Per ciò che in cartella non c'è: la foto di una lastra, il PDF di un
 * collega esterno, uno schema disegnato a mano. La riga sotto il campo
 * dice cosa **non** va caricato qui, ed è la parte che conta: un referto
 * caricato in conversazione salta la classificazione, l'estrazione dei
 * valori e la revisione, e finisce in fondo a un filo invece che nella
 * storia clinica di una persona.
 */
export function CaricaAllegato({
  conversationId,
  pazienteId,
}: {
  conversationId: string;
  pazienteId?: string | null;
}) {
  const [stato, azione, inCorso] = useActionState(caricaAllegato, statoTestoIniziale);
  const router = useRouter();
  const form = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      router.refresh();
    }
  }, [stato, router]);

  return (
    <form ref={form} action={azione} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {pazienteId ? <input type="hidden" name="pazienteId" value={pazienteId} /> : null}

      <label className="min-w-[240px] flex-1">
        <span className={ETICHETTA}>Carica un file</span>
        <input
          type="file"
          name="file"
          disabled={inCorso}
          className={cx(
            CAMPO,
            "mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-bone-200 file:px-3 file:py-1",
            "file:text-sm file:text-ink-700 hover:file:bg-bone-300",
          )}
        />
      </label>

      <button type="submit" disabled={inCorso} className={QUIETO}>
        {inCorso ? "Caricamento…" : "Carica"}
      </button>

      <div className="w-full">
        <p className="text-xs leading-relaxed text-ink-400">
          Per ciò che in cartella non c’è. Un <strong className="font-medium text-ink-600">referto</strong> va
          caricato nella cartella del paziente e allegato da lì: qui salterebbe la
          classificazione, l’estrazione dei valori e la revisione.
        </p>
        <Esito stato={stato} />
      </div>
    </form>
  );
}
