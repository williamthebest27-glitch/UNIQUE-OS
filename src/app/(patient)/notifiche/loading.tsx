import { sezioneDi } from "@/lib/patient/sezioni";
import {
  CardScheletro,
  EroeScheletro,
  ListaScheletro,
  PaginaInCaricamento,
} from "@/components/shell/skeleton";

export default function CaricamentoNotifiche() {
  const sezione = sezioneDi("/notifiche")!;
  return (
    <PaginaInCaricamento title={sezione.titolo} subtitle={sezione.sottotitolo}>
      <div className="space-y-6">
        <ListaScheletro righe={4} />
        <ListaScheletro righe={3} />
      </div>
    </PaginaInCaricamento>
  );
}
