import { NavLink } from "@/components/shell/nav-link";
import { Panel, Stato } from "@/components/control/primitives";
import { cx } from "@/components/ui/primitives";
import type { SegnaleSistema, StatoSistema, TonoSegnale } from "@/lib/data/stato-sistema";

/**
 * Lo stato del sistema, in una schermata.
 *
 * Il pannello mostra **anche ciò che va bene**, e non è ridondanza: una
 * riga che compare solo quando è rotta si distingue da una riga che non
 * esiste soltanto se si sa che dovrebbe esserci. Uno zero verde accanto
 * a «letture fallite» dice due cose — non ci sono errori, e qualcuno li
 * sta contando.
 *
 * Le voci gravi salgono in cima al gruppo. In una schermata che si
 * guarda di sfuggita al mattino, l'ordine è il primo strumento di
 * lettura che c'è.
 */

/** L'ordine di lettura: prima ciò che è rotto, in fondo ciò che è solo una scelta. */
const PESO: Record<TonoSegnale, number> = { grave: 0, attesa: 1, buono: 2, spento: 3 };

function Segnale({ s }: { s: SegnaleSistema }) {
  const corpo = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-bone-50/70">{s.etichetta}</p>
        <p
          className={cx(
            "shrink-0 font-display text-[19px] leading-none tnum",
            s.tono === "grave"
              ? "text-gold-300"
              : s.tono === "buono"
                ? "text-brand-300"
                : "text-bone-50",
          )}
        >
          {s.valore}
        </p>
      </div>
      <p className="mt-1 text-xs leading-snug text-bone-50/40">{s.nota}</p>
    </>
  );

  if (!s.href) {
    return <li className="border-t border-white/[0.07] px-5 py-3 first:border-t-0">{corpo}</li>;
  }

  return (
    <li className="border-t border-white/[0.07] first:border-t-0">
      <NavLink
        href={s.href}
        className={cx(
          "block px-5 py-3 transition-colors hover:bg-white/[0.05]",
          "focus-visible:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-300/60",
        )}
      >
        {corpo}
      </NavLink>
    </li>
  );
}

export function PannelloStatoSistema({ stato }: { stato: StatoSistema }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] leading-tight text-bone-50">Stato del sistema</h2>
        <Stato tono={stato.qualcosaNonVa ? "avviso" : "buono"}>
          {stato.qualcosaNonVa ? "Qualcosa richiede attenzione" : "Tutto in ordine"}
        </Stato>
      </div>

      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-bone-50/40">
        Non è la giornata della clinica — quella sta in Comando. Qui c&apos;è ciò che
        si è rotto o si è fermato: un referto che non si è aperto, un evento che
        non è arrivato, una domanda che nessuno ha letto.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stato.gruppi.map((g) => (
          <Panel key={g.titolo} title={g.titolo}>
            <ul className="pb-2">
              {[...g.segnali]
                .sort((a, b) => PESO[a.tono] - PESO[b.tono])
                .map((s) => (
                  <Segnale key={s.chiave} s={s} />
                ))}
            </ul>
          </Panel>
        ))}
      </div>
    </section>
  );
}
