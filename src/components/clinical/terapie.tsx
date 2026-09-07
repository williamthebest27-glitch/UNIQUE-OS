"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cambiaStatoTerapia,
  prescrivi,
  registraDose,
} from "@/lib/clinical/terapie-actions";
import { statoTestoIniziale, type StatoTesto } from "@/lib/clinical/state";
import {
  ETICHETTE_DOSE,
  ETICHETTE_VIA,
  SCHEMI_ORARI,
  STATI_DOSE,
  VERBI_DOSE,
  VIE,
  richiedeMotivo,
  type StatoDose,
  type StatoTerapia,
} from "@/lib/clinical/terapie";
import { cx } from "@/components/ui/primitives";

/**
 * I moduli della terapia.
 *
 * Una regola sopra tutte, e viene dal fatto che questi gesti si fanno in
 * piedi con una mano sola: **la strada normale è un clic.**
 * «Somministrata» non chiede niente — è ciò che succede novanta volte su
 * cento. Il motivo lo chiedono soltanto i due stati che senza non si
 * capiscono, e lo chiedono aprendo un campo, non una finestra.
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

/* ── Prescrivere ──────────────────────────────────────────────────── */

/**
 * Il modulo della prescrizione.
 *
 * Gli schemi orari sono pulsanti che riempiono il campo, non un elenco
 * da cui scegliere: il campo resta libero — chi ha uno schema strano lo
 * scrive — e i sei schemi coprono quasi tutto senza vincolare. Senza,
 * «tre volte al giorno» sarebbe finito scritto in quattro formati
 * diversi, che è il modo in cui un elenco smette di potersi ordinare.
 */
export function ModuloPrescrizione({ pazienteId }: { pazienteId: string }) {
  const [stato, azione, inCorso] = useActionState(prescrivi, statoTestoIniziale);
  const [orari, setOrari] = useState("08:00");
  const form = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (stato.esito === "ok") {
      form.current?.reset();
      setOrari("08:00");
      router.refresh();
    }
  }, [stato, router]);

  return (
    <form ref={form} action={azione} className="space-y-4">
      <input type="hidden" name="pazienteId" value={pazienteId} />

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[220px] flex-[2]">
          <span className={ETICHETTA}>Farmaco</span>
          <input
            name="farmaco"
            disabled={inCorso}
            placeholder="Ramipril"
            className={cx(CAMPO, "mt-1.5")}
          />
        </label>

        <label className="min-w-[120px] flex-1">
          <span className={ETICHETTA}>Dose</span>
          <input
            name="dose"
            disabled={inCorso}
            placeholder="5 mg"
            className={cx(CAMPO, "mt-1.5")}
          />
        </label>

        <label className="min-w-[150px] flex-1">
          <span className={ETICHETTA}>Via</span>
          <select name="via" defaultValue="oral" className={cx(CAMPO, "mt-1.5")}>
            {VIE.map((v) => (
              <option key={v} value={v}>
                {ETICHETTE_VIA[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={ETICHETTA}>Frequenza</span>
        <input
          name="frequenza"
          disabled={inCorso}
          placeholder="Una compressa al mattino"
          className={cx(CAMPO, "mt-1.5")}
        />
      </label>

      <div>
        <label className="block">
          <span className={ETICHETTA}>Orari</span>
          <input
            name="orari"
            value={orari}
            onChange={(e) => setOrari(e.target.value)}
            disabled={inCorso}
            placeholder="08:00, 20:00 — vuoto se al bisogno"
            className={cx(CAMPO, "mt-1.5")}
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SCHEMI_ORARI.map((s) => (
            <button
              key={s.etichetta}
              type="button"
              onClick={() => setOrari(s.orari.join(", "))}
              className="rounded-full px-3 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:bg-bone-100 hover:text-ink-900"
            >
              {s.etichetta}
            </button>
          ))}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          Da questi orari nascono le dosi che l’infermieristica trova nel giro,
          per i prossimi sette giorni. Lasciando vuoto è «al bisogno»: nessuna
          dose programmata, la registra chi la somministra.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[160px] flex-1">
          <span className={ETICHETTA}>Inizio</span>
          <input type="date" name="inizio" className={cx(CAMPO, "mt-1.5")} />
        </label>

        <label className="min-w-[160px] flex-1">
          <span className={ETICHETTA}>Fine (facoltativa)</span>
          <input type="date" name="fine" className={cx(CAMPO, "mt-1.5")} />
        </label>
      </div>

      <label className="block">
        <span className={ETICHETTA}>Istruzioni</span>
        <textarea
          name="istruzioni"
          rows={2}
          disabled={inCorso}
          placeholder="A stomaco pieno. Sospendere in caso di tosse persistente."
          className={cx(CAMPO, "mt-1.5 resize-y")}
        />
      </label>

      <div>
        <button type="submit" disabled={inCorso} className={PULSANTE}>
          {inCorso ? "Salvataggio…" : "Prescrivi"}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Prescrivere è un atto medico: il database accetta la scrittura solo da
          un medico del care team.
        </p>
        <Esito stato={stato} />
      </div>
    </form>
  );
}

/* ── Registrare una dose ──────────────────────────────────────────── */

/**
 * Cosa è successo a questa dose.
 *
 * «Somministra» è un pulsante e finisce lì. Gli altri tre stanno dietro
 * un «altro», e due dei tre aprono il campo del motivo — che il database
 * pretende comunque, ma chiederlo prima del clic è la differenza fra un
 * modulo e un rimbalzo.
 */
export function AzioniDose({
  doseId,
  pazienteId,
  stato: statoDose,
  compatto = false,
}: {
  doseId: string;
  pazienteId: string;
  stato: StatoDose;
  /** Nel giro le righe sono venti: i verbi stanno su una riga sola. */
  compatto?: boolean;
}) {
  const [esito, azione, inCorso] = useActionState(registraDose, statoTestoIniziale);
  const [scelto, setScelto] = useState<StatoDose | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (esito.esito === "ok") {
      setScelto(null);
      router.refresh();
    }
  }, [esito, router]);

  if (statoDose !== "due") {
    return null;
  }

  const altri = STATI_DOSE.filter(
    (s): s is Exclude<StatoDose, "due"> => s !== "due" && s !== "given",
  );

  return (
    <div className={compatto ? "" : "mt-2"}>
      <div className="flex flex-wrap items-center gap-2">
        {/* La strada normale: un clic. */}
        <form action={azione}>
          <input type="hidden" name="doseId" value={doseId} />
          <input type="hidden" name="pazienteId" value={pazienteId} />
          <input type="hidden" name="stato" value="given" />
          <button type="submit" disabled={inCorso} className={PULSANTE}>
            {inCorso ? "…" : "Somministra"}
          </button>
        </form>

        {altri.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScelto(scelto === s ? null : s)}
            aria-expanded={scelto === s}
            className={cx(
              QUIETO,
              scelto === s && "bg-bone-100 text-brand-700 ring-brand-100",
            )}
          >
            {VERBI_DOSE[s]}
          </button>
        ))}
      </div>

      {scelto ? (
        <form action={azione} className="mt-2.5 space-y-2">
          <input type="hidden" name="doseId" value={doseId} />
          <input type="hidden" name="pazienteId" value={pazienteId} />
          <input type="hidden" name="stato" value={scelto} />

          {richiedeMotivo(scelto) ? (
            <label className="block">
              <span className={ETICHETTA}>Motivo</span>
              <input
                name="motivo"
                autoFocus
                disabled={inCorso}
                placeholder={
                  scelto === "refused"
                    ? "Dice di sentirsi nauseata."
                    : "Paziente a digiuno per il prelievo."
                }
                className={cx(CAMPO, "mt-1.5")}
              />
            </label>
          ) : null}

          <label className="block">
            <span className={ETICHETTA}>Nota (facoltativa)</span>
            <input name="nota" disabled={inCorso} className={cx(CAMPO, "mt-1.5")} />
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={inCorso} className={PULSANTE}>
              {inCorso ? "…" : `Registra: ${ETICHETTE_DOSE[scelto].toLowerCase()}`}
            </button>
            <button type="button" onClick={() => setScelto(null)} className={QUIETO}>
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      <Esito stato={esito} />
    </div>
  );
}

/* ── Sospendere e riprendere ──────────────────────────────────────── */

/**
 * I gesti su una terapia in corso.
 *
 * Sospendere e concludere chiedono il perché — e non è burocrazia: una
 * terapia sospesa senza motivo, riletta fra un mese, non si sa se
 * riprenderla. Riprendere no: il perché è che serve di nuovo.
 */
export function AzioniTerapia({
  prescrizioneId,
  pazienteId,
  stato,
}: {
  prescrizioneId: string;
  pazienteId: string;
  stato: StatoTerapia;
}) {
  const [esito, azione, inCorso] = useActionState(
    cambiaStatoTerapia,
    statoTestoIniziale,
  );
  const [apri, setApri] = useState<StatoTerapia | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (esito.esito === "ok") {
      setApri(null);
      router.refresh();
    }
  }, [esito, router]);

  if (stato === "cancelled" || stato === "completed") {
    return (
      <p className="text-xs text-ink-400">
        Terapia {stato === "completed" ? "conclusa" : "annullata"}. Resta in
        cartella: quello che è stato somministrato è successo.
      </p>
    );
  }

  const possibili: StatoTerapia[] =
    stato === "active" ? ["suspended", "completed", "cancelled"] : ["active", "cancelled"];

  const verbi: Record<StatoTerapia, string> = {
    active: "Riprendi",
    suspended: "Sospendi",
    completed: "Concludi",
    cancelled: "Annulla",
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {possibili.map((s) =>
          s === "active" ? (
            <form key={s} action={azione}>
              <input type="hidden" name="prescrizioneId" value={prescrizioneId} />
              <input type="hidden" name="pazienteId" value={pazienteId} />
              <input type="hidden" name="stato" value="active" />
              <button type="submit" disabled={inCorso} className={QUIETO}>
                {verbi[s]}
              </button>
            </form>
          ) : (
            <button
              key={s}
              type="button"
              onClick={() => setApri(apri === s ? null : s)}
              aria-expanded={apri === s}
              className={cx(QUIETO, apri === s && "bg-bone-100 text-brand-700")}
            >
              {verbi[s]}
            </button>
          ),
        )}
      </div>

      {apri ? (
        <form action={azione} className="mt-2.5">
          <input type="hidden" name="prescrizioneId" value={prescrizioneId} />
          <input type="hidden" name="pazienteId" value={pazienteId} />
          <input type="hidden" name="stato" value={apri} />

          <label className="block">
            <span className={ETICHETTA}>Perché</span>
            <input
              name="motivo"
              autoFocus
              disabled={inCorso}
              placeholder={
                apri === "suspended"
                  ? "Tosse persistente, rivalutare fra due settimane."
                  : "Ciclo terminato come previsto."
              }
              className={cx(CAMPO, "mt-1.5")}
            />
          </label>

          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={inCorso} className={PULSANTE}>
              {inCorso ? "…" : verbi[apri]}
            </button>
            <button type="button" onClick={() => setApri(null)} className={QUIETO}>
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      <Esito stato={esito} />
    </div>
  );
}
