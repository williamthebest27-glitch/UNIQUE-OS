import { ListaScheletro, PaginaInCaricamento } from "@/components/shell/skeleton";

/**
 * Lo scheletro del documento.
 *
 * Il titolo qui non si può conoscere prima di aver letto la riga, e
 * inventarne uno provvisorio farebbe lampeggiare due testi diversi. Una
 * riga onesta — «sto aprendo un documento» — è meglio di un titolo che
 * cambia sotto gli occhi.
 */
export default function CaricamentoDocumento() {
  return (
    <PaginaInCaricamento
      title="Documento"
      subtitle="Sto aprendo il documento e ciò che il motore ne ha letto."
    >
      <ListaScheletro righe={6} />
    </PaginaInCaricamento>
  );
}
