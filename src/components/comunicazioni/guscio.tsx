import type { ReactNode } from "react";
import { NavLink } from "@/components/shell/nav-link";
import { cx } from "@/components/ui/primitives";
import type { Reparto, VoceInbox } from "@/lib/data/comunicazioni";
import {
  ETICHETTE_VISTA,
  NOTE_VISTA,
  VISTE,
  type Vista,
} from "@/lib/comunicazioni/tipi";
import { formatRelativeDays } from "@/lib/format";
import {
  BarraPriorita,
  PastigliaPriorita,
  PastigliaStato,
  Vuoto,
  classiUrgenza,
} from "@/components/comunicazioni/segnali";

/**
 * Il telaio delle comunicazioni.
 *
 * Tre colonne su schermo largo — code, elenco, conversazione — e una
 * sola su telefono. Non è un componente client con uno stato: **ogni
 * conversazione ha un indirizzo**, quindi si apre in una scheda nuova,
 * si mette fra i preferiti, si manda a un collega e torna indietro con
 * il tasto del browser. È la stessa scelta della cartella paziente, e
 * per le stesse tre ragioni.
 *
 * Da qui deriva anche il comportamento su telefono, che non ha bisogno
 * di JavaScript: la pagina dell'elenco mostra l'elenco, quella della
 * conversazione mostra la conversazione con un «indietro» in cima.
 * Nessuna delle due deve sapere cosa sta facendo l'altra.
 */
export function GuscioComunicazioni({
  code,
  elenco,
  dettaglio,
  /** Vero nella pagina di una conversazione: su telefono l'elenco sparisce. */
  aperta = false,
}: {
  code: ReactNode;
  elenco: ReactNode;
  dettaglio: ReactNode;
  aperta?: boolean;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[186px_minmax(0,320px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <aside className={cx("lg:sticky lg:top-[76px]", aperta && "hidden lg:block")}>
        {code}
      </aside>

      <div
        className={cx(
          "mt-5 lg:mt-0 lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-108px)] lg:overflow-y-auto",
          aperta && "hidden lg:block",
        )}
      >
        {elenco}
      </div>

      <div className={cx("mt-5 lg:mt-0", !aperta && "hidden lg:block")}>{dettaglio}</div>
    </div>
  );
}

/* ── Le code ──────────────────────────────────────────────────────── */

/** Costruisce un indirizzo tenendo ciò che c'era già nella barra. */
function indirizzo(base: Record<string, string | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(base)) {
    if (valore) p.set(chiave, valore);
  }
  const q = p.toString();
  return q ? `/pro/comunicazioni?${q}` : "/pro/comunicazioni";
}

export interface StatoFiltri {
  vista: Vista;
  reparto: string | null;
  ricerca: string | null;
}

/**
 * Le sei code e i reparti.
 *
 * Le code non sono filtri: rispondono a domande diverse — *cosa devo
 * leggere*, *cosa non può aspettare*, *cosa ho chiesto io* — e per
 * questo si vedono tutte insieme invece di stare dentro un menu a
 * tendina. Un menu costringe ad aprirlo per ricordare cosa contiene;
 * queste lo mostrano, e il numero accanto dice se vale la pena entrare.
 *
 * **Cambiano forma con lo schermo, non contenuto.** Da schermo largo
 * sono una colonna a sinistra. Sotto, diventano una riga di pastiglie
 * che scorre in orizzontale — la stessa forma delle sezioni della
 * cartella paziente, e per la stessa ragione: in verticale su un
 * telefono occupavano tutto il primo schermo, e per arrivare alla prima
 * conversazione bisognava scorrere oltre dieci collegamenti. Una
 * navigazione che si frappone al contenuto è una navigazione che si
 * impara a saltare.
 */
export function ColonnaCode({
  stato,
  reparti,
  conteggi,
}: {
  stato: StatoFiltri;
  reparti: Reparto[];
  /** Quante righe ha ciascuna coda, per non entrare in una vuota. */
  conteggi: Partial<Record<Vista, number>>;
}) {
  const mieiReparti = reparti.filter((r) => r.mio);
  const altri = reparti.filter((r) => !r.mio);

  return (
    <nav
      aria-label="Code e reparti"
      className={cx(
        // Telefono e tablet: una riga sola che scorre, a filo dei margini
        // della pagina così le pastiglie non sembrano tagliate a metà.
        "-mx-5 flex items-start gap-2 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8",
        "lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0",
      )}
    >
      <Gruppo titolo="Posta" primo>
        {VISTE.map((v) => {
          const attiva = stato.vista === v && !stato.reparto;
          const n = conteggi[v] ?? 0;

          return (
            <Voce
              key={v}
              href={indirizzo({
                vista: v === "tutte" ? null : v,
                q: stato.ricerca,
              })}
              attiva={attiva}
              titolo={NOTE_VISTA[v]}
              conta={n}
            >
              {ETICHETTE_VISTA[v]}
            </Voce>
          );
        })}
      </Gruppo>

      {mieiReparti.length > 0 ? (
        <Gruppo titolo="I miei reparti">
          {mieiReparti.map((r) => (
            <VoceReparto key={r.id} reparto={r} stato={stato} />
          ))}
        </Gruppo>
      ) : null}

      {altri.length > 0 ? (
        <Gruppo titolo="Reparti">
          {altri.map((r) => (
            <VoceReparto key={r.id} reparto={r} stato={stato} />
          ))}
        </Gruppo>
      ) : null}

      <div className="shrink-0 lg:px-3">
        <NavLink
          href="/pro/comunicazioni/registro"
          className="whitespace-nowrap text-xs text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
        >
          Registro →
        </NavLink>
      </div>
    </nav>
  );
}

/**
 * Un gruppo di voci.
 *
 * Il titolo sparisce sotto `lg`: su una riga orizzontale sarebbe una
 * pastiglia che non si clicca in mezzo a pastiglie che si cliccano, e la
 * riga verticale sottile che lo sostituisce dice la stessa cosa — «qui
 * comincia un altro insieme» — occupando trenta volte meno spazio.
 */
function Gruppo({
  titolo,
  primo = false,
  children,
}: {
  titolo: string;
  /** Il primo gruppo non ha niente da cui separarsi. */
  primo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 lg:block">
      {primo ? null : (
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-bone-200 lg:hidden" />
      )}
      <h2 className="hidden px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300 lg:block">
        {titolo}
      </h2>
      <div className="flex shrink-0 gap-1.5 lg:mt-1.5 lg:block lg:space-y-0.5">
        {children}
      </div>
    </div>
  );
}

/** Pastiglia su telefono, riga di menu su schermo largo. */
function Voce({
  href,
  attiva,
  titolo,
  conta = 0,
  nota,
  children,
}: {
  href: string;
  attiva: boolean;
  titolo?: string;
  conta?: number;
  nota?: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink
      href={href}
      aria-current={attiva ? "page" : undefined}
      title={titolo}
      className={cx(
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
        "lg:w-full lg:rounded-xl",
        attiva
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-ink-500 ring-1 ring-bone-200 hover:bg-bone-100 hover:text-ink-900 lg:ring-0",
      )}
    >
      <span className="lg:flex-1 lg:truncate">{children}</span>
      {conta > 0 ? (
        <span
          className={cx("text-[11px] tnum", attiva ? "text-brand-600" : "text-ink-300")}
        >
          {conta}
        </span>
      ) : null}
      {nota}
    </NavLink>
  );
}

function VoceReparto({ reparto, stato }: { reparto: Reparto; stato: StatoFiltri }) {
  const attivo = stato.reparto === reparto.slug;

  return (
    <Voce
      href={indirizzo({
        // Ricliccare il reparto attivo lo toglie: è il gesto che ci si
        // aspetta da un filtro, e senza servirebbe cercare «Tutte».
        reparto: attivo ? null : reparto.slug,
        vista: stato.vista === "tutte" ? null : stato.vista,
        q: stato.ricerca,
      })}
      attiva={attivo}
      titolo={reparto.descrizione ?? undefined}
      nota={
        !reparto.clinico ? (
          <span
            aria-label="non clinico"
            className="text-[10px] uppercase tracking-[0.06em] text-ink-300"
          >
            amm
          </span>
        ) : null
      }
    >
      {reparto.nome}
    </Voce>
  );
}

/* ── L'elenco ─────────────────────────────────────────────────────── */

/**
 * L'elenco delle conversazioni.
 *
 * L'ordine è per ultimo messaggio e non per non-letti: una
 * conversazione a cui si è già risposto ma che è ancora viva vale più di
 * una vecchia con un pallino sopra. Chi vuole l'altro ordine ha la coda
 * «Non lette», che è una domanda diversa e ha il suo indirizzo.
 */
export function ElencoConversazioni({
  voci,
  attiva,
  vuoto,
}: {
  voci: VoceInbox[];
  attiva?: string | null;
  vuoto: ReactNode;
}) {
  if (voci.length === 0) {
    return (
      <div className="rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
        {vuoto}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-bone-200/80 overflow-hidden rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
      {voci.map((v) => {
        const corrente = v.id === attiva;

        return (
          <li key={v.id}>
            <NavLink
              href={`/pro/comunicazioni/${v.id}`}
              aria-current={corrente ? "page" : undefined}
              className={cx(
                "flex gap-3 px-4 py-3 transition-colors",
                corrente ? "bg-brand-50" : cx("hover:bg-bone-50", classiUrgenza(v.priorita, v.chiusa)),
              )}
            >
              <BarraPriorita priorita={v.priorita} />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cx(
                      "min-w-0 truncate text-[14px] leading-snug",
                      v.nonLetti > 0 ? "font-semibold text-ink-900" : "text-ink-900",
                    )}
                  >
                    {v.titolo}
                  </p>
                  <span className="shrink-0 text-[11px] text-ink-300 tnum">
                    {formatRelativeDays(v.ultimoIl)}
                  </span>
                </div>

                {v.con.length > 0 || v.paziente ? (
                  <p className="mt-0.5 truncate text-xs text-ink-400">
                    {v.con.slice(0, 3).join(" · ")}
                    {v.con.length > 3 ? ` +${v.con.length - 3}` : ""}
                    {v.paziente ? `${v.con.length > 0 ? " · " : ""}${v.paziente}` : ""}
                  </p>
                ) : null}

                {v.anteprima ? (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
                    {v.anteprima}
                  </p>
                ) : null}

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PastigliaPriorita priorita={v.priorita} />
                  {v.statoConsulto ? <PastigliaStato stato={v.statoConsulto} /> : null}
                  {v.chiusa ? (
                    <span className="text-[11px] uppercase tracking-[0.06em] text-ink-300">
                      chiusa
                    </span>
                  ) : null}
                  {v.silenziata ? (
                    <span className="text-[11px] uppercase tracking-[0.06em] text-ink-300">
                      silenziata
                    </span>
                  ) : null}
                  {v.nonLetti > 0 ? (
                    <span
                      aria-label={`${v.nonLetti} da leggere`}
                      className="ml-auto inline-flex min-w-[20px] justify-center rounded-full bg-[#fdf6e8] px-1.5 py-0.5 text-[11px] font-semibold text-signal-attention ring-1 ring-[#f0e0bd] tnum"
                    >
                      {v.nonLetti}
                    </span>
                  ) : null}
                </div>
              </div>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Il posto della conversazione, finché non se ne apre una. */
export function NessunaConversazione() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
      <Vuoto titolo="Scegli una conversazione">
        A sinistra c’è ciò a cui partecipi, in ordine di ultimo messaggio. Le
        code in cima rispondono a domande diverse: cosa devi leggere, cosa non
        può aspettare, cosa hai chiesto tu.
      </Vuoto>
    </div>
  );
}
