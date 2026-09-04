import { sezioneDi } from "@/lib/patient/sezioni";
import { ListaScheletro, PaginaInCaricamento } from "@/components/shell/skeleton";

export default function CaricamentoAppuntamenti() {
  return (
    <PaginaInCaricamento title={sezioneDi("/appuntamenti")!.titolo} subtitle={sezioneDi("/appuntamenti")!.sottotitolo}>
      <div className="space-y-6">
        <ListaScheletro righe={2} />
        <ListaScheletro righe={4} />
      </div>
    </PaginaInCaricamento>
  );
}
