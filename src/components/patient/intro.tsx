"use client";

import { useEffect, useState } from "react";
import { reducedMotion } from "@/lib/motion/engine";

/**
 * Il sipario.
 *
 * Un secondo e mezzo, una volta per sessione, solo sulla home del
 * paziente. Il tempo serve a caricare i font — altrimenti sarebbe una
 * tassa sul visitatore — e la partenza è vincolata a `document.fonts`
 * con un limite: un CDN lento non deve poter intrappolare nessuno.
 *
 * Con reduced motion non compare affatto.
 */

const CHIAVE = "unique-os:intro";
const MINIMO = 1400;
const LIMITE = 2400;

export function Intro() {
  const [stato, setStato] = useState<"idle" | "on" | "off">("idle");

  useEffect(() => {
    let mostrato = false;
    try {
      mostrato = sessionStorage.getItem(CHIAVE) === "1";
    } catch {
      // storage bloccato: come se fosse già visto
      mostrato = true;
    }

    if (mostrato || reducedMotion()) {
      setStato("off");
      return;
    }

    setStato("on");
    const t0 = performance.now();

    const pronto = Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => setTimeout(r, LIMITE)),
    ]);

    // Il sipario si alza da solo via CSS a 1,35 s; qui aspettiamo che i
    // font siano pronti e poi togliamo il nodo quando l'animazione è finita.
    let timer = 0;
    pronto.then(() => {
      const resta = Math.max(0, MINIMO - (performance.now() - t0));
      timer = window.setTimeout(() => {
        setStato("off");
        try {
          sessionStorage.setItem(CHIAVE, "1");
        } catch {
          // ignorato
        }
      }, resta + 900);
    });

    return () => clearTimeout(timer);
  }, []);

  if (stato !== "on") return null;

  return (
    <div className="intro" aria-hidden="true">
      <div className="intro-mark">
        <span className="intro-word">UNIQUE</span>
        <span className="intro-line" />
      </div>
    </div>
  );
}
