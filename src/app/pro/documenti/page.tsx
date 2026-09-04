import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDocumentiRecenti } from "@/lib/data/professional";
import { formatShortDate } from "@/lib/format";
import { PageHeading } from "@/components/shell/page-heading";
import { Badge, Card, ChevronIcon, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documenti" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

const KIND_LABEL: Record<string, string> = {
  lab_report: "Esame di laboratorio",
  imaging: "Diagnostica per immagini",
  prescription: "Prescrizione",
  consent: "Consenso",
  care_plan: "Piano di cura",
  invoice: "Fattura",
  other: "Documento",
};

/** Lo stato dell'analisi del motore: pending, completed o failed. */
function StatoAnalisi({ stato }: { stato: string | null }) {
  if (stato === null) return <Badge>non analizzato</Badge>;
  if (stato === "pending") return <Badge tone="brand">in analisi</Badge>;
  if (stato === "failed") return <Badge tone="attention">analisi fallita</Badge>;
  return <Badge tone="positive">analizzato</Badge>;
}

/**
 * Tutti i documenti dei pazienti seguiti, in ordine di arrivo.
 *
 * Il caricamento e l'analisi restano nella cartella del paziente, dove
 * hanno il loro contesto: questa è la porta d'ingresso, non un archivio
 * parallelo. Serve a vedere cos'è arrivato mentre non guardavi.
 */
export default async function DocumentiPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[860px]">
        <PageHeading title="Documenti" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            documenti.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const documenti = await getDocumentiRecenti();

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeading
        title="Documenti"
        subtitle="Referti e allegati dei pazienti che segui, dal più recente. Si aprono nella cartella, dove si analizzano e si approvano i valori."
      />

            <Card className="mt-8">
        {documenti.length === 0 ? (
          <EmptyState>
            Nessun documento. Compaiono qui appena un paziente ne carica uno o
            lo aggiungi dalla sua cartella.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {documenti.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/pro/pazienti/${doc.patientId}`}
                  className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink-900">
                      {doc.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {doc.patientName} · {KIND_LABEL[doc.kind] ?? doc.kind} ·{" "}
                      {formatShortDate(doc.issuedOn ?? doc.createdAt)}
                    </p>
                  </div>

                  <StatoAnalisi stato={doc.statoAnalisi} />

                  <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
