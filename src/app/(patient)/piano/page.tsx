import type { Metadata } from "next";
import { requirePatientDashboard } from "@/lib/data/patient";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { PILLAR_LABELS, type PillarKey, type RecommendedAction } from "@/lib/domain/types";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Il tuo piano" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Il piano.
 *
 * Le azioni consigliate esistevano già, in un elenco unico ordinato per
 * priorità. Qui cambiano forma per rispondere a due domande diverse:
 * **cosa devo fare in questi giorni** — che è una scadenza — e **a cosa
 * serve** — che è il pilastro. Sono due tagli dello stesso insieme, non
 * due elenchi.
 *
 * Le azioni le apre e le chiude la clinica, non il paziente: una casella
 * spuntata qui non è una prova che qualcosa sia stato fatto, e mostrarla
 * come tale sarebbe una promessa che il sistema non può mantenere.
 */

const SEZIONE = sezioneDi("/piano")!;

const ORIGINE: Record<RecommendedAction["source"], string> = {
  professional: "Dal tuo medico",
  protocol: "Dal protocollo",
  brain: "Unique Brain",
};

function giorniA(iso: string | null): number | null {
  if (!iso) return null;
  const x = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const oggi = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((x - oggi) / 86_400_000);
}

function Riga({
  azione,
  mostraPilastro = true,
}: {
  azione: RecommendedAction;
  /** Sotto il titolo di un pilastro, ripeterlo su ogni riga è rumore. */
  mostraPilastro?: boolean;
}) {
  const giorni = giorniA(azione.dueOn);
  const inRitardo = giorni !== null && giorni < 0;

  return (
    <li className="flex gap-4 px-6 py-4">
      <span
        aria-hidden="true"
        className={cx(
          "mt-1.5 w-0.5 shrink-0 rounded-full",
          azione.priority === 1
            ? "bg-signal-attention"
            : azione.priority === 2
              ? "bg-brand-500"
              : "bg-bone-300",
        )}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-medium leading-snug text-ink-900">{azione.title}</h3>
        {azione.description ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{azione.description}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={azione.source === "brain" ? "brand" : "neutral"}>
            {ORIGINE[azione.source]}
          </Badge>
          {azione.status === "in_progress" ? <Badge tone="brand">In corso</Badge> : null}
          {mostraPilastro && azione.pillarKey ? (
            <Badge>{PILLAR_LABELS[azione.pillarKey]}</Badge>
          ) : null}
          {azione.dueOn ? (
            <span className={cx("text-xs", inRitardo ? "text-signal-alert" : "text-ink-400")}>
              {formatShortDate(azione.dueOn)} · {formatRelativeDays(azione.dueOn)}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function PianoPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const aperte = data.actions.filter((a) => a.status !== "done" && a.status !== "dismissed");

  const entroSette = aperte.filter((a) => {
    const g = giorniA(a.dueOn);
    return g !== null && g <= 7;
  });

  // Il resto per pilastro: la stessa azione non compare due volte, perché
  // "entro sette giorni" è un taglio del tempo e questo è un taglio del
  // senso — e vederla ripetuta farebbe sembrare il piano più lungo di
  // quello che è.
  const restanti = aperte.filter((a) => !entroSette.includes(a));
  const perPilastro = new Map<PillarKey | "altro", RecommendedAction[]>();
  for (const azione of restanti) {
    const chiave = azione.pillarKey ?? "altro";
    perPilastro.set(chiave, [...(perPilastro.get(chiave) ?? []), azione]);
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      {aperte.length === 0 ? (
        <Card>
          <CardHeader title="Nessuna attività aperta" />
          <EmptyState>
            Il tuo piano è in pari. Dopo la prossima visita, o quando arrivano nuovi
            risultati, qui compaiono le cose da fare.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Nei prossimi sette giorni"
              hint={
                entroSette.length === 0
                  ? "Niente con una scadenza vicina."
                  : `${entroSette.length} ${entroSette.length === 1 ? "attività" : "attività"} con una data.`
              }
            />
            {entroSette.length === 0 ? (
              <EmptyState>Nessuna scadenza vicina. Il resto del piano è qui sotto.</EmptyState>
            ) : (
              <ul className="divide-y divide-bone-200/80 pb-2">
                {entroSette.map((azione) => (
                  <Riga key={azione.id} azione={azione} />
                ))}
              </ul>
            )}
          </Card>

          {[...perPilastro.entries()].map(([chiave, azioni]) => (
            <Card key={chiave}>
              <CardHeader
                title={chiave === "altro" ? "Il resto del piano" : PILLAR_LABELS[chiave]}
                hint={`${azioni.length} ${azioni.length === 1 ? "attività" : "attività"}`}
              />
              <ul className="divide-y divide-bone-200/80 pb-2">
                {azioni.map((azione) => (
                  <Riga key={azione.id} azione={azione} mostraPilastro={chiave === "altro"} />
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Le attività del piano le apre e le chiude chi ti segue. Se ne hai già
        fatta una, o se una non ti torna, scrivilo dai messaggi: viene aggiornata
        da chi l&apos;ha proposta.
      </p>
    </div>
  );
}
