import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  etichettaRegistro,
  getRegistroComunicazioni,
} from "@/lib/data/comunicazioni";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Indietro, Riquadro } from "@/components/clinical/command-center";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Vuoto } from "@/components/comunicazioni/segnali";

export const metadata: Metadata = { title: "Registro delle comunicazioni" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il registro.
 *
 * Non è un log e non è una cronologia da consultare per curiosità: è la
 * risposta alla domanda che un garante fa davvero — *chi ha scritto di
 * questa persona, chi l'ha letto, chi ha preso in carico un consulto e
 * quando.* Sono fatti che nessun'altra tabella lascerebbe vedere: una
 * lettura non cambia niente, quindi non produce nessun evento di
 * dominio, e senza questa riga sparirebbe.
 *
 * **Non ha un controllo di ruolo, e non gli serve.** `audit_log` ha due
 * policy che decidono al posto suo: la direzione vede tutto, chi
 * partecipa a una conversazione ne vede le tracce. Se questa pagina
 * avesse un errore, Postgres non restituirebbe comunque righe di
 * conversazioni altrui — che è la sola garanzia che vale la pena avere.
 *
 * Le righe non si possono scrivere dal client: `log_comms` è security
 * definer ed è l'unica strada. Un registro che il registrato può
 * riscrivere non è un registro.
 */
export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ conversazione?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>
        <Card className="mt-6">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const { conversazione } = await searchParams;
  const righe = await getRegistroComunicazioni({
    conversationId: conversazione ?? null,
    limite: 200,
  });

  // Raggruppare per giorno: un elenco di duecento righe con la data su
  // ciascuna si legge come rumore, e la domanda che ci si porta dentro è
  // quasi sempre «quel giorno lì».
  const giorni = new Map<string, typeof righe>();
  for (const r of righe) {
    const giorno = r.quando.slice(0, 10);
    giorni.set(giorno, [...(giorni.get(giorno) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>

      <div className="mt-4">
        <PageHeading
          title="Registro delle comunicazioni"
          subtitle="Chi ha scritto, chi ha letto, chi ha preso in carico un consulto. Vedi le tracce delle conversazioni a cui partecipi; la direzione le vede tutte."
        />
      </div>

      {conversazione ? (
        <p className="mt-3 text-sm text-ink-400">
          Filtrato su una conversazione.{" "}
          <NavLink
            href="/pro/comunicazioni/registro"
            className="text-brand-700 underline-offset-4 hover:underline"
          >
            Mostra tutto
          </NavLink>
        </p>
      ) : null}

      <div className="mt-6 space-y-5">
        {righe.length === 0 ? (
          <Card>
            <Vuoto titolo="Nessuna traccia da mostrare.">
              Ogni messaggio inviato, ogni lettura, ogni consulto preso in carico
              lascia una riga qui. Compariranno appena qualcuno userà le
              comunicazioni.
            </Vuoto>
          </Card>
        ) : (
          [...giorni.entries()].map(([giorno, elenco]) => (
            <Riquadro
              key={giorno}
              titolo={formatShortDate(`${giorno}T12:00:00Z`)}
              conta={elenco.length}
              nota={formatRelativeDays(`${giorno}T12:00:00Z`)}
            >
              <ul className="mt-1 divide-y divide-bone-200/80">
                {elenco.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-2.5"
                  >
                    <span className="shrink-0 text-xs text-ink-300 tnum">
                      {formatTime(r.quando)}
                    </span>

                    <span className="text-sm text-ink-900">
                      {r.attore ?? "Profilo rimosso"}
                    </span>

                    <span className="text-sm text-ink-500">
                      {etichettaRegistro(r.azione).toLowerCase()}
                    </span>

                    {r.conversazione ? (
                      <NavLink
                        href={`/pro/comunicazioni/${r.conversationId}`}
                        className="min-w-0 truncate text-sm text-brand-700 underline-offset-4 hover:underline"
                      >
                        {r.conversazione}
                      </NavLink>
                    ) : (
                      <span className="text-sm text-ink-300">
                        conversazione non accessibile
                      </span>
                    )}

                    {r.pazienteId ? (
                      <NavLink
                        href={`/pro/pazienti/${r.pazienteId}`}
                        className="text-xs text-ink-400 underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        cartella →
                      </NavLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Riquadro>
          ))
        )}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-ink-300">
        Il registro non si scrive dal browser: le righe le produce una funzione del
        database, e non esiste una policy che permetta di inserirle o modificarle.
      </p>
    </div>
  );
}
