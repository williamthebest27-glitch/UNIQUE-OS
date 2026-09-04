import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoProfilo() {
  const sezione = sezioneDi("/profilo")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <CardScheletro righe={4} />
        <CardScheletro righe={4} />
        <CardScheletro righe={3} />
      </div>
    </PaginaInCaricamento>
  );
}
