import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoQuestionari() {
  const sezione = sezioneDi("/questionari")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <ListaScheletro righe={3} />
        <ListaScheletro righe={2} />
      </div>
    </PaginaInCaricamento>
  );
}
