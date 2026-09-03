"use client";

import { useState } from "react";
import { exportSignature } from "@/lib/signature/export";
import { webglAvailable, type SignatureState } from "@/lib/signature/shader";

/**
 * "Salva la tua Signature."
 *
 * Genera l'immagine al momento del clic, non prima: un fotogramma in più
 * per ogni visita alla home sarebbe uno spreco per una cosa che si fa
 * una volta al mese.
 */
export function ExportButton({
  state,
  scoreLabel,
  dateLabel,
  fileName,
  className,
}: {
  state: SignatureState;
  scoreLabel: string;
  dateLabel: string;
  fileName: string;
  className?: string;
}) {
  const [stato, setStato] = useState<"idle" | "working" | "done" | "error">("idle");

  async function onClick() {
    if (stato === "working") return;
    setStato("working");
    try {
      await exportSignature({ state, scoreLabel, dateLabel, fileName });
      setStato("done");
    } catch (error) {
      console.error("[signature] esportazione fallita:", error);
      setStato("error");
    } finally {
      setTimeout(() => setStato("idle"), 2500);
    }
  }

  // Senza WebGL non c'è una figura da esportare: meglio nessun pulsante
  // che un pulsante che fallisce.
  if (typeof window !== "undefined" && !webglAvailable()) return null;

  const etichetta =
    stato === "working"
      ? "Preparo l’immagine…"
      : stato === "done"
        ? "Fatto"
        : stato === "error"
          ? "Non è riuscito"
          : "Salva la tua Signature";

  return (
    <button type="button" onClick={onClick} disabled={stato === "working"} className={className}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M8 2v8m0 0 3-3M8 10 5 7M3 12v1.5h10V12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {etichetta}
    </button>
  );
}
