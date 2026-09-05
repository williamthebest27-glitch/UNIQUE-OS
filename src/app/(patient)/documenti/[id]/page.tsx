import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocumento } from "@/lib/data/documento";
import { PageHeading } from "@/components/shell/page-heading";
import { NavLink } from "@/components/shell/nav-link";
import {
  Avvertenze,
  ElencoBiomarcatori,
  ElencoIntuizioni,
  ElencoNote,
  StatoDocumento,
} from "@/components/documents/analisi";
import { ETICHETTE_TIPO_DOCUMENTO, type TipoDocumento } from "@/lib/document-intelligence/tipi";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documento" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Un documento, visto dal paziente.
 *
 * Tre cose, in quest'ordine: **l'originale**, che è suo e deve poter
 * aprire sempre; **cosa il sistema ha letto**, quando un professionista
 * l'ha guardato; **cosa ne pensa il motore**, con la stessa condizione.
 *
 * La condizione non è paternalismo ed è scritta in una policy del
 * database, non qui: un referto scansionato storto produce valori
 * sbagliati con la faccia di valori veri, e una persona che legge
 * «Ferritina 8, sotto l'intervallo» di sera non ha modo di sapere che il
 * motore ha letto male una cifra. Il file, la data e lo stato della
 * lavorazione si vedono comunque — così nessuno resta a chiedersi se il
 * caricamento sia andato a buon fine.
 *
 * Le **raccomandazioni** restano invisibili finché un professionista non
 * le ha decise, e quella è una policy ancora più stretta: una proposta
 * generata da una macchina, letta prima che un medico la confermi, è
 * indistinguibile da un consiglio clinico.
 */

export default async function DocumentoPazientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const documento = await getDocumento(id);

  // Nessuna riga significa che la Row Level Security non l'ha
  // restituita: non è un suo documento. Non c'è altro da distinguere.
  if (!documento) notFound();

  const letto = documento.statoRevisione !== "pending";
  const estrazione = documento.estrazione;
  const raccomandazioniDecise = documento.raccomandazioni.filter((r) => r.decisione !== null);

  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <NavLink
          href="/documenti"
          className="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
        >
          ← Documenti
        </NavLink>
        <div className="mt-2">
          <PageHeading
            title={documento.titolo}
            subtitle={`${
              ETICHETTE_TIPO_DOCUMENTO[
                (estrazione?.tipoDocumento ?? "UNKNOWN") as TipoDocumento
              ] ?? "Documento"
            } · ${formatShortDate(documento.emessoIl ?? documento.caricatoIl)}`}
          />
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* ── L'originale ─────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Il documento originale"
            hint="Il file che è stato caricato, esattamente com'era. Non viene mai modificato."
          />
          <div className="flex flex-wrap items-center gap-3 px-6 pb-6 pt-3">
            <a
              href={`/api/documenti/${documento.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
            >
              Apri il documento
            </a>
            <a
              href={`/api/documenti/${documento.id}?scarica=1`}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-700 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
            >
              Scarica
            </a>

            <span className="text-xs text-ink-400">
              {documento.formato ? `${documento.formato.toUpperCase()} · ` : ""}
              {documento.dimensione ? formatFileSize(documento.dimensione) : ""}
              {documento.pagine ? ` · ${documento.pagine} pagine` : ""}
            </span>

            <span className="ml-auto">
              <StatoDocumento stato={documento.statoLavorazione} />
            </span>
          </div>
        </Card>

        {/* ── Chi l'ha guardato ───────────────────────────────── */}
        {letto ? (
          <p className="rounded-xl bg-[#e9f6ee] px-4 py-3 text-sm text-signal-positive ring-1 ring-[#cdebd8]">
            {documento.statoRevisione === "approved"
              ? "Un medico ha approvato questo referto: ha valore clinico."
              : "Un professionista del tuo care team ha letto questo documento."}
            {documento.revisionatoDa ? ` — ${documento.revisionatoDa}` : ""}
            {documento.revisionatoIl ? `, ${formatShortDate(documento.revisionatoIl)}` : ""}
          </p>
        ) : (
          <p className="rounded-xl bg-bone-50 px-4 py-3 text-sm leading-relaxed text-ink-500 ring-1 ring-bone-200">
            Il documento è arrivato ed è al sicuro. Un professionista del tuo care team lo
            guarderà: i valori che il sistema ha letto compaiono qui dopo quel passaggio,
            perché un numero letto male non deve poter preoccupare nessuno prima che una
            persona lo abbia verificato.
          </p>
        )}

        {/* ── Cosa abbiamo letto ──────────────────────────────── */}
        {letto && estrazione ? (
          <>
            {estrazione.sintesi ? (
              <Card>
                <CardHeader title="In sintesi" />
                <p className="px-6 pb-5 pt-2 text-sm leading-relaxed text-ink-700">
                  {estrazione.sintesi}
                </p>
              </Card>
            ) : null}

            {documento.biomarcatori.length > 0 ? (
              <Card>
                <CardHeader
                  title="I valori"
                  hint="Accanto a ogni valore trovi l'intervallo con cui è stato confrontato e da dove viene."
                />
                <ElencoBiomarcatori biomarcatori={documento.biomarcatori} />
              </Card>
            ) : null}

            {documento.intuizioni.length > 0 ? (
              <Card>
                <CardHeader
                  title="Cosa abbiamo notato"
                  hint="Osservazioni del motore Unique sui tuoi valori nel tempo. Non sono una diagnosi."
                />
                <ElencoIntuizioni intuizioni={documento.intuizioni} />
              </Card>
            ) : null}

            {raccomandazioniDecise.length > 0 ? (
              <Card>
                <CardHeader
                  title="Cosa ne ha detto il tuo professionista"
                  hint="Le proposte del motore che un professionista ha valutato."
                />
                <ul className="divide-y divide-bone-200/80">
                  {raccomandazioniDecise.map((r) => (
                    <li key={r.id} className="px-6 py-4">
                      <p className="text-[15px] text-ink-900">{r.azione}</p>
                      <p className="mt-1 text-sm text-ink-500">
                        {r.decisione === "accolta"
                          ? "Il tuo professionista ha ritenuto di darle seguito."
                          : r.decisione === "rimandata"
                            ? "Se ne riparla al prossimo controllo."
                            : "Il tuo professionista non l'ha ritenuta necessaria."}
                        {r.notaDecisione ? ` «${r.notaDecisione}»` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {documento.note.length > 0 ? (
              <Card>
                <CardHeader title="Altro nel documento" />
                <ElencoNote note={documento.note} />
              </Card>
            ) : null}

            {estrazione.avvertenze.length > 0 ? (
              <Card>
                <CardHeader
                  title="Cosa non ho capito bene"
                  hint="Preferiamo dirlo che far finta di aver letto tutto."
                />
                <Avvertenze avvertenze={estrazione.avvertenze} />
              </Card>
            ) : null}
          </>
        ) : null}

        {letto && !estrazione ? (
          <Card>
            <CardHeader title="I valori" />
            <EmptyState>
              Questo documento non è stato analizzato in automatico. È comunque in cartella e
              lo vede il tuo care team.
            </EmptyState>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
