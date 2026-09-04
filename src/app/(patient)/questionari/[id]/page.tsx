import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { questionario } from "@/lib/data/paziente-sezioni";
import { salvaQuestionario } from "@/lib/patient/actions";
import { completamento, type Domanda, type Risposta } from "@/lib/patient/questionari";
import { Modulo } from "@/components/patient/modulo";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Questionario" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Un questionario da compilare.
 *
 * Una domanda per riga, tutte sulla stessa pagina: uno per schermata
 * sembra più curato e fa abbandonare di più, perché nasconde quanto
 * manca. Qui si vede tutto, si risponde a quello che si sa, e si salva —
 * riprendere è previsto, non un ripiego.
 *
 * Il tipo di domanda decide il campo: una scala è una fila di bottoni
 * radio con gli estremi scritti, non un cursore che su telefono non si
 * ferma dove vuoi.
 */

function CampoDomanda({
  domanda,
  valore,
  sola,
}: {
  domanda: Domanda;
  valore: Risposta | undefined;
  sola: boolean;
}) {
  const nome = `q_${domanda.id}`;
  const classeCampo =
    "w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 " +
    "focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 disabled:opacity-60";

  if (domanda.tipo === "scale") {
    const min = domanda.min ?? 1;
    const max = domanda.max ?? 5;
    const valori = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
      <fieldset disabled={sola}>
        <legend className="sr-only">{domanda.testo}</legend>
        <div className="flex flex-wrap gap-2">
          {valori.map((v) => (
            <label key={v} className="cursor-pointer">
              <input
                type="radio"
                name={nome}
                value={v}
                defaultChecked={Number(valore) === v}
                className="peer sr-only"
              />
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bone-100 text-[15px] text-ink-700 transition-colors peer-checked:bg-ink-900 peer-checked:text-bone-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
                {v}
              </span>
            </label>
          ))}
        </div>
        {domanda.estremi ? (
          <div className="mt-2 flex justify-between text-xs text-ink-400">
            <span>{domanda.estremi[0]}</span>
            <span>{domanda.estremi[1]}</span>
          </div>
        ) : null}
      </fieldset>
    );
  }

  if (domanda.tipo === "single" || domanda.tipo === "multi") {
    const scelte = Array.isArray(valore) ? valore : valore ? [String(valore)] : [];
    return (
      <fieldset disabled={sola}>
        <legend className="sr-only">{domanda.testo}</legend>
        <div className="space-y-1.5">
          {domanda.opzioni.map((opzione) => (
            <label
              key={opzione}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-bone-100 px-4 py-3 transition-colors has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
            >
              <input
                type={domanda.tipo === "multi" ? "checkbox" : "radio"}
                name={nome}
                value={opzione}
                defaultChecked={scelte.includes(opzione)}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <span className="text-[15px]">{opzione}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (domanda.tipo === "number") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="number"
          name={nome}
          inputMode="decimal"
          step="any"
          min={domanda.min ?? undefined}
          max={domanda.max ?? undefined}
          defaultValue={valore === undefined || valore === null ? "" : String(valore)}
          disabled={sola}
          aria-label={domanda.testo}
          className={cx(classeCampo, "max-w-[9rem]")}
        />
        {domanda.unita ? <span className="text-sm text-ink-400">{domanda.unita}</span> : null}
      </div>
    );
  }

  return (
    <textarea
      name={nome}
      rows={3}
      defaultValue={typeof valore === "string" ? valore : ""}
      disabled={sola}
      aria-label={domanda.testo}
      className={cx(classeCampo, "resize-y")}
    />
  );
}

export default async function QuestionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await questionario(id);
  if (!q) notFound();

  const consegnato = q.stato === "completed";
  const fatto = completamento(q.domande, q.risposte);

  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <Link href="/questionari" className="text-xs text-ink-400 transition-colors hover:text-ink-900">
          ← Questionari
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
            {q.titolo}
          </h1>
          {consegnato ? (
            <Badge tone="positive">
              Consegnato{q.completatoIl ? ` il ${formatShortDate(q.completatoIl)}` : ""}
            </Badge>
          ) : (
            <Badge>circa {q.minutiStimati} minuti</Badge>
          )}
        </div>
        {q.descrizione ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">{q.descrizione}</p>
        ) : null}
      </div>

      {!consegnato && q.domande.length > 0 ? (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bone-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
              style={{ width: `${fatto}%` }}
            />
          </div>
          <span className="text-sm text-ink-400 tnum">{fatto}%</span>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={consegnato ? "Le tue risposte" : "Le domande"}
          hint={
            consegnato
              ? "Un questionario consegnato non si modifica. Se qualcosa è cambiato, scrivilo dai messaggi."
              : "Rispondi a quello che sai. Puoi salvare e riprendere quando vuoi."
          }
        />

        {q.domande.length === 0 ? (
          <EmptyState>
            Questo questionario non ha domande da mostrare. Segnalalo alla segreteria.
          </EmptyState>
        ) : (
          <div className="px-6 pb-6 pt-3">
            <Modulo
              action={salvaQuestionario}
              invio={consegnato ? "Già consegnato" : "Consegna"}
              azioniExtra={
                consegnato ? null : (
                  <button
                    type="submit"
                    name="bozza"
                    value="true"
                    className="rounded-xl px-4 py-3 text-[15px] text-ink-500 transition-colors hover:text-ink-900"
                  >
                    Salva e continua dopo
                  </button>
                )
              }
            >
              {/* Il bottone principale consegna. Quello quieto porta con sé
                  `bozza`, che è l'unico modo perché due invii dello stesso
                  modulo si distinguano senza campi in conflitto. */}
              <input type="hidden" name="assessmentId" value={q.id} />

              <ol className="space-y-7">
                {q.domande.map((domanda, i) => (
                  <li key={domanda.id}>
                    <p className="text-[15px] font-medium leading-snug text-ink-900">
                      <span className="mr-2 text-ink-300 tnum">{i + 1}.</span>
                      {domanda.testo}
                      {!domanda.obbligatoria ? (
                        <span className="ml-2 text-[13px] font-normal text-ink-400">facoltativa</span>
                      ) : null}
                    </p>
                    <div className="mt-3">
                      <CampoDomanda
                        domanda={domanda}
                        valore={q.risposte[domanda.id]}
                        sola={consegnato}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </Modulo>
          </div>
        )}
      </Card>
    </div>
  );
}
