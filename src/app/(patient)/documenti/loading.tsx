import { SEZIONI_PAZIENTE } from "@/lib/sezioni";
import { ListaScheletro, PaginaInCaricamento } from "@/components/shell/skeleton";

export default function CaricamentoDocumenti() {
  return (
    <PaginaInCaricamento {...SEZIONI_PAZIENTE.documenti}>
      <ListaScheletro righe={5} />
    </PaginaInCaricamento>
  );
}
