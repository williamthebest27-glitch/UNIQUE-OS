import { geometria, variazione, type PuntoSerie } from "@/lib/patient/andamento";
import { formatShortDate } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

/**
 * Un grafico di andamento.
 *
 * SVG puro, nessuna libreria, nessun JavaScript: si disegna sul server e
 * arriva già fatto. Una libreria di grafici da centoventi chilobyte per
 * tracciare otto punti è il modo più elegante di rendere lenta una
 * pagina che deve essere immediata.
 *
 * L'aritmetica sta in `@/lib/patient/andamento`, che è puro e ha i suoi
 * test: qui si disegna e basta. La scala non parte da zero — segue i
 * dati — perché fra 74 e 78 punti ci sono quattro punti di percorso, e
 * su un asse 0–100 sarebbero una linea piatta.
 */

export function Grafico({
  punti,
  salireEMeglio = true,
  altezza = 120,
  riferimento,
  etichetta,
  className,
}: {
  punti: readonly PuntoSerie[];
  salireEMeglio?: boolean;
  altezza?: number;
  /** Le soglie del referto, disegnate come corsia. */
  riferimento?: { basso: number | null; alto: number | null };
  /** Per chi legge con uno screen reader. */
  etichetta: string;
  className?: string;
}) {
  const larghezza = 320;
  const g = geometria(punti, larghezza, altezza);

  if (!g) {
    return (
      <p className={cx("py-6 text-center text-sm text-ink-300", className)}>
        Nessuna misura da mostrare.
      </p>
    );
  }

  // Un punto solo non è un andamento: si mostra il valore, non una linea
  // che suggerirebbe una direzione che non esiste.
  const unicoPunto = g.punti.length === 1;
  const v = variazione(punti, salireEMeglio);

  const y = (valore: number) => {
    const alto = 6;
    const basso = altezza - 6;
    return basso - ((valore - g.min) / (g.max - g.min)) * (basso - alto);
  };

  const corsia =
    riferimento && (riferimento.basso !== null || riferimento.alto !== null)
      ? {
          y: riferimento.alto !== null ? y(Math.min(riferimento.alto, g.max)) : 0,
          h:
            (riferimento.basso !== null ? y(Math.max(riferimento.basso, g.min)) : altezza) -
            (riferimento.alto !== null ? y(Math.min(riferimento.alto, g.max)) : 0),
        }
      : null;

  const colore = v?.miglioramento === false ? "var(--color-signal-attention)" : "var(--color-brand-600)";
  const gradiente = `grad-${Math.abs(g.linea.length * g.punti.length)}`;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${larghezza} ${altezza}`}
        className="h-auto w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={etichetta}
      >
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colore} stopOpacity="0.16" />
            <stop offset="100%" stopColor={colore} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* La corsia dell'intervallo di riferimento: un fatto stampato sul
            referto, non un giudizio. */}
        {corsia && corsia.h > 0 ? (
          <rect x="0" y={corsia.y} width={larghezza} height={corsia.h} fill="var(--color-brand-50)" />
        ) : null}

        {!unicoPunto ? (
          <>
            <path d={g.area} fill={`url(#${gradiente})`} />
            <path
              d={g.linea}
              fill="none"
              stroke={colore}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}

        {g.punti.map((p, i) => (
          <circle
            key={p.punto.data}
            cx={p.x}
            cy={p.y}
            r={i === g.punti.length - 1 ? 4 : 2.5}
            fill={i === g.punti.length - 1 ? colore : "white"}
            stroke={colore}
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <figcaption className="mt-1.5 flex justify-between text-[11px] text-ink-300 tnum">
        <span>{formatShortDate(g.punti[0].punto.data)}</span>
        {g.punti.length > 1 ? (
          <span>{formatShortDate(g.punti[g.punti.length - 1].punto.data)}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
