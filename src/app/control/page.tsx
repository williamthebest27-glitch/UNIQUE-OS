import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getControlCenter } from "@/lib/data/control";
import { homePathForRole, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatEuro, formatPercent } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Riga, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Control Center" };
export const dynamic = "force-dynamic";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function nomeMese(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return `${MESI[mese - 1]} ${anno}`;
}

export default async function ControlPage() {
  // Reception e marketing entrano nel Control Center, ma non da qui: i
  // numeri di direzione non sono roba loro, e mostrargli una schermata
  // vuota sarebbe peggio che portarli dove hanno qualcosa da fare.
  const profile = await requireProfile();
  if (profile.role === "reception" || profile.role === "marketing") {
    redirect(homePathForRole(profile.role));
  }

  const dati = await getControlCenter();

  if (!dati) {
    return (
      <Panel title="Control Center">
        <Vuoto>
          {isSupabaseConfigured()
            ? "Il tuo profilo non ha i permessi di direzione."
            : "Supabase non è collegato: in modalità dimostrativa non ci sono numeri da mostrare."}
        </Vuoto>
      </Panel>
    );
  }

  const { oggi, mese, capacita, compensi } = dati;

  return (
    <div className="space-y-8">
      {/* ── Oggi ────────────────────────────────────────────────── */}
      <section>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Oggi</h1>
        <div className="mt-4">
          <KpiStrip>
            <Kpi label="Pazienti" value={String(oggi.pazienti)} />
            <Kpi label="Fatturato" value={formatEuro(oggi.fatturatoCents)} />
            <Kpi label="Nuovi lead" value={String(oggi.nuoviLead)} />
            <Kpi label="Prenotazioni" value={String(oggi.prenotazioni)} />
            <Kpi
              label="Conversion rate"
              value={formatPercent(oggi.conversionRate)}
              hint="Lead convertiti oggi"
            />
            <Kpi label="Membership attive" value={String(oggi.membershipAttive)} tone="good" />
            <Kpi label="Crediti utilizzati" value={String(oggi.creditiUtilizzati)} />
            <Kpi
              label="No-show"
              value={String(oggi.noShow)}
              tone={oggi.noShow > 0 ? "warn" : "neutral"}
            />
          </KpiStrip>
        </div>
      </section>

      {/* ── Mese ────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-display text-[24px] leading-tight text-bone-50 first-letter:uppercase">
          {nomeMese(mese.periodo)}
        </h2>

        <div className="mt-4 space-y-px">
          <KpiStrip>
            <Kpi label="Fatturato" value={formatEuro(mese.fatturatoCents)} hint="Incassato" />
            <Kpi label="MRR membership" value={formatEuro(mese.mrrCents)} hint="Ricorrente mensile" />
            <Kpi label="Nuovi membri" value={String(mese.nuoviMembri)} tone="good" />
            <Kpi
              label="Churn"
              value={String(mese.churn)}
              tone={mese.churn > 0 ? "warn" : "neutral"}
            />
          </KpiStrip>

          <div className="h-px" />

          <KpiStrip>
            <Kpi label="Lead" value={String(mese.lead)} />
            <Kpi label="Conversion rate" value={formatPercent(mese.conversionRate)} />
            <Kpi label="Visite erogate" value={String(mese.visite)} />
            <Kpi label="Retention" value={formatPercent(mese.retention)} />
          </KpiStrip>

          <div className="h-px" />

          <KpiStrip>
            <Kpi
              label="Margine Unique"
              value={formatEuro(mese.totaliEconomici.uniqueMarginCents)}
              hint={`${formatPercent(mese.totaliEconomici.marginRatio)} del lordo`}
              tone="good"
            />
            <Kpi
              label="Compensi da liquidare"
              value={formatEuro(compensi.totaleDaPagareCents)}
              hint={`${compensi.righe.length} professionisti`}
            />
            <Kpi
              label="Valore per paziente"
              value={formatEuro(mese.ltvCents)}
              hint="Sui pazienti visti nel mese"
            />
            <Kpi
              label="Saturazione"
              value={
                capacita.collo
                  ? formatPercent(capacita.collo.saturazione)
                  : "—"
              }
              hint={
                capacita.collo
                  ? (capacita.nomiProfessionisti.get(capacita.collo.professionalId) ??
                    "Collo di bottiglia")
                  : "Orari non configurati"
              }
              tone={capacita.collo && capacita.collo.saturazione > 0.85 ? "warn" : "neutral"}
            />
          </KpiStrip>
        </div>
      </section>

      {/* ── Dove si genera il fatturato ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Ricavo per servizio" hint="Nel mese, dalle visite erogate.">
          {mese.perServizio.length === 0 ? (
            <Vuoto>Nessuna visita erogata nel mese.</Vuoto>
          ) : (
            <ul className="pb-2">
              {mese.perServizio.map((g) => (
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

        <Panel title="Ricavo per professionista" hint="Lordo generato e compenso maturato.">
          {mese.perProfessionista.length === 0 ? (
            <Vuoto>Nessuna visita erogata nel mese.</Vuoto>
          ) : (
            <ul className="pb-2">
              {mese.perProfessionista.map((g) => (
                <Riga
                  key={g.key}
                  label={g.label}
                  sub={`${g.totali.visite} visite`}
                  value={formatEuro(g.totali.grossCents)}
                  extra={`compenso ${formatEuro(g.totali.professionalPayCents)}`}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
