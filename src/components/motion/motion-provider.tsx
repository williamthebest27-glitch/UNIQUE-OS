"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observeReveals, startEngine } from "@/lib/motion/engine";

/**
 * Accende il motore una volta per tutta l'app, e riosserva i reveal a
 * ogni cambio di pagina: la navigazione client-side monta nuovi nodi che
 * l'osservatore iniziale non conosce.
 *
 * Qui vive anche il confine fra la prima apertura e tutte le volte dopo.
 * Un ingresso da 950 millisecondi è giusto quando il prodotto si
 * presenta; ripetuto al passaggio fra Home e Percorso è tempo tolto a chi
 * ha già deciso dove andare. Dalla prima navigazione in poi
 * `data-navigato` sta sulla radice e il foglio di stile accorcia tutto —
 * e non si toglie più: chi ha visto la presentazione non ha bisogno di
 * rivederla.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const engine = startEngine();
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    const radice = document.documentElement;

    if (!radice.dataset.percorso) {
      // Prima apertura: nessuna navigazione, solo l'arrivo.
      radice.dataset.percorso = pathname;
    } else if (radice.dataset.percorso !== pathname) {
      radice.dataset.percorso = pathname;
      radice.dataset.navigato = "";
    }

    // Un frame dopo, così i nodi nuovi sono già nel DOM.
    const id = requestAnimationFrame(() => observeReveals());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return <>{children}</>;
}
