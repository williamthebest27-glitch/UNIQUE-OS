import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, cx } from "@/components/ui/primitives";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import {
  CATENA_ESAME,
  ETICHETTE_ESAME,
  avanzamento,
  tonoEsame,
} from "@/lib/clinical/laboratorio";
import {
  BarraPriorita,
  PastigliaPriorita,
  classiUrgenza,
} from "@/components/comunicazioni/segnali";
import { AzioniEsame } from "@/components/clinical/laboratorio";
import type { RichiestaEsameLab } from "@/lib/data/laboratorio";

/**
 * Le richieste di esame.
 *
 * La catena — richiesta, prelievo, analisi, risultati, validazione — è
 * disegnata come cinque tacche e non come una barra continua: una barra
 * al sessanta per cento non dice a quale passaggio si è fermata, e «a
 * quale passaggio si è fermata» è l'unica cosa che serve sapere quando
 * una coda si allunga.
 *
 * Le ore trascorse compaiono solo dopo il primo giorno. Prima non
 * dicono niente — un esame chiesto stamattina è normale che sia ancora
 * lì — e una colonna di «2 ore» su ogni riga insegna a non leggerla.
 */

function Catena({ stato }: { stato: RichiestaEsameLab["stato"] }) {
  const fatto = avanzamento(stato);

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Stato: ${ETICHETTE_ESAME[stato]}, passaggio ${
        Math.max(1, Math.round(fatto * CATENA_ESAME.length))
      } di ${CATENA_ESAME.length}.`}
    >
      {CATENA_ESAME.map((s, i) => {
        const raggiunto = stato !== "cancelled" && i < fatto * CATENA_ESAME.length;
        return (
          <span
            key={s}
            aria-hidden="true"
            title={ETICHETTE_ESAME[s]}
            className={cx(
              "h-1 w-5 rounded-full",
              stato === "cancelled"
                ? "bg-bone-200"
                : raggiunto
                  ? "bg-brand-600"
                  : "bg-bone-200",
            )}
          />
        );
      })}
    </div>
  );
}

function Riga({
  r,
  conPaziente,
  azioni,
}: {
  r: RichiestaEsameLab;
  /** Nella coda del reparto serve il nome; in cartella si sa già di chi è. */
  conPaziente: boolean;
  azioni: boolean;
}) {
  const aperta = r.stato !== "validated" && r.stato !== "cancelled";

  return (
    <li
      className={cx(
        "flex gap-3.5 px-6 py-4",
        aperta ? classiUrgenza(r.priorita) : undefined,
      )}
    >
      <BarraPriorita priorita={r.priorita} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="text-[15px] font-medium leading-snug text-ink-900">
            {r.pannello}
          </p>
          <Badge tone={tonoEsame(r.stato)}>{ETICHETTE_ESAME[r.stato]}</Badge>
          <PastigliaPriorita priorita={r.priorita} />
          {r.valori > 0 ? (
            <span className="text-[11px] uppercase tracking-[0.06em] text-ink-300">
              {r.valori} {r.valori === 1 ? "valore" : "valori"} in cartella
            </span>
          ) : null}
        </div>

        {conPaziente ? (
          <p className="mt-0.5 text-sm">
            <NavLink
              href={`/pro/pazienti/${r.pazienteId}/clinico`}
              className="text-brand-700 underline-offset-4 hover:underline"
            >
              {r.paziente}
            </NavLink>
          </p>
        ) : null}

        {r.domanda ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{r.domanda}</p>
        ) : null}

        {r.motivoAnnullamento ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            Annullata: {r.motivoAnnullamento}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Catena stato={r.stato} />

          <span className="text-xs text-ink-300 tnum first-letter:uppercase">
            {formatRelativeDays(r.chiestoIl)}
            {r.richiedente ? ` · ${r.richiedente}` : ""}
          </span>

          {/* Le ore solo quando cominciano a contare. */}
          {aperta && r.oreInAttesa >= 24 ? (
            <span
              className={cx(
                "text-xs tnum",
                r.oreInAttesa >= 72 ? "text-signal-alert" : "text-signal-attention",
              )}
            >
              ferma da {Math.floor(r.oreInAttesa / 24)}{" "}
              {Math.floor(r.oreInAttesa / 24) === 1 ? "giorno" : "giorni"}
            </span>
          ) : null}

          {r.validatoIl ? (
            <span className="text-xs text-ink-300 tnum">
              validato {formatShortDate(r.validatoIl)}
              {r.validatoDa ? ` da ${r.validatoDa}` : ""}
            </span>
          ) : null}
        </div>

        {azioni ? (
          <div className="mt-3">
            <AzioniEsame
              richiestaId={r.id}
              pazienteId={r.pazienteId}
              stato={r.stato}
            />
          </div>
        ) : null}
      </div>

      {r.documentId ? (
        <NavLink
          href={`/pro/pazienti/${r.pazienteId}/documenti/${r.documentId}`}
          className="h-fit shrink-0 rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
        >
          Referto
        </NavLink>
      ) : null}
    </li>
  );
}

/** Le richieste di una persona, in cartella. */
export function EsamiDelPaziente({
  richieste,
  puoAgire,
}: {
  richieste: RichiestaEsameLab[];
  puoAgire: boolean;
}) {
  const aperte = richieste.filter(
    (r) => r.stato !== "validated" && r.stato !== "cancelled",
  );

  return (
    <Riquadro
      titolo="Esami richiesti"
      conta={aperte.length}
      nota={
        aperte.length > 0
          ? "Richiesta, prelievo, analisi, risultati, validazione. I valori entrano in cartella con la firma, non con il referto."
          : "Le richieste di esame per questa persona."
      }
    >
      {richieste.length === 0 ? (
        <Niente>
          Nessun esame richiesto. Una richiesta avvisa la Diagnostica e compare
          nella loro coda.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {richieste.map((r) => (
            <Riga key={r.id} r={r} conPaziente={false} azioni={puoAgire} />
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/**
 * La coda del laboratorio.
 *
 * Ordinata per stato — prima ciò che nessuno ha ancora toccato — e poi
 * per attesa. È la coda di chi esegue, e la domanda che si fa entrando
 * non è «cosa è successo oggi» ma «cosa è fermo».
 */
export function CodaLaboratorio({ richieste }: { richieste: RichiestaEsameLab[] }) {
  const daPrelevare = richieste.filter((r) => r.stato === "requested").length;
  const daValidare = richieste.filter((r) => r.stato === "resulted").length;

  return (
    <Riquadro
      titolo="Coda del laboratorio"
      conta={richieste.length}
      nota={
        daPrelevare > 0 || daValidare > 0
          ? [
              daPrelevare > 0
                ? `${daPrelevare} da prelevare`
                : null,
              daValidare > 0 ? `${daValidare} in attesa di firma` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "Le richieste di esame arrivate ai tuoi reparti, dalla più ferma."
      }
    >
      {richieste.length === 0 ? (
        <Niente>
          Nessuna richiesta aperta. Un medico ne apre una dalla sezione «Clinico»
          della cartella.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {richieste.map((r) => (
            <Riga key={r.id} r={r} conPaziente azioni />
          ))}
        </ul>
      )}
    </Riquadro>
  );
}
