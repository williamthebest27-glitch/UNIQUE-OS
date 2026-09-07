import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, cx } from "@/components/ui/primitives";
import { formatShortDate } from "@/lib/format";
import type { AndamentoParametro, PuntoSerie } from "@/lib/data/laboratorio";

/**
 * L'andamento di un parametro nel tempo.
 *
 * `13,8 → 13,1 → 12,4 → 11,9` è la cosa che un medico legge per prima, e
 * che due valori a confronto non sanno dire: tre discese di fila sono
 * un'altra informazione rispetto a una discesa sola.
 *
 * ---
 *
 * **La forma è una stat tile, non un grafico.** Etichetta, valore
 * corrente, variazione, e una sparkline che porta il contesto. Il dato
 * che conta è *un numero*; la serie serve a sapere da dove viene. Un
 * grafico a linee con assi ed etichette per otto parametri sarebbe stato
 * otto grafici da leggere invece di otto numeri da guardare.
 *
 * **Una serie sola per riquadro**, quindi nessuna legenda e nessuna
 * palette da validare: l'unico colore che significa qualcosa è quello di
 * stato — fuori dall'intervallo — e viaggia sempre con la sua parola
 * scritta accanto, mai da solo.
 *
 * **Il numero grande non ha cifre tabulari.** `tnum` dà a ogni cifra la
 * larghezza dello zero: perfetto in una colonna che deve allinearsi,
 * sbagliato su un valore isolato a ventiquattro pixel, dove «121»
 * diventa spaziato. Le tabulari restano dove servono — la sequenza
 * testuale e le date.
 *
 * **La serie in chiaro non è un ripiego per screen reader.** È il modo
 * in cui un medico la legge ad alta voce, e sta in pagina accanto al
 * disegno per la stessa ragione per cui in cartella si scrive il valore
 * e non si allega un grafico.
 */

/* ── La sparkline ─────────────────────────────────────────────────── */

const LARGHEZZA = 104;
const ALTEZZA = 30;
const MARGINE = 4;

function Sparkline({
  punti,
  riferimento,
  fuoriOra,
  etichetta,
}: {
  punti: PuntoSerie[];
  riferimento: { basso: number | null; alto: number | null } | null;
  fuoriOra: boolean;
  etichetta: string;
}) {
  if (punti.length < 2) return null;

  const valori = punti.map((p) => p.valore);

  /*
   * La scala comprende l'intervallo di riferimento, non solo i dati.
   *
   * Senza, una serie tutta dentro i limiti riempirebbe l'altezza e
   * sembrerebbe drammatica, e una tutta fuori sembrerebbe piatta. Con,
   * la posizione della linea rispetto alla fascia dice qualcosa da sola.
   */
  const candidati = [
    ...valori,
    ...(riferimento?.basso !== null && riferimento?.basso !== undefined
      ? [riferimento.basso]
      : []),
    ...(riferimento?.alto !== null && riferimento?.alto !== undefined
      ? [riferimento.alto]
      : []),
  ];

  const min = Math.min(...candidati);
  const max = Math.max(...candidati);
  // Una serie piatta dividerebbe per zero: le si dà un'altezza finta.
  const ampiezza = max - min || Math.abs(max) || 1;

  const x = (i: number) =>
    MARGINE + (i / (punti.length - 1)) * (LARGHEZZA - MARGINE * 2);
  const y = (v: number) =>
    ALTEZZA - MARGINE - ((v - min) / ampiezza) * (ALTEZZA - MARGINE * 2);

  const tracciato = punti.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.valore)}`).join(" ");

  const ultimo = punti.length - 1;

  // La fascia di riferimento, quando entrambi gli estremi ci sono.
  const fascia =
    riferimento?.basso !== null &&
    riferimento?.basso !== undefined &&
    riferimento?.alto !== null &&
    riferimento?.alto !== undefined
      ? { y: y(riferimento.alto), h: Math.max(1, y(riferimento.basso) - y(riferimento.alto)) }
      : null;

  return (
    <svg
      viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
      width={LARGHEZZA}
      height={ALTEZZA}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`Andamento di ${etichetta}: ${punti.length} rilevazioni, ultimo valore ${punti[ultimo].valore}.`}
    >
      {fascia ? (
        <rect
          x={0}
          y={fascia.y}
          width={LARGHEZZA}
          height={fascia.h}
          fill="var(--color-bone-200)"
          opacity="0.7"
        />
      ) : null}

      <path
        d={tracciato}
        fill="none"
        stroke="var(--color-ink-300)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Solo l'ultimo punto porta il colore: è quello che si sta
          leggendo. Un pallino su ogni rilevazione avrebbe reso la linea
          una collana e tolto all'ultimo la sua evidenza. L'anello bianco
          lo stacca dalla fascia quando ci passa sopra. */}
      <circle
        cx={x(ultimo)}
        cy={y(punti[ultimo].valore)}
        r="3.5"
        fill={fuoriOra ? "var(--color-signal-alert)" : "var(--color-brand-600)"}
        stroke="#ffffff"
        strokeWidth="2"
      />

      {/* Un titolo per punto: il browser lo mostra al passaggio del
          mouse, senza una riga di JavaScript e senza un componente
          client per ognuna delle otto righe della pagina. */}
      {punti.map((p, i) => (
        <circle key={p.misuratoIl} cx={x(i)} cy={y(p.valore)} r="6" fill="transparent">
          <title>{`${formatShortDate(`${p.misuratoIl}T12:00:00Z`)}: ${p.valore}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/* ── La riga ──────────────────────────────────────────────────────── */

function segno(n: number): string {
  const arrotondato = Math.round(n * 100) / 100;
  return `${arrotondato > 0 ? "+" : ""}${arrotondato.toLocaleString("it-IT")}`;
}

function numero(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString("it-IT");
}

function RigaParametro({ a }: { a: AndamentoParametro }) {
  const { ultimo } = a;

  return (
    <li
      className={cx(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5",
        a.fuoriOra && "bg-brand-50/40",
      )}
    >
      <div className="min-w-[150px] flex-1">
        <p className="text-sm text-ink-600">{a.etichetta}</p>

        <p className="mt-0.5 flex items-baseline gap-2">
          {/* Cifre proporzionali, non tabulari: è un valore isolato, e
              tabulari a questa dimensione lo fanno sembrare spaziato. */}
          <span
            className={cx(
              "font-display text-[24px] leading-none",
              a.fuoriOra ? "text-signal-alert" : "text-ink-900",
            )}
          >
            {numero(ultimo.valore)}
          </span>
          {a.unita ? <span className="text-xs text-ink-400">{a.unita}</span> : null}

          {ultimo.delta !== null && ultimo.delta !== 0 ? (
            <span className="text-xs text-ink-400 tnum">
              {segno(ultimo.delta)} dalla precedente
            </span>
          ) : null}
        </p>

        {/*
          La sequenza in chiaro. È come si legge un andamento ad alta
          voce, ed è anche ciò che resta a chi il disegno non lo vede.
        */}
        {a.punti.length > 1 ? (
          <p className="mt-1 text-xs text-ink-400 tnum">
            {a.punti.slice(-5).map((p) => numero(p.valore)).join(" → ")}
          </p>
        ) : null}
      </div>

      <Sparkline
        punti={a.punti}
        riferimento={a.riferimento}
        fuoriOra={a.fuoriOra}
        etichetta={a.etichetta}
      />

      <div className="flex min-w-[130px] shrink-0 flex-col items-end gap-1">
        {/* Lo stato non è mai il solo colore: la pastiglia porta la
            parola, e il colore la accompagna. */}
        {a.fuoriOra ? (
          <Badge tone="attention">Fuori range</Badge>
        ) : a.riferimento ? (
          <Badge tone="positive">Nel range</Badge>
        ) : null}

        {a.tendenza ? (
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-400">
            {a.tendenza === "in-calo" ? "3 in calo" : "3 in salita"}
          </span>
        ) : null}

        <span className="text-[11px] text-ink-300 tnum">
          {formatShortDate(`${ultimo.misuratoIl}T12:00:00Z`)}
        </span>
      </div>
    </li>
  );
}

/* ── Il riquadro ──────────────────────────────────────────────────── */

export function Andamenti({
  andamenti,
  quanti = 8,
}: {
  andamenti: AndamentoParametro[];
  /** Quanti mostrarne prima di chiudere il resto. */
  quanti?: number;
}) {
  const fuori = andamenti.filter((a) => a.fuoriOra).length;
  const inCima = andamenti.slice(0, quanti);
  const resto = andamenti.slice(quanti);

  return (
    <Riquadro
      titolo="Andamento dei parametri"
      conta={andamenti.length}
      nota={
        fuori > 0
          ? `${fuori} ${fuori === 1 ? "parametro fuori" : "parametri fuori"} dall'intervallo di riferimento. L'ordine mette in cima ciò che richiede uno sguardo, non ciò che comincia per A.`
          : "L'ultimo valore di ogni parametro, con la sua storia. La fascia chiara è l'intervallo di riferimento del laboratorio."
      }
    >
      {andamenti.length === 0 ? (
        <Niente>
          Nessuna misura numerica in cartella. Gli andamenti compaiono da sé quando
          un referto viene letto e i valori validati.
        </Niente>
      ) : (
        <>
          <ul className="mt-1 divide-y divide-bone-200/80">
            {inCima.map((a) => (
              <RigaParametro key={a.codice} a={a} />
            ))}
          </ul>

          {resto.length > 0 ? (
            <details className="group border-t border-bone-200">
              <summary className="cursor-pointer list-none px-6 py-3 text-sm text-ink-400 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block group-open:rotate-90">
                  ›
                </span>{" "}
                Altri {resto.length} parametri
              </summary>
              <ul className="divide-y divide-bone-200/80 border-t border-bone-200">
                {resto.map((a) => (
                  <RigaParametro key={a.codice} a={a} />
                ))}
              </ul>
            </details>
          ) : null}

          <p className="border-t border-bone-200 px-6 py-3 text-xs leading-relaxed text-ink-400">
            Sale e scende sono direzioni, non giudizi: se una discesa sia una buona
            notizia lo decide la curva di normalizzazione del Longevity Score, che è
            versionata con l’algoritmo. Qui c’è quanto è cambiato e se sta dentro
            l’intervallo stampato sul referto.
          </p>
        </>
      )}
    </Riquadro>
  );
}
