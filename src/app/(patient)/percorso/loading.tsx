import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoPercorso() {
  return (
    <PaginaInCaricamento title={sezioneDi("/percorso")!.titolo} subtitle={sezioneDi("/percorso")!.sottotitolo}>
      <div className="space-y-6">
        <CardScheletro righe={2} className="min-h-[180px]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <CardScheletro righe={4} />
          <CardScheletro righe={4} />
        </div>
      </div>
    </PaginaInCaricamento>
  );
}
