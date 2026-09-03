"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { observeReveals } from "@/lib/motion/engine";

/**
 * Rivela i figli quando entrano nel viewport.
 *
 * Il ritardo va sui figli tramite `--i`, non sul contenitore: così una
 * griglia di card sale una dopo l'altra invece che tutta insieme.
 * Con reduced motion lo stato finale è immediato.
 */
export function Reveal({
  children,
  className,
  index = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return observeReveals(ref.current.parentElement ?? document);
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      className={className}
      style={{ "--i": index } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}

/**
 * Testo rivelato parola per parola, da dietro una maschera.
 *
 * Il padding con margine negativo tiene il bordo della maschera lontano
 * dalle ascendenti e discendenti: senza, a interlinea stretta il taglio
 * mangia le lettere.
 */
export function SplitText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return observeReveals(ref.current.parentElement ?? document);
  }, []);

  const parole = text.split(" ");

  // Lo spazio sta FUORI dalla maschera: dentro un inline-block con
  // overflow nascosto, uno spazio finale viene rimosso dal collasso del
  // bianco e le parole si incollano.
  return (
    <span ref={ref} data-reveal="" className={className} aria-label={text}>
      {parole.map((parola, i) => (
        <span key={`${parola}-${i}`} aria-hidden="true">
          <span className="wm">
            <span style={{ "--i": i + delay } as React.CSSProperties}>{parola}</span>
          </span>
          {i < parole.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
