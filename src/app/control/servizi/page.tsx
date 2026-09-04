import type { Metadata } from "next";
import { elencoSedi, elencoServizi, elencoStanze, type ServizioInCatalogo, type StanzaInCatalogo } from "@/lib/data/gestione";
import { salvaServizio, salvaStanza } from "@/lib/gestione/actions";
import { DISCIPLINE, etichetta } from "@/lib/gestione/etichette";
import { euroDaCentesimi } from "@/lib/gestione/importi";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCredits, formatDurata, formatEuro } from "@/lib/format";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { AreaTesto, Campo, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";

export const metadata: Metadata = { title: "Listino e stanze" };
export const dynamic = "force-dynamic";

/**
 * Il listino e le stanze.
 *
 * Un servizio è ciò che si prenota: ha una durata, che decide le fette
 * dell'agenda; un costo in crediti, che decide cosa scala la membership;
 * un prezzo, che decide cosa si incassa a prestazione. Cambiarli qui
 * cambia il futuro, non il passato: le visite già fissate tengono i
 * numeri con cui sono nate.
 */

function CampiServizio({ servizio }: { servizio?: ServizioInCatalogo }) {
  return (
    <>
      {servizio ? <input type="hidden" name="id" value={servizio.id} /> : null}
      <Campo label="Nome">
        <Testo name="name" required defaultValue={servizio?.nome ?? ""} placeholder="Consulenza longevity" />
      </Campo>
      <Campo label="Identificativo" hint="Come lo chiama il sistema. Vuoto = dal nome.">
        <Testo name="slug" defaultValue={servizio?.slug ?? ""} placeholder="consulenza-longevity" />
      </Campo>
      <Campo label="Durata (minuti)">
        <Testo name="durationMin" type="number" min={5} step={5} required defaultValue={servizio?.durataMin ?? 60} />
      </Campo>
      <Campo label="Crediti">
        <Testo name="creditsCost" inputMode="decimal" defaultValue={servizio ? String(servizio.creditsCost) : "1"} />
      </Campo>
      <Campo label="Prezzo a prestazione" hint="In euro, ad esempio 149,00">
        <Testo name="priceEuro" inputMode="decimal" defaultValue={servizio ? euroDaCentesimi(servizio.prezzoCents) : ""} placeholder="149,00" />
      </Campo>
      <Campo label="Materiali" hint="Costo vivo per prestazione: reagenti, consumabili.">
        <Testo name="materialsEuro" inputMode="decimal" defaultValue={servizio ? euroDaCentesimi(servizio.materialiCents) : ""} placeholder="0,00" />
      </Campo>
      <Campo label="Disciplina">
        <Scelta name="discipline" defaultValue={servizio?.disciplina ?? ""}>
          <option value="">Qualunque</option>
          {Object.entries(DISCIPLINE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Scelta>
      </Campo>
      <Campo label="Stato">
        <Scelta name="isActive" defaultValue={servizio && !servizio.attivo ? "off" : "on"}>
          <option value="on">Prenotabile</option>
          <option value="off">Sospeso</option>
        </Scelta>
      </Campo>
      <div className="sm:col-span-2">
        <Campo label="Descrizione">
          <AreaTesto name="description" defaultValue={servizio?.descrizione ?? ""} className="min-h-[4rem] font-sans" />
        </Campo>
      </div>
    </>
  );
}

function CampiStanza({ stanza, sedi }: { stanza?: StanzaInCatalogo; sedi: { id: string; nome: string }[] }) {
  return (
    <>
      {stanza ? <input type="hidden" name="id" value={stanza.id} /> : null}
      <Campo label="Nome">
        <Testo name="name" required defaultValue={stanza?.nome ?? ""} placeholder="Studio 2" />
      </Campo>
      <Campo label="Stato">
        <Scelta name="isActive" defaultValue={stanza && !stanza.attiva ? "off" : "on"}>
          <option value="on">In uso</option>
          <option value="off">Fuori uso</option>
        </Scelta>
      </Campo>
      {!stanza && sedi.length > 1 ? (
        <Campo label="Sede">
          <Scelta name="locationId" defaultValue={sedi[0]?.id}>
            {sedi.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Scelta>
        </Campo>
      ) : null}
      <div className="sm:col-span-2">
        <Campo label="Note">
          <Testo name="notes" defaultValue={stanza?.note ?? ""} placeholder="Lettino, ecografo" />
        </Campo>
      </div>
    </>
  );
}

export default async function ServiziPage() {
  const sezione = SEZIONI_CONTROL["/control/servizi"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: il listino vive nel database.</Vuoto>
      </Panel>
    );
  }

  const [servizi, stanze, sedi] = await Promise.all([elencoServizi(true), elencoStanze(), elencoSedi()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">{sezione.title}</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
      </div>

      <Panel title="Listino" hint={`${servizi.length} servizi`}>
        {servizi.length === 0 ? (
          <Vuoto>Nessun servizio a listino.</Vuoto>
        ) : (
          <ul className="pb-2">
            {servizi.map((s) => (
              <li key={s.id} className="border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-bone-50">{s.nome}</span>
                    <span className="mt-0.5 block text-xs text-bone-50/40">
                      {formatDurata(s.durataMin)} · {formatCredits(s.creditsCost)} · {formatEuro(s.prezzoCents)}
                      {s.materialiCents > 0 ? ` (materiali ${formatEuro(s.materialiCents)})` : ""}
                      {s.disciplina ? ` · ${etichetta(DISCIPLINE, s.disciplina)}` : ""}
                    </span>
                  </span>
                  <Stato tono={s.attivo ? "buono" : "spento"}>{s.attivo ? "Prenotabile" : "Sospeso"}</Stato>
                </div>
                <details className="mt-2 text-xs text-bone-50/50">
                  <summary className="cursor-pointer hover:text-bone-50">Modifica</summary>
                  <ModuloAzione action={salvaServizio} invio="Salva" variante="quieto" className="mt-3 grid gap-4 sm:grid-cols-2">
                    <CampiServizio servizio={s} />
                  </ModuloAzione>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Nuovo servizio">
        <ModuloAzione action={salvaServizio} invio="Aggiungi al listino" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <CampiServizio />
        </ModuloAzione>
      </Panel>

      <Panel title="Stanze" hint={`${stanze.filter((s) => s.attiva).length} in uso`}>
        {stanze.length === 0 ? (
          <Vuoto>Nessuna stanza. Senza stanze l&apos;agenda non può accorgersi di due visite nello stesso posto.</Vuoto>
        ) : (
          <ul className="pb-2">
            {stanze.map((st) => (
              <li key={st.id} className="border-t border-white/[0.07] px-5 py-3 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-bone-50">{st.nome}</span>
                    {st.note ? <span className="mt-0.5 block text-xs text-bone-50/40">{st.note}</span> : null}
                  </span>
                  <Stato tono={st.attiva ? "buono" : "spento"}>{st.attiva ? "In uso" : "Fuori uso"}</Stato>
                </div>
                <details className="mt-2 text-xs text-bone-50/50">
                  <summary className="cursor-pointer hover:text-bone-50">Modifica</summary>
                  <ModuloAzione action={salvaStanza} invio="Salva" variante="quieto" className="mt-3 grid gap-4 sm:grid-cols-2">
                    <CampiStanza stanza={st} sedi={sedi} />
                  </ModuloAzione>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Nuova stanza">
        <ModuloAzione action={salvaStanza} invio="Aggiungi la stanza" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <CampiStanza sedi={sedi} />
        </ModuloAzione>
      </Panel>
    </div>
  );
}
