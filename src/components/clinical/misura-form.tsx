"use client";

import { useActionState, useState } from "react";
import { registraMisura } from "@/lib/clinical/actions";
import { statoTestoIniziale } from "@/lib/clinical/state";
import { cx } from "@/components/ui/primitives";

/**
 * Una misura presa in visita.
 *
 * Il campo del parametro è una `<datalist>` e non un menu a tendina: il
 * catalogo ha una trentina di voci, e trovare «pressione diastolica»
 * scorrendo una tendina mentre si ha il bracciale in mano è più lento
 * che scriverne tre lettere. Chi non ricorda il nome esatto lo vede
 * comunque comparire.
 *
 * L'unità di misura non si chiede: la conosce il catalogo. Chiederla
 * significherebbe accettare che qualcuno scriva mmol/L dove il resto del
 * sistema assume mg/dL, ed è esattamente l'errore che il controllo di
 * plausibilità esiste per fermare.
 */

export interface VoceCatalogo {
  codice: string;
  label: string;
  unita: string;
  pilastro: string;
}

export function MisuraForm({
  patientId,
  catalogo,
}: {
  patientId: string;
  catalogo: VoceCatalogo[];
}) {
  const [stato, azione, inCorso] = useActionState(registraMisura, statoTestoIniziale);
  const [scelto, setScelto] = useState("");

  const voce = catalogo.find(
    (v) => v.label.toLowerCase() === scelto.trim().toLowerCase() || v.codice === scelto,
  );

  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <form action={azione} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="metricCode" value={voce?.codice ?? ""} />

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[14rem] flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
            Parametro
          </span>
          <input
            list="catalogo-metriche"
            value={scelto}
            onChange={(e) => setScelto(e.target.value)}
            placeholder="Pressione sistolica"
            className="mt-1.5 w-full rounded-lg bg-bone-50 px-3 py-2 text-[15px] text-ink-900 ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
          />
          <datalist id="catalogo-metriche">
            {catalogo.map((v) => (
              <option key={v.codice} value={v.label}>
                {v.unita} · {v.pilastro}
              </option>
            ))}
          </datalist>
        </label>

        <label className="w-32">
          <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
            Valore
          </span>
          <div className="relative mt-1.5">
            <input
              name="valore"
              inputMode="decimal"
              placeholder="120"
              className="w-full rounded-lg bg-bone-50 py-2 pl-3 pr-12 text-[15px] text-ink-900 tnum ring-1 ring-bone-200 placeholder:text-ink-300 focus:ring-2 focus:ring-brand-500"
            />
            {voce ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                {voce.unita}
              </span>
            ) : null}
          </div>
        </label>

        <label className="w-40">
          <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
            Rilevata il
          </span>
          <input
            type="date"
            name="misurataIl"
            defaultValue={oggi}
            className="mt-1.5 w-full rounded-lg bg-bone-50 px-3 py-2 text-[15px] text-ink-900 ring-1 ring-bone-200 focus:ring-2 focus:ring-brand-500"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={inCorso || !voce}
          className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {inCorso ? "Registro…" : "Registra la misura"}
        </button>

        {scelto && !voce ? (
          <span className="text-xs text-signal-attention">
            Non è un parametro del catalogo: scegline uno dall&apos;elenco.
          </span>
        ) : (
          <span className="text-xs text-ink-400">
            Entra in cartella firmata da te, senza passare dalla coda di revisione.
          </span>
        )}
      </div>

      {stato.esito !== "iniziale" ? (
        <p
          role="status"
          className={cx(
            "rounded-lg px-3 py-2 text-sm leading-relaxed ring-1",
            stato.esito === "ok"
              ? "bg-[#e9f6ee] text-signal-positive ring-[#cdebd8]"
              : "bg-brand-50 text-signal-alert ring-brand-100",
          )}
        >
          {stato.messaggio}
        </p>
      ) : null}
    </form>
  );
}
