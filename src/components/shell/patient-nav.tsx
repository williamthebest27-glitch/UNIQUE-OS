"use client";

import { NavLink } from "@/components/shell/nav-link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui/primitives";
import { IconaDiSezione } from "@/components/ui/icone";
import {
  GRUPPI_PAZIENTE,
  STRUMENTI_PAZIENTE,
  TUTTE_LE_VOCI,
  VOCI_IN_BARRA,
  type VoceSezione,
} from "@/lib/patient/sezioni";

/**
 * La navigazione del paziente.
 *
 * Due disegni diversi, non uno adattato: su schermo largo una colonna
 * che si può stringere a sole icone, su telefono quattro voci a portata
 * di pollice e un pannello per il resto. Rendere "responsive" la colonna
 * laterale avrebbe prodotto un menu che su telefono nessuno apre.
 */

function attiva(percorso: string, href: string): boolean {
  return percorso === href || percorso.startsWith(`${href}/`);
}

/* ── Colonna laterale ─────────────────────────────────────────────── */

const CHIAVE_STRETTA = "unique.nav.stretta";

function Voce({
  voce,
  percorso,
  stretta,
  pallino,
}: {
  voce: VoceSezione;
  percorso: string;
  stretta: boolean;
  pallino?: number;
}) {
  const qui = attiva(percorso, voce.href);

  return (
    <NavLink
      href={voce.href}
      aria-current={qui ? "page" : undefined}
      title={stretta ? voce.etichetta : undefined}
      className={cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
        "[&_svg]:h-[18px] [&_svg]:w-[18px]",
        stretta && "justify-center px-0",
        qui
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-ink-500 hover:bg-bone-100 hover:text-ink-900",
      )}
    >
      <span className={cx("relative shrink-0", qui ? "text-brand-600" : "text-ink-400")}>
        <IconaDiSezione nome={voce.icona} />
        {pallino && pallino > 0 ? (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
        ) : null}
      </span>

      {stretta ? (
        <span className="sr-only">{voce.etichetta}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{voce.etichetta}</span>
          {pallino && pallino > 0 ? (
            <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white tnum">
              {pallino > 9 ? "9+" : pallino}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

/**
 * La colonna intera, non solo il menu.
 *
 * Sta qui e non nel layout perché la larghezza dipende dallo stato
 * "stretta", e quello vive nel browser: un layout server-side non può
 * saperlo. Lo stato sta in un posto solo — qui — e scende come
 * proprietà: due componenti che leggono la stessa chiave di
 * `localStorage` andrebbero fuori sincrono al primo clic.
 *
 * Il marchio e il blocco in fondo arrivano da fuori come contenuto, così
 * la colonna non conosce né il profilo né l'azione di uscita.
 */
export function ColonnaPaziente({
  marchio,
  marchioStretto,
  piede,
  messaggiNonLetti = 0,
  questionariDaFare = 0,
}: {
  marchio: React.ReactNode;
  /** Il marchio a colonna stretta: una lettera, non un logo rimpicciolito. */
  marchioStretto: React.ReactNode;
  piede: React.ReactNode;
  messaggiNonLetti?: number;
  questionariDaFare?: number;
}) {
  const [stretta, setStretta] = useState(false);

  // La preferenza vive nel browser di chi la esprime: è una comodità
  // personale, non un dato da conservare altrove.
  useEffect(() => {
    try {
      setStretta(window.localStorage.getItem(CHIAVE_STRETTA) === "1");
    } catch {
      // Navigazione privata o storage bloccato: si resta larghi.
    }
  }, []);

  function alterna() {
    setStretta((prima) => {
      const dopo = !prima;
      try {
        window.localStorage.setItem(CHIAVE_STRETTA, dopo ? "1" : "0");
      } catch {
        // Nulla da fare: la preferenza vale per questa sessione.
      }
      return dopo;
    });
  }

  return (
    <aside
      className={cx(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-bone-200 bg-bone-50 py-7 md:flex",
        "transition-[width] duration-300 ease-[var(--ease-out-expo)]",
        stretta ? "w-[76px] px-3" : "w-[248px] px-5 lg:w-[268px]",
      )}
    >
      <div className={cx(stretta && "flex justify-center")}>
        {stretta ? marchioStretto : marchio}
      </div>

      {/* Solo le sezioni scorrono. Gli strumenti e il blocco della persona
          restano dove sono: se «Chiedi a Unique» finisce sotto la piega su
          uno schermo basso, tanto vale non averlo messo. */}
      <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
        <PatientSidebarNav
          stretta={stretta}
          messaggiNonLetti={messaggiNonLetti}
          questionariDaFare={questionariDaFare}
        />
      </div>

      <StrumentiPaziente stretta={stretta} alterna={alterna} />

      {stretta ? null : <div className="pt-3">{piede}</div>}
    </aside>
  );
}

/** Gli strumenti in fondo, più il comando che stringe la colonna. */
function StrumentiPaziente({ stretta, alterna }: { stretta: boolean; alterna: () => void }) {
  const percorso = usePathname();

  return (
    <div className="mt-4 space-y-1 border-t border-bone-200 pt-3">
      {STRUMENTI_PAZIENTE.map((voce) => (
        <Voce key={voce.href} voce={voce} percorso={percorso} stretta={stretta} />
      ))}

      <button
        type="button"
        onClick={alterna}
        aria-expanded={!stretta}
        className={cx(
          "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-ink-400 transition-colors hover:bg-bone-100 hover:text-ink-700",
          stretta && "justify-center px-0",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path
            d={stretta ? "m10 6 6 6-6 6" : "m14 6-6 6 6 6"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {stretta ? <span className="sr-only">Allarga il menu</span> : "Riduci il menu"}
      </button>
    </div>
  );
}

/** Solo le sezioni. Gli strumenti stanno fuori, dove non scorrono via. */
export function PatientSidebarNav({
  stretta,
  messaggiNonLetti = 0,
  questionariDaFare = 0,
}: {
  stretta: boolean;
  messaggiNonLetti?: number;
  questionariDaFare?: number;
}) {
  const percorso = usePathname();

  const contatore = (href: string) =>
    href === "/messaggi" ? messaggiNonLetti : href === "/questionari" ? questionariDaFare : 0;

  return (
    <nav aria-label="Sezioni" className="space-y-6">
      {GRUPPI_PAZIENTE.map((gruppo, i) => (
        <div key={gruppo.titolo ?? i} className="space-y-1">
          {gruppo.titolo && !stretta ? (
            <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              {gruppo.titolo}
            </h2>
          ) : null}
          {gruppo.titolo && stretta ? <div className="mx-auto my-2 h-px w-6 bg-bone-200" /> : null}
          {gruppo.voci.map((voce) => (
            <Voce
              key={voce.href}
              voce={voce}
              percorso={percorso}
              stretta={stretta}
              pallino={contatore(voce.href)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ── Barra in fondo, su telefono ──────────────────────────────────── */

/**
 * Quattro voci e «Altro».
 *
 * Cinque icone da undici pixel di etichetta sono già il limite di quanto
 * si distingue con il pollice in movimento. Il resto sta dietro un
 * pannello che si apre dal basso, dove la mano è già.
 */
export function PatientTabBar({
  messaggiNonLetti = 0,
  questionariDaFare = 0,
}: {
  messaggiNonLetti?: number;
  questionariDaFare?: number;
}) {
  const percorso = usePathname();
  const [apertoAltro, setApertoAltro] = useState(false);

  // Cambiando pagina il pannello si chiude da sé: restare aperto sopra
  // la pagina nuova è il difetto classico di questi menu.
  useEffect(() => {
    setApertoAltro(false);
  }, [percorso]);

  const inBarra = VOCI_IN_BARRA.map((v) => v.href);
  const altre = TUTTE_LE_VOCI.filter((v) => !inBarra.includes(v.href));
  const altroAttivo = altre.some((v) => attiva(percorso, v.href));

  return (
    <>
      {apertoAltro ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setApertoAltro(false)}
            className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]"
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 shadow-lift"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-bone-300" />
            <h2 className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              Tutte le sezioni
            </h2>
            <ul className="grid grid-cols-2 gap-1.5">
              {altre.map((voce) => {
                const qui = attiva(percorso, voce.href);
                const conta =
                  voce.href === "/questionari" ? questionariDaFare : 0;
                return (
                  <li key={voce.href}>
                    <NavLink
                      href={voce.href}
                      aria-current={qui ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-xl px-3 py-3 text-[14px] transition-colors",
                        "[&_svg]:h-[18px] [&_svg]:w-[18px]",
                        qui ? "bg-brand-50 font-medium text-brand-700" : "bg-bone-100 text-ink-700",
                      )}
                    >
                      <span className={qui ? "text-brand-600" : "text-ink-400"}>
                        <IconaDiSezione nome={voce.icona} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{voce.etichetta}</span>
                      {conta > 0 ? (
                        <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white tnum">
                          {conta}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-bone-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {VOCI_IN_BARRA.map((voce) => {
            const qui = attiva(percorso, voce.href);
            const conta = voce.href === "/messaggi" ? messaggiNonLetti : 0;
            return (
              <li key={voce.href}>
                <NavLink
                  href={voce.href}
                  aria-current={qui ? "page" : undefined}
                  className={cx(
                    "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                    "[&_svg]:h-5 [&_svg]:w-5",
                    qui ? "text-brand-700" : "text-ink-400",
                  )}
                >
                  <span className="relative">
                    <IconaDiSezione nome={voce.icona} />
                    {conta > 0 ? (
                      <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
                    ) : null}
                  </span>
                  {voce.etichetta}
                </NavLink>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setApertoAltro((a) => !a)}
              aria-expanded={apertoAltro}
              className={cx(
                "flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                altroAttivo || apertoAltro ? "text-brand-700" : "text-ink-400",
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                <circle cx="19" cy="12" r="1.6" fill="currentColor" />
              </svg>
              Altro
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
