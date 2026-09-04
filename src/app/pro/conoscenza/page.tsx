import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cercaConoscenza, elencoConoscenza } from "@/lib/knowledge/queries";
import { TIPI_CONOSCENZA } from "@/lib/knowledge/labels";
import type { KnowledgeKind } from "@/lib/knowledge/validity";
import { ricercaUtile } from "@/lib/ricerca/corrispondenza";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Knowledge base" };
export const dynamic = "force-dynamic";

/**
 * La knowledge base, in sola lettura.
 *
 * Protocolli, procedure, listini, policy: la memoria aziendale, letta da
 * chi la applica. **Si legge da `knowledge_current`**, che è la vista di
 * ciò che è vero *oggi*: il prezzo di ieri resta leggibile nello storico
 * di una voce, ma non risponde più.
 *
 * Qui non si scrive. Una versione nuova la apre e la pubblica la
 * direzione, dal Control Center, e non è una limitazione di comodo: una
 * procedura clinica che chiunque può riscrivere non è una procedura.
 *
 * A livello di database niente di tutto questo dipende da questa pagina:
 * `is_internal()` lascia leggere la knowledge base a tutto lo staff, e
 * la scrittura è già riservata altrove.
 */
export default async function ConoscenzaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Knowledge base" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa la knowledge base è
            vuota.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { q, tipo } = await searchParams;
  const cerca = (q ?? "").trim();

  const voci =
    cerca && ricercaUtile(cerca)
      ? await cercaConoscenza(cerca, 30)
      : await elencoConoscenza(
          tipo && tipo in TIPI_CONOSCENZA ? (tipo as KnowledgeKind) : undefined,
        );

  const tipiPresenti = [...new Set(voci.map((v) => v.kind))];

  return (
    <div>
      <PageHeading
        title="Knowledge base"
        subtitle="Protocolli, procedure, listini e policy: ciò che è in vigore oggi. Le versioni precedenti restano leggibili nella scheda di ogni voce."
      />

      {/* ── Ricerca ──────────────────────────────────────────── */}
      <form method="get" className="mt-6" role="search">
        <label htmlFor="cerca-conoscenza" className="sr-only">
          Cerca nella knowledge base
        </label>
        <input
          id="cerca-conoscenza"
          name="q"
          type="search"
          defaultValue={cerca}
          placeholder="Protocollo, prezzo, procedura…"
          className="w-full max-w-md rounded-xl bg-white px-4 py-2.5 text-[15px] text-ink-900 shadow-card ring-1 ring-bone-200 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      {/* ── Tipi ─────────────────────────────────────────────── */}
      {!cerca ? (
        <nav aria-label="Tipi di informazione" className="mt-4 flex flex-wrap gap-1.5">
          <Pillola href="/pro/conoscenza" attiva={!tipo}>
            Tutto
          </Pillola>
          {Object.entries(TIPI_CONOSCENZA).map(([chiave, etichetta]) => (
            <Pillola
              key={chiave}
              href={`/pro/conoscenza?tipo=${chiave}`}
              attiva={tipo === chiave}
              spenta={!tipiPresenti.includes(chiave as KnowledgeKind) && !tipo}
            >
              {etichetta}
            </Pillola>
          ))}
        </nav>
      ) : null}

      <Riquadro
        titolo={cerca ? `Risultati per «${cerca}»` : "In vigore oggi"}
        conta={voci.length}
        className="mt-5"
      >
        {voci.length === 0 ? (
          <Niente>
            {cerca
              ? "Nessuna voce corrisponde. Se non è qui, non è vero oggi: il Brain risponde solo da questa vista."
              : "Nessuna voce di questo tipo."}
          </Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {voci.map((v) => (
              <li key={v.entryId}>
                <NavLink
                  href={`/pro/conoscenza/${v.slug}`}
                  className="block px-6 py-4 transition-colors hover:bg-bone-50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-[15px] font-medium text-ink-900">{v.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge>{TIPI_CONOSCENZA[v.kind] ?? v.kind}</Badge>
                      {v.daRiconfermare ? (
                        <Badge tone="attention">Da riconfermare</Badge>
                      ) : null}
                    </div>
                  </div>

                  {v.summary ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">{v.summary}</p>
                  ) : null}

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-300">
                    <span>{v.provenienza}</span>
                    {v.ownerName ? <span>responsabile {v.ownerName}</span> : null}
                  </p>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro titolo="Perché una voce ha una versione" apribile aperto={false} className="mt-6">
        <div className="space-y-3 px-6 py-4 text-sm leading-relaxed text-ink-600">
          <p>
            Un&apos;informazione aziendale non è vera per sempre: un prezzo cambia, una
            procedura si aggiorna. Ogni voce ha versioni con date di validità, e da
            questa schermata si legge <strong className="font-medium">ciò che vale
            oggi</strong>.
          </p>
          <p>
            Il prezzo dell&apos;anno scorso resta leggibile nello storico di ogni voce
            — serve a capire una fattura vecchia — ma non risponde più a chi chiede
            «quanto costa».
          </p>
          <p className="text-ink-400">
            Le voci si scrivono e si pubblicano dal Control Center. Una voce senza un
            proprietario invecchia senza che nessuno se ne accorga: se ne trovi una,
            segnalala alla direzione.
          </p>
        </div>
      </Riquadro>
    </div>
  );
}

function Pillola({
  href,
  attiva,
  spenta = false,
  children,
}: {
  href: string;
  attiva: boolean;
  spenta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      href={href}
      aria-current={attiva ? "true" : undefined}
      className={cx(
        "rounded-full px-3 py-1 text-sm transition-colors",
        attiva
          ? "bg-ink-900 font-medium text-bone-50"
          : spenta
            ? "text-ink-300 ring-1 ring-bone-200"
            : "bg-white text-ink-500 ring-1 ring-bone-200 hover:text-brand-700 hover:ring-brand-100",
      )}
    >
      {children}
    </NavLink>
  );
}
