import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoRisultati() {
  const sezione = sezioneDi("/risultati")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <CardScheletro righe={2} />
        <ListaScheletro righe={5} />
      </div>
    </PaginaInCaricamento>
  );
}
