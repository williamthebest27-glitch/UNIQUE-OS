import Link from "next/link";
import type { BriefMattutino } from "@/lib/data/morning";
import { formatEuro, formatTime } from "@/lib/format";
import { segnaLetta } from "@/lib/brain/founder-actions";

/**
 * Il briefing del mattino.
 *
 * Sette righe, non settanta. Le critiche stanno in cima e hanno un colore
 * loro; le informative diventano un numero. La regola che tiene in piedi
 * la schermata è che ogni riga qui dentro deve poter cambiare la
 * giornata di chi la legge — altrimenti è rumore, e va nel digest.
 */
export function MorningBrief({ brief }: { brief: BriefMattutino }) {
  const righe: { etichetta: string; valore: string; allerta?: boolean; href?: string }[] = [
    { etichetta: "pazienti oggi", valore: String(brief.pazientiOggi) },
    { etichetta: "revenue prevista", valore: formatEuro(brief.revenuePrevistaCents) },
    { etichetta: "nuovi lead", valore: String(brief.nuoviLead), href: "/control/crm" },
    {
      etichetta: "pagamenti falliti",
      valore: String(brief.pagamentiFalliti),
      allerta: brief.pagamentiFalliti > 0,
    },
    {
      etichetta: "da ricontattare",
      valore: String(brief.daRicontattare),
      allerta: brief.daRicontattare > 0,
      href: "/control/task",
    },
    {
      etichetta: "Score da approvare",
      valore: String(brief.scoreDaApprovare),
      allerta: brief.scoreDaApprovare > 0,
      href: "/pro/revisioni",
    },
    {
      etichetta: "proposte in attesa",
      valore: String(brief.proposteInAttesa),
      allerta: brief.proposteInAttesa > 0,
      href: "/control/approvazioni",
    },
  ];

  return (
    <section className="rounded-card bg-white/[0.04] px-5 py-5 ring-1 ring-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-bone-50/70">
          Morning brief
        </h2>
        {brief.informative > 0 ? (
          <span className="text-xs text-bone-50/35">
            {brief.informative} avvisi informativi nel digest
          </span>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1.5">
        {righe.map((r) => (
          <li key={r.etichetta} className="flex items-baseline gap-3">
            <span
              className={
                r.allerta
                  ? "min-w-[3.5rem] text-right font-display text-[20px] leading-none text-gold-300 tnum"
                  : "min-w-[3.5rem] text-right font-display text-[20px] leading-none text-bone-50 tnum"
              }
            >
              {r.valore}
            </span>
            {r.href ? (
              <Link href={r.href} className="text-sm text-bone-50/55 hover:text-bone-50">
                {r.etichetta}
              </Link>
            ) : (
              <span className="text-sm text-bone-50/55">{r.etichetta}</span>
            )}
          </li>
        ))}
      </ul>

      {brief.critici.length > 0 || brief.importanti.length > 0 ? (
        <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4">
          {[...brief.critici, ...brief.importanti].slice(0, 6).map((avviso) => {
            const critico = brief.critici.some((c) => c.id === avviso.id);
            return (
              <div key={avviso.id} className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={
                      critico
                        ? "text-[15px] text-signal-alert"
                        : "text-[15px] text-bone-50/85"
                    }
                  >
                    {avviso.titolo}
                  </p>
                  {avviso.corpo ? (
                    <p className="mt-0.5 text-xs text-bone-50/40">{avviso.corpo}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-bone-50/25">{formatTime(avviso.quando)}</span>
                  <form action={segnaLetta}>
                    <input type="hidden" name="notificaId" value={avviso.id} />
                    <button
                      type="submit"
                      className="text-[11px] text-bone-50/35 transition-colors hover:text-bone-50/70"
                    >
                      Visto
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
