"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Marchio } from "@/components/brand/marchio";
import { cx } from "@/components/ui/primitives";
import { ANCORE, useRegia } from "@/components/landing/regia";
import { Comando, Freccia } from "@/components/landing/primitive";

/**
 * La navigazione.
 *
 * **Su schermo largo cambia natura, non solo dimensione.** In cima alla
 * pagina è larga quanto la pagina e non ha superficie: il marchio a
 * sinistra, le sezioni al centro, i comandi a destra, sospesi sul vuoto.
 * Appena si scorre si raccoglie in una pastiglia che si stacca dal
 * fondo. Non è un vezzo: in cima la barra fa parte della scena
 * dell'hero, più giù deve galleggiare *sopra* un contenuto che si muove,
 * e per farlo ha bisogno di un bordo suo.
 *
 * **Su telefono è un altro oggetto.** Marchio e un pulsante, e un
 * pannello a schermo intero che non è il menu di sopra rimpicciolito: le
 * voci sono grandi, numerate, e arrivano una dopo l'altra. È la stessa
 * scelta già presa nell'applicazione — `patient-nav.tsx` disegna due
 * navigazioni, non una adattata.
 */

export function UniqueNavbar({
  entra,
  registrati,
  etichettaEntra,
  autenticato,
}: {
  /** Dove porta il comando principale: la sessione se c'è, l'accesso se no. */
  entra: string;
  registrati: string;
  etichettaEntra: string;
  /**
   * A chi ha già una sessione non si propone di accedere né di
   * registrarsi: gli si offre di rientrare. Due comandi che invitano a
   * fare una cosa già fatta sono il modo più rapido per far sembrare che
   * il sistema non sappia chi ha davanti.
   */
  autenticato: boolean;
}) {
  const { vai, sezione, ferma, riparti } = useRegia();
  const [condensata, setCondensata] = useState(false);
  const [aperto, setAperto] = useState(false);

  /* ── La condensa ────────────────────────────────────────────────
     Due soglie invece di una: si condensa a 48 px e si riapre a 12, o
     un dito fermo esattamente sul confine farebbe lampeggiare la barra
     a ogni pixel. */
  useEffect(() => {
    let raf = 0;
    const misura = () => {
      raf = 0;
      setCondensata((prima) => (prima ? scrollY > 12 : scrollY > 48));
    };
    const suScroll = () => {
      if (!raf) raf = requestAnimationFrame(misura);
    };
    misura();
    addEventListener("scroll", suScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", suScroll);
    };
  }, []);

  /* ── Il pannello blocca la pagina sotto di sé ───────────────────── */
  useEffect(() => {
    if (!aperto) return;
    ferma();
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperto(false);
    };
    addEventListener("keydown", suTasto);
    return () => {
      removeEventListener("keydown", suTasto);
      riparti();
    };
  }, [aperto, ferma, riparti]);

  const versoSezione = (id: string) => (e: React.MouseEvent) => {
    // Il link resta un vero `href`: senza JavaScript porta lo stesso
    // dove deve. Qui si intercetta solo per farlo con peso.
    e.preventDefault();
    setAperto(false);
    vai(`#${id}`);
  };

  return (
    <>
      <header
        data-condensata={condensata ? "" : undefined}
        className={cx(
          "fixed inset-x-0 top-0 z-50",
          "transition-[padding] duration-700 [transition-timing-function:var(--ease-out-expo)]",
          condensata ? "pt-2.5 sm:pt-3" : "pt-4 sm:pt-6",
        )}
      >
        <nav
          aria-label="Principale"
          className={cx(
            "mx-auto flex items-center gap-4",
            "transition-all duration-700 [transition-timing-function:var(--ease-out-expo)]",
            condensata
              ? "w-[calc(100%-1.5rem)] max-w-[1080px] rounded-full px-3 py-2 sm:px-4"
              : "w-[calc(100%-2rem)] max-w-[1440px] rounded-full px-2 py-2 sm:px-4",
          )}
          style={
            condensata
              ? {
                  background: "rgb(10 11 13 / 0.62)",
                  backdropFilter: "blur(18px) saturate(140%)",
                  WebkitBackdropFilter: "blur(18px) saturate(140%)",
                  boxShadow:
                    "inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 20px 50px -30px rgb(0 0 0 / 0.9)",
                }
              : undefined
          }
        >
          {/* ── Marchio ───────────────────────────────────────────── */}
          <Link
            href="/"
            className="group/os flex shrink-0 items-center gap-2.5 rounded-full pl-1 pr-2 py-1"
            aria-label="Unique OS — torna in cima"
            onClick={(e) => {
              e.preventDefault();
              setAperto(false);
              vai(0);
            }}
          >
            <Marchio
              className={cx(
                "w-auto transition-all duration-700 [transition-timing-function:var(--ease-out-expo)]",
                condensata ? "h-6" : "h-7 sm:h-8",
              )}
            />
            <span className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-medium tracking-[-0.01em] text-[color:var(--os-piena)]">
                Unique
              </span>
              <span className="os-mono text-[color:var(--os-tenue)] transition-colors group-hover/os:text-[color:var(--os-mente)]">
                OS
              </span>
            </span>
          </Link>

          {/* ── Sezioni ───────────────────────────────────────────── */}
          <ul className="ml-auto hidden items-center gap-8 lg:flex">
            {ANCORE.map(({ id, etichetta }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={versoSezione(id)}
                  data-qui={sezione === id ? "" : undefined}
                  aria-current={sezione === id ? "true" : undefined}
                  className="os-voce text-[13.5px] font-medium tracking-[-0.005em]"
                >
                  {etichetta}
                </a>
              </li>
            ))}
          </ul>

          {/* ── Comandi ───────────────────────────────────────────── */}
          <div className="ml-auto flex items-center gap-1.5 lg:ml-8 lg:gap-2">
            {autenticato ? (
              <Comando
                href={entra}
                variante="pieno"
                magnetico={false}
                className="group/os hidden !min-h-[38px] !px-4 !text-[13.5px] sm:inline-flex"
              >
                {etichettaEntra}
                <Freccia />
              </Comando>
            ) : (
              <>
                <Link
                  href={entra}
                  className={cx(
                    "hidden rounded-full px-4 py-2 text-[13.5px] font-medium sm:inline-flex",
                    "text-[color:var(--os-media)] transition-colors hover:text-[color:var(--os-piena)]",
                  )}
                >
                  Accedi
                </Link>

                <Comando
                  href={registrati}
                  variante="pieno"
                  magnetico={false}
                  className="group/os hidden !min-h-[38px] !px-4 !text-[13.5px] sm:inline-flex"
                >
                  Registrati
                  <Freccia />
                </Comando>
              </>
            )}

            {/* Su telefono resta solo questo, e la barra è due oggetti. */}
            <button
              type="button"
              onClick={() => setAperto((a) => !a)}
              aria-expanded={aperto}
              aria-controls="menu-unique"
              className="relative -mr-1 flex h-11 w-11 items-center justify-center rounded-full sm:hidden"
            >
              <span className="sr-only">{aperto ? "Chiudi il menu" : "Apri il menu"}</span>
              <span aria-hidden="true" className="relative block h-3 w-5">
                <span
                  className={cx(
                    "absolute left-0 block h-px w-full bg-[color:var(--os-piena)]",
                    "transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)]",
                    aperto ? "top-1/2 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cx(
                    "absolute left-0 block h-px w-full bg-[color:var(--os-piena)]",
                    "transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)]",
                    aperto ? "top-1/2 -rotate-45" : "top-full",
                  )}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <PannelloMobile
        aperto={aperto}
        chiudi={() => setAperto(false)}
        versoSezione={versoSezione}
        entra={entra}
        registrati={registrati}
        etichettaEntra={etichettaEntra}
        autenticato={autenticato}
      />
    </>
  );
}

/* ── Il pannello su telefono ──────────────────────────────────────── */

/**
 * Non è il menu di sopra rimpicciolito.
 *
 * Le voci sono grandi come titoli, numerate come le sezioni della
 * pagina, e arrivano una dopo l'altra da dietro una maschera. Sotto, i
 * due comandi, alla portata del pollice invece che in cima allo schermo.
 *
 * Il pannello resta nel DOM solo mentre serve: montarlo sempre
 * significherebbe tenere in pagina un elemento a schermo intero che
 * intercetta il tocco, e prima o poi qualcuno lo scopre.
 */
function PannelloMobile({
  aperto,
  chiudi,
  versoSezione,
  entra,
  registrati,
  etichettaEntra,
  autenticato,
}: {
  aperto: boolean;
  chiudi: () => void;
  versoSezione: (id: string) => (e: React.MouseEvent) => void;
  entra: string;
  registrati: string;
  etichettaEntra: string;
  autenticato: boolean;
}) {
  const rif = useRef<HTMLDivElement>(null);
  const [montato, setMontato] = useState(false);

  // Un fotogramma fra il montaggio e l'apertura: senza, la transizione
  // parte già dal suo stato finale e il pannello appare di colpo.
  useEffect(() => {
    if (!aperto) {
      setMontato(false);
      return;
    }
    const id = requestAnimationFrame(() => setMontato(true));
    return () => cancelAnimationFrame(id);
  }, [aperto]);

  // Il fuoco entra nel pannello e non ne esce finché è aperto: con la
  // tastiera, un menu a schermo intero da cui si esce tabulando è un
  // menu che nasconde il resto della pagina senza dirlo.
  useEffect(() => {
    if (!aperto) return;
    const nodo = rif.current;
    if (!nodo) return;

    const precedente = document.activeElement as HTMLElement | null;
    const focalizzabili = () =>
      [...nodo.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
        (n) => n.offsetParent !== null,
      );

    focalizzabili()[0]?.focus();

    const suTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const voci = focalizzabili();
      if (voci.length === 0) return;
      const primo = voci[0];
      const ultimo = voci[voci.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    };

    addEventListener("keydown", suTab);
    return () => {
      removeEventListener("keydown", suTab);
      precedente?.focus?.();
    };
  }, [aperto]);

  if (!aperto) return null;

  return (
    <div
      ref={rif}
      id="menu-unique"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-aperto={montato ? "" : undefined}
      className={cx(
        "fixed inset-0 z-40 flex flex-col sm:hidden",
        "transition-opacity duration-500 [transition-timing-function:var(--ease-out-expo)]",
        montato ? "opacity-100" : "opacity-0",
      )}
      style={{ background: "var(--os-vuoto)" }}
    >
      <div className="os-reticolo" aria-hidden="true" />

      <div className="relative flex min-h-0 flex-1 flex-col justify-between px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-28">
        <ul className="space-y-1">
          {ANCORE.map(({ id, etichetta }, i) => (
            <li key={id} className="overflow-hidden">
              <a
                href={`#${id}`}
                onClick={versoSezione(id)}
                className={cx(
                  "flex items-baseline gap-4 py-2.5",
                  "transition-[transform,opacity] duration-[750ms] [transition-timing-function:var(--ease-out-expo)]",
                  montato ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
                )}
                style={{ transitionDelay: `${60 + i * 65}ms` }}
              >
                <span className="os-mono w-6 shrink-0 text-[color:var(--os-appena)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="os-display text-[clamp(2rem,10vw,2.9rem)]">
                  {etichetta}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div
          className={cx(
            "transition-[transform,opacity] duration-[750ms] [transition-timing-function:var(--ease-out-expo)]",
            montato ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
          style={{ transitionDelay: "340ms" }}
        >
          <hr className="os-filo mb-7" />

          <div className="flex flex-col gap-2.5">
            <Comando
              href={entra}
              variante="pieno"
              magnetico={false}
              className="group/os w-full"
            >
              {etichettaEntra}
              <Freccia />
            </Comando>
            {!autenticato ? (
              <Comando
                href={registrati}
                variante="vuoto"
                magnetico={false}
                className="w-full"
              >
                Registrati
              </Comando>
            ) : null}
          </div>

          <p className="os-mono mt-7 flex items-center gap-2.5 text-[color:var(--os-appena)]">
            <span className="os-vivo" aria-hidden="true" />
            Unique Longevity Clinic
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={chiudi}
        className="sr-only"
        aria-label="Chiudi il menu"
      />
    </div>
  );
}
