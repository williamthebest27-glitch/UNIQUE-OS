import { Blocco, PaginaInCaricamento } from "@/components/shell/skeleton";
import { SEZIONI_PRO } from "@/lib/sezioni";

/**
 * Lo scheletro delle comunicazioni.
 *
 * La geometria è quella vera — tre colonne su schermo largo, una sola su
 * telefono — perché uno scheletro con la forma sbagliata fa saltare il
 * contenuto quando arriva, e quel salto si nota più dell'attesa che ha
 * evitato. Il titolo non è un rettangolo grigio: è testo statico, lo
 * sappiamo già, e vederlo comparire subito è ciò che fa sembrare
 * istantaneo il passaggio.
 */
export default function CaricamentoComunicazioni() {
  const sezione = SEZIONI_PRO["/pro/comunicazioni"];

  return (
    <PaginaInCaricamento title={sezione.title} subtitle={sezione.subtitle}>
      <div className="lg:grid lg:grid-cols-[186px_minmax(0,320px)_minmax(0,1fr)] lg:gap-5">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <Blocco key={i} className="h-7 w-full" />
          ))}
        </div>

        <div className="rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
          <ul className="divide-y divide-bone-200/80">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="space-y-2 px-4 py-3.5">
                <Blocco className="h-3.5 w-2/3" />
                <Blocco className="h-3 w-1/2" />
                <Blocco className="h-3 w-full" />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 hidden min-h-[420px] rounded-card bg-white shadow-card ring-1 ring-bone-200/70 lg:mt-0 lg:block" />
      </div>
    </PaginaInCaricamento>
  );
}
