import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoMessaggi() {
  const sezione = sezioneDi("/messaggi")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <ListaScheletro righe={4} />
        <CardScheletro righe={4} />
      </div>
    </PaginaInCaricamento>
  );
}
