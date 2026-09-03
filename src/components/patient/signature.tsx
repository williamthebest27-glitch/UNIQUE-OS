"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clamp, lerp, reducedMotion, startEngine } from "@/lib/motion/engine";
import { SignatureRenderer, webglAvailable, type SignatureState } from "@/lib/signature/shader";
import { morphProgress, useMorph } from "@/components/patient/morph";

/**
 * La Signature, in pagina.
 *
 * Il disegno vive in `SignatureRenderer`, condiviso con l'esportatore.
 * Qui restano le cose che appartengono alla pagina: le dimensioni dal
 * `ResizeObserver`, il puntatore, la visibilità, e l'orologio della
 * morfosi — che riparte ogni volta che il contesto lo chiede.
 */

export interface SignatureProps extends SignatureState {
  className?: string;
  /** Mostrato quando WebGL non è disponibile o il movimento è ridotto. */
  fallback: ReactNode;
}

export function Signature({
  pillars,
  previousPillars,
  score,
  previousScore,
  seed,
  className,
  fallback,
}: SignatureProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const { key: morphKey, hasPrevious } = useMorph();
  // Contatore di tentativi: se WebGL non c'era perché la scheda era in
  // background, al ritorno in primo piano si riprova una volta.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ready !== false || attempt > 0) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setReady(null);
        setAttempt((a) => a + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, attempt]);

  // L'orologio della morfosi: un ref, così il ciclo di rendering lo legge
  // senza che il contesto WebGL venga ricreato a ogni replay.
  // Zero = non ancora partita: parte al primo frame disegnato, così una
  // scheda aperta in background mostra la morfosi quando viene guardata.
  const morphStart = useRef(0);
  useEffect(() => {
    morphStart.current = 0;
  }, [morphKey]);

  useEffect(() => {
    if (reducedMotion() || !webglAvailable()) {
      setReady(false);
      return;
    }

    const canvas = ref.current;
    if (!canvas) return;

    let renderer: SignatureRenderer;
    try {
      renderer = new SignatureRenderer(canvas);
    } catch {
      setReady(false);
      return;
    }

    renderer.setState({ pillars, previousPillars, score, previousScore, seed });
    renderer.fit();

    const ro = new ResizeObserver(() => renderer.fit());
    ro.observe(canvas);

    // ── Puntatore ─────────────────────────────────────────────────
    let mx = 0.5, my = 0.5, hov = 0, hovTarget = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width;
      my = 1 - (e.clientY - r.top) / r.height;
    };
    const onEnter = () => (hovTarget = 1);
    const onLeave = () => (hovTarget = 0);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);

    // ── Rendering, agganciato all'unico ciclo del motore ──────────
    const engine = startEngine();
    const t0 = performance.now();
    let fade = 0;
    let hidden = document.visibilityState === "hidden";
    const onVis = () => (hidden = document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);

    const stop = engine.onTick((time, velocity) => {
      if (hidden) return;
      const r = canvas.getBoundingClientRect();
      // Fuori dallo schermo non si disegna.
      if (r.bottom < -80 || r.top > innerHeight + 80) return;

      if (!morphStart.current) morphStart.current = time;
      hov = lerp(hov, hovTarget, 0.08);
      fade = lerp(fade, 1, 0.045);

      renderer.frame({
        t: (time - t0) / 1000,
        // Senza uno stato precedente la figura è già com'è.
        morph: hasPrevious ? morphProgress(morphStart.current, time) : 1,
        vel: clamp(velocity / 900, -0.12, 0.12),
        hov,
        fade,
        mouse: [mx, my],
      });
    });

    setReady(true);

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
    };
  }, [pillars, previousPillars, score, previousScore, seed, hasPrevious]);

  if (ready === false) return <>{fallback}</>;

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
