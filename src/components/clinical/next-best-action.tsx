import type { NbaSuggestion } from "@/lib/nba/rules";
import { STAGE_LABELS, type JourneyResult } from "@/lib/journey/stages";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

/**
 * Next Best Action.
 *
 * Due colonne, non una classifica. Le regole cliniche e quelle
 * commerciali restano separate anche sullo schermo: metterle in fila
 * insieme significherebbe far competere "ripetere gli esami" con
 * "proporre il rinnovo", e in una lista sola si guarda solo la prima riga.
 */

function Colonna({
  titolo,
  sottotitolo,
  suggerimenti,
  tono,
}: {
  titolo: string;
  sottotitolo: string;
  suggerimenti: NbaSuggestion[];
  tono: "clinical" | "commercial";
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
          {titolo}
        </h3>
        <span
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            tono === "clinical" ? "bg-jade-500" : "bg-gold-500",
          )}
        />
      </div>
      <p className="mt-1 text-xs text-ink-400">{sottotitolo}</p>

      {suggerimenti.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">Niente da segnalare.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {suggerimenti.map((s) => (
            <li
              key={s.id}
              className={cx(
                "rounded-xl px-3.5 py-3 ring-1",
                tono === "clinical"
                  ? "bg-jade-50 ring-jade-100"
                  : "bg-gold-100/60 ring-gold-300/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-snug text-ink-900">
                  {s.title}
                </p>
                {s.priority === 1 ? <Badge tone="attention">Priorità</Badge> : null}
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {s.because.map((fatto) => (
                  <li key={fatto} className="text-sm leading-relaxed text-ink-600">
                    {fatto}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NextBestActionPanel({
  stage,
  clinical,
  commercial,
}: {
  stage: JourneyResult;
  clinical: NbaSuggestion[];
  commercial: NbaSuggestion[];
}) {
  return (
    <Card>
      <CardHeader
        title="Next Best Action"
        hint="Ogni suggerimento porta con sé i fatti che lo hanno attivato."
        action={<Badge tone="jade">{STAGE_LABELS[stage.stage]}</Badge>}
      />

      <p className="px-6 pt-2 text-sm text-ink-500">{stage.reason}</p>

      {clinical.length === 0 && commercial.length === 0 ? (
        <EmptyState>Nessuna azione suggerita: il percorso è in ordine.</EmptyState>
      ) : (
        <div className="grid gap-8 px-6 pb-6 pt-5 sm:grid-cols-2">
          <Colonna
            titolo="Clinico"
            sottotitolo="Riguarda la salute. Non conosce crediti né scadenze."
            suggerimenti={clinical}
            tono="clinical"
          />
          <Colonna
            titolo="Commerciale"
            sottotitolo="Riguarda il rapporto. Non propone atti clinici."
            suggerimenti={commercial}
            tono="commercial"
          />
        </div>
      )}
    </Card>
  );
}
