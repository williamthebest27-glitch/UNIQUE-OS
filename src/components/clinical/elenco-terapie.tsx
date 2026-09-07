import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, cx } from "@/components/ui/primitives";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import {
  ETICHETTE_DOSE,
  ETICHETTE_STATO_TERAPIA,
  ETICHETTE_VIA,
  SIGLE_VIA,
  tonoDose,
  tonoStatoTerapia,
} from "@/lib/clinical/terapie";
import { AzioniDose, AzioniTerapia } from "@/components/clinical/terapie";
import type { Terapia, VoceGiro } from "@/lib/data/terapie";

/**
 * La terapia in cartella.
 *
 * Una scheda per farmaco, e dentro le sue somministrazioni recenti.
 * L'ordine delle informazioni è quello con cui si legge una terapia ad
 * alta voce: **farmaco, dose, via, frequenza** — poi da quando, poi chi
 * l'ha prescritta. Metterlo in un altro ordine costringe a ricomporre la
 * frase ogni volta.
 *
 * L'aderenza è un numero e non una barra: «11 su 14» dice quante dosi
 * mancano, una barra al 79% dice che qualcosa non va senza dire cosa. E
 * conta come non date anche le dosi ancora `due` nel passato, perché è
 * quello che sono — una dose prevista per ieri che nessuno ha registrato
 * non è in attesa, è un buco.
 */

export function ElencoTerapie({
  terapie,
  pazienteId,
  puoPrescrivere,
}: {
  terapie: Terapia[];
  pazienteId: string;
  /** Falso per chi non è medico: le schede si leggono, non si toccano. */
  puoPrescrivere: boolean;
}) {
  if (terapie.length === 0) {
    return (
      <Niente>
        Nessuna terapia in corso. Una prescrizione qui genera le dosi che
        l’infermieristica trova nel giro.
      </Niente>
    );
  }

  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {terapie.map((t) => (
        <li key={t.id} className="px-6 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="text-[15px] leading-snug text-ink-900">
                <span className="font-medium">{t.farmaco}</span>{" "}
                <span className="tnum">{t.dose}</span>{" "}
                <span
                  className="text-xs uppercase tracking-[0.06em] text-ink-400"
                  title={ETICHETTE_VIA[t.via]}
                >
                  {SIGLE_VIA[t.via]}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-ink-500">{t.frequenza}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge tone={tonoStatoTerapia(t.stato)}>
                {ETICHETTE_STATO_TERAPIA[t.stato]}
              </Badge>
              {t.aderenza && t.aderenza.previste > 0 ? (
                <Badge
                  tone={
                    t.aderenza.date === t.aderenza.previste
                      ? "positive"
                      : t.aderenza.date / t.aderenza.previste >= 0.8
                        ? "neutral"
                        : "attention"
                  }
                >
                  {t.aderenza.date} su {t.aderenza.previste} in 14 giorni
                </Badge>
              ) : null}
            </div>
          </div>

          {t.orari.length > 0 ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {t.orari.map((o) => (
                <span
                  key={o}
                  className="rounded-full bg-bone-100 px-2 py-0.5 text-xs text-ink-600 tnum"
                >
                  {o}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1.5 text-xs uppercase tracking-[0.06em] text-ink-300">
              Al bisogno
            </p>
          )}

          {t.istruzioni ? (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{t.istruzioni}</p>
          ) : null}

          <p className="mt-1.5 text-xs text-ink-300">
            Dal {formatShortDate(`${t.inizio}T12:00:00Z`)}
            {t.fine ? ` al ${formatShortDate(`${t.fine}T12:00:00Z`)}` : ""}
            {t.prescrittore ? ` · ${t.prescrittore}` : ""}
          </p>

          {t.motivoStato ? (
            <p className="mt-1.5 rounded-lg bg-bone-100 px-3 py-2 text-sm leading-relaxed text-ink-600">
              {t.motivoStato}
            </p>
          ) : null}

          {/* Le somministrazioni recenti, chiuse: sono la prova, non la
              notizia. Chi legge la cartella vuole sapere cosa sta
              prendendo; chi contesta vuole sapere cosa è stato dato. */}
          {t.somministrazioni.length > 0 ? (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-xs text-ink-400 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block group-open:rotate-90">
                  ›
                </span>{" "}
                Somministrazioni ({t.somministrazioni.length})
              </summary>

              <ul className="mt-2 space-y-1 border-l border-bone-200 pl-3">
                {t.somministrazioni.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="w-32 shrink-0 text-xs text-ink-400 tnum">
                      {formatShortDate(d.previstaPer)} {formatTime(d.previstaPer)}
                    </span>
                    <Badge tone={d.arretrata ? "attention" : tonoDose(d.stato)}>
                      {d.arretrata ? "Non registrata" : ETICHETTE_DOSE[d.stato]}
                    </Badge>
                    {d.somministrataDa ? (
                      <span className="text-xs text-ink-400">{d.somministrataDa}</span>
                    ) : null}
                    {d.motivo ? (
                      <span className="w-full text-sm text-ink-500">{d.motivo}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {puoPrescrivere ? (
            <div className="mt-3">
              <AzioniTerapia
                prescrizioneId={t.id}
                pazienteId={pazienteId}
                stato={t.stato}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Il giro ──────────────────────────────────────────────────────── */

/**
 * Le dosi da dare adesso.
 *
 * Raggruppate per orario e non per paziente: un turno si fa per orari —
 * si porta il carrello alle otto, poi alle quattordici — e raggruppare
 * per persona costringerebbe a rileggere tutta la lista a ogni giro.
 *
 * Le arretrate stanno fuori dai gruppi, in cima, con il fondo tinto. Non
 * è enfasi: sono l'unica cosa della schermata che qualcuno deve guardare
 * adesso, e in mezzo agli orari futuri si perderebbero.
 */
export function GiroSomministrazioni({ righe }: { righe: VoceGiro[] }) {
  const arretrate = righe.filter((r) => r.arretrata);
  const restanti = righe.filter((r) => !r.arretrata);

  const gruppi = new Map<string, VoceGiro[]>();
  for (const r of restanti) {
    const ora = formatTime(r.previstaPer);
    gruppi.set(ora, [...(gruppi.get(ora) ?? []), r]);
  }

  return (
    <Riquadro
      titolo="Giro delle somministrazioni"
      conta={righe.filter((r) => r.stato === "due").length}
      nota={
        arretrate.length > 0
          ? `${arretrate.length} ${arretrate.length === 1 ? "dose scaduta" : "dosi scadute"} e non registrate.`
          : "Le dosi previste fra dodici ore indietro e dodici avanti."
      }
    >
      {righe.length === 0 ? (
        <Niente>
          Nessuna dose prevista in questa finestra. Le dosi nascono da una
          prescrizione con degli orari: senza orari è «al bisogno», e non compare
          nel giro.
        </Niente>
      ) : (
        <div>
          {arretrate.length > 0 ? (
            <div className="bg-brand-50/50">
              <p className="px-6 pt-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-signal-alert">
                Scadute
              </p>
              <ul className="divide-y divide-bone-200/60">
                {arretrate.map((r) => (
                  <RigaGiro key={r.id} riga={r} />
                ))}
              </ul>
            </div>
          ) : null}

          {[...gruppi.entries()].map(([ora, elenco]) => (
            <div key={ora}>
              <p className="border-t border-bone-200 bg-bone-100/50 px-6 py-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500 tnum">
                {ora}
              </p>
              <ul className="divide-y divide-bone-200/60">
                {elenco.map((r) => (
                  <RigaGiro key={r.id} riga={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Riquadro>
  );
}

function RigaGiro({ riga }: { riga: VoceGiro }) {
  return (
    <li className="px-6 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug text-ink-900">
            <span className="font-medium">{riga.farmaco}</span>{" "}
            <span className="tnum">{riga.dose}</span>{" "}
            <span
              className="text-xs uppercase tracking-[0.06em] text-ink-400"
              title={ETICHETTE_VIA[riga.via]}
            >
              {SIGLE_VIA[riga.via]}
            </span>
          </p>
          <p className="mt-0.5 text-sm">
            <NavLink
              href={`/pro/pazienti/${riga.pazienteId}/piano`}
              className="text-brand-700 underline-offset-4 hover:underline"
            >
              {riga.paziente}
            </NavLink>
          </p>
        </div>

        <span
          className={cx(
            "shrink-0 text-xs tnum",
            riga.arretrata ? "text-signal-alert" : "text-ink-300",
          )}
        >
          {formatTime(riga.previstaPer)}
          {riga.arretrata ? ` · ${formatRelativeDays(riga.previstaPer)}` : ""}
        </span>
      </div>

      {riga.istruzioni ? (
        <p className="mt-1 text-sm leading-relaxed text-ink-500">{riga.istruzioni}</p>
      ) : null}

      {riga.stato === "due" ? (
        <AzioniDose
          doseId={riga.id}
          pazienteId={riga.pazienteId}
          stato={riga.stato}
          compatto
        />
      ) : (
        <p className="mt-1">
          <Badge tone={tonoDose(riga.stato)}>{ETICHETTE_DOSE[riga.stato]}</Badge>
        </p>
      )}
    </li>
  );
}
