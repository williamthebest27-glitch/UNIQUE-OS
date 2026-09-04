import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoProgressi() {
  const sezione = sezioneDi("/progressi")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <CardScheletro righe={5} className="min-h-[240px]" />
        <div className="grid gap-6 sm:grid-cols-2">
          <CardScheletro righe={3} />
          <CardScheletro righe={3} />
        </div>
      </div>
    </PaginaInCaricamento>
  );
}
