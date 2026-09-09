"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { conWebGL } from "@/lib/landing/capacita";
import { aTatto } from "@/lib/landing/tatto";

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
 *
 * **E nemmeno sulle tavolette.** `conWebGL()` risponde a una domanda di
 * muscoli, e un iPad ne ha: passerebbe. Ma la domanda qui è un'altra —
 * uno shader a schermo intero, rovesciato da un `filter`, moltiplicato
 * sulla carta e mascherato, che viene scalato e dissolto mentre il dito
 * scorre la scena. Sono quattro strati di composizione ridisegnati a
 * ogni fotogramma dietro a tutto il resto dell'hero: esattamente ciò che
 * `capacita.ts` vuole togliere di mezzo dove la pagina la muove un
 * pollice, e che la sua soglia di larghezza — tarata sui telefoni — non
 * arrivava a coprire. `aTatto()` sì: vedi `lib/landing/tatto.ts`. Al suo
 * posto resta l'alone, come sul telefono.
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
  useEffect(() => setAcceso(conWebGL() && !aTatto()), []);

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
