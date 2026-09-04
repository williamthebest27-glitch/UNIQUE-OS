import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAgenda } from "@/lib/data/professional";
import { formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { PageHeading } from "@/components/shell/page-heading";
import { Badge, Card, ChevronIcon, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * L'agenda dei prossimi trenta giorni.
 *
 * La home mostra oggi e poco altro, perché una giornata clinica si guarda
 * un'ora alla volta. Qui c'è il mese: serve per rispondere a "quando ti
 * rivedo" senza uscire dall'applicazione.
 */
export default async function AgendaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-[860px]">
        <PageHeading title="Agenda" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è
            un’agenda da mostrare.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const giorni = await getAgenda();
  const totale = giorni.reduce((n, g) => n + g.visite.length, 0);

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeading
        title="Agenda"
        subtitle="Le visite dei prossimi trenta giorni, giorno per giorno. Apri una riga per la cartella del paziente."
      />

      {giorni.length === 0 ? (
        <Card className="mt-8">
          <EmptyState>
            Nessuna visita in programma. Le prenotazioni arrivano dal
            gestionale o dalla dashboard del paziente.
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="mt-5 text-sm text-ink-400">
            <span className="tnum">{totale}</span>{" "}
            {totale === 1 ? "visita in programma" : "visite in programma"}.
          </p>

          <div className="mt-6 space-y-6">
            {giorni.map((giorno) => (
              <section key={giorno.data}>
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500 first-letter:uppercase">
                  {formatWeekdayDayMonth(`${giorno.data}T12:00:00Z`)}
                </h2>

                <Card className="mt-2.5">
                  <ul className="divide-y divide-bone-200/80">
                    {giorno.visite.map((visita) => (
                      <li key={visita.id}>
                        <Link
                          href={`/pro/pazienti/${visita.patientId}`}
                          className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                        >
                          <span className="font-display text-[20px] text-ink-900 tnum">
                            {formatTime(visita.startsAt)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium text-ink-900">
                              {visita.patientName}
                            </span>
                            <span className="mt-0.5 block text-sm text-ink-500">
                              {visita.serviceName}
                              {visita.location ? ` · ${visita.location}` : ""}
                            </span>
                          </span>
                          {visita.status === "scheduled" ? (
                            <Badge tone="attention">da confermare</Badge>
                          ) : null}
                          <ChevronIcon className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
