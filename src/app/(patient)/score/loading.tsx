import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoScore() {
  const sezione = sezioneDi("/score")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <EroeScheletro />
        <div className="grid gap-6 lg:grid-cols-3">
          <CardScheletro righe={4} className="lg:col-span-2" />
          <CardScheletro righe={3} />
        </div>
      </div>
    </PaginaInCaricamento>
  );
}
