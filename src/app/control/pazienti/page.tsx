import type { Metadata } from "next";
import Link from "next/link";
import { elencoPazienti, elencoSedi } from "@/lib/data/gestione";
import { creaPaziente } from "@/lib/gestione/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCredits, formatShortDate } from "@/lib/format";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { Bottone, Campo, Panel, Scelta, Stato, Testo, Vuoto } from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";

export const metadata: Metadata = { title: "Pazienti" };
export const dynamic = "force-dynamic";

/**
 * L'anagrafica.
 *
 * Una riga per persona, con ciò che serve al banco: come contattarla,
 * se ha una membership, quanti crediti le restano, quando è venuta
 * l'ultima volta. Niente referti, niente misure — quelli stanno nella
 * cartella, e la cartella non passa da qui.
 */
export default async function PazientiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sezione = SEZIONI_CONTROL["/control/pazienti"];
  const { q } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: l’anagrafica vive nel database.</Vuoto>
      </Panel>
    );
  }

  const [pazienti, sedi] = await Promise.all([elencoPazienti(q), elencoSedi()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">{sezione.title}</h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
      </div>

      <Panel
        title={q ? `Risultati per “${q}”` : "Tutti i pazienti"}
        hint={`${pazienti.length} ${pazienti.length === 1 ? "persona" : "persone"}`}
      >
        <form method="get" className="flex flex-wrap gap-2 px-5 pb-4 pt-2">
          <Testo
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nome, email, telefono o codice"
            className="max-w-sm"
            aria-label="Cerca un paziente"
          />
          <Bottone type="submit" variante="quieto">
            Cerca
          </Bottone>
          {q ? (
            <Link href="/control/pazienti" className="self-center text-sm text-bone-50/50 hover:text-bone-50">
              Tutti
            </Link>
          ) : null}
        </form>

        {pazienti.length === 0 ? (
          <Vuoto>{q ? "Nessuno con questo nome. Se è nuovo, aggiungilo qui sotto." : "Ancora nessun paziente in anagrafica."}</Vuoto>
        ) : (
          <ul className="pb-2">
            {pazienti.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/[0.07] px-5 py-3 first:border-t-0"
              >
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/control/pazienti/${p.id}`}
                    className="block text-[15px] text-bone-50 hover:text-brand-300"
                  >
                    {p.nome}
                  </Link>
                  <span className="mt-0.5 block text-xs text-bone-50/40">
                    {[p.email, p.telefono, p.codice, p.sede].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-right">
                  {p.membership ? <Stato tono="buono">{p.membership}</Stato> : <Stato tono="spento">Senza piano</Stato>}
                  <span className="text-xs text-bone-50/50 tnum">{formatCredits(p.creditiDisponibili)}</span>
                  <span className="w-24 text-xs text-bone-50/35 tnum">
                    {p.ultimaVisita ? formatShortDate(p.ultimaVisita) : "mai venuto"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Nuovo paziente" hint="Crea anche l'accesso: la password se la sceglie lui">
        <ModuloAzione action={creaPaziente} invio="Aggiungi in anagrafica" className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <Campo label="Nome">
            <Testo name="firstName" required autoComplete="off" />
          </Campo>
          <Campo label="Cognome">
            <Testo name="lastName" required autoComplete="off" />
          </Campo>
          <Campo label="Email" hint="Con questa entra in Unique OS e riceve i collegamenti.">
            <Testo name="email" type="email" required autoComplete="off" />
          </Campo>
          <Campo label="Telefono">
            <Testo name="phone" type="tel" autoComplete="off" />
          </Campo>
          <Campo label="Data di nascita">
            <Testo name="dateOfBirth" type="date" />
          </Campo>
          <Campo label="Codice fiscale">
            <Testo name="fiscalCode" maxLength={16} className="uppercase" autoComplete="off" />
          </Campo>
          {sedi.length > 1 ? (
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
        </ModuloAzione>
      </Panel>
    </div>
  );
}
