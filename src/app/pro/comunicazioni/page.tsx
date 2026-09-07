import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { filtraPerVista, getInbox, getReparti } from "@/lib/data/comunicazioni";
import { ETICHETTE_VISTA, NOTE_VISTA, VISTE, isVista, type Vista } from "@/lib/comunicazioni/tipi";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Scorciatoia } from "@/components/clinical/command-center";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  ColonnaCode,
  ElencoConversazioni,
  GuscioComunicazioni,
  NessunaConversazione,
} from "@/components/comunicazioni/guscio";
import { Ricerca } from "@/components/comunicazioni/moduli";
import { Vuoto } from "@/components/comunicazioni/segnali";
import { AggiornamentoLive } from "@/components/comunicazioni/realtime";

export const metadata: Metadata = { title: "Comunicazioni" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
export const unstable_dynamicStaleTime = 0;

/**
 * Il Clinical Communication Center.
 *
 * La domanda a cui questa schermata risponde è una sola: **cosa devo
 * leggere, e a cosa devo rispondere.** Non «tutti i messaggi», che è un
 * archivio, e non «le ultime notizie», che è un feed.
 *
 * Da qui l'ordine della pagina: prima le code — che sono domande, non
 * filtri — poi l'elenco in ordine di ultimo messaggio, poi la
 * conversazione. Le code stanno in colonna e non in un menu a tendina
 * perché un menu costringe ad aprirlo per ricordare cosa c'è dentro,
 * mentre una colonna lo mostra e il numero accanto dice se vale la pena
 * entrarci.
 *
 * Il contatore accanto a ciascuna coda e le righe che si vedono
 * cliccandoci nascono **dalla stessa lettura**: sei query separate
 * avrebbero prodotto sei istanti diversi, e un «3 urgenti» sopra un
 * elenco di due è il modo più rapido per far smettere di fidarsi di un
 * cruscotto.
 */
export default async function ComunicazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; reparto?: string; q?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  const { vista: vistaGrezza, reparto, q } = await searchParams;
  const vista: Vista = vistaGrezza && isVista(vistaGrezza) ? vistaGrezza : "tutte";
  const ricerca = (q ?? "").trim() || null;

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading
          title="Comunicazioni"
          subtitle="Le conversazioni fra colleghi e reparti, e i consulti specialistici."
        />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            comunicazioni.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [tutte, reparti] = await Promise.all([
    getInbox({ reparto, ricerca }),
    getReparti(),
  ]);

  const voci = filtraPerVista(tutte, vista);

  const conteggi = Object.fromEntries(
    VISTE.map((v) => [v, filtraPerVista(tutte, v).length]),
  ) as Partial<Record<Vista, number>>;

  const stato = { vista, reparto: reparto ?? null, ricerca };
  const nomeReparto = reparto
    ? (reparti.find((r) => r.slug === reparto)?.nome ?? reparto)
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <PageHeading
          title="Comunicazioni"
          subtitle="Le conversazioni fra colleghi e reparti, e i consulti specialistici. Il paziente non le vede: la conversazione con lui sta in «Messaggi»."
        />

        <div className="flex flex-wrap items-center gap-2">
          <Scorciatoia href="/pro/comunicazioni/nuova">Nuova comunicazione</Scorciatoia>
          <Scorciatoia href="/pro/comunicazioni/consulti">Consulti</Scorciatoia>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Ricerca
          valore={ricerca}
          vista={vista === "tutte" ? null : vista}
          reparto={reparto ?? null}
        />

        <AggiornamentoLive profileId={profile.id} />

        {(ricerca || nomeReparto) && (
          <p className="text-sm text-ink-400">
            {ricerca ? (
              <>
                {voci.length} {voci.length === 1 ? "conversazione" : "conversazioni"} per
                «<span className="text-ink-700">{ricerca}</span>»
              </>
            ) : (
              <>
                Reparto <span className="text-ink-700">{nomeReparto}</span>
              </>
            )}
            {vista !== "tutte" ? ` · ${ETICHETTE_VISTA[vista].toLowerCase()}` : ""}
          </p>
        )}
      </div>

      <div className="mt-5">
        <GuscioComunicazioni
          code={<ColonnaCode stato={stato} reparti={reparti} conteggi={conteggi} />}
          elenco={
            <ElencoConversazioni
              voci={voci}
              vuoto={
                <Vuoto
                  titolo={
                    ricerca
                      ? "Nessuna comunicazione trovata."
                      : tutte.length === 0
                        ? "Non partecipi ancora a nessuna comunicazione."
                        : `Niente in «${ETICHETTE_VISTA[vista].toLowerCase()}».`
                  }
                  azione={
                    <NavLink
                      href="/pro/comunicazioni/nuova"
                      className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ink-800"
                    >
                      Apri una comunicazione
                    </NavLink>
                  }
                >
                  {ricerca
                    ? "La ricerca guarda dentro il testo di tutti i messaggi che hai diritto di leggere, non solo in questa pagina."
                    : NOTE_VISTA[vista]}
                </Vuoto>
              }
            />
          }
          dettaglio={<NessunaConversazione />}
        />
      </div>
    </div>
  );
}
