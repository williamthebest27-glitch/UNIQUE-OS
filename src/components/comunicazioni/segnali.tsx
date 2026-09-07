import type { ReactNode } from "react";
import {
  ETICHETTE_PRIORITA,
  ETICHETTE_STATO,
  ETICHETTE_TIPO,
  eUrgente,
  livelloPriorita,
  tonoPriorita,
  tonoStato,
  type Priorita,
  type StatoConsulto,
  type TipoMessaggio,
} from "@/lib/comunicazioni/tipi";
import { Badge, cx } from "@/components/ui/primitives";

/**
 * Come si legge l'urgenza, senza gridare.
 *
 * Il rosso in Unique è il colore del **marchio**: sta sul pulsante
 * principale, sul link attivo, sul logotipo. Usarlo anche per «priorità
 * alta» significherebbe che metà interfaccia sembra in emergenza, e dopo
 * due giorni nessuno lo vedrebbe più.
 *
 * Da qui la scala che questi componenti applicano:
 *
 *   `normal` e `low`   nessun segno. Il silenzio è l'informazione.
 *   `high`             una pastiglia oro, che si nota scorrendo.
 *   `urgent`           pastiglia rossa e barra verticale.
 *   `critical`         come sopra, più una fascia sulla riga intera.
 *
 * La barra verticale è la stessa del command center clinico, ed è
 * deliberato: un medico che sa già leggere la coda di «Attenzione» non
 * deve imparare un secondo alfabeto per la coda dei messaggi.
 */

/* ── Priorità ─────────────────────────────────────────────────────── */

export function PastigliaPriorita({ priorita }: { priorita: Priorita }) {
  // Normale non si dice: una pastiglia su ogni riga è nessuna pastiglia.
  if (priorita === "normal" || priorita === "low") return null;

  return <Badge tone={tonoPriorita(priorita)}>{ETICHETTE_PRIORITA[priorita]}</Badge>;
}

/** La barra alta quanto la riga. Invisibile quando non c'è nulla di urgente. */
export function BarraPriorita({ priorita }: { priorita: Priorita }) {
  const livello = livelloPriorita(priorita);

  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "w-[3px] shrink-0 self-stretch rounded-full",
          livello === 1 ? "bg-brand-600" : livello === 2 ? "bg-gold-500" : "bg-bone-200",
        )}
      />
      <span className="sr-only">Priorità {ETICHETTE_PRIORITA[priorita].toLowerCase()}.</span>
    </>
  );
}

/* ── Tipo di messaggio ────────────────────────────────────────────── */

/**
 * Di cosa si parla, in una parola.
 *
 * «Informazione» non si scrive: è il valore predefinito, e una riga su
 * cui c'è scritto «informazione» ha speso spazio per non dire niente.
 */
export function EtichettaTipo({ tipo }: { tipo: TipoMessaggio }) {
  if (tipo === "info") return null;

  return (
    <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
      {ETICHETTE_TIPO[tipo]}
    </span>
  );
}

/* ── Stato del consulto ───────────────────────────────────────────── */

export function PastigliaStato({ stato }: { stato: StatoConsulto }) {
  return <Badge tone={tonoStato(stato)}>{ETICHETTE_STATO[stato]}</Badge>;
}

/* ── La fascia di ciò che non aspetta ─────────────────────────────── */

/**
 * Il fondo che una riga urgente si porta dietro.
 *
 * Tinto appena — `brand-50` è quasi bianco — perché deve distinguersi
 * scorrendo l'elenco e non deve rendere il testo più difficile da
 * leggere. Un fondo saturo su una riga di testo clinico è il modo più
 * elegante di far sbagliare a leggere un dosaggio.
 */
export function classiUrgenza(priorita: Priorita, chiusa = false): string {
  if (chiusa || !eUrgente(priorita)) return "";
  return priorita === "critical" ? "bg-brand-50/70" : "bg-brand-50/40";
}

/* ── Righe vuote ──────────────────────────────────────────────────── */

/**
 * Cosa comparirà qui.
 *
 * Una riga vuota che dice «nessun risultato» insegna soltanto che la
 * schermata funziona. Una che dice cosa la riempirà insegna a usarla, ed
 * è l'unico momento in cui qualcuno legge davvero un'istruzione.
 */
export function Vuoto({
  titolo,
  children,
  azione,
}: {
  titolo: string;
  children?: ReactNode;
  azione?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[15px] text-ink-500">{titolo}</p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-400">
          {children}
        </p>
      ) : null}
      {azione ? <div className="mt-4 flex justify-center">{azione}</div> : null}
    </div>
  );
}
