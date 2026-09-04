import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth";
import { getDocumentiPaziente } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { analizzaDocumento } from "@/lib/brain/actions";
import { capacitaAttive } from "@/lib/brain/fornitore";
import { puoApprovare as puoApprovareReferti, toStatoRevisione } from "@/lib/documents/revisione";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { ConfineAI, Niente, Riquadro } from "@/components/clinical/command-center";
import { RevisioneReferto } from "@/components/clinical/revisione-referto";
import { UploadForm } from "@/components/documents/upload-form";
import { Badge, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Documenti del paziente" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * I referti in cartella.
 *
 * La colonna che conta è quella a destra, ed è nuova: **da revisionare,
 * revisionato, approvato.** Prima esisteva solo lo stato dell'analisi —
 * se il motore avesse letto il PDF — che è un fatto tecnico e non dice
 * niente su chi l'abbia guardato. Un referto scansionato risulta
 * «analizzato» senza che nessuno abbia capito cosa c'è scritto.
 *
 * Le due colonne stanno affiancate proprio perché non vanno confuse.
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

function StatoAnalisi({ stato }: { stato: string | null }) {
  if (stato === null) return <Badge>non analizzato</Badge>;
  if (stato === "pending") return <Badge tone="brand">in analisi</Badge>;
  if (stato === "failed") return <Badge tone="attention">analisi fallita</Badge>;
  return <Badge tone="positive">analizzato</Badge>;
}

export default async function DocumentiPazientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [documenti, profile] = await Promise.all([
    getDocumentiPaziente(id),
    getCurrentProfile(),
  ]);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "documenti", documenti: documenti.length },
  });

  // La disciplina decide chi può approvare, ed è la stessa regola che
  // `can_approve_clinical_flag()` impone nel database.
  const supabase = await createSupabaseServerClient();
  const { data: pro } = await supabase
    .from("professionals")
    .select("discipline")
    .eq("profile_id", profile?.id ?? "")
    .maybeSingle();

  const puoApprovare = puoApprovareReferti(
    (pro as { discipline: string } | null)?.discipline ?? null,
    profile?.role ?? "professional",
  );

  const capacita = capacitaAttive();
  const daLeggere = documenti.filter((d) => toStatoRevisione(d.statoRevisione) === "pending");

  return (
    <div className="space-y-6">
      <Riquadro
        titolo="Carica un referto"
        nota="Il motore lo classifica, ne estrae i parametri e segnala al care team ciò che va rivisto. Se l’analisi fallisce, il file resta comunque caricato."
      >
        <div className="px-6 pb-5 pt-3">
          <UploadForm patientId={id} />
          {!capacita.estrazione ? (
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              Un PDF con il testo dentro viene letto dal motore proprietario. Un
              referto <em>scansionato</em> è un&apos;immagine, e senza un modello
              linguistico non si legge: il file resta caricato e va guardato a mano,
              che è meglio di leggerlo male.
            </p>
          ) : null}
        </div>
      </Riquadro>

      {daLeggere.length > 0 ? (
        <Riquadro
          titolo="Da revisionare"
          conta={daLeggere.length}
          nota="Nessuno li ha ancora aperti."
        >
          <ElencoDocumenti
            documenti={daLeggere}
            patientId={id}
            puoApprovare={puoApprovare}
          />
        </Riquadro>
      ) : null}

      <Riquadro
        titolo="Tutti i documenti"
        conta={documenti.length}
        nota="«Analizzato» dice che il motore ha letto il file. «Revisionato» dice che l’ha guardato una persona. Sono due cose diverse."
      >
        {documenti.length === 0 ? (
          <Niente>
            Nessun documento in cartella. Compaiono qui appena il paziente ne
            carica uno o lo aggiungi da sopra.
          </Niente>
        ) : (
          <ElencoDocumenti
            documenti={documenti}
            patientId={id}
            puoApprovare={puoApprovare}
          />
        )}
      </Riquadro>

      <Riquadro titolo="Cosa succede a un referto caricato" apribile aperto={false}>
        <div className="space-y-3 px-6 py-4 text-sm leading-relaxed text-ink-600">
          <p>
            Il PDF viene riletto ricostruendo le righe dalla posizione dei
            frammenti, gli esami si riconoscono dai sinonimi del catalogo, le unità
            si convertono e ogni valore porta la fiducia della lettura.
          </p>
          <p>
            I parametri passano poi da regole deterministiche: quelli clinicamente
            rilevanti finiscono in{" "}
            <NavLink
              href="/pro/revisioni"
              className="text-brand-700 underline-offset-4 hover:underline"
            >
              coda di revisione
            </NavLink>
            , e il Longevity Score si ricalcola solo su ciò che un professionista ha
            approvato.
          </p>
          <p>
            Un referto scansionato è un&apos;immagine: il sistema lo dichiara invece
            di leggerlo male.
          </p>
        </div>
      </Riquadro>
    </div>
  );
}

/* ── L'elenco ─────────────────────────────────────────────────────── */

function ElencoDocumenti({
  documenti,
  patientId,
  puoApprovare,
}: {
  documenti: Awaited<ReturnType<typeof getDocumentiPaziente>>;
  patientId: string;
  puoApprovare: boolean;
}) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {documenti.map((d) => {
        const analizzato = d.statoAnalisi === "completed";

        return (
          <li key={d.id} className="flex flex-wrap gap-x-6 gap-y-4 px-6 py-4">
            <div className="min-w-[16rem] flex-1">
              <p className="text-[15px] font-medium text-ink-900">{d.titolo}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {TIPO[d.tipo] ?? d.tipo} ·{" "}
                <span className="tnum">
                  {formatShortDate(d.emessoIl ?? d.caricatoIl)}
                </span>
                {d.dimensione ? ` · ${formatFileSize(d.dimensione)}` : ""}
                {d.caricatoDa ? ` · caricato da ${d.caricatoDa}` : ""}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatoAnalisi stato={d.statoAnalisi} />

                {d.valoriEstratti > 0 ? (
                  <span className="text-xs text-ink-400 tnum">
                    {d.valoriEstratti}{" "}
                    {d.valoriEstratti === 1 ? "valore estratto" : "valori estratti"}
                    {d.valoriInAttesa > 0 ? `, ${d.valoriInAttesa} in attesa` : ""}
                  </span>
                ) : null}

                {!analizzato ? (
                  <form action={analizzaDocumento}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="patientId" value={patientId} />
                    <button
                      type="submit"
                      className="rounded-lg px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
                    >
                      Analizza
                    </button>
                  </form>
                ) : null}
              </div>

              {d.sintesiAnalisi ? (
                <div className="mt-3 max-w-2xl">
                  <ConfineAI fonte={`lettura automatica di «${d.titolo}»`}>
                    Sintesi prodotta dal motore leggendo il documento. Va confrontata con
                    il referto originale.
                  </ConfineAI>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    {d.sintesiAnalisi}
                  </p>
                </div>
              ) : null}

              {d.notaRevisione ? (
                <p
                  className={cx(
                    "mt-2 max-w-2xl rounded-lg bg-bone-50 px-3 py-2 text-sm text-ink-600",
                    "ring-1 ring-bone-200",
                  )}
                >
                  {d.notaRevisione}
                  {d.revisionatoIl ? (
                    <span className="ml-2 text-xs text-ink-300 tnum">
                      {formatShortDate(d.revisionatoIl)}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>

            <RevisioneReferto
              documentId={d.id}
              patientId={patientId}
              stato={d.statoRevisione}
              revisionatoDa={d.revisionatoDa}
              puoApprovare={puoApprovare}
            />
          </li>
        );
      })}
    </ul>
  );
}
