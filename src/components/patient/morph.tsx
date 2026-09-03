"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { reducedMotion } from "@/lib/motion/engine";
import { morphProgress } from "@/lib/signature/morph";

/**
 * La morfosi.
 *
 * Figura e numero devono trasformarsi insieme: un "74" che diventa "78"
 * mentre la Signature si riordina. Il contesto tiene il momento di
 * partenza; figura e contatore leggono lo stesso orologio, che vive in
 * `@/lib/signature/morph` — puro, provato senza browser.
 */

export { morphProgress };

interface MorphContextValue {
  /** Cambia a ogni replay: chi lo osserva riparte. */
  key: number;
  hasPrevious: boolean;
  replay: () => void;
}

const MorphContext = createContext<MorphContextValue>({
  key: 0,
  hasPrevious: false,
  replay: () => {},
});

export function MorphProvider({
  hasPrevious,
  children,
}: {
  hasPrevious: boolean;
  children: React.ReactNode;
}) {
  const [key, setKey] = useState(0);
  const replay = useCallback(() => setKey((k) => k + 1), []);
  const value = useMemo(() => ({ key, hasPrevious, replay }), [key, hasPrevious, replay]);
  return <MorphContext.Provider value={value}>{children}</MorphContext.Provider>;
}

export function useMorph(): MorphContextValue {
  return useContext(MorphContext);
}

/* ── Il numero che cambia ─────────────────────────────────────────── */

/**
 * Conta da com'era a com'è, in sincrono con la figura.
 *
 * Renderizza subito il valore finale lato server, così senza JavaScript
 * — o con reduced motion — il numero giusto c'è comunque.
 */
export function ScoreCounter({
  from,
  to,
  className,
}: {
  from: number;
  to: number;
  className?: string;
}) {
  const { key, hasPrevious } = useMorph();
  const [shown, setShown] = useState(Math.round(to));
  const raf = useRef(0);

  useEffect(() => {
    if (!hasPrevious || reducedMotion() || from === to) {
      setShown(Math.round(to));
      return;
    }

    setShown(Math.round(from));

    // L'orologio parte al primo frame, non adesso: in una scheda in
    // background i frame non arrivano, e la morfosi va vista, non persa.
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const k = morphProgress(t0, now);
      setShown(Math.round(from + (to - from) * k));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf.current);
  }, [key, hasPrevious, from, to]);

  return <span className={className}>{shown}</span>;
}

/* ── Rivedi la trasformazione ─────────────────────────────────────── */

export function ReplayButton({ className }: { className?: string }) {
  const { hasPrevious, replay } = useMorph();
  if (!hasPrevious || reducedMotion()) return null;

  return (
    <button type="button" onClick={replay} className={className}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Rivedi la trasformazione
    </button>
  );
}
