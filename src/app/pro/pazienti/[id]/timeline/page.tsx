import type { Metadata } from "next";
import { getPatientTimeline } from "@/lib/data/timeline";
import { accessiAlPaziente, etichettaAudit } from "@/lib/audit";
import { recentEvents } from "@/lib/events/emit";
import { traccia } from "@/lib/audit";
import { formatShortDate, formatTime } from "@/lib/format";
import { Timeline } from "@/components/patient/timeline";
import { Niente, Riquadro } from "@/components/clinical/command-center";

export const metadata: Metadata = { title: "Timeline" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Tutto quello che è successo, in tre registri diversi.
 *
 * Non è ridondanza: sono tre domande che nessuno dei tre può rispondere
 * da solo.
 *
 *   **La Health Timeline** racconta la storia clinica — punteggi,
 *   visite, referti, percorsi — ed è quella che si guarda per capire
 *   una persona. Viene da una vista sulle tabelle di dominio: non
 *   esiste una tabella di eventi da tenere allineata, e una vista non
 *   può andare fuori sincrono con sé stessa.
 *
 *   **Gli eventi di dominio** dicono cosa è *cambiato*, al passato e
 *   nell'ordine in cui è successo. Sono il sistema nervoso da cui
 *   partono notifiche, task e webhook.
 *
 *   **Il registro degli accessi** dice chi ha *guardato*. Aprire una
 *   cartella senza toccare niente non produce nessun evento — ed è
 *   esattamente l'accesso che l'art. 32 del GDPR chiede di poter
 *   mostrare.
 */
export default async function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [eventi, accessi, dominio] = await Promise.all([
    getPatientTimeline(id, 60),
    accessiAlPaziente(id, 40),
    recentEvents({ patientId: id, limit: 30 }).catch(() => []),
  ]);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "timeline" },
  });

  return (
    <div className="space-y-6">
      <Timeline
        events={eventi}
        title="Health Timeline"
        hint="Punteggi, visite, referti e percorsi, dal più recente. Ricostruita dalle tabelle di dominio, non da un registro a parte."
      />

      <Riquadro
        titolo="Eventi"
        conta={dominio.length}
        nota="Cosa è cambiato, al passato. È il registro append-only da cui partono notifiche, task e integrazioni."
        apribile
        aperto={false}
      >
        {dominio.length === 0 ? (
          <Niente>
            Nessun evento da mostrare. Il registro degli eventi è riservato alla
            direzione: contiene nomi e importi di tutta la clinica, e la Row Level
            Security lo restringe a chi dirige — quindi qui può risultare vuoto
            anche quando gli eventi esistono.
          </Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {dominio.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-2.5"
              >
                <span className="w-36 shrink-0 text-xs text-ink-400 tnum">
                  {formatShortDate(e.occurredAt)} {formatTime(e.occurredAt)}
                </span>
                <span className="font-mono text-xs text-ink-700">{e.eventName}</span>
                <span className="text-sm text-ink-500">{e.entity}</span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro
        titolo="Chi ha guardato"
        conta={accessi.length}
        nota="Il registro degli accessi ai dati sanitari di questa persona. Gli eventi dicono cosa è cambiato; questo dice chi ha aperto la cartella senza toccare niente."
        apribile
        aperto={false}
      >
        {accessi.length === 0 ? (
          <Niente>
            Nessun accesso registrato. Il registro si popola da qui in avanti: prima
            della migrazione che lo ha acceso, le letture non lasciavano traccia.
          </Niente>
        ) : (
          <ul className="divide-y divide-bone-200/80">
            {accessi.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-2.5"
              >
                <span className="w-36 shrink-0 text-xs text-ink-400 tnum">
                  {formatShortDate(a.quando)} {formatTime(a.quando)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[15px] text-ink-900">
                    {a.attore ?? "Utente rimosso"}
                  </span>
                  <span className="ml-2 text-sm text-ink-500">
                    {etichettaAudit(a.azione)}
                  </span>
                  {typeof a.dettagli.sezione === "string" ? (
                    <span className="ml-2 text-xs text-ink-300">
                      {String(a.dettagli.sezione)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>
    </div>
  );
}
