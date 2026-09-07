import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  filtraPerVista,
  getColleghi,
  getConversazione,
  getInbox,
  getReparti,
} from "@/lib/data/comunicazioni";
import { VISTE, isVista, type Vista } from "@/lib/comunicazioni/tipi";
import {
  chiudiConversazione,
  segnaLetta,
  silenziaConversazione,
} from "@/lib/comunicazioni/azioni";
import { Indietro, Riquadro } from "@/components/clinical/command-center";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  ColonnaCode,
  ElencoConversazioni,
  GuscioComunicazioni,
} from "@/components/comunicazioni/guscio";
import {
  Allegati,
  IntestazioneConversazione,
  Messaggi,
  SchedaConsulto,
} from "@/components/comunicazioni/conversazione";
import {
  AggiungiPartecipante,
  AllegaReferto,
  AzioniConsulto,
  CaricaAllegato,
  Compositore,
} from "@/components/comunicazioni/moduli";
import { Vuoto } from "@/components/comunicazioni/segnali";
import { AggiornamentoLive } from "@/components/comunicazioni/realtime";

export const metadata: Metadata = { title: "Comunicazione" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Una conversazione interna.
 *
 * Aprirla la segna letta, ed è l'opposto di ciò che fa la conversazione
 * con un paziente. Non è un'incoerenza: là `read_by_staff_at` è **uno
 * per tutta la clinica**, quindi segnarlo all'apertura toglierebbe il
 * pallino a tutto il team per una scheda lasciata aperta per sbaglio.
 * Qui la lettura è di una persona sola e vale solo per lei, e chiedere
 * un clic per confermare una cosa già successa sarebbe burocrazia.
 *
 * La pagina rirenderizza per intero l'elenco a fianco invece di viverci
 * dentro come segmento annidato. Costa una lettura in più ed evita il
 * problema che la rende inutile: un layout non viene rieseguito
 * navigando fra due figli, e il pallino della conversazione appena letta
 * resterebbe acceso finché non si ricarica la pagina.
 */
export default async function ConversazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string; reparto?: string; q?: string }>;
}) {
  const { id } = await params;
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

  const { vista: vistaGrezza, reparto, q } = await searchParams;
  const vista: Vista = vistaGrezza && isVista(vistaGrezza) ? vistaGrezza : "tutte";
  const ricerca = (q ?? "").trim() || null;

  // Segnare letto prima di leggere: così le ricevute che la pagina
  // mostra comprendono la propria, e la riga non si disegna «non letta»
  // un istante prima di smettere di esserlo.
  await segnaLetta(id);

  const [c, tutte, reparti, colleghi] = await Promise.all([
    getConversazione(id),
    getInbox({ reparto, ricerca }),
    getReparti(),
    getColleghi(),
  ]);

  if (!c) notFound();

  const conteggi = Object.fromEntries(
    VISTE.map((v) => [v, filtraPerVista(tutte, v).length]),
  ) as Partial<Record<Vista, number>>;

  // I referti allegabili sono quelli della cartella di questa persona, e
  // la Row Level Security li restringe già a chi ha titolo: se qui non
  // arriva niente, non c'è niente da allegare — non è un errore.
  let documenti: { id: string; titolo: string }[] = [];
  if (c.pazienteId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .eq("patient_id", c.pazienteId)
      .order("created_at", { ascending: false })
      .limit(30);
    documenti = ((data ?? []) as { id: string; title: string }[]).map((d) => ({
      id: d.id,
      titolo: d.title,
    }));
  }

  const dettaglio = (
    <div className="space-y-4">
      <div className="lg:hidden">
        <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>
      </div>

      <AggiornamentoLive profileId={profile.id} conversationId={c.id} />

      <div className="overflow-hidden rounded-card bg-white shadow-card ring-1 ring-bone-200/70">
        <IntestazioneConversazione c={c} />

        {c.consulto ? (
          <SchedaConsulto
            consulto={c.consulto}
            azioni={
              c.scrivibile ? (
                <AzioniConsulto
                  consultoId={c.consulto.id}
                  pazienteId={c.consulto.pazienteId}
                  stato={c.consulto.stato}
                />
              ) : null
            }
          />
        ) : null}

        <Messaggi messaggi={c.messaggi} />

        {/* Il composer resta in fondo alla scheda e sul telefono si
            raggiunge scorrendo: fissarlo allo schermo avrebbe coperto
            l'ultima riga proprio mentre la si legge per rispondere. */}
        <div className="border-t border-bone-200 bg-bone-100/40">
          <Compositore
            conversationId={c.id}
            pazienteId={c.pazienteId}
            chiusa={c.chiusa}
            scrivibile={c.scrivibile}
          />
        </div>
      </div>

      {c.allegati.length > 0 ? (
        <Riquadro titolo="Allegati" conta={c.allegati.length}>
          <Allegati allegati={c.allegati} pazienteId={c.pazienteId} />
        </Riquadro>
      ) : null}

      <Riquadro
        titolo="Partecipanti e allegati"
        nota="Aggiungere un reparto significa che chiunque ne faccia parte oggi vede la conversazione, anche chi entrerà domani."
        apribile
        aperto={false}
      >
        <div className="space-y-5 px-5 py-4">
          {c.scrivibile ? (
            <AggiungiPartecipante
              conversationId={c.id}
              colleghi={colleghi}
              reparti={reparti}
            />
          ) : null}

          {c.pazienteId && c.scrivibile ? (
            <AllegaReferto
              conversationId={c.id}
              pazienteId={c.pazienteId}
              documenti={documenti}
            />
          ) : null}

          {c.scrivibile ? (
            <CaricaAllegato conversationId={c.id} pazienteId={c.pazienteId} />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <form action={silenziaConversazione}>
              <input type="hidden" name="conversationId" value={c.id} />
              <input
                type="hidden"
                name="silenzia"
                value={c.silenziata ? "false" : "true"}
              />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-ink-900"
              >
                {c.silenziata ? "Riattiva gli avvisi" : "Silenzia gli avvisi"}
              </button>
            </form>

            <form action={chiudiConversazione}>
              <input type="hidden" name="conversationId" value={c.id} />
              {c.pazienteId ? (
                <input type="hidden" name="pazienteId" value={c.pazienteId} />
              ) : null}
              <input type="hidden" name="riapri" value={c.chiusa ? "true" : "false"} />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-ink-900"
              >
                {c.chiusa ? "Riapri la conversazione" : "Chiudi la conversazione"}
              </button>
            </form>
          </div>

          <p className="text-xs leading-relaxed text-ink-300">
            Chiudere non cancella niente e non impedisce di rileggere: toglie la
            possibilità di scrivere. Silenziare toglie gli avvisi a te soltanto —
            la conversazione resta in elenco.
          </p>
        </div>
      </Riquadro>
    </div>
  );

  return (
    <div>
      <div className="hidden lg:block">
        <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>
      </div>

      <div className="lg:mt-4">
        <GuscioComunicazioni
          aperta
          code={
            <ColonnaCode
              stato={{ vista, reparto: reparto ?? null, ricerca }}
              reparti={reparti}
              conteggi={conteggi}
            />
          }
          elenco={
            <ElencoConversazioni
              voci={filtraPerVista(tutte, vista)}
              attiva={c.id}
              vuoto={<Vuoto titolo="Nessun’altra comunicazione in questa coda." />}
            />
          }
          dettaglio={dettaglio}
        />
      </div>
    </div>
  );
}
