import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { getDocumentiDelPaziente, mioPatientId } from "@/lib/data/documento";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { NavLink } from "@/components/shell/nav-link";
import { sezioneDi } from "@/lib/patient/sezioni";
import { Dropzone } from "@/components/documents/dropzone";
import { StatoDocumento } from "@/components/documents/analisi";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, DocumentIcon, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documenti" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * La cartella dei documenti del paziente.
 *
 * Prima questa pagina mostrava gli ultimi sei referti — il riquadro
 * «documenti recenti» della dashboard, riusato. Il resto esisteva nel
 * database, la Row Level Security lo rendeva accessibile da sempre, e
 * semplicemente non c'era nessun posto in cui vederlo.
 *
 * Adesso ci sono tutti, e in due direzioni: quelli caricati dal paziente
 * e quelli caricati dalla clinica. È la stessa cartella vista dai due
 * lati, ed è il senso di averne una.
 */

const TIPO: Record<string, string> = {
  lab_report: "Esame di laboratorio",
  imaging: "Diagnostica per immagini",
  prescription: "Prescrizione",
  consent: "Consenso",
  care_plan: "Piano di cura",
  invoice: "Fattura",
  other: "Documento",
};

export default async function DocumentiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const patientId = await mioPatientId();
  const documenti = patientId ? await getDocumentiDelPaziente(patientId) : [];

  const sezione = sezioneDi("/documenti")!;
  const daClinica = documenti.filter((d) => d.dallaClinica);
  const miei = documenti.filter((d) => !d.dallaClinica);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={sezione.titolo} subtitle={sezione.sottotitolo} />

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader
            title="Carica un documento"
            hint="Referti, esami, prescrizioni. Puoi anche fotografarli: alla lettura pensiamo noi."
          />
          <div className="px-6 pb-6 pt-3">
            <Dropzone />
          </div>
        </Card>

        {/*
          Divisi per provenienza, e non in un elenco unico ordinato per
          data. Le due domande che una persona si fa davanti a questa
          pagina sono diverse — «cosa mi ha mandato la clinica» e «cosa
          ho mandato io» — e mescolarle costringe a leggere ogni riga
          per capire di quale delle due si tratta.
        */}
        {daClinica.length > 0 ? (
          <Elenco
            titolo="Dalla clinica"
            nota="Referti e piani di cura caricati dai professionisti che ti seguono."
            documenti={daClinica}
          />
        ) : null}

        <Elenco
          titolo="Caricati da te"
          nota={
            miei.length > 0
              ? "I documenti che hai aggiunto. Li vedono anche i professionisti del tuo care team."
              : undefined
          }
          documenti={miei}
          vuoto="Non hai ancora caricato nessun documento. Quelli che aggiungi qui li vede anche il tuo care team."
        />
      </div>
    </div>
  );
}

/* ── L'elenco ─────────────────────────────────────────────────────── */

function Elenco({
  titolo,
  nota,
  documenti,
  vuoto,
}: {
  titolo: string;
  nota?: string;
  documenti: Awaited<ReturnType<typeof getDocumentiDelPaziente>>;
  vuoto?: string;
}) {
  const nuovi = documenti.filter((d) => d.nuovoPerIlPaziente).length;

  return (
    <Card>
      <CardHeader
        title={titolo}
        hint={nota}
        action={nuovi > 0 ? <Badge tone="brand">{nuovi} nuovi</Badge> : undefined}
      />

      {documenti.length === 0 ? (
        <EmptyState>{vuoto ?? "Nessun documento."}</EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-bone-200/80 pb-2">
          {documenti.map((d) => (
            <li key={d.id} className="transition-colors hover:bg-bone-50">
              <NavLink
                href={`/documenti/${d.id}`}
                className="flex items-start gap-3.5 px-6 py-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bone-100 text-ink-500">
                  <DocumentIcon className="h-[18px] w-[18px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-[15px] font-medium text-ink-900">{d.titolo}</p>
                    {d.nuovoPerIlPaziente ? <Badge tone="brand">nuovo</Badge> : null}
                  </div>

                  <p className="mt-0.5 text-sm text-ink-500">
                    {TIPO[d.tipo] ?? "Documento"} ·{" "}
                    <span className="tnum">{formatShortDate(d.emessoIl ?? d.caricatoIl)}</span>
                    {d.dimensione ? ` · ${formatFileSize(d.dimensione)}` : ""}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatoDocumento stato={d.statoLavorazione} />
                    {d.quantiValori > 0 ? (
                      <span className="text-xs text-ink-400 tnum">
                        {d.quantiValori}{" "}
                        {d.quantiValori === 1 ? "valore letto" : "valori letti"}
                      </span>
                    ) : null}
                  </div>
                </div>

                <span aria-hidden="true" className="mt-1 text-ink-300">
                  ›
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
