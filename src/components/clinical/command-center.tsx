import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/shell/nav-link";
import { cx } from "@/components/ui/primitives";
import type { PrioritaAttenzione } from "@/lib/clinical/attenzione";

/**
 * Gli elementi del command center clinico.
 *
 * Il design di Unique dice una cosa netta sull'area professionale:
 * eredita tipografia e palette, **non la Signature né il movimento**. Un
 * medico fra due pazienti non ha bisogno di uno shader — ha bisogno di
 * capire in tre secondi cosa lo aspetta. Qui dentro non c'è
 * un'animazione.
 *
 * L'altra regola che governa questo file è negativa: **niente quaranta
 * card uguali**. Una card è un contenitore neutro, e quaranta contenitori
 * neutri costringono a leggerli tutti per scoprire quale conta. Al loro
 * posto tre forme, ciascuna con un mestiere:
 *
 *   `Striscia`  i numeri della giornata, su una riga sola. Sono contesto,
 *               non lavoro: nessuno di essi si clicca per fare qualcosa.
 *
 *   `Coda`      il lavoro, in ordine di urgenza. Una riga per cosa da
 *               fare, con dentro il perché e un solo verbo per agire.
 *
 *   `Riquadro`  tutto il resto, e comincia già aperto o già chiuso a
 *               seconda che serva guardarlo o solo saperlo lì.
 *
 * Il rosso è il marchio, quindi da solo non vuol dire «va male»: la
 * priorità si legge dalla posizione e da una barra sottile, non da un
 * campo colorato che griderebbe su ogni riga.
 */

/* ── La striscia della giornata ───────────────────────────────────── */

/**
 * I numeri di oggi, su una riga sola.
 *
 * Divisi da linee e non impilati in card: sono grandezze omogenee che si
 * leggono di fila, e nove card identiche le renderebbero nove domande
 * separate invece di un colpo d'occhio.
 */
export function Striscia({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-bone-200 ring-1 ring-bone-200 sm:grid-cols-3 lg:grid-cols-6 [&>*]:bg-white">
      {children}
    </div>
  );
}

/**
 * Un numero della striscia.
 *
 * Diventa un collegamento solo quando c'è un posto dove andare. Un
 * numero che si può cliccare e uno che no devono essere distinguibili
 * senza provare: qui il primo ha la freccia e reagisce, il secondo no.
 */
export function Numero({
  etichetta,
  valore,
  nota,
  href,
  tono = "neutro",
}: {
  etichetta: string;
  valore: number | string;
  nota?: string;
  href?: string;
  tono?: "neutro" | "attenzione" | "urgente" | "quieto";
}) {
  const spento = valore === 0 || valore === "0";

  const colore = spento
    ? "text-ink-300"
    : tono === "urgente"
      ? "text-signal-alert"
      : tono === "attenzione"
        ? "text-signal-attention"
        : tono === "quieto"
          ? "text-ink-400"
          : "text-ink-900";

  const corpo = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-400">
        {etichetta}
      </p>
      <p className={cx("mt-1.5 font-display text-[28px] leading-none tnum", colore)}>
        {valore}
      </p>
      {nota ? <p className="mt-1 text-xs leading-snug text-ink-400">{nota}</p> : null}
    </>
  );

  if (!href || spento) {
    return <div className="px-4 py-3.5">{corpo}</div>;
  }

  return (
    <NavLink
      href={href}
      className="group block px-4 py-3.5 transition-colors hover:bg-bone-50"
    >
      {corpo}
      <span
        aria-hidden="true"
        className="mt-1 inline-block text-xs text-ink-300 transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </NavLink>
  );
}

/* ── Priorità ─────────────────────────────────────────────────────── */

/**
 * La priorità come barra verticale, non come pastiglia colorata.
 *
 * Una pastiglia per riga, su venti righe, sono venti pastiglie: il
 * colore smette di significare qualcosa nel momento in cui è ovunque.
 * Una barra alta quanto la riga si legge con la coda dell'occhio
 * scorrendo la colonna, ed è invisibile quando non c'è nulla di urgente.
 */
export function Priorita({ livello }: { livello: PrioritaAttenzione }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "w-[3px] shrink-0 self-stretch rounded-full",
        livello === 1
          ? "bg-brand-600"
          : livello === 2
            ? "bg-gold-500"
            : "bg-bone-300",
      )}
    />
  );
}

/** La stessa informazione, per chi legge con uno screen reader. */
export function PrioritaTesto({ livello }: { livello: PrioritaAttenzione }) {
  return (
    <span className="sr-only">
      {livello === 1 ? "Priorità alta." : livello === 2 ? "Priorità media." : "Priorità bassa."}
    </span>
  );
}

/* ── Sezioni ──────────────────────────────────────────────────────── */

/**
 * Un riquadro del command center.
 *
 * `apribile` lo rende un `<details>`: il contenuto esiste nel documento,
 * si trova con la ricerca del browser e si legge con uno screen reader
 * anche da chiuso. È progressive disclosure senza una riga di
 * JavaScript, che nell'area clinica è l'unica che vale la pena scrivere.
 */
export function Riquadro({
  titolo,
  nota,
  conta,
  tutto,
  azione,
  apribile = false,
  aperto = true,
  children,
  className,
}: {
  titolo: string;
  nota?: string;
  /** Compare accanto al titolo. Zero non si mostra: è già l'assenza. */
  conta?: number;
  /** Il collegamento all'elenco completo, quando qui c'è un'anteprima. */
  tutto?: { label: string; href: string };
  azione?: ReactNode;
  apribile?: boolean;
  aperto?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const intestazione = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
          {titolo}
        </h2>
        {conta !== undefined && conta > 0 ? (
          <span className="text-[13px] font-semibold text-ink-300 tnum">{conta}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {azione}
        {tutto ? (
          <NavLink
            href={tutto.href}
            className="text-xs text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
          >
            {tutto.label} →
          </NavLink>
        ) : null}
      </div>
    </div>
  );

  const guscio = "rounded-card bg-white shadow-card ring-1 ring-bone-200/70";

  if (apribile) {
    return (
      <details open={aperto} className={cx(guscio, "group", className)}>
        <summary className="cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 text-ink-300 transition-transform group-open:rotate-90"
            >
              ›
            </span>
            <div className="min-w-0 flex-1">
              {intestazione}
              {nota ? <p className="mt-1 text-sm text-ink-400">{nota}</p> : null}
            </div>
          </div>
        </summary>
        <div className="border-t border-bone-200">{children}</div>
      </details>
    );
  }

  return (
    <section className={cx(guscio, className)}>
      <div className="px-6 pt-5 pb-1">
        {intestazione}
        {nota ? <p className="mt-1 text-sm text-ink-400">{nota}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Riga vuota che dice cosa comparirà qui, non solo che non c'è nulla. */
export function Niente({ children }: { children: ReactNode }) {
  return <p className="px-6 py-7 text-center text-sm text-ink-400">{children}</p>;
}

/* ── La coda di lavoro ────────────────────────────────────────────── */

export function Coda({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-bone-200/80">{children}</ul>;
}

/**
 * Una riga di lavoro.
 *
 * La forma è sempre la stessa e l'ordine delle informazioni non cambia
 * mai: priorità, cosa, di chi, perché, quando, cosa fare. Chi scorre
 * venti righe impara la posizione una volta sola e poi legge solo la
 * colonna che gli serve — è la ragione per cui una tabella irregolare si
 * legge più lentamente di una noiosa.
 */
export function RigaLavoro({
  priorita,
  titolo,
  paziente,
  pazienteHref,
  motivo,
  quando,
  etichetta,
  azione,
  extra,
}: {
  priorita: PrioritaAttenzione;
  titolo: string;
  paziente?: string | null;
  pazienteHref?: string | null;
  motivo?: string[];
  quando?: string | null;
  /** La categoria, in una parola. */
  etichetta?: string;
  azione?: { label: string; href: string } | null;
  /** Moduli di azione rapida: si mettono qui, dopo il verbo principale. */
  extra?: ReactNode;
}) {
  return (
    <li className="flex gap-3.5 px-6 py-4">
      <Priorita livello={priorita} />
      <PrioritaTesto livello={priorita} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="text-[15px] font-medium leading-snug text-ink-900">{titolo}</p>
          {etichetta ? (
            <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
              {etichetta}
            </span>
          ) : null}
        </div>

        {paziente ? (
          <p className="mt-0.5 text-sm">
            {pazienteHref ? (
              <NavLink
                href={pazienteHref}
                className="text-brand-700 underline-offset-4 hover:underline"
              >
                {paziente}
              </NavLink>
            ) : (
              <span className="text-ink-500">{paziente}</span>
            )}
          </p>
        ) : null}

        {motivo && motivo.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {motivo.map((riga) => (
              <li key={riga} className="text-sm leading-relaxed text-ink-500">
                {riga}
              </li>
            ))}
          </ul>
        ) : null}

        {quando ? <p className="mt-1 text-xs text-ink-300 tnum">{quando}</p> : null}
      </div>

      {azione || extra ? (
        <div className="flex shrink-0 flex-col items-end gap-2">
          {azione ? (
            <NavLink
              href={azione.href}
              className="rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
            >
              {azione.label}
            </NavLink>
          ) : null}
          {extra}
        </div>
      ) : null}
    </li>
  );
}

/* ── Azioni ───────────────────────────────────────────────────────── */

/**
 * Il verbo principale di un riquadro.
 *
 * Uno per riquadro. Due pulsanti pieni sulla stessa scheda chiedono a
 * chi legge di scegliere prima di aver capito.
 */
export function Verbo({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50",
        "transition-colors hover:bg-ink-800 disabled:opacity-50",
        props.className,
      )}
    >
      {children}
    </button>
  );
}

/** Un'azione secondaria: si vede, non chiama. */
export function VerboQuieto({
  children,
  tono = "neutro",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tono?: "neutro" | "rifiuto";
}) {
  return (
    <button
      {...props}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm ring-1 ring-bone-200 transition-colors disabled:opacity-50",
        tono === "rifiuto"
          ? "text-ink-500 hover:text-signal-alert"
          : "text-ink-600 hover:bg-bone-50 hover:text-brand-700",
        props.className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Il collegamento rapido: si vede da lontano che porta altrove.
 *
 * Usato nelle intestazioni e nelle strisce di scorciatoie, dove
 * l'alternativa sarebbe un pulsante pieno che competerebbe con il verbo
 * della pagina.
 */
export function Scorciatoia({
  href,
  children,
  icona,
}: {
  href: string;
  children: ReactNode;
  icona?: ReactNode;
}) {
  return (
    <NavLink
      href={href}
      className={cx(
        "inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm text-ink-600",
        "ring-1 ring-bone-200 transition-colors hover:text-brand-700 hover:ring-brand-100",
        "[&_svg]:h-4 [&_svg]:w-4",
      )}
    >
      {icona ? <span className="text-ink-400">{icona}</span> : null}
      {children}
    </NavLink>
  );
}

/* ── Il confine dell'AI ───────────────────────────────────────────── */

/**
 * L'etichetta che accompagna ogni output del motore.
 *
 * Non è una formalità legale da mettere in fondo in grigio chiaro: è la
 * differenza fra un supporto e una decisione, e va letta **prima** del
 * contenuto, non dopo. Per questo sta sopra, e per questo dice cosa il
 * motore ha guardato — un supporto decisionale di cui non si conoscono
 * le fonti non è verificabile, e quindi non è un supporto.
 */
export function ConfineAI({
  fonte,
  children,
}: {
  /** Cosa ha letto il motore per produrre questo. */
  fonte?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-bone-50 px-3 py-2 ring-1 ring-bone-200">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        Supporto decisionale
      </span>
      <span className="text-xs leading-relaxed text-ink-400">
        {children ?? "Non sostituisce il giudizio clinico. Verifica i dati citati."}
      </span>
      {fonte ? (
        <span className="w-full text-xs text-ink-400">
          Fondato su: <span className="text-ink-500">{fonte}</span>
        </span>
      ) : null}
    </div>
  );
}

/* ── Navigazione contestuale ──────────────────────────────────────── */

/**
 * Le sezioni di un workspace.
 *
 * Un `<nav>` di collegamenti e non un componente client con lo stato:
 * ogni sezione è una rotta, quindi si apre in una scheda nuova, si mette
 * fra i preferiti e si condivide con un collega. Uno stato in React
 * avrebbe risparmiato una navigazione e tolto tutte e tre le cose.
 */
export function SezioniWorkspace({
  voci,
  attiva,
}: {
  voci: { href: string; label: string; conta?: number }[];
  attiva: string;
}) {
  return (
    <nav
      aria-label="Sezioni della cartella"
      className="-mx-1 flex gap-1 overflow-x-auto pb-px"
    >
      {voci.map((voce) => {
        const corrente = voce.href === attiva;
        return (
          <NavLink
            key={voce.href}
            href={voce.href}
            aria-current={corrente ? "page" : undefined}
            className={cx(
              "shrink-0 rounded-lg px-3 py-2 text-sm transition-colors",
              corrente
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-500 hover:bg-bone-100 hover:text-ink-900",
            )}
          >
            {voce.label}
            {voce.conta !== undefined && voce.conta > 0 ? (
              <span
                className={cx(
                  "ml-1.5 text-xs tnum",
                  corrente ? "text-brand-600" : "text-ink-300",
                )}
              >
                {voce.conta}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Il ritorno da dove si è arrivati.
 *
 * Un `Link` normale e non `NavLink`: indietro non si prefetch al
 * passaggio del mouse, perché è la pagina da cui si viene ed è già lì.
 */
export function Indietro({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-ink-400 transition-colors hover:text-ink-700"
    >
      ← {children}
    </Link>
  );
}
