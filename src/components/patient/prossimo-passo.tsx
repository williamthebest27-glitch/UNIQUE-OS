import Link from "next/link";
import type { ProssimiPassi } from "@/lib/patient/prossimo-passo";
import { Card, ChevronIcon, cx } from "@/components/ui/primitives";

/**
 * Il prossimo passo.
 *
 * È la componente più importante della home, e la sua forma dice tutto:
 * **un titolo grande, un motivo, un bottone.** Non tre bottoni. Chi apre
 * l'app deve sapere cosa fare adesso, non scegliere fra dieci cose che
 * potrebbe fare.
 *
 * Il motivo non è una decorazione: è la differenza fra un'app che ti dice
 * cosa fare e una che ti dice *perché*. Chi legge deve poter verificare
 * il perché senza fidarsi del cosa.
 *
 * Il resto sta sotto, in righe quiete, e sotto ci sta bene.
 */

const TONO_URGENZA: Record<1 | 2 | 3, { punto: string; parola: string }> = {
  1: { punto: "bg-brand-500", parola: "Adesso" },
  2: { punto: "bg-gold-500", parola: "Questa settimana" },
  3: { punto: "bg-bone-300", parola: "Quando puoi" },
};

export function ProssimoPasso({ passi }: { passi: ProssimiPassi }) {
  const { principale, altri } = passi;

  // Niente da fare è uno stato legittimo, e va detto invece di riempirlo
  // con un invito inventato.
  if (!principale) {
    return (
      <Card className="p-7 sm:p-8">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-400">
          Il tuo prossimo passo
        </h2>
        <p className="mt-3 font-display text-[24px] leading-tight text-ink-900">
          Sei in pari. Non c&apos;è nulla in sospeso.
        </p>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-500">
          Quando arriva un referto, si avvicina un controllo o c&apos;è qualcosa da
          fare, lo trovi qui.
        </p>
      </Card>
    );
  }

  const tono = TONO_URGENZA[principale.urgenza];

  return (
    <Card className="overflow-hidden">
      <div className="p-7 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className={cx("h-2 w-2 shrink-0 rounded-full", tono.punto)} aria-hidden="true" />
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-400">
            Il tuo prossimo passo · {tono.parola}
          </h2>
        </div>

        <p className="mt-3.5 font-display text-[26px] leading-[1.15] text-ink-900 sm:text-[30px]">
          {principale.titolo}
        </p>
        <p className="mt-2.5 max-w-[56ch] text-[15px] leading-relaxed text-ink-500">
          {principale.motivo}
        </p>

        {principale.azione.tipo === "vai" ? (
          <Link
            href={principale.azione.href}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-[15px] font-medium text-bone-50 transition-colors hover:bg-ink-800"
          >
            {principale.azione.etichetta}
            <ChevronIcon className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {altri.length > 0 ? (
        <div className="border-t border-bone-200 bg-bone-100/60">
          <h3 className="px-7 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400 sm:px-8">
            Poi
          </h3>
          <ul className="divide-y divide-bone-200/70 pb-1">
            {altri.map((passo) => (
              <li key={passo.id}>
                {passo.azione.tipo === "vai" ? (
                  <Link
                    href={passo.azione.href}
                    className="group flex items-center gap-3 px-7 py-3.5 transition-colors hover:bg-white sm:px-8"
                  >
                    <span
                      className={cx("h-1.5 w-1.5 shrink-0 rounded-full", TONO_URGENZA[passo.urgenza].punto)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-ink-900">{passo.titolo}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-400">{passo.motivo}</span>
                    </span>
                    <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
