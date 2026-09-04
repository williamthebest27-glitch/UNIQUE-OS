import type { Metadata } from "next";
import { getMarketing } from "@/lib/data/marketing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatEuro, formatPercent } from "@/lib/format";
import { Kpi, KpiStrip, Panel, Riga, Stato, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

/**
 * Marketing intelligence.
 *
 * Le domande a cui questa schermata deve rispondere sono quattro, e sono
 * scritte nella visione: quanto abbiamo speso, quale campagna porta i
 * pazienti migliori, quale genera membership, quali contenuti convertono.
 *
 * Dove un rapporto non è calcolabile compare "non ancora misurabile" e
 * non uno zero: una campagna senza lead non ha un costo per lead pari a
 * zero, non ne ha uno.
 */

const CANALI: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  email: "Email",
  organic: "Organico",
  referral: "Passaparola",
  offline: "Offline",
  other: "Altro",
};

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function nomeMese(periodo: string): string {
  const [anno, mese] = periodo.split("-").map(Number);
  return `${MESI[mese - 1]} ${anno}`;
}

function euroOppure(cents: number | null): string {
  return cents === null ? "—" : formatEuro(cents);
}

export default async function MarketingPage() {
  const dati = await getMarketing();

  if (!dati) {
    return (
      <Panel title="Marketing">
        <Vuoto>
          {isSupabaseConfigured()
            ? "Il tuo profilo non ha accesso ai dati di marketing."
            : "Supabase non è collegato: in modalità dimostrativa non ci sono campagne."}
        </Vuoto>
      </Panel>
    );
  }

  const { totali, campagne, fuoriMedia, perQualita, qualita, contenuti, ricorrenze } = dati;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Marketing</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-bone-50/50">
          <span className="first-letter:uppercase">{nomeMese(dati.periodo)}</span>. La spesa è del
          mese, i lead sono quelli nati nel mese, il valore generato è tutto quello che quei lead
          hanno prodotto — anche se incassato dopo.
        </p>
      </div>

      <KpiStrip>
        <Kpi label="Speso" value={formatEuro(totali.spendCents)} />
        <Kpi label="Lead" value={String(totali.leads)} />
        <Kpi
          label="Costo per lead"
          value={euroOppure(totali.cplCents)}
          hint={totali.cplCents === null ? "Non ancora misurabile" : "Media pesata"}
        />
        <Kpi
          label="Costo per paziente"
          value={euroOppure(totali.cacCents)}
          hint={`${totali.patients} acquisiti`}
        />
      </KpiStrip>

      <KpiStrip>
        <Kpi label="Membership" value={String(totali.members)} tone="good" />
        <Kpi
          label="Conversione"
          value={totali.conversione === null ? "—" : formatPercent(totali.conversione)}
          hint="Lead diventati pazienti"
        />
        <Kpi label="Valore generato" value={formatEuro(totali.revenueCents)} tone="good" />
        <Kpi
          label="ROAS"
          value={totali.roas === null ? "—" : `${totali.roas.toLocaleString("it-IT", { maximumFractionDigits: 1 })}×`}
          tone={totali.roas !== null && totali.roas >= 3 ? "good" : "neutral"}
        />
      </KpiStrip>

      {/* ── Quello che sta costando troppo ──────────────────────── */}
      {fuoriMedia.length > 0 ? (
        <Panel
          title="Sopra la media"
          hint="Costo per lead più alto della media pesata del periodo."
        >
          <ul className="pb-2">
            {fuoriMedia.map((s) => (
              <Riga
                key={s.campaignId}
                label={s.name}
                sub={`costo per lead ${formatEuro(s.cplCents)}`}
                value={`+${formatPercent(s.scarto)}`}
                extra="rispetto alla media"
              />
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* ── Le campagne ─────────────────────────────────────────── */}
      <Panel title="Campagne" hint="Solo quelle che nel mese hanno speso o prodotto lead.">
        {campagne.length === 0 ? (
          <Vuoto>
            Nessuna campagna attiva nel mese. La spesa si importa dalla piattaforma
            pubblicitaria, i lead arrivano dal CRM.
          </Vuoto>
        ) : (
          <ul className="pb-2">
            {campagne.map((c) => (
              <li key={c.id} className="border-t border-white/[0.07] px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] text-bone-50">{c.name}</span>
                    <Stato tono={c.status === "active" ? "buono" : "spento"}>
                      {CANALI[c.channel] ?? c.channel}
                    </Stato>
                    {c.serviceName ? (
                      <span className="text-xs text-bone-50/35">{c.serviceName}</span>
                    ) : null}
                  </span>
                  <span className="text-[15px] text-bone-50 tnum">{formatEuro(c.spendCents)}</span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-bone-50/45 sm:grid-cols-5">
                  <div>
                    <dt className="inline">Lead </dt>
                    <dd className="inline text-bone-50/70 tnum">{c.leads}</dd>
                  </div>
                  <div>
                    <dt className="inline">CPL </dt>
                    <dd className="inline text-bone-50/70 tnum">{euroOppure(c.cplCents)}</dd>
                  </div>
                  <div>
                    <dt className="inline">Pazienti </dt>
                    <dd className="inline text-bone-50/70 tnum">{c.patients}</dd>
                  </div>
                  <div>
                    <dt className="inline">CAC </dt>
                    <dd className="inline text-bone-50/70 tnum">{euroOppure(c.cacCents)}</dd>
                  </div>
                  <div>
                    <dt className="inline">ROAS </dt>
                    <dd className="inline text-bone-50/70 tnum">
                      {c.roas === null
                        ? "—"
                        : `${c.roas.toLocaleString("it-IT", { maximumFractionDigits: 1 })}×`}
                    </dd>
                  </div>
                </dl>

                {c.scartoTracciamento !== 0 ? (
                  <p className="mt-1.5 text-xs text-gold-300/80">
                    La piattaforma dichiara {c.scartoTracciamento > 0 ? "+" : ""}
                    {c.scartoTracciamento} lead rispetto a quelli arrivati nel CRM.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── I pazienti migliori ─────────────────────────────────── */}
      <Panel
        title="Chi porta i pazienti migliori"
        hint="Ordinate per valore generato per paziente, non per numero di lead."
      >
        {perQualita.length === 0 ? (
          <Vuoto>Nessuna campagna ha ancora portato abbastanza pazienti per dirlo.</Vuoto>
        ) : (
          <ul className="pb-2">
            {perQualita.map((c) => {
              const q = qualita.get(c.id);
              return (
                <Riga
                  key={c.id}
                  label={c.name}
                  sub={
                    q
                      ? `${q.avgVisits.toLocaleString("it-IT", { maximumFractionDigits: 1 })} visite per paziente · ${formatPercent(q.membersRatio)} diventa membro`
                      : `${c.patients} pazienti`
                  }
                  value={formatEuro(Math.round(c.revenueCents / Math.max(1, c.patients)))}
                  extra="valore medio per paziente"
                />
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ── I contenuti ─────────────────────────────────────────── */}
      <Panel
        title="Contenuti"
        hint="Il punteggio pesa il coinvolgimento, ma vale di più chi porta persone."
      >
        {contenuti.length === 0 ? (
          <Vuoto>Nessun contenuto registrato.</Vuoto>
        ) : (
          <>
            {ricorrenze.angoli.length > 0 ? (
              <p className="px-5 pt-1 text-xs text-bone-50/45">
                Fra i migliori ricorrono: {ricorrenze.angoli.map(([a, n]) => `${a} (${n})`).join(", ")}
                {ricorrenze.formati.length > 0
                  ? ` · formati: ${ricorrenze.formati.map(([f, n]) => `${f} (${n})`).join(", ")}`
                  : ""}
                .
              </p>
            ) : null}
            <ul className="pb-2">
              {contenuti.slice(0, 10).map((c) => (
                <Riga
                  key={c.id}
                  label={c.title}
                  sub={[c.format, c.angle, c.publishedOn].filter(Boolean).join(" · ")}
                  value={
                    c.leadPerMille === null
                      ? "—"
                      : `${c.leadPerMille.toLocaleString("it-IT", { maximumFractionDigits: 1 })}‰`
                  }
                  extra={
                    c.engagement === null
                      ? `${c.leadsAttributed} lead`
                      : `${formatPercent(c.engagement, 1)} coinvolgimento · ${c.leadsAttributed} lead`
                  }
                />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
