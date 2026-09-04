import { cx } from "@/components/ui/primitives";

/**
 * Lo scheletro che compare mentre una sezione arriva.
 *
 * Non è decorazione: è la differenza fra un clic che risponde subito e
 * uno che sembra ignorato. Senza un confine di caricamento il router
 * aspetta il render completo prima di cambiare schermata, e per chi
 * clicca quel tempo è indistinguibile da un guasto.
 *
 * Due regole che rendono uno scheletro credibile:
 *
 * **Il titolo è quello vero**, non un rettangolo grigio. È testo statico,
 * lo sappiamo già, e vederlo comparire subito è ciò che fa sembrare
 * istantaneo il passaggio anche quando i dati arrivano dopo.
 *
 * **La forma somiglia a ciò che sostituisce.** Uno scheletro con la
 * geometria sbagliata fa saltare il contenuto quando arriva, e quel salto
 * si nota più dell'attesa che ha evitato.
 */

export function Blocco({ className }: { className?: string }) {
  return <div className={cx("rounded-lg bg-bone-200/70", className)} />;
}

/** Un riquadro dell'altezza di una card, con dentro qualche riga. */
export function CardScheletro({
  righe = 3,
  className,
}: {
  righe?: number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card bg-white p-6 shadow-card ring-1 ring-bone-200/70",
        className,
      )}
    >
      <Blocco className="h-3.5 w-28" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: righe }, (_, i) => (
          <Blocco
            key={i}
            className={cx("h-3", i === righe - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/** Una lista di righe: documenti, movimenti, appuntamenti. */
export function ListaScheletro({ righe = 4 }: { righe?: number }) {
  return (
    <div className="rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
      <ul className="divide-y divide-bone-200/80">
        {Array.from({ length: righe }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-6 py-4">
            <Blocco className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Blocco className="h-3.5 w-1/3" />
              <Blocco className="h-3 w-1/2" />
            </div>
            <Blocco className="h-3 w-16 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Il posto della Signature.
 *
 * Scuro come il riquadro che sostituisce: un rettangolo chiaro dove poi
 * arriva un blocco scuro è il salto più visibile di tutta l'applicazione.
 */
export function EroeScheletro() {
  return (
    <div className="min-h-[380px] rounded-card bg-ink-900/90 p-6 sm:min-h-[440px] sm:p-8">
      <div className="h-3 w-40 rounded bg-white/10" />
      <div className="mt-10 h-16 w-32 rounded bg-white/10" />
      <div className="mt-8 space-y-2.5">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-4/5 rounded bg-white/10" />
      </div>
    </div>
  );
}

/**
 * L'involucro comune: titolo vero, contenuto che pulsa.
 *
 * `aria-busy` e il testo per i lettori di schermo dicono che si sta
 * caricando; il pulsare lo dice a chi guarda. Servono entrambi, e nessuno
 * dei due basta da solo.
 */
export function PaginaInCaricamento({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy="true">
      <header>
        <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">
            {subtitle}
          </p>
        ) : null}
      </header>

      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>

      <div className="mt-8 animate-pulse motion-reduce:animate-none">{children}</div>
    </div>
  );
}
