import type { Metadata } from "next";
import Link from "next/link";
import { elencoConoscenza } from "@/lib/knowledge/queries";
import { creaVoce } from "@/lib/knowledge/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { KnowledgeKind } from "@/lib/knowledge/validity";
import { TIPI_CONOSCENZA } from "@/lib/knowledge/labels";
import {
  AreaTesto,
  Bottone,
  Campo,
  Panel,
  Scelta,
  Stato,
  Testo,
  Vuoto,
} from "@/components/control/primitives";

export const metadata: Metadata = { title: "Knowledge base" };
export const dynamic = "force-dynamic";

/**
 * La memoria aziendale.
 *
 * Una riga per informazione, e su ogni riga le quattro cose che rendono
 * un'informazione utilizzabile: da quando vale, chi ne risponde, a quale
 * versione siamo, e se è ora di riconfermarla. Senza queste, una
 * knowledge base è un archivio di file con la ricerca.
 */


export default async function ConoscenzaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Panel title="Knowledge base">
        <Vuoto>Supabase non è collegato: la memoria aziendale vive nel database.</Vuoto>
      </Panel>
    );
  }

  const voci = await elencoConoscenza();
  const daRiconfermare = voci.filter((v) => v.daRiconfermare);

  const perTipo = new Map<KnowledgeKind, typeof voci>();
  for (const voce of voci) {
    perTipo.set(voce.kind, [...(perTipo.get(voce.kind) ?? []), voce]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">Knowledge base</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">
          Ciò che Unique sa di sé. Un’informazione non si modifica: se ne
          pubblica una versione nuova, con la data da cui vale. Il Brain legge
          solo da qui, e solo ciò che è vero oggi.
        </p>
      </div>

      {daRiconfermare.length > 0 ? (
        <Panel
          title="Da riconfermare"
          hint="Nessuno le tocca da troppo tempo. Non sono sbagliate: non sono garantite."
        >
          <ul className="pb-2">
            {daRiconfermare.map((voce) => (
              <li
                key={voce.entryId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0"
              >
                <Link
                  href={`/control/conoscenza/${voce.slug}`}
                  className="text-[15px] text-bone-50 hover:text-brand-300"
                >
                  {voce.title}
                </Link>
                <span className="text-xs text-gold-300">{voce.provenienza}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {voci.length === 0 ? (
        <Panel title="Ancora vuota">
          <Vuoto>
            Nessuna informazione registrata. La prima voce si scrive qui sotto.
          </Vuoto>
        </Panel>
      ) : (
        [...perTipo.entries()].map(([kind, elenco]) => (
          <Panel key={kind} title={TIPI_CONOSCENZA[kind] ?? kind} hint={`${elenco.length} voci`}>
            <ul className="pb-2">
              {elenco.map((voce) => (
                <li
                  key={voce.entryId}
                  className="border-t border-white/[0.07] px-5 py-3 first:border-t-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link
                      href={`/control/conoscenza/${voce.slug}`}
                      className="text-[15px] text-bone-50 hover:text-brand-300"
                    >
                      {voce.title}
                    </Link>
                    <span className="flex items-center gap-2">
                      {voce.audience === "public" ? <Stato tono="neutro">Pubblica</Stato> : null}
                      {voce.daRiconfermare ? <Stato tono="avviso">Da riconfermare</Stato> : null}
                      <span className="text-xs text-bone-50/40 tnum">v{voce.version}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-bone-50/40">
                    {voce.summary ?? voce.body.slice(0, 120)}
                  </p>
                  <p className="mt-1 text-xs text-bone-50/30">
                    In vigore dal {voce.validFrom}
                    {voce.ownerName ? ` · ${voce.ownerName}` : " · senza proprietario"}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}

      {/* ── Nuova voce ──────────────────────────────────────────── */}
      <Panel
        title="Nuova informazione"
        hint="Nasce in bozza. Diventa vera quando la direzione la pubblica."
      >
        <form action={creaVoce} className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <Campo label="Titolo">
            <Testo name="title" required placeholder="Listino esami di laboratorio" />
          </Campo>

          <Campo label="Identificativo" hint="Come la chiamerà il Brain. Minuscolo, senza spazi.">
            <Testo name="slug" required placeholder="listino-laboratorio" />
          </Campo>

          <Campo label="Tipo">
            <Scelta name="kind" defaultValue="procedura">
              {Object.entries(TIPI_CONOSCENZA).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Scelta>
          </Campo>

          <Campo label="Visibilità" hint="Pubblica: può finire sul sito o in bocca a un chatbot.">
            <Scelta name="audience" defaultValue="internal">
              <option value="internal">Interna</option>
              <option value="public">Pubblica</option>
            </Scelta>
          </Campo>

          <div className="sm:col-span-2">
            <Campo label="Sintesi" hint="Una riga: è ciò che il Brain legge per decidere se aprirla.">
              <Testo name="summary" placeholder="Prezzi degli esami eseguiti in sede." />
            </Campo>
          </div>

          <div className="sm:col-span-2">
            <Campo label="Contenuto">
              <AreaTesto name="body" required placeholder="Il testo dell'informazione." />
            </Campo>
          </div>

          <Campo label="Etichette" hint="Separate da virgola.">
            <Testo name="tags" placeholder="prezzi, laboratorio" />
          </Campo>

          <Campo label="In vigore dal">
            <Testo type="date" name="validFrom" />
          </Campo>

          <div className="sm:col-span-2">
            <Bottone type="submit">Crea la bozza</Bottone>
          </div>
        </form>
      </Panel>
    </div>
  );
}
