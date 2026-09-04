import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDocumentiRecenti, type DocumentoInArrivo } from "@/lib/data/professional";
import {
  ETICHETTE_REVISIONE,
  SPIEGAZIONI_REVISIONE,
  STATI_REVISIONE,
  toStatoRevisione,
  tonoRevisione,
  type StatoRevisione,
} from "@/lib/documents/revisione";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, ChevronIcon, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documenti" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * I referti arrivati, in coda di revisione.
 *
 * La distinzione che governa questa pagina, e che prima non esisteva:
 *
 *   **Analizzato** dice che il motore ha letto il PDF. È un fatto
 *   tecnico. Un referto scansionato risulta analizzato senza che nessuno
 *   abbia capito cosa c'è scritto.
 *
 *   **Revisionato** dice che una persona l'ha guardato.
 *
 *   **Approvato** dice che ha valore clinico, e a stabilirlo è un
 *   medico — la stessa regola dei valori fuori soglia, imposta dal
 *   database e non dall'interfaccia.
 *
 * Le tre colonne stanno separate perché i tre stati sono tre lavori
 * diversi, spesso di persone diverse. Il gesto si fa nella cartella,
 * dove il referto ha il suo contesto: questa è la porta d'ingresso, non
 * un archivio parallelo.
 */

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

export default async function DocumentiPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Documenti" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono documenti.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { stato } = await searchParams;
  const filtro = (STATI_REVISIONE as readonly string[]).includes(stato ?? "")
    ? (stato as StatoRevisione)
    : null;

  const tutti = await getDocumentiRecenti(80);
  const daRevisionare = tutti.filter((d) => toStatoRevisione(d.statoRevisione) === "pending");
  const mostrati = filtro
    ? tutti.filter((d) => toStatoRevisione(d.statoRevisione) === filtro)
    : tutti;

  const conteggi = STATI_REVISIONE.map((s) => ({
    stato: s,
    quanti: tutti.filter((d) => toStatoRevisione(d.statoRevisione) === s).length,
  }));

  return (
    <div>
      <PageHeading
        title="Documenti"
        subtitle="Referti e allegati dei pazienti che segui, dal più recente. Si aprono nella cartella, dove si analizzano, si revisionano e si approvano i valori."
      />

      {/* ── I filtri di stato ────────────────────────────────── */}
      <nav aria-label="Stato di revisione" className="mt-6 flex flex-wrap gap-1.5">
        <Pillola href="/pro/documenti" attiva={!filtro}>
          Tutti <span className="tnum">{tutti.length}</span>
        </Pillola>
        {conteggi.map((c) => (
          <Pillola
            key={c.stato}
            href={`/pro/documenti?stato=${c.stato}`}
            attiva={filtro === c.stato}
            urgente={c.stato === "pending" && c.quanti > 0}
          >
            {ETICHETTE_REVISIONE[c.stato]} <span className="tnum">{c.quanti}</span>
          </Pillola>
        ))}
      </nav>

      {filtro ? (
        <p className="mt-3 text-sm text-ink-500">{SPIEGAZIONI_REVISIONE[filtro]}</p>
      ) : null}

      {/* ── La coda, se non si sta già filtrando ─────────────── */}
      {!filtro && daRevisionare.length > 0 ? (
        <Riquadro
          titolo="Da revisionare"
          conta={daRevisionare.length}
          nota="Nessuno li ha ancora aperti. Il più vecchio è in cima."
          className="mt-5"
        >
          <Elenco documenti={[...daRevisionare].reverse()} />
        </Riquadro>
      ) : null}

      <Riquadro
        titolo={filtro ? ETICHETTE_REVISIONE[filtro] : "Tutti i documenti"}
        conta={mostrati.length}
        nota={
          filtro
            ? undefined
            : "«Analizzato» dice che il motore ha letto il file; «revisionato» che l’ha guardato una persona. Sono due cose diverse."
        }
        className="mt-5"
      >
        {mostrati.length === 0 ? (
          <Niente>
            {filtro
              ? "Nessun documento in questo stato."
              : "Nessun documento. Compaiono qui appena un paziente ne carica uno o lo aggiungi dalla sua cartella."}
          </Niente>
        ) : (
          <Elenco documenti={mostrati} />
        )}
      </Riquadro>
    </div>
  );
}

/* ── Pezzi ────────────────────────────────────────────────────────── */

function Elenco({ documenti }: { documenti: DocumentoInArrivo[] }) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {documenti.map((doc) => {
        const revisione = toStatoRevisione(doc.statoRevisione);

        return (
          <li key={doc.id}>
            <NavLink
              href={`/pro/pazienti/${doc.patientId}/documenti`}
              className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-bone-50"
            >
              <div className="min-w-[14rem] flex-1">
                <p className="truncate text-[15px] font-medium text-ink-900">
                  {doc.title}
                </p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {doc.patientName} · {KIND_LABEL[doc.kind] ?? doc.kind} ·{" "}
                  <span className="tnum">
                    {formatShortDate(doc.issuedOn ?? doc.createdAt)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-ink-300 first-letter:uppercase">
                  arrivato {formatRelativeDays(doc.createdAt)}
                  {doc.revisionatoDa ? ` · revisionato da ${doc.revisionatoDa}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {doc.valoriInAttesa > 0 ? (
                  <Badge tone="attention">
                    {doc.valoriInAttesa} valori in attesa
                  </Badge>
                ) : null}
                <StatoAnalisi stato={doc.statoAnalisi} />
                <Badge tone={tonoRevisione(revisione)}>
                  {ETICHETTE_REVISIONE[revisione]}
                </Badge>
              </div>

              <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function Pillola({
  href,
  attiva,
  urgente = false,
  children,
}: {
  href: string;
  attiva: boolean;
  urgente?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      href={href}
      aria-current={attiva ? "true" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors",
        attiva
          ? "bg-ink-900 font-medium text-bone-50"
          : urgente
            ? "bg-[#fdf6e8] text-signal-attention ring-1 ring-[#f0e0bd] hover:bg-[#fbf0d9]"
            : "bg-white text-ink-500 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
      )}
    >
      {children}
    </NavLink>
  );
}
