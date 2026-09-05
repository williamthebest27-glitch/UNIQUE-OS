"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { inMovimento } from "@/lib/landing/capacita";
import { avviaScorrimento, rimisura, type Scorrimento } from "@/lib/landing/scena";
import { startEngine } from "@/lib/motion/engine";

/**
 * La regia della landing.
 *
 * Un solo componente accende lo scorrimento, tiene il conto di dove si è
 * arrivati e sa quale sezione si sta guardando. Tutto il resto della
 * pagina chiede a lui: due componenti che avviassero Lenis per conto
 * proprio produrrebbero due scorrimenti sovrapposti, e un menu che
 * "porta a" una sezione mentre un altro motore la sta già muovendo.
 *
 * Qui vive anche l'unico punto di contatto con il resto
 * dell'applicazione: il motore di casa continua a girare — la Signature
 * ci è appesa — ma per il tempo in cui la landing è a schermo non tocca
 * più la rotellina. Uscendo, la restituisce.
 */

interface ValoreRegia {
  /**
   * Porta a un'ancora — o a una posizione assoluta, per tornare in cima —
   * passando dallo scorrimento morbido: un `scrollIntoView` nativo mentre
   * Lenis è acceso finisce in una corsa contro se stesso.
   */
  vai: (bersaglio: string | number) => void;
  /** Blocca la pagina sotto un pannello aperto, e la libera. */
  ferma: () => void;
  riparti: () => void;
  /** L'id della sezione attualmente in campo, per la navigazione. */
  sezione: string;
}

const Contesto = createContext<ValoreRegia>({
  vai: () => {},
  ferma: () => {},
  riparti: () => {},
  sezione: "",
});

export function useRegia(): ValoreRegia {
  return useContext(Contesto);
}

/** Le ancore che la navigazione conosce, nell'ordine in cui si incontrano. */
export const ANCORE = [
  { id: "sistema", etichetta: "Sistema" },
  { id: "intelligenza", etichetta: "Intelligenza" },
  { id: "percorso", etichetta: "Percorso" },
  { id: "piattaforma", etichetta: "Piattaforma" },
] as const;

export function Regia({ children }: { children: ReactNode }) {
  const [sezione, setSezione] = useState("");
  const scorrimento = useRef<Scorrimento | null>(null);
  const barra = useRef<HTMLDivElement>(null);

  /* ── Scorrimento ────────────────────────────────────────────────
     Il motore di casa lascia la rotellina a Lenis finché la landing è
     montata: due sistemi che scrivono la posizione nello stesso
     fotogramma fanno tremare ogni sezione fissata. */
  useEffect(() => {
    const motore = startEngine();
    motore.setWheel(false);

    scorrimento.current = avviaScorrimento();
    const smettiRimisura = rimisura();

    return () => {
      smettiRimisura();
      scorrimento.current?.spegni();
      scorrimento.current = null;
      motore.setWheel(true);
    };
  }, []);

  /* ── L'avanzamento della lettura ────────────────────────────────
     Una riga sottilissima in cima, che passa da petrolio a lume a oro:
     è la stessa storia della pagina, detta in un pixel e mezzo. */
  useEffect(() => {
    const nodo = barra.current;
    if (!nodo || !inMovimento()) return;

    let raf = 0;
    const misura = () => {
      raf = 0;
      const altezza = document.documentElement.scrollHeight - innerHeight;
      const p = altezza > 0 ? Math.min(1, Math.max(0, scrollY / altezza)) : 0;
      nodo.style.setProperty("--avanzamento", p.toFixed(4));
    };
    const suScroll = () => {
      if (!raf) raf = requestAnimationFrame(misura);
    };

    misura();
    addEventListener("scroll", suScroll, { passive: true });
    addEventListener("resize", suScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", suScroll);
      removeEventListener("resize", suScroll);
    };
  }, []);

  /* ── Quale sezione si sta guardando ─────────────────────────────
     La fascia di osservazione è alta un terzo di schermo al centro: una
     soglia sull'intera sezione farebbe cambiare voce attiva mentre metà
     della precedente è ancora visibile. */
  useEffect(() => {
    const nodi = ANCORE.map(({ id }) => document.getElementById(id)).filter(
      (n): n is HTMLElement => Boolean(n),
    );
    if (nodi.length === 0 || !("IntersectionObserver" in window)) return;

    const visibili = new Set<string>();

    const osservatore = new IntersectionObserver(
      (voci) => {
        for (const voce of voci) {
          if (voce.isIntersecting) visibili.add(voce.target.id);
          else visibili.delete(voce.target.id);
        }
        // Fra due sezioni che si sovrappongono vince quella più avanti
        // nella pagina: si sta scendendo, ed è dove si sta arrivando.
        const ordinate = ANCORE.filter((a) => visibili.has(a.id));
        setSezione(ordinate.length > 0 ? ordinate[ordinate.length - 1].id : "");
      },
      { rootMargin: "-38% 0px -55% 0px" },
    );

    for (const nodo of nodi) osservatore.observe(nodo);
    return () => osservatore.disconnect();
  }, []);

  const vai = useCallback((bersaglio: string | number) => {
    scorrimento.current?.vai(bersaglio);
  }, []);
  const ferma = useCallback(() => scorrimento.current?.ferma(), []);
  const riparti = useCallback(() => scorrimento.current?.riparti(), []);

  const valore = useMemo(
    () => ({ vai, ferma, riparti, sezione }),
    [vai, ferma, riparti, sezione],
  );

  return (
    <Contesto.Provider value={valore}>
      <div ref={barra} className="os-avanzamento" aria-hidden="true" />
      {children}
    </Contesto.Provider>
  );
}
