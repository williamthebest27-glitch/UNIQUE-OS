import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getControlCenter } from "@/lib/data/control";
import { getBriefMattutino } from "@/lib/data/morning";
import { homePathForRole, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MorningBrief } from "@/components/control/morning-brief";
import { getStatoSistema } from "@/lib/data/stato-sistema";
import { PannelloStatoSistema } from "@/components/control/stato-sistema";
import { formatEuro, formatPercent } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Riga, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Direzione" };
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

  const [dati, brief, sistema] = await Promise.all([
    getControlCenter(),
    getBriefMattutino(),
    getStatoSistema(),
  ]);

  if (!dati) {
    return (
      <Panel title="Direzione">
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
      {brief ? <MorningBrief brief={brief} /> : null}

      {/* ── Oggi ────────────────────────────────────────────────── */}
      <section>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Oggi</h1>
        <div className="mt-4">
          {/*
            Ogni numero che ha un dettaglio porta al dettaglio. Un
            cruscotto dice come va; un centro di comando fa arrivare dove
            si interviene, e la distanza fra i due è un collegamento.
          */}
          <KpiStrip>
            <Kpi label="Pazienti" value={String(oggi.pazienti)} href="/control/pazienti" />
            <Kpi
              label="Fatturato"
              value={formatEuro(oggi.fatturatoCents)}
              href="/control/incassi"
            />
            <Kpi label="Nuovi lead" value={String(oggi.nuoviLead)} href="/control/crm" />
            <Kpi
              label="Prenotazioni"
              value={String(oggi.prenotazioni)}
              href="/control/agenda"
            />
            <Kpi
              label="Conversion rate"
              value={formatPercent(oggi.conversionRate)}
              hint="Lead convertiti oggi"
              href="/control/crm"
            />
            <Kpi
              label="Membership attive"
              value={String(oggi.membershipAttive)}
              tone="good"
              href="/control/professionisti"
            />
            <Kpi
              label="Crediti utilizzati"
              value={String(oggi.creditiUtilizzati)}
              href="/control/economia"
            />
            <Kpi
              label="No-show"
              value={String(oggi.noShow)}
              tone={oggi.noShow > 0 ? "warn" : "neutral"}
              href="/control/agenda"
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
            <Kpi
              label="Fatturato"
              value={formatEuro(mese.fatturatoCents)}
              hint="Incassato"
              href="/control/incassi"
            />
            <Kpi
              label="MRR membership"
              value={formatEuro(mese.mrrCents)}
              hint="Ricorrente mensile"
              href="/control/economia"
            />
            <Kpi label="Nuovi membri" value={String(mese.nuoviMembri)} tone="good" href="/control/crm" />
            <Kpi
              label="Churn"
              value={String(mese.churn)}
              tone={mese.churn > 0 ? "warn" : "neutral"}
              href="/control/crm"
            />
          </KpiStrip>

          <div className="h-px" />

          <KpiStrip>
            <Kpi label="Lead" value={String(mese.lead)} href="/control/crm" />
            <Kpi label="Conversion rate" value={formatPercent(mese.conversionRate)} href="/control/crm" />
            <Kpi label="Visite erogate" value={String(mese.visite)} href="/control/agenda" />
            {/* La retention è un rapporto: non ha una riga da aprire. */}
            <Kpi label="Retention" value={formatPercent(mese.retention)} />
          </KpiStrip>

          <div className="h-px" />

          <KpiStrip>
            <Kpi
              label="Margine Unique"
              value={formatEuro(mese.totaliEconomici.uniqueMarginCents)}
              hint={`${formatPercent(mese.totaliEconomici.marginRatio)} del lordo`}
              tone="good"
              href="/control/economia"
            />
            <Kpi
              label="Compensi da liquidare"
              value={formatEuro(compensi.totaleDaPagareCents)}
              hint={`${compensi.righe.length} professionisti`}
              href="/control/economia"
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
              href="/control/capacita"
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

      {/*
        In fondo e non in cima: si apre questa pagina per sapere come va
        l'azienda, non per fare manutenzione. Ma la riga in testa al
        pannello dice subito se c'è qualcosa da guardare, e in quel caso
        si scorre.
      */}
      {sistema ? <PannelloStatoSistema stato={sistema} /> : null}
    </div>
  );
}
