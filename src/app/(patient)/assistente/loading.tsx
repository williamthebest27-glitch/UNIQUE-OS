import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoAssistente() {
  const sezione = sezioneDi("/assistente")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <CardScheletro righe={6} className="min-h-[60vh]" />
    </PaginaInCaricamento>
  );
}
