"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { conWebGL } from "@/lib/landing/capacita";

/**
 * Il campo vivo dietro l'hero.
 *
 * **Non è un effetto nuovo: è la Signature.** Lo stesso shader che
 * disegna il Longevity Score dentro l'applicazione — sette pilastri che
 * diventano forma, in `src/lib/signature/shader.ts` — messo dietro alla
 * scena d'ingresso e portato quasi al nero. Chi arriva vede muoversi
 * qualcosa che non riesce a nominare; quando entra e apre il proprio
 * punteggio, ritrova la stessa figura, stavolta con un nome e un numero.
 * È la promessa della landing mantenuta alla lettera dal prodotto, e non
 * costa una libreria in più: c'era già.
 *
 * I sette valori sono quelli dimostrativi del progetto (82 · 74 · 71 ·
 * 86 · 76 · 80 · 69 → 78), gli stessi che `docs/design.md` usa da ancora
 * di regressione. La figura in copertina è quindi una figura *vera*, non
 * un fondale disegnato per l'occasione.
 *
 * Arriva solo dove non costa: `next/dynamic` senza SSR — un canvas non
 * ha nulla da rendere sul server — e solo al livello pieno. Su telefono
 * al suo posto resta l'alone, che è già la sua luce.
 */

const Signature = dynamic(
  () => import("@/components/patient/signature").then((m) => m.Signature),
  { ssr: false, loading: () => null },
);

/** I pilastri dimostrativi: la figura di riferimento di Unique OS. */
const PILASTRI = [82, 74, 71, 86, 76, 80, 69];
const PUNTEGGIO = 78;

export function CampoVivo({ className }: { className?: string }) {
  const [acceso, setAcceso] = useState(false);

  // La decisione si prende dopo il montaggio: `conWebGL()` legge
  // `matchMedia` e `navigator`, che sul server non esistono, e deciderlo
  // in fase di render darebbe due alberi diversi.
  useEffect(() => setAcceso(conWebGL()), []);

  if (!acceso) return null;

  return (
    <div className={className} aria-hidden="true">
      <Signature
        pillars={PILASTRI}
        previousPillars={null}
        score={PUNTEGGIO}
        previousScore={null}
        seed="unique-os"
        fallback={null}
      />
    </div>
  );
}
