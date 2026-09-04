"use client";

import { usePathname } from "next/navigation";
import { SEZIONI_PRO, sezionePerPercorso } from "@/lib/sezioni";
import { Blocco, CardScheletro, ListaScheletro } from "@/components/shell/skeleton";

/**
 * L'attesa nell'area clinica.
 *
 * Un solo file per tutte le sezioni, e il titolo lo sceglie il percorso:
 * quando la navigazione comincia l'indirizzo è già quello nuovo, ed è
 * l'unica cosa che serve sapere per scrivere l'intestazione giusta.
 *
 * Dove il titolo dipende dai dati — la home saluta per nome, una cartella
 * porta il nome del paziente — resta un rettangolo. Un titolo sbagliato
 * per mezzo secondo si nota più dell'attesa che avrebbe risparmiato.
 */
export default function CaricamentoPro() {
  const percorso = usePathname();
  const sezione = sezionePerPercorso(SEZIONI_PRO, percorso);
  const lista = percorso !== "/pro" && percorso !== "/pro/revisioni";

  return (
    <div aria-busy="true" className="mx-auto max-w-[860px]">
      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>

      {sezione ? (
        <header>
          <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
            {sezione.title}
          </h1>
          {sezione.subtitle ? (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">
              {sezione.subtitle}
            </p>
          ) : null}
        </header>
      ) : (
        <div className="animate-pulse motion-reduce:animate-none">
          <Blocco className="h-9 w-56 sm:h-10" />
        </div>
      )}

      <div className="mt-8 animate-pulse space-y-6 motion-reduce:animate-none">
        {lista ? (
          <ListaScheletro righe={5} />
        ) : (
          <>
            <CardScheletro righe={3} />
            <ListaScheletro righe={3} />
          </>
        )}
      </div>
    </div>
  );
}
