import type { Metadata } from "next";
import Link from "next/link";
import { elencoPazienti, incassiRecenti, riepilogoIncassi } from "@/lib/data/gestione";
import { registraIncasso } from "@/lib/gestione/actions";
import { CANALI_INCASSO, TIPI_INCASSO, etichetta } from "@/lib/gestione/etichette";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatEuro, formatShortDate, formatTime } from "@/lib/format";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { Campo, Kpi, KpiStrip, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";

export const metadata: Metadata = { title: "Incassi" };
export const dynamic = "force-dynamic";

/**
 * La cassa.
 *
 * Due numeri in alto — oggi e il mese — e sotto ogni incasso con la sua
 * ricevuta. Il numero della ricevuta lo assegna il database, progressivo
 * per anno: nessuno lo scrive a mano, nessuno lo salta.
 */
export default async function IncassiPage() {
  const sezione = SEZIONI_CONTROL["/control/incassi"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: gli incassi vivono nel database.</Vuoto>
      </Panel>
    );
  }

  const [riepilogo, incassi, pazienti] = await Promise.all([riepilogoIncassi(), incassiRecenti(), elencoPazienti()]);
  const perNome = [...pazienti].sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">{sezione.title}</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
        <div className="mt-4">
          <KpiStrip>
            <Kpi label="Oggi" value={formatEuro(riepilogo.oggiCents)} hint={`${riepilogo.oggiQuanti} incassi`} />
            <Kpi label="Questo mese" value={formatEuro(riepilogo.meseCents)} hint={`${riepilogo.meseQuanti} incassi`} tone="good" />
          </KpiStrip>
        </div>
      </section>

      <Panel title="Registra un incasso">
        <ModuloAzione action={registraIncasso} invio="Registra" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Paziente">
            <Scelta name="patientId" required defaultValue="">
              <option value="" disabled>
                Scegli…
              </option>
              {perNome.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Scelta>
          </Campo>
          <Campo label="Importo" hint="In euro, ad esempio 149,00">
            <Testo name="importoEuro" required inputMode="decimal" placeholder="149,00" autoComplete="off" />
          </Campo>
          <Campo label="Canale">
            <Scelta name="channel" defaultValue="pos">
              {Object.entries(CANALI_INCASSO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Scelta>
          </Campo>
          <Campo label="Per cosa">
            <Scelta name="kind" defaultValue="service">
              {Object.entries(TIPI_INCASSO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Scelta>
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Descrizione">
              <Testo name="descrizione" placeholder="Consulenza longevity" autoComplete="off" />
            </Campo>
          </div>
        </ModuloAzione>
      </Panel>

      <Panel title="Ultimi incassi" hint={`${incassi.length}`}>
        {incassi.length === 0 ? (
          <Vuoto>Ancora nessun incasso registrato.</Vuoto>
        ) : (
          <ul className="pb-2">
            {incassi.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                <span className="w-32 text-xs text-bone-50/40 tnum">
                  {i.paidAt ? `${formatShortDate(i.paidAt)} · ${formatTime(i.paidAt)}` : "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/control/pazienti/${i.patientId}`} className="block text-[15px] text-bone-50 hover:text-brand-300">
                    {i.paziente}
                  </Link>
                  <span className="mt-0.5 block text-xs text-bone-50/40">
                    {i.descrizione ?? etichetta(TIPI_INCASSO, i.kind)} · {etichetta(CANALI_INCASSO, i.channel)}
                    {i.ricevuta ? ` · ${i.ricevuta}` : ""}
                  </span>
                </span>
                <span className="font-display text-[17px] text-bone-50 tnum">{formatEuro(i.importoCents, 2)}</span>
                <Stato tono={i.status === "paid" ? "buono" : i.status === "pending" ? "avviso" : "spento"}>
                  {i.status === "paid" ? "Pagato" : i.status === "pending" ? "Da pagare" : i.status}
                </Stato>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
