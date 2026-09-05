"use client";

import { useActionState, useState } from "react";
import {
  correggiValore,
  decidiRaccomandazione,
  revisionaAnalisi,
} from "@/lib/documents/actions";
import { statoRevisioneAnalisiIniziale } from "@/lib/documents/state";
import { cx } from "@/components/ui/primitives";

/**
 * I gesti con cui una persona chiude il ciclo.
 *
 * È il punto che la visione chiama `CLINICIAN DECISION`, e nel codice
 * non è un tipo né un campo: è **una firma**. Finché nessuno preme uno
 * di questi pulsanti, il documento resta un'ipotesi di lettura fatta da
 * una macchina — e l'interfaccia del paziente lo dice.
 *
 * Tutte e tre le decisioni passano da una funzione `security definer`
 * del database, non da un `update`. Il motivo è sempre lo stesso: le
 * regole su chi può decidere cosa, l'autore, l'istante e la traccia
 * devono valere insieme, e una policy da sola non le esprime.
 */

/* ── Revisione dell'analisi ───────────────────────────────────────── */

export function RevisioneAnalisi({
  extractionId,
  patientId,
  giaRevisionata,
}: {
  extractionId: string;
  patientId: string;
  giaRevisionata: boolean;
}) {
  const [stato, azione, inCorso] = useActionState(
    revisionaAnalisi,
    statoRevisioneAnalisiIniziale,
  );
  const [nota, setNota] = useState("");

  return (
    <form action={azione} className="space-y-3 px-6 py-4">
      <input type="hidden" name="extractionId" value={extractionId} />
      <input type="hidden" name="patientId" value={patientId} />

      <p className="text-sm leading-relaxed text-ink-500">
        {giaRevisionata
          ? "Questa analisi è già stata validata. Puoi rivederla: la decisione precedente resta nel registro."
          : "Il motore ha letto il documento e proposto questi valori. Approvarli li rende visibili anche al paziente."}
      </p>

      <label className="block">
        <span className="text-[13px] font-medium text-ink-700">
          Nota <span className="font-normal text-ink-400">(facoltativa)</span>
        </span>
        <textarea
          name="nota"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Cosa hai verificato, o perché la respingi."
          className="mt-1.5 w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decisione"
          value="approvata"
          disabled={inCorso}
          className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-brand-900 disabled:opacity-60"
        >
          Approva l&apos;analisi
        </button>

        <button
          type="submit"
          name="decisione"
          value="corretta"
          disabled={inCorso}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-700 ring-1 ring-bone-200 transition-colors hover:text-brand-700 disabled:opacity-60"
        >
          Approva con le mie correzioni
        </button>

        <button
          type="submit"
          name="decisione"
          value="respinta"
          disabled={inCorso}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-signal-alert ring-1 ring-bone-200 transition-colors hover:bg-brand-50 disabled:opacity-60"
        >
          Respingi
        </button>
      </div>

      {stato.esito !== "iniziale" && stato.messaggio ? (
        <p
          role="status"
          className={cx(
            "rounded-xl px-3.5 py-2.5 text-sm",
            stato.esito === "ok"
              ? "bg-brand-50 text-brand-700"
              : "bg-[#fdf6e8] text-signal-attention",
          )}
        >
          {stato.messaggio}
        </p>
      ) : null}
    </form>
  );
}

/* ── Correzione di un valore ──────────────────────────────────────── */

/**
 * Correggere un numero che il motore ha letto male.
 *
 * Si apre solo su richiesta: su quaranta esami, quaranta campi di testo
 * aperti sarebbero un invito a modificare invece che a verificare. Il
 * valore letto dalla macchina resta comunque in archivio accanto alla
 * correzione — l'interfaccia lo dice, e il database lo garantisce.
 */
export function CorreggiValore({
  biomarkerId,
  patientId,
  nome,
  valoreAttuale,
  unita,
}: {
  biomarkerId: string;
  patientId: string;
  nome: string;
  valoreAttuale: number | null;
  unita: string | null;
}) {
  const [aperto, setAperto] = useState(false);

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="shrink-0 rounded-lg px-2 py-0.5 text-xs text-ink-400 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
      >
        {valoreAttuale === null ? "Inserisci" : "Correggi"}
      </button>
    );
  }

  return (
    <form action={correggiValore} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="biomarkerId" value={biomarkerId} />
      <input type="hidden" name="patientId" value={patientId} />

      <label className="sr-only" htmlFor={`valore-${biomarkerId}`}>
        Valore corretto per {nome}
      </label>
      <input
        id={`valore-${biomarkerId}`}
        name="valore"
        type="text"
        inputMode="decimal"
        autoFocus
        defaultValue={valoreAttuale ?? ""}
        placeholder={unita ? `valore in ${unita}` : "valore"}
        className="w-28 rounded-lg bg-white px-2.5 py-1 text-sm text-ink-900 tnum ring-1 ring-bone-300 focus:ring-2 focus:ring-brand-500"
      />

      <input
        name="nota"
        type="text"
        placeholder="perché (facoltativo)"
        className="min-w-[10rem] flex-1 rounded-lg bg-white px-2.5 py-1 text-sm text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
      />

      <button
        type="submit"
        className="rounded-lg bg-ink-900 px-3 py-1 text-xs font-medium text-bone-50 transition-colors hover:bg-ink-800"
      >
        Salva
      </button>
      <button
        type="button"
        onClick={() => setAperto(false)}
        className="rounded-lg px-2 py-1 text-xs text-ink-400 hover:text-ink-700"
      >
        Annulla
      </button>
    </form>
  );
}

/* ── Decisione su una raccomandazione ─────────────────────────────── */

export function DecidiRaccomandazione({
  recommendationId,
  patientId,
  giaDecisa,
}: {
  recommendationId: string;
  patientId: string;
  giaDecisa: boolean;
}) {
  return (
    <form action={decidiRaccomandazione} className="flex shrink-0 flex-wrap gap-1.5">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="patientId" value={patientId} />

      <button
        type="submit"
        name="decisione"
        value="accolta"
        className="rounded-lg px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-signal-positive"
      >
        {giaDecisa ? "Cambia in accolta" : "Accogli"}
      </button>
      <button
        type="submit"
        name="decisione"
        value="rimandata"
        className="rounded-lg px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-signal-attention"
      >
        Rimanda
      </button>
      <button
        type="submit"
        name="decisione"
        value="respinta"
        className="rounded-lg px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-signal-alert"
      >
        Respingi
      </button>
    </form>
  );
}
