import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRegistroAccessi, frase } from "@/lib/data/registro";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { SicurezzaAccount } from "@/components/shell/sicurezza-account";
import { Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sicurezza" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * La sicurezza del proprio account.
 *
 * Due cose che si fanno, e una che si guarda.
 *
 * Le due che si fanno sono il secondo fattore e la chiusura delle altre
 * sessioni. Sono le uniche due leve che una persona ha davvero sul
 * proprio account: tutto il resto — le policy, i ruoli, la cifratura,
 * i backup — è del sistema e non si tocca da qui.
 *
 * Quella che si guarda è **il proprio registro**: cosa il sistema ha
 * scritto di te. Sta in questa pagina e non in quella della direzione
 * per una ragione che non è di comodo — chi è tracciato deve poter
 * vedere la propria traccia. Un registro che si può leggere solo
 * dall'alto è sorveglianza; uno che ciascuno può leggere su di sé è
 * trasparenza, ed è la stessa riga di dati.
 */
export default async function SicurezzaPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/profilo");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Sicurezza" />
        <Card className="mt-8">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  /*
   * Le proprie righe, non quelle di tutti.
   *
   * `audit_leggibile` passa dalle policy di `audit_log`: un
   * professionista vede le righe dei pazienti che segue, e fra quelle
   * ci sono le proprie. Il filtro sull'attore lo si fa qui perché è una
   * scelta di questa pagina — «cosa è stato scritto di me» — non un
   * permesso.
   */
  const tutte = await getRegistroAccessi({ giorni: 30, quante: 400 });
  const mie = tutte.filter((r) => r.attore === profile.fullName).slice(0, 60);

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeading
        title="Sicurezza"
        subtitle="Il secondo fattore, le altre sessioni, e cosa il sistema ha registrato di te."
      />

      <div className="mt-6 space-y-6">
        <Riquadro titolo="Il tuo accesso">
          <div className="px-6 pb-6 pt-4">
            <SicurezzaAccount />
          </div>
        </Riquadro>

        <Riquadro
          titolo="Cosa è stato registrato di te"
          conta={mie.length}
          nota="Gli ultimi trenta giorni. Chi è tracciato deve poter vedere la propria traccia."
        >
          {mie.length === 0 ? (
            <Niente>
              Nessuna riga negli ultimi trenta giorni. Il registro si scrive da sé
              quando apri una cartella, modifichi una terapia, valuti un referto.
            </Niente>
          ) : (
            <ul className="mt-1 divide-y divide-bone-200/80">
              {mie.map((r) => {
                const { verbo, oggetto } = frase(r.azione, r.entita);
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-6 py-2.5"
                  >
                    <span className="w-32 shrink-0 text-xs text-ink-400 tnum">
                      {formatShortDate(r.quando)} {formatTime(r.quando)}
                    </span>
                    <span className="text-sm text-ink-700">
                      Hai {verbo.replace(/^ha /, "")}
                      {oggetto ? ` ${oggetto}` : ""}
                    </span>
                    {r.pazienteId ? (
                      <span className="text-sm text-ink-900">{r.paziente}</span>
                    ) : null}
                    <span className="text-xs text-ink-300 first-letter:uppercase">
                      {formatRelativeDays(r.quando)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Riquadro>

        <Riquadro
          titolo="Quello che non dipende da te"
          nota="Perché tu possa sapere cosa protegge i dati che tocchi, anche se non lo configuri."
          apribile
          aperto={false}
        >
          <div className="space-y-3 px-6 pb-6 pt-4 text-sm leading-relaxed text-ink-500">
            <p>
              <strong className="font-medium text-ink-900">Chi vede cosa lo decide il database.</strong>{" "}
              Ogni tabella clinica ha la Row Level Security attiva e le query
              dell’applicazione non filtrano per paziente: se una query fosse
              sbagliata, Postgres non restituirebbe comunque righe che non ti
              competono. Vedi i pazienti che ti sono assegnati, non quelli della
              clinica.
            </p>
            <p>
              <strong className="font-medium text-ink-900">Il registro non si riscrive.</strong>{" "}
              Un trigger rifiuta ogni modifica e ogni cancellazione, anche a chi ha
              la chiave di servizio, e ogni riga porta l’impronta della precedente:
              una manomissione spezza la catena e resta visibile.
            </p>
            <p>
              <strong className="font-medium text-ink-900">La password non la conosciamo.</strong>{" "}
              La custodisce Supabase; qui non transita mai in chiaro fuori dalla
              richiesta che la porta e non esiste una tabella nostra che la
              contenga. Il minimo è dodici caratteri, non i sei predefiniti.
            </p>
            <p>
              <strong className="font-medium text-ink-900">I dati sono cifrati</strong> in
              transito (TLS) e a riposo, e i backup li tiene Supabase con
              conservazione a punto nel tempo. Sono garanzie
              dell’infrastruttura, non di questo codice: è giusto saperlo invece di
              scoprirlo.
            </p>
          </div>
        </Riquadro>
      </div>
    </div>
  );
}
