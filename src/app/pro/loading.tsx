import { CardScheletro, ListaScheletro } from "@/components/shell/skeleton";

/**
 * L'attesa nell'area clinica.
 *
 * Senza titolo vero: qui le sezioni sono cinque e i titoli cambiano, e un
 * titolo sbagliato per mezzo secondo è peggio di nessun titolo.
 */
export default function CaricamentoPro() {
  return (
    <div aria-busy="true" className="mx-auto max-w-[860px]">
      <span className="sr-only" role="status">
        Caricamento in corso.
      </span>
      <div className="animate-pulse space-y-6 motion-reduce:animate-none">
        <div className="h-8 w-52 rounded-lg bg-bone-200/70" />
        <ListaScheletro righe={4} />
        <CardScheletro righe={3} />
      </div>
    </div>
  );
}
