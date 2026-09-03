"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observeReveals, startEngine } from "@/lib/motion/engine";

/**
 * Accende il motore una volta per tutta l'app, e riosserva i reveal a
 * ogni cambio di pagina: la navigazione client-side monta nuovi nodi che
 * l'osservatore iniziale non conosce.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const engine = startEngine();
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    // Un frame dopo, così i nodi nuovi sono già nel DOM.
    const id = requestAnimationFrame(() => observeReveals());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return <>{children}</>;
}
