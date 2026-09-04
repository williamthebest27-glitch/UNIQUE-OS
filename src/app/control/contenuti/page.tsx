import type { Metadata } from "next";
import { contenutiGenerati, FORMATI } from "@/lib/brain/content";
import { generaContenutoAction } from "@/lib/brain/content-actions";
import { capacitaAttive } from "@/lib/brain/fornitore";
import { ControlloContenuto } from "@/components/control/controllo-contenuto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatShortDate } from "@/lib/format";
import {
  AreaTesto,
  Bottone,
  Campo,
  Panel,
  Scelta,
  Stato,
  Vuoto,
} from "@/components/control/primitives";

export const metadata: Metadata = { title: "Contenuti" };
export const dynamic = "force-dynamic";

/**
 * Il Content Brain.
 *
 * "Scrivimi il carosello per il nuovo Longevity Score", "fammi lo script
 * del reel", "trasforma questo studio in cinque contenuti Unique".
 *
 * Ogni bozza esce con tre cose che una generazione qualsiasi non ha: le
 * voci di knowledge base su cui si regge, i vincoli di brand che hanno
 * cambiato le scelte, e l'elenco di ciò che un medico deve rileggere
 * prima della pubblicazione.
 */
export default async function ContenutiPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Contenuti">
        <Vuoto>Supabase non è collegato: i contenuti generati vivono nel database.</Vuoto>
      </Panel>
    );
  }

  const bozze = await contenutiGenerati();
  const capacita = capacitaAttive();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Contenuti</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-bone-50/50">
          Il materiale nasce dal brand book e dal listino in vigore, non dalla
          memoria del modello. I prezzi che non trova nella knowledge base non li
          scrive.
        </p>
      </div>

      <Panel
        title="Nuovo contenuto"
        hint={
          capacita.redazione
            ? "Una bozza da rileggere, non un post da pubblicare."
            : "Senza modello linguistico esce un'impalcatura: struttura, fatti veri dalla knowledge base, e cosa resta da scrivere."
        }
      >
        <form action={generaContenutoAction} className="grid gap-4 px-5 pb-5 pt-2">
          <Campo label="Formato">
            <Scelta name="formato" defaultValue="carosello-instagram">
              {Object.entries(FORMATI).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Scelta>
          </Campo>

          <Campo
            label="Brief"
            hint="Di cosa parla, a chi si rivolge, cosa deve ottenere. Più è preciso, meno c'è da riscrivere."
          >
            <AreaTesto
              name="brief"
              required
              placeholder="Carosello sul nuovo Longevity Score per chi non ha mai fatto un check-up completo. Deve far capire che è una misura, non una diagnosi, e portare alla prenotazione."
            />
          </Campo>

          <div>
            <Bottone type="submit">
              {capacita.redazione ? "Genera la bozza" : "Costruisci l'impalcatura"}
            </Bottone>
          </div>
        </form>
      </Panel>

      {bozze.length === 0 ? (
        <Panel title="Bozze">
          <Vuoto>Nessun contenuto generato finora.</Vuoto>
        </Panel>
      ) : (
        bozze.map((bozza) => (
          <Panel
            key={bozza.id}
            title={bozza.titolo}
            hint={`${FORMATI[bozza.formato] ?? bozza.formato} · ${formatShortDate(bozza.createdAt)}`}
          >
            <div className="space-y-5 px-5 pb-5 pt-1">
              <p className="text-xs text-bone-50/35">{bozza.brief}</p>

              <ol className="space-y-3">
                {bozza.contenuto.blocchi?.map((blocco, i) => (
                  <li key={i} className="border-l border-white/10 pl-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/40">
                      {blocco.ruolo}
                    </p>
                    {blocco.testo ? (
                      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-bone-50/85">
                        {blocco.testo}
                      </p>
                    ) : null}
                    {blocco.daScrivere ? (
                      <p className="mt-1 text-[15px] leading-relaxed text-gold-300/80">
                        {blocco.daScrivere}
                      </p>
                    ) : null}
                    {blocco.nota ? (
                      <p className="mt-1 text-xs text-bone-50/35">{blocco.nota}</p>
                    ) : null}
                  </li>
                ))}
              </ol>

              {bozza.contenuto.call_to_action ? (
                <p className="text-[15px] text-brand-300">{bozza.contenuto.call_to_action}</p>
              ) : null}

              {bozza.contenuto.vincoli_rispettati?.length ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/40">
                    Vincoli
                  </p>
                  <ul className="mt-1 space-y-1">
                    {bozza.contenuto.vincoli_rispettati.map((v, i) => (
                      <li key={i} className="text-sm text-bone-50/55">
                        {v}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {bozza.contenuto.da_far_rileggere?.length ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-gold-300">
                    Da sapere prima di scrivere
                  </p>
                  <ul className="mt-1 space-y-1">
                    {bozza.contenuto.da_far_rileggere.map((a, i) => (
                      <li key={i} className="text-sm text-gold-300/80">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {bozza.contenuto.hook_alternativi?.length ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-bone-50/40">
                    Altri ganci
                  </p>
                  <ul className="mt-1 space-y-1">
                    {bozza.contenuto.hook_alternativi.map((h, i) => (
                      <li key={i} className="text-sm text-bone-50/60">
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}


              <div className="flex flex-wrap gap-2">
                {bozza.contenuto.fonti?.map((f, i) => (
                  <Stato key={i} tono="spento">
                    {f.slug}
                  </Stato>
                ))}
              </div>
            </div>
          </Panel>
        ))
      )}
      <Panel
        title="Controllo di conformità"
        hint="Su un testo qualunque: scritto a mano, da un modello, o preso da una campagna già online."
      >
        <ControlloContenuto formati={Object.entries(FORMATI)} />
      </Panel>
    </div>
  );
}
