/**
 * L'attesa nella control room.
 *
 * Fondo scuro e riquadri chiari: uno scheletro con i toni dell'app
 * paziente qui lampeggerebbe, ed è il difetto che si nota di più su una
 * schermata che si guarda dieci volte al giorno.
 */
export default function CaricamentoControl() {
  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>

      <div className="animate-pulse space-y-8 motion-reduce:animate-none">
        <div className="h-7 w-40 rounded-lg bg-white/10" />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-white/10 ring-1 ring-white/10 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-ink-900 px-5 py-4">
              <div className="h-2.5 w-16 rounded bg-white/10" />
              <div className="mt-3 h-7 w-20 rounded bg-white/10" />
            </div>
          ))}
        </div>

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
