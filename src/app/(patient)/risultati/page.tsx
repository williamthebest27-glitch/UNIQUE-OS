import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { letture } from "@/lib/data/paziente-sezioni";
import { componiRisultati, fuoriIntervallo, type RigaRisultato } from "@/lib/patient/risultati";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { Grafico } from "@/components/patient/grafico";
import { DocumentsCard } from "@/components/patient/lists";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Risultati" };
export const dynamic = "force-dynamic";

/**
 * I risultati.
 *
 * Ogni parametro con il suo valore, la sua unità, l'intervallo di
 * riferimento del laboratorio e il confronto con la misura precedente.
 *
 * **Qui non si diagnostica niente.** Dire che un valore sta fuori
 * dall'intervallo di riferimento *del referto* è riportare un fatto
 * stampato; dire cosa quel fatto significhi per quella persona è
 * medicina, e la fa un medico. La riga in fondo alla pagina lo scrive
 * esplicitamente, perché chi legge un numero fuori intervallo si spaventa
 * e ha il diritto di sapere subito a chi chiedere.
 */

const SEZIONE = sezioneDi("/risultati")!;

function numero(valore: number): string {
  const decimali = Math.abs(valore) < 10 && !Number.isInteger(valore) ? 1 : 0;
  return valore.toLocaleString("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: Math.max(decimali, 1),
  });
}

function Riferimento({ riga }: { riga: RigaRisultato }) {
  const { basso, alto } = riga.riferimento;
  if (basso === null && alto === null) return null;

  const testo =
    basso !== null && alto !== null
      ? `${numero(basso)}–${numero(alto)}`
      : alto !== null
        ? `fino a ${numero(alto)}`
        : `da ${numero(basso!)}`;

  return (
    <span className="text-xs text-ink-400 tnum">
      riferimento {testo}
      {riga.unit ? ` ${riga.unit}` : ""}
    </span>
  );
}

function RigaValore({ riga }: { riga: RigaRisultato }) {
  const fuori = riga.stato === "sotto" || riga.stato === "sopra";

  return (
    <li className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[15px] font-medium text-ink-900">{riga.label}</h3>
            {fuori ? (
              <Badge tone="attention">
                {riga.stato === "sopra" ? "sopra il riferimento" : "sotto il riferimento"}
              </Badge>
            ) : riga.stato === "dentro" ? (
              <Badge tone="positive">nel riferimento</Badge>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[30px] leading-none text-ink-900 tnum">
              {riga.valore !== null ? numero(riga.valore) : (riga.categoria ?? "—")}
            </span>
            {riga.unit ? <span className="text-sm text-ink-400">{riga.unit}</span> : null}
            <Riferimento riga={riga} />
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-[13px]">
            <span className="text-ink-400 tnum">
              misurato il {formatShortDate(riga.misuratoIl)}
            </span>
            {riga.precedente && riga.delta !== null ? (
              <span
                className={cx(
                  "font-medium tnum",
                  riga.miglioramento === true
                    ? "text-signal-positive"
                    : riga.miglioramento === false
                      ? "text-signal-attention"
                      : "text-ink-400",
                )}
              >
                {riga.delta > 0 ? "+" : "−"}
                {numero(Math.abs(riga.delta))} da {formatShortDate(riga.precedente.misuratoIl)}
              </span>
            ) : null}
          </div>
        </div>

        {riga.storico.length > 1 ? (
          <div className="w-full sm:w-[220px]">
            <Grafico
              punti={riga.storico}
              altezza={70}
              riferimento={riga.riferimento}
              salireEMeglio={riga.miglioramento !== false}
              etichetta={`Andamento di ${riga.label}, ${riga.storico.length} misure`}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default async function RisultatiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const gruppi = componiRisultati(await letture());
  const quantiFuori = fuoriIntervallo(gruppi);
  const quanti = gruppi.reduce((somma, g) => somma + g.righe.length, 0);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      {quanti === 0 ? (
        <Card>
          <CardHeader title="Ancora nessun valore" />
          <EmptyState>
            Qui compariranno i tuoi parametri appena il primo referto viene letto e
            validato. Puoi caricare un esame dalla sezione documenti.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-px overflow-hidden rounded-card bg-bone-200/70 ring-1 ring-bone-200/70 sm:grid-cols-3">
            <div className="bg-white px-6 py-5">
              <p className="text-[13px] text-ink-500">Parametri seguiti</p>
              <p className="mt-1 font-display text-[28px] leading-none text-ink-900 tnum">{quanti}</p>
            </div>
            <div className="bg-white px-6 py-5">
              <p className="text-[13px] text-ink-500">Fuori dall&apos;intervallo</p>
              <p
                className={cx(
                  "mt-1 font-display text-[28px] leading-none tnum",
                  quantiFuori > 0 ? "text-signal-attention" : "text-ink-900",
                )}
              >
                {quantiFuori}
              </p>
            </div>
            <div className="bg-white px-6 py-5">
              <p className="text-[13px] text-ink-500">Documenti nuovi</p>
              <p className="mt-1 font-display text-[28px] leading-none text-ink-900 tnum">
                {data.newDocuments.filter((d) => d.isNewForPatient).length}
              </p>
            </div>
          </div>

          {gruppi.map((gruppo) => (
            <Card key={gruppo.pilastro}>
              <CardHeader
                title={gruppo.etichetta}
                hint={`${gruppo.righe.length} ${gruppo.righe.length === 1 ? "parametro" : "parametri"}`}
              />
              <ul className="divide-y divide-bone-200/80 pb-2">
                {gruppo.righe.map((riga) => (
                  <RigaValore key={riga.code} riga={riga} />
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}

      <DocumentsCard documents={data.newDocuments} />

      <p className="max-w-2xl rounded-card bg-bone-100 px-5 py-4 text-[13px] leading-relaxed text-ink-500">
        <strong className="font-medium text-ink-700">Cosa vuol dire un valore fuori intervallo.</strong>{" "}
        L&apos;intervallo di riferimento è quello stampato dal laboratorio che ha
        eseguito l&apos;esame: dice dove cade il numero, non cosa significa per te.
        Un valore fuori intervallo non è una diagnosi, e uno dentro non esclude
        nulla. A leggerli insieme alla tua storia è il medico che ti segue: se hai
        un dubbio, scrivigli dai messaggi.
      </p>
    </div>
  );
}
