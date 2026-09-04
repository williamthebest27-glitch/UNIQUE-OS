import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { notifiche } from "@/lib/data/paziente-sezioni";
import { segnaNotificheLette } from "@/lib/patient/actions";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Notifiche" };
export const dynamic = "force-dynamic";

/**
 * Le notifiche.
 *
 * Non lette in cima, tutte sotto, e un bottone per azzerarle. Segnarle
 * lette all'apertura sarebbe stato più comodo da scrivere e peggiore da
 * usare: chi apre l'elenco per cercare una cosa perderebbe il segno di
 * tutte le altre.
 */

const SEZIONE = sezioneDi("/notifiche")!;

export default async function NotifichePage() {
  await requireProfile();
  const elenco = await notifiche();

  const nonLette = elenco.filter((n) => n.lettaIl === null);
  const lette = elenco.filter((n) => n.lettaIl !== null);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <Card>
        <CardHeader
          title="Da leggere"
          action={
            nonLette.length > 0 ? (
              <form action={segnaNotificheLette}>
                <button
                  type="submit"
                  className="text-[13px] text-ink-500 transition-colors hover:text-ink-900"
                >
                  Segna tutte come lette
                </button>
              </form>
            ) : undefined
          }
        />
        {nonLette.length === 0 ? (
          <EmptyState>Non hai notifiche da leggere.</EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80 pb-2">
            {nonLette.map((n) => (
              <li key={n.id} className="flex gap-3.5 px-6 py-4">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-snug text-ink-900">
                    {n.titolo}
                  </h3>
                  {n.corpo ? (
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">{n.corpo}</p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-ink-400 first-letter:uppercase">
                    {formatRelativeDays(n.creataIl)} · {formatTime(n.creataIl)}
                  </p>
                  {n.link ? (
                    <Link
                      href={n.link}
                      className="mt-2 inline-block text-[13px] font-medium text-brand-700 hover:underline"
                    >
                      Vai
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Già lette" />
        {lette.length === 0 ? (
          <EmptyState>Niente nell&apos;archivio.</EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80 pb-2">
            {lette.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-ink-700">{n.titolo}</span>
                  {n.corpo ? (
                    <span className="mt-0.5 line-clamp-1 block text-sm text-ink-400">{n.corpo}</span>
                  ) : null}
                </span>
                <span className={cx("text-xs text-ink-300 tnum")}>
                  {formatShortDate(n.creataIl)}
                </span>
                {n.link ? (
                  <Link href={n.link} className="text-[13px] text-ink-400 hover:text-ink-900">
                    Vai
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Su quali canali ricevere gli avvisi lo decidi tu dal{" "}
        <Link href="/profilo" className="text-ink-700 underline underline-offset-2">
          profilo
        </Link>
        . <Badge>Nota</Badge> gli avvisi su appuntamenti e referti restano sempre
        visibili qui, anche se scegli di non riceverli per email.
      </p>
    </div>
  );
}
