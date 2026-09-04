import { SEZIONI_PAZIENTE } from "@/lib/sezioni";
import {
  CardScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoCrediti() {
  return (
    <PaginaInCaricamento {...SEZIONI_PAZIENTE.crediti}>
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <CardScheletro righe={3} />
          <CardScheletro righe={3} />
        </div>
        <ListaScheletro righe={4} />
      </div>
    </PaginaInCaricamento>
  );
}
