import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { traccia } from "@/lib/audit";
import { getDocumento } from "@/lib/data/documento";
import { rileggiDocumento } from "@/lib/documents/actions";
import { puoApprovare as puoApprovareReferti } from "@/lib/documents/revisione";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ETICHETTE_TIPO_DOCUMENTO,
  type TipoDocumento,
} from "@/lib/document-intelligence/tipi";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { ConfineAI, Indietro, Niente, Riquadro } from "@/components/clinical/command-center";
import { RevisioneReferto } from "@/components/clinical/revisione-referto";
import {
  Avvertenze,
  ElencoBiomarcatori,
  ElencoIntuizioni,
  ElencoNote,
  ElencoRaccomandazioni,
  Registro,
  StatoDocumento,
} from "@/components/documents/analisi";
import {
  CorreggiValore,
  DecidiRaccomandazione,
  RevisioneAnalisi,
} from "@/components/documents/decisioni";

export const metadata: Metadata = { title: "Documento" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Un documento, visto da chi deve deciderne.
 *
 * L'ordine della pagina è l'ordine del lavoro, e ripete quello della
 * visione senza inventarsi niente:
 *
 *   l'originale → cosa ho letto → cosa ne deduco → cosa propongo →
 *   **cosa decidi tu**.
 *
 * I quattro livelli restano visivamente distinti perché confonderli è
 * il modo in cui un supporto decisionale diventa una diagnosi
 * automatica. Un valore ha una citazione; un'intuizione ha delle prove;
 * una raccomandazione ha un pulsante che dice chiaramente che serve una
 * firma. Nessuno dei tre si presenta come l'altro.
 */

export default async function DocumentoClinicoPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;

  const [documento, profile] = await Promise.all([getDocumento(docId), getCurrentProfile()]);

  if (!documento || documento.patientId !== id) notFound();

  traccia({
    azione: "document.view",
    entita: "document",
    patientId: id,
    entityId: docId,
    dettagli: { biomarcatori: documento.biomarcatori.length },
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

  const estrazione = documento.estrazione;
  const daVerificare = documento.biomarcatori.filter((b) => b.richiedeVerifica);
  const negative = documento.intuizioni.filter((i) => i.gruppo === "negativo");
  const daRivedere = documento.intuizioni.filter((i) => i.gruppo === "da_rivedere");
  const positive = documento.intuizioni.filter((i) => i.gruppo === "positivo");

  return (
    <div className="space-y-6">
      <Indietro href={`/pro/pazienti/${id}/documenti`}>Documenti del paziente</Indietro>

      {/* ── L'originale ───────────────────────────────────────── */}
      <Riquadro
        titolo={documento.titolo}
        nota={`${
          ETICHETTE_TIPO_DOCUMENTO[
            (estrazione?.tipoDocumento ?? "UNKNOWN") as TipoDocumento
          ] ?? "Documento"
        } · ${formatShortDate(documento.emessoIl ?? documento.caricatoIl)}${
          documento.caricatoDa ? ` · caricato da ${documento.caricatoDa}` : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <a
            href={`/api/documenti/${documento.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
          >
            Apri l&apos;originale
          </a>

          <span className="text-xs text-ink-400">
            {documento.formato ? `${documento.formato.toUpperCase()} · ` : ""}
            {documento.dimensione ? formatFileSize(documento.dimensione) : ""}
            {documento.pagine ? ` · ${documento.pagine} pagine` : ""}
            {estrazione?.laboratorio ? ` · ${estrazione.laboratorio}` : ""}
          </span>

          <StatoDocumento stato={documento.statoLavorazione} />

          <form action={rileggiDocumento} className="ml-auto">
            <input type="hidden" name="documentId" value={documento.id} />
            <input type="hidden" name="patientId" value={id} />
            <button
              type="submit"
              className="rounded-lg px-2.5 py-1 text-xs text-ink-500 ring-1 ring-bone-200 transition-colors hover:text-brand-700"
            >
              {estrazione ? "Rileggi" : "Analizza"}
            </button>
          </form>
        </div>

        {documento.erroreLavorazione ? (
          <p className="mx-6 mb-4 rounded-xl bg-[#fdf6e8] px-3.5 py-2.5 text-sm text-signal-attention ring-1 ring-[#f0e0bd]">
            L&apos;ultima elaborazione non è riuscita: {documento.erroreLavorazione}
          </p>
        ) : null}

        {estrazione?.nomeSulDocumento ? (
          <p className="mx-6 mb-4 text-xs text-ink-400">
            Il documento è intestato a «{estrazione.nomeSulDocumento}». È una lettura di
            controllo: l&apos;attribuzione al paziente resta quella scelta al caricamento.
          </p>
        ) : null}
      </Riquadro>

      {/* ── La revisione del referto ──────────────────────────── */}
      <Riquadro
        titolo="Revisione del referto"
        nota="«Analizzato» dice che il motore ha letto il file. «Revisionato» dice che l'hai guardato tu. Segnarlo letto rende i valori visibili anche al paziente."
      >
        <div className="px-6 py-4">
          <RevisioneReferto
            documentId={documento.id}
            patientId={id}
            stato={documento.statoRevisione}
            revisionatoDa={documento.revisionatoDa}
            puoApprovare={puoApprovare}
          />
        </div>
      </Riquadro>

      {!estrazione ? (
        <Riquadro titolo="Analisi">
          <Niente>
            Questo documento non è ancora passato dal motore. Premi «Analizza» qui sopra: il
            file resta comunque in cartella, qualunque cosa la lettura produca.
          </Niente>
        </Riquadro>
      ) : (
        <>
          {/* ── Cosa ho letto ─────────────────────────────────── */}
          <Riquadro
            titolo="Cosa ho letto"
            conta={documento.biomarcatori.length}
            nota={comeHoLetto(estrazione)}
          >
            <div className="px-6 pt-3">
              <ConfineAI
                fonte={`lettura automatica di «${documento.titolo}»${
                  estrazione.motoreOcr ? ` con riconoscimento ottico (${estrazione.motoreOcr})` : ""
                }`}
              >
                Valori estratti dal documento, non ancora un dato clinico. Ogni riga porta la
                citazione da cui viene: verificala prima di approvare.
              </ConfineAI>
            </div>

            {estrazione.sintesi ? (
              <p className="px-6 pt-3 text-sm leading-relaxed text-ink-600">
                {estrazione.sintesi}
              </p>
            ) : null}

            {daVerificare.length > 0 ? (
              <p className="mx-6 mt-3 rounded-xl bg-[#fdf6e8] px-3.5 py-2.5 text-sm text-signal-attention ring-1 ring-[#f0e0bd]">
                {daVerificare.length}{" "}
                {daVerificare.length === 1
                  ? "valore richiede una verifica"
                  : "valori richiedono una verifica"}{" "}
                prima di poter entrare in cartella.
              </p>
            ) : null}

            <div className="mt-2">
              <ElencoBiomarcatori
                biomarcatori={documento.biomarcatori}
                azioni={(b) => (
                  <CorreggiValore
                    biomarkerId={b.id}
                    patientId={id}
                    nome={b.nome}
                    valoreAttuale={b.valoreCorretto ?? b.valore}
                    unita={b.unita}
                  />
                )}
              />
            </div>
          </Riquadro>

          {estrazione.avvertenze.length > 0 ? (
            <Riquadro
              titolo="Cosa non ho capito"
              conta={estrazione.avvertenze.length}
              nota="Dichiarato invece che indovinato."
            >
              <Avvertenze avvertenze={estrazione.avvertenze} />
            </Riquadro>
          ) : null}

          {/* ── Cosa ne deduco ────────────────────────────────── */}
          {negative.length + daRivedere.length + positive.length > 0 ? (
            <Riquadro
              titolo="Cosa ne deduco"
              nota="Inferenze del motore sui valori e sul loro andamento nel tempo. Non sono fatti: ogni riga porta le prove su cui si fonda."
            >
              {negative.length > 0 ? (
                <Gruppo titolo="Fuori dall'intervallo">
                  <ElencoIntuizioni intuizioni={negative} />
                </Gruppo>
              ) : null}

              {daRivedere.length > 0 ? (
                <Gruppo titolo="Da guardare">
                  <ElencoIntuizioni intuizioni={daRivedere} />
                </Gruppo>
              ) : null}

              {positive.length > 0 ? (
                <Gruppo titolo="In ordine">
                  <ElencoIntuizioni intuizioni={positive} />
                </Gruppo>
              ) : null}
            </Riquadro>
          ) : null}

          {/* ── Cosa propongo ─────────────────────────────────── */}
          <Riquadro
            titolo="Cosa propongo"
            conta={documento.raccomandazioni.length}
            nota="Richieste di attenzione, non prescrizioni. Il paziente le vede solo dopo che le hai decise."
          >
            <ElencoRaccomandazioni
              raccomandazioni={documento.raccomandazioni}
              azioni={(r) => (
                <DecidiRaccomandazione
                  recommendationId={r.id}
                  patientId={id}
                  giaDecisa={r.decisione !== null}
                />
              )}
            />
          </Riquadro>

          {documento.note.length > 0 ? (
            <Riquadro
              titolo="Terapia e testo del referto"
              nota="Letti dal documento. Non sostituiscono la terapia registrata in cartella."
              apribile
              aperto={false}
            >
              <ElencoNote note={documento.note} />
            </Riquadro>
          ) : null}

          {/* ── Cosa decidi tu ────────────────────────────────── */}
          <Riquadro
            titolo="La tua decisione sull'analisi"
            nota="Diversa dalla revisione del referto: qui giudichi ciò che la macchina ha capito, non il documento."
          >
            <RevisioneAnalisi
              extractionId={estrazione.id}
              patientId={id}
              giaRevisionata={documento.revisioniAnalisi.length > 0}
            />

            {documento.revisioniAnalisi.length > 0 ? (
              <ul className="space-y-1 border-t border-bone-200 px-6 py-3">
                {documento.revisioniAnalisi.map((r) => (
                  <li key={r.id} className="text-xs text-ink-400">
                    <span className="font-medium text-ink-500">{r.decisione}</span>
                    {r.revisore ? ` — ${r.revisore}` : ""} · {formatShortDate(r.quando)}
                    {r.nota ? ` · «${r.nota}»` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </Riquadro>

          {/* ── Il testo grezzo ───────────────────────────────── */}
          {estrazione.testo ? (
            <Riquadro
              titolo="Il testo che ho letto"
              nota="Esattamente ciò che il motore aveva davanti quando ha proposto quei valori."
              apribile
              aperto={false}
            >
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap px-6 py-4 font-mono text-[11px] leading-relaxed text-ink-600">
                {estrazione.testo}
              </pre>
            </Riquadro>
          ) : null}
        </>
      )}

      {/* ── Il registro ───────────────────────────────────────── */}
      <Riquadro
        titolo="Storia del documento"
        nota="Ogni passaggio, con chi l'ha fatto e cosa è cambiato."
        apribile
        aperto={false}
      >
        <Registro righe={documento.registro} />
      </Riquadro>
    </div>
  );
}

/* ── Servizio ─────────────────────────────────────────────────────── */

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-bone-200 first:border-t-0">
      <h3 className="px-6 pt-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-400">
        {titolo}
      </h3>
      {children}
    </div>
  );
}

/**
 * Come il documento è stato letto, detto in una riga.
 *
 * Serve a chi rivede più di quanto sembri: un referto letto con
 * riconoscimento ottico al settanta per cento va guardato con occhi
 * diversi da un PDF nativo, e la differenza non si vede dai valori.
 */
function comeHoLetto(estrazione: NonNullable<
  Awaited<ReturnType<typeof getDocumento>>
>["estrazione"]): string {
  if (!estrazione) return "";

  const parti: string[] = [];

  parti.push(
    estrazione.letturaVia === "nativo"
      ? "Testo letto direttamente dal file"
      : estrazione.letturaVia === "ocr"
        ? `Testo riconosciuto otticamente${estrazione.motoreOcr ? ` (${estrazione.motoreOcr})` : ""}`
        : "Parte del testo letta dal file, parte riconosciuta otticamente",
  );

  if (estrazione.fiduciaTesto !== null && estrazione.letturaVia !== "nativo") {
    parti.push(`fiducia della lettura ${Math.round(estrazione.fiduciaTesto * 100)}%`);
  }

  if (estrazione.confidenza !== null) {
    parti.push(`confidenza complessiva ${Math.round(estrazione.confidenza * 100)}%`);
  }

  return `${parti.join(" · ")}.`;
}
