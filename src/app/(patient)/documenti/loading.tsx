import { sezioneDi } from "@/lib/patient/sezioni";
import { ListaScheletro, PaginaInCaricamento } from "@/components/shell/skeleton";

export default function CaricamentoDocumenti() {
  return (
    <PaginaInCaricamento title={sezioneDi("/documenti")!.titolo} subtitle={sezioneDi("/documenti")!.sottotitolo}>
      <ListaScheletro righe={5} />
    </PaginaInCaricamento>
  );
}
