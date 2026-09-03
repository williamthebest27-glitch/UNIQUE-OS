import { Card } from "@/components/ui/primitives";

/**
 * Stato mostrato a un account valido a cui la clinica non ha ancora
 * associato una scheda clinica. Capita fra la creazione dell’utente e la
 * prima visita: è uno stato reale del percorso, non un errore.
 */
export function SchedaInAttesa() {
  return (
    <Card className="p-8 text-center sm:p-12">
      <h1 className="font-display text-[26px] leading-tight text-ink-900">
        Ci siamo quasi
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-500">
        Il tuo account è attivo, ma la scheda clinica non è ancora stata aperta.
        Comparirà qui dopo la prima visita in clinica, insieme al tuo Unique
        Longevity Score.
      </p>
      <p className="mt-6 text-sm text-ink-400">
        Per qualsiasi domanda, la segreteria è a disposizione.
      </p>
    </Card>
  );
}
