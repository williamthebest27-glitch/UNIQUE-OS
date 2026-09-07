"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cx } from "@/components/ui/primitives";
import { apriCoda } from "@/lib/comando/azioni";
import { attesaDa, descriviEvento, oraDi, tonoEvento } from "@/lib/comando/vocabolario";
import type { Coda, RigaCoda, StatoClinica } from "@/lib/data/stato-clinica";

/**
 * Il Command Center.
 *
 * Tre cifre, le code, il feed. In quest'ordine perché rispondono a tre
 * domande che si fanno in quest'ordine: *quanto grande è oggi*, *cosa è
 * fermo*, *cosa sta succedendo adesso*.
 *
 * È l'unica schermata di Unique pensata anche per essere **guardata da
 * lontano** — un monitor appeso in una stanza, non uno schermo a trenta
 * centimetri. Da qui le cifre sproporzionate, e il fatto che nessuna
 * informazione stia in un colore soltanto: a due metri il colore si
 * vede e la sfumatura no.
 */

/* ── Le cifre ─────────────────────────────────────────────────────
   Non `Kpi`: quello è tarato su una striscia di quattro numeri densi,
   e qui i numeri sono tre e devono leggersi dall'altro lato della
   stanza. Stesse regole — cifre tabulari, etichetta in maiuscoletto —
   con un corpo diverso. */

function Cifra({
  valore,
  etichetta,
  nota,
  acceso = false,
}: {
  valore: number;
  etichetta: string;
  nota?: string;
  /** Il rosa del marchio, che in Unique è il colore dell'urgenza. */
  acceso?: boolean;
}) {
  return (
    <div className="bg-ink-900 px-2 py-5 text-center sm:px-5 sm:py-9">
      <p
        className={cx(
          "font-display text-[clamp(30px,8vw,64px)] leading-none tnum",
          acceso && valore > 0 ? "text-brand-300" : "text-bone-50",
        )}
      >
        {valore}
      </p>
      <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-bone-50/50 sm:text-[11px] sm:tracking-[0.16em]">
        {etichetta}
      </p>
      {/* La chiosa sparisce sul telefono: a un terzo di 375px andrebbe a
          capo tre volte, e tre righe di grigio sotto ogni cifra sono
          esattamente ciò che spinge le code sotto la piega. */}
      {nota ? <p className="mt-1.5 hidden text-xs text-bone-50/35 sm:block">{nota}</p> : null}
    </div>
  );
}

/* ── Una coda ─────────────────────────────────────────────────── */

/**
 * La barretta a sinistra porta il tono, e il tono non porta mai
 * l'informazione da solo: l'etichetta dice già cosa è fermo. Su fondo
 * scuro `signal-alert` è quasi illeggibile come testo — va bene come
 * superficie piena, che è come lo usa il resto della control room.
 */
const BARRA: Record<Coda["tono"], string> = {
  grave: "bg-signal-alert",
  attesa: "bg-gold-500",
  neutro: "bg-white/15",
};

function CodaRiga({ coda }: { coda: Coda }) {
  const [righe, setRighe] = useState<RigaCoda[] | null>(null);
  const [aperta, setAperta] = useState(false);
  const [caricamento, avvia] = useTransition();

  const vuota = coda.quante === 0;

  function alterna() {
    if (vuota) return;

    if (aperta) {
      setAperta(false);
      return;
    }

    setAperta(true);

    // Si chiedono una volta sola: riaprire una coda già letta non deve
    // ripagare la query. Il tempo reale rirenderizza comunque la
    // pagina, e con lei questo componente.
    if (righe === null) avvia(() => void apriCoda(coda.chiave).then(setRighe));
  }

  return (
    <li className="border-t border-white/[0.07] first:border-t-0">
      <div className="flex items-stretch">
        <span
          aria-hidden
          className={cx("w-[3px] shrink-0", vuota ? "bg-transparent" : BARRA[coda.tono])}
        />

        <button
          type="button"
          onClick={alterna}
          disabled={vuota}
          aria-expanded={aperta}
          className={cx(
            "flex min-w-0 flex-1 items-baseline gap-4 px-4 py-3.5 text-left transition-colors sm:px-5",
            vuota ? "cursor-default" : "hover:bg-white/[0.04]",
          )}
        >
          <span
            className={cx(
              "w-12 shrink-0 font-display text-[26px] leading-none tnum",
              vuota ? "text-bone-50/25" : "text-bone-50",
            )}
          >
            {coda.quante}
          </span>

          <span className="min-w-0 flex-1">
            <span className={cx("block text-[15px]", vuota ? "text-bone-50/40" : "text-bone-50")}>
              {coda.etichetta}
            </span>
            <span className="mt-0.5 block text-xs text-bone-50/40">{coda.nota}</span>
          </span>

          {vuota ? null : (
            <span aria-hidden className="shrink-0 text-bone-50/30">
              {aperta ? "−" : "+"}
            </span>
          )}
        </button>

        {coda.href ? (
          <Link
            href={coda.href}
            className="hidden shrink-0 items-center px-5 text-xs text-bone-50/40 transition-colors hover:text-bone-50 sm:flex"
          >
            Apri
          </Link>
        ) : null}
      </div>

      {aperta ? (
        <div className="border-t border-white/[0.07] bg-black/20 pl-[3px]">
          {caricamento && righe === null ? (
            <p className="px-5 py-4 text-sm text-bone-50/40">Leggo…</p>
          ) : righe && righe.length > 0 ? (
            <ul>
              {righe.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.05] px-4 py-2.5 first:border-t-0 sm:px-5"
                >
                  <span className="min-w-0">
                    {r.pazienteId ? (
                      <Link
                        href={`/pro/pazienti/${r.pazienteId}`}
                        className="text-[15px] text-bone-50 underline-offset-4 hover:underline"
                      >
                        {r.paziente}
                      </Link>
                    ) : (
                      <span className="text-[15px] text-bone-50/60">{r.paziente}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-bone-50/40">
                      {r.dettaglio ? `${r.titolo} · ${r.dettaglio}` : r.titolo}
                    </span>
                  </span>
                  <span className="text-xs text-bone-50/40 tnum">{attesaDa(r.quando)}</span>
                </li>
              ))}
            </ul>
          ) : (
            /* Il conteggio e le righe passano dalle stesse policy, ma
               non dallo stesso istante: fra i due viaggi qualcuno può
               aver preso in carico l'ultima. Dirlo è meglio che
               mostrare un vuoto che sembra un guasto. */
            <p className="px-5 py-4 text-sm text-bone-50/40">
              Nessuna riga da mostrare: potrebbero essere state prese in carico proprio adesso.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/* ── La schermata ─────────────────────────────────────────────── */

export function Comando({ stato }: { stato: StatoClinica }) {
  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-bone-50/35">
          Unique OS
        </p>
        <h1 className="mt-2 font-display text-[clamp(28px,5vw,38px)] leading-tight tracking-[0.02em] text-bone-50">
          Clinical Command
        </h1>
      </header>

      {/* Tre colonne anche sul telefono. Impilate erano una prima
          schermata intera di sole cifre, e le code — che sono il motivo
          per cui si apre questa pagina — cominciavano sotto la piega. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-card bg-white/10 ring-1 ring-white/10">
        <Cifra valore={stato.pazienti} etichetta="Pazienti" nota="In anagrafica" />
        {/* Non «ricoveri»: qui non ci sono degenze, e un contatore di
            posti letto sarebbe un numero che nessuno può verificare
            guardando altrove. */}
        <Cifra valore={stato.oggi} etichetta="Oggi in clinica" nota="Appuntamenti di giornata" />
        <Cifra valore={stato.urgenti} etichetta="Urgenti" nota="Consulti aperti" acceso />
      </div>

      <section className="rounded-card bg-white/[0.04] ring-1 ring-white/10">
        <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-bone-50/70">
            Code
          </h2>
          <p className="text-xs text-bone-50/40 tnum">
            {stato.arretrato === 0
              ? "Niente in attesa"
              : `${stato.arretrato} in attesa · apri una riga per vedere quali`}
          </p>
        </header>

        <ul>
          {stato.code.map((c) => (
            <CodaRiga key={c.chiave} coda={c} />
          ))}
        </ul>
      </section>

      <section className="rounded-card bg-white/[0.04] ring-1 ring-white/10">
        <header className="px-5 pt-4 pb-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-bone-50/70">
            Attività recenti
          </h2>
          <p className="mt-1 text-xs text-bone-50/40">
            Ogni fatto della clinica, nell&apos;ordine in cui è successo.
          </p>
        </header>

        {stato.attivita.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-bone-50/40">
            Ancora niente da raccontare.
          </p>
        ) : (
          <ul>
            {stato.attivita.map((e) => {
              const tono = tonoEvento(e.nome);

              return (
                <li
                  key={e.id}
                  className="flex items-baseline gap-4 border-t border-white/[0.07] px-5 py-2.5 first:border-t-0"
                >
                  <span className="shrink-0 text-sm text-bone-50/40 tnum">{oraDi(e.quando)}</span>
                  <span
                    aria-hidden
                    className={cx(
                      "size-1.5 shrink-0 rounded-full",
                      tono === "grave"
                        ? "bg-signal-alert"
                        : tono === "clinico"
                          ? "bg-brand-300"
                          : "bg-white/20",
                    )}
                  />
                  <span
                    className={cx(
                      "min-w-0 text-[15px]",
                      tono === "neutro" ? "text-bone-50/70" : "text-bone-50",
                    )}
                  >
                    {descriviEvento(e.nome)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
