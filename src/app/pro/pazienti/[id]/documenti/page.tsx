import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth";
import { getDocumentiPaziente } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { rileggiDocumento } from "@/lib/documents/actions";
import { motoreOcrAttivo } from "@/lib/document-intelligence/ocr";
import { puoApprovare as puoApprovareReferti, toStatoRevisione } from "@/lib/documents/revisione";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { ConfineAI, Niente, Riquadro } from "@/components/clinical/command-center";
import { RevisioneReferto } from "@/components/clinical/revisione-referto";
import { Dropzone } from "@/components/documents/dropzone";
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

  const ocr = await motoreOcrAttivo();
  const daLeggere = documenti.filter((d) => toStatoRevisione(d.statoRevisione) === "pending");

  return (
    <div className="space-y-6">
      <Riquadro
        titolo="Carica un referto"
        nota="Il motore lo classifica, ne estrae i parametri e segnala al care team ciò che va rivisto. Se l’analisi fallisce, il file resta comunque caricato."
      >
        <div className="px-6 pb-5 pt-3">
          <Dropzone patientId={id} baseDocumenti={`/pro/pazienti/${id}/documenti`} />

          {/*
            Cosa il motore sa leggere *adesso*, chiesto al registro dei
            motori invece che dedotto dal modello linguistico acceso.
            Sono due cose diverse da quando il riconoscimento ottico può
            girare in locale: dirlo male qui significa far ricaricare a
            mano referti che il sistema avrebbe letto.
          */}
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            PDF, Word, Excel e CSV vengono letti direttamente.{" "}
            {ocr.nome === "tesseract" ? (
              <>
                Le foto e le immagini passano dal riconoscimento ottico locale: non
                esce niente dalla clinica. Un PDF <em>scansionato</em> resta invece
                un&apos;immagine dentro un contenitore, e per quello serve un modello.
              </>
            ) : ocr.nome === "modello" ? (
              <>
                Foto, immagini e PDF scansionati passano dal riconoscimento ottico del
                modello acceso.
              </>
            ) : (
              <>
                Una foto o un referto <em>scansionato</em> è un&apos;immagine, e senza
                riconoscimento ottico non si legge: il file resta caricato e va
                guardato a mano, che è meglio di leggerlo male.
              </>
            )}
          </p>
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
            Word ed Excel si aprono per intero — fogli, tabelle, formule comprese.
            Una foto o un&apos;immagine passa dal riconoscimento ottico, che dichiara
            quanto è sicuro di ogni riga: un carattere non letto resta un carattere
            non letto, e il valore che lo contiene non entra in cartella da solo.
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
              {/*
                Il titolo porta al documento. Prima l'elenco era un
                capolinea: si vedeva che un referto esisteva e che era
                stato analizzato, e non c'era modo di guardare né il file
                né i valori che ne erano usciti.
              */}
              <NavLink
                href={`/pro/pazienti/${patientId}/documenti/${d.id}`}
                className="text-[15px] font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline"
              >
                {d.titolo}
              </NavLink>
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

                {/*
                  Passa dal Document Intelligence Engine, non più dal
                  vecchio estrattore: è la stessa pipeline del
                  caricamento, quindi da qui un referto scansionato
                  viene riconosciuto otticamente invece di risultare
                  «analizzato» senza che nessuno abbia letto niente.
                */}
                {!analizzato ? (
                  <form action={rileggiDocumento}>
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
