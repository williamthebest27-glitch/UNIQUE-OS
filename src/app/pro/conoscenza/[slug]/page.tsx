import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { voceConStoria } from "@/lib/knowledge/queries";
import { TIPI_CONOSCENZA } from "@/lib/knowledge/labels";
import { formatShortDate } from "@/lib/format";
import { Indietro, Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Voce della knowledge base" };
export const dynamic = "force-dynamic";

const STATI: Record<string, string> = {
  draft: "Bozza",
  active: "In vigore",
  superseded: "Sostituita",
  archived: "Archiviata",
};

/**
 * Una voce, con tutta la sua storia.
 *
 * La versione in vigore sta in cima e per intero; le precedenti restano
 * sotto, leggibili. È il punto in cui la knowledge base smette di essere
 * un archivio e diventa utile: «quanto costava a marzo» è una domanda
 * che si fa davvero, e la risposta non deve costare una telefonata.
 *
 * Sola lettura. Una versione nuova la apre e la pubblica la direzione.
 */
export default async function VoceConoscenzaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/conoscenza">Knowledge base</Indietro>
        <Card className="mt-6">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const voce = await voceConStoria(slug);
  if (!voce) notFound();

  const precedenti = voce.versioni.filter((v) => v.version !== voce.corrente?.version);

  return (
    <div className="mx-auto max-w-[820px]">
      <Indietro href="/pro/conoscenza">Knowledge base</Indietro>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <h1 className="font-display text-[28px] leading-tight text-ink-900 sm:text-[32px]">
            {voce.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{TIPI_CONOSCENZA[voce.kind] ?? voce.kind}</Badge>
            {voce.audience === "public" ? <Badge tone="brand">Pubblica</Badge> : null}
            {voce.corrente?.daRiconfermare ? (
              <Badge tone="attention">Da riconfermare</Badge>
            ) : null}
          </div>
        </div>

        {voce.corrente ? (
          <p className="mt-2 text-sm text-ink-400">
            {voce.corrente.provenienza}
            {voce.corrente.ownerName ? ` · responsabile ${voce.corrente.ownerName}` : ""}
          </p>
        ) : null}

        {voce.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {voce.tags.map((t) => (
              <li
                key={t}
                className="rounded-full bg-bone-100 px-2.5 py-0.5 text-xs text-ink-500 ring-1 ring-bone-200"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* ── In vigore ────────────────────────────────────────── */}
      <Riquadro
        titolo="In vigore oggi"
        nota={
          voce.corrente
            ? `Versione ${voce.corrente.version}, dal ${formatShortDate(voce.corrente.validFrom)}.`
            : undefined
        }
        className="mt-6"
      >
        {!voce.corrente ? (
          <Niente>
            Nessuna versione in vigore. Esiste la voce, ma oggi non risponde: né qui,
            né nelle risposte del Brain.
          </Niente>
        ) : (
          <div className="px-6 pb-6 pt-3">
            {voce.corrente.summary ? (
              <p className="text-[15px] leading-relaxed text-ink-700">
                {voce.corrente.summary}
              </p>
            ) : null}

            <div
              className={cx(
                "whitespace-pre-line text-[15px] leading-relaxed text-ink-800",
                voce.corrente.summary && "mt-4 border-t border-bone-200 pt-4",
              )}
            >
              {voce.corrente.body}
            </div>

            {Object.keys(voce.corrente.data).length > 0 ? (
              <dl className="mt-5 grid gap-x-8 gap-y-2 border-t border-bone-200 pt-4 sm:grid-cols-2">
                {Object.entries(voce.corrente.data).map(([chiave, valore]) => (
                  <div key={chiave} className="flex justify-between gap-4 text-sm">
                    <dt className="text-ink-400">{chiave}</dt>
                    <dd className="text-ink-900 tnum">{String(valore)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {voce.corrente.changeNote ? (
              <p className="mt-5 rounded-xl bg-bone-50 px-4 py-3 text-sm leading-relaxed text-ink-600 ring-1 ring-bone-200">
                {voce.corrente.changeNote}
              </p>
            ) : null}
          </div>
        )}
      </Riquadro>

      {/* ── Lo storico ───────────────────────────────────────── */}
      <Riquadro
        titolo="Versioni precedenti"
        conta={precedenti.length}
        nota="Restano leggibili, e non rispondono più. Servono a capire un documento vecchio, non a decidere oggi."
        apribile
        aperto={false}
        className="mt-6"
      >
        {precedenti.length === 0 ? (
          <Niente>Questa voce non è mai stata modificata.</Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {precedenti.map((v) => (
              <li key={v.id} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[15px] font-medium text-ink-900">
                    Versione <span className="tnum">{v.version}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge>{STATI[v.status] ?? v.status}</Badge>
                    <span className="text-xs text-ink-400 tnum">
                      {formatShortDate(v.validFrom)}
                      {v.validTo ? ` – ${formatShortDate(v.validTo)}` : ""}
                    </span>
                  </div>
                </div>

                {v.changeNote ? (
                  <p className="mt-1 text-sm text-ink-500">{v.changeNote}</p>
                ) : null}

                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-sm text-ink-400 transition-colors hover:text-ink-700 [&::-webkit-details-marker]:hidden">
                    Leggi il testo →
                  </summary>
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-bone-50 px-4 py-3 text-sm leading-relaxed text-ink-600 ring-1 ring-bone-200">
                    {v.body}
                  </p>
                </details>

                {v.authorName ? (
                  <p className="mt-1.5 text-xs text-ink-300">scritta da {v.authorName}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <p className="mt-4 text-xs leading-relaxed text-ink-300">
        Sola lettura. Aprire una versione nuova è una decisione di direzione, e passa
        dal Control Center.
      </p>
    </div>
  );
}
