import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoPiano() {
  const sezione = sezioneDi("/piano")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <ListaScheletro righe={3} />
        <ListaScheletro righe={4} />
      </div>
    </PaginaInCaricamento>
  );
}
