"use client";

import { usePathname } from "next/navigation";
import { SEZIONI_CONTROL, sezionePerPercorso } from "@/lib/sezioni";

/**
 * L'attesa nella control room.
 *
 * Fondo scuro e riquadri chiari: uno scheletro con i toni dell'app
 * paziente qui lampeggerebbe, ed è il difetto che si nota di più su una
 * schermata che si guarda dieci volte al giorno.
 *
 * Il titolo lo sceglie il percorso. Le sezioni che non compaiono nella
 * mappa — la scheda di una voce di knowledge base, per dire — ne restano
 * senza: meglio niente che il titolo dell'elenco da cui si è arrivati.
 */
export default function CaricamentoControl() {
  const percorso = usePathname();
  const sezione = sezionePerPercorso(SEZIONI_CONTROL, percorso);
  const conNumeri = percorso === "/control" || percorso === "/control/marketing";

  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>

      {sezione ? (
        <div>
          <h1 className="font-display text-[28px] leading-tight text-bone-50">
            {sezione.title}
          </h1>
          {sezione.subtitle ? (
            <p className="mt-1.5 max-w-[64ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
          ) : null}
        </div>
      ) : (
        <div className="h-7 w-40 animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" />
      )}

      <div className="animate-pulse space-y-8 motion-reduce:animate-none">
        {conNumeri ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-white/10 ring-1 ring-white/10 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="bg-ink-900 px-5 py-4">
                <div className="h-2.5 w-16 rounded bg-white/10" />
                <div className="mt-3 h-7 w-20 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : null}

        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-card bg-white/[0.04] p-5 ring-1 ring-white/10">
            <div className="h-3 w-32 rounded bg-white/10" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }, (_, r) => (
                <div key={r} className="h-3 w-full rounded bg-white/[0.07]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
