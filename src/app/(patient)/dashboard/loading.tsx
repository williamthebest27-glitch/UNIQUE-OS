import {
  Blocco,
  CardScheletro,
  EroeScheletro,
} from "@/components/shell/skeleton";

/**
 * L'attesa della home.
 *
 * Qui il titolo non si può anticipare: è un saluto con dentro un nome, e
 * scrivere "Ciao." per poi sostituirlo con "Ciao Alessandro." sarebbe il
 * cambio di testo che gli scheletri esistono per evitare. Meglio un
 * rettangolo, che non promette niente.
 *
 * La forma invece si anticipa: la Signature occupa la colonna larga, le
 * schede di sintesi quella stretta. Uno scheletro a card uguali farebbe
 * saltare tutto quando arrivano i dati.
 */
export default function CaricamentoHome() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>

      <div className="animate-pulse motion-reduce:animate-none">
        <Blocco className="h-9 w-64 sm:h-10" />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <EroeScheletro />
          <div className="space-y-6">
            <CardScheletro righe={2} />
            <CardScheletro righe={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
