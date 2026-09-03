import type { Metadata } from "next";
import { getControlCenter } from "@/lib/data/control";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatEuro, formatPercent } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Riga, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Economia" };
export const dynamic = "force-dynamic";

export default async function EconomiaPage({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string }>;
}) {
  const { mese: periodoRichiesto } = await searchParams;
  const dati = await getControlCenter(periodoRichiesto);

  if (!dati) {
    return (
      <Panel title="Economia">
        <Vuoto>
          {isSupabaseConfigured()
            ? "Il tuo profilo non ha i permessi di direzione."
            : "Supabase non è collegato."}
        </Vuoto>
      </Panel>
    );
  }

  const { mese, compensi } = dati;
  const t = mese.totaliEconomici;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">
          Unit economics
        </h1>
        <p className="mt-1.5 text-sm text-bone-50/50">
          Prezzo meno materiali è la base compensabile; la quota del professionista
          si calcola su quella. Periodo: {mese.periodo}.
        </p>
      </div>

      <KpiStrip>
        <Kpi label="Fatturato lordo" value={formatEuro(t.grossCents)} hint={`${t.visite} visite`} />
        <Kpi label="Costo materiali" value={formatEuro(t.materialCents)} />
        <Kpi label="Compensi professionisti" value={formatEuro(t.professionalPayCents)} />
        <Kpi
          label="Margine Unique"
          value={formatEuro(t.uniqueMarginCents)}
          hint={formatPercent(t.marginRatio)}
          tone="good"
        />
      </KpiStrip>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Margine per servizio">
          {mese.perServizio.length === 0 ? (
            <Vuoto>Nessuna visita nel periodo.</Vuoto>
          ) : (
            <ul className="pb-2">
              {mese.perServizio.map((g) => (
                <Riga
                  key={g.key}
                  label={g.label}
                  sub={`${g.totali.visite} visite · materiali ${formatEuro(g.totali.materialCents)}`}
                  value={formatEuro(g.totali.uniqueMarginCents)}
                  extra={`${formatPercent(g.totali.marginRatio)} su ${formatEuro(g.totali.grossCents)}`}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Margine per paziente" hint="Chi genera valore, e quanto costa servirlo.">
          {mese.perPaziente.length === 0 ? (
            <Vuoto>Nessuna visita nel periodo.</Vuoto>
          ) : (
            <ul className="pb-2">
              {mese.perPaziente.slice(0, 12).map((g) => (
                <Riga
                  key={g.key}
                  label={g.label}
                  sub={`${g.totali.visite} visite`}
                  value={formatEuro(g.totali.grossCents)}
                  extra={`margine ${formatEuro(g.totali.uniqueMarginCents)}`}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Compensi ────────────────────────────────────────────── */}
      <Panel
        title="Compensi da liquidare"
        hint="Ogni importo si ricostruisce dalle visite che lo compongono."
        action={
          <span className="font-display text-[22px] text-bone-50 tnum">
            {formatEuro(compensi.totaleDaPagareCents)}
          </span>
        }
      >
        {compensi.righe.length === 0 ? (
          <Vuoto>Nessun compenso maturato nel periodo.</Vuoto>
        ) : (
          <ul className="pb-2">
            {compensi.righe.map((riga) => (
              <li key={riga.professionalId} className="border-t border-white/[0.07] px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[15px] font-medium text-bone-50">
                    {riga.professionalName}
                  </p>
                  <p className="font-display text-[20px] text-bone-50 tnum">
                    {formatEuro(riga.totaleDaPagareCents)}
                  </p>
                </div>

                <p className="mt-1 text-xs text-bone-50/40 tnum">
                  {riga.totali.visite} visite · lordo {formatEuro(riga.totali.grossCents)} ·
                  base {formatEuro(riga.totali.compensableCents)}
                </p>

                {riga.perServizio.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {riga.perServizio.map((s) => (
                      <li
                        key={s.key}
                        className="flex justify-between gap-4 text-xs text-bone-50/55"
                      >
                        <span>
                          {s.label} × {s.totali.visite}
                        </span>
                        <span className="tnum">{formatEuro(s.totali.professionalPayCents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {riga.rettifiche.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {riga.rettifiche.map((r) => (
                      <li
                        key={r.id}
                        className="flex justify-between gap-4 text-xs text-gold-300"
                      >
                        <span>Rettifica — {r.reason}</span>
                        <span className="tnum">{formatEuro(r.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
