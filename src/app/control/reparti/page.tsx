import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReparti } from "@/lib/data/comunicazioni";
import {
  cambiaMembroReparto,
  cambiaStatoReparto,
  creaReparto,
} from "@/lib/comunicazioni/azioni";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import {
  Campo,
  Panel,
  Scelta,
  Stato,
  Testo,
  Vuoto,
} from "@/components/control/primitives";
import { ModuloAzione } from "@/components/control/modulo-azione";

export const metadata: Metadata = { title: "Reparti" };
export const dynamic = "force-dynamic";

/**
 * I reparti.
 *
 * È una pagina di **permessi travestita da organigramma**, e conviene
 * saperlo prima di usarla: mettere una persona in un reparto significa
 * darle da leggere tutte le comunicazioni indirizzate a quel reparto, e
 * la possibilità di prendere in carico i consulti che vi arrivano —
 * cioè, per un consulto, l'accesso alla cartella del paziente per la sua
 * durata. Per questo la modificano solo direzione e proprietà, e per
 * questo la riga in fondo lo dice in chiaro invece di lasciarlo dedurre.
 *
 * Un reparto non si cancella: si mette fuori servizio. Le conversazioni
 * già indirizzate a un reparto cancellato perderebbero i loro
 * partecipanti, e con essi la ragione per cui qualcuno le può leggere.
 */
export default async function RepartiPage() {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "owner") redirect("/control");

  const sezione = SEZIONI_CONTROL["/control/reparti"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: i reparti vivono nel database.</Vuoto>
      </Panel>
    );
  }

  const supabase = await createSupabaseServerClient();

  const [reparti, membriRes, personeRes] = await Promise.all([
    // Anche i disattivati: la direzione deve poterli rimettere in servizio.
    getReparti(false),
    supabase
      .from("department_members")
      .select("department_id, profile_id, profile:profiles(full_name, role)")
      .is("ended_at", null)
      .limit(2000),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .neq("role", "patient")
      .order("full_name", { ascending: true })
      .limit(400),
  ]);

  const membriPer = new Map<
    string,
    { profileId: string; nome: string; ruolo: string }[]
  >();

  for (const m of (membriRes.data ?? []) as unknown as {
    department_id: string;
    profile_id: string;
    profile: { full_name: string; role: string } | null;
  }[]) {
    const elenco = membriPer.get(m.department_id) ?? [];
    elenco.push({
      profileId: m.profile_id,
      nome: m.profile?.full_name ?? "—",
      ruolo: m.profile?.role ?? "",
    });
    membriPer.set(m.department_id, elenco);
  }

  const persone = ((personeRes.data ?? []) as {
    id: string;
    full_name: string;
    role: string;
  }[]).filter((p) => p.full_name.trim().length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">
          {sezione.title}
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
      </div>

      <Panel
        title="Nuovo reparto"
        hint="Il nome è quello che i colleghi leggono quando scelgono un destinatario. Deve dirsi da solo."
      >
        <ModuloAzione
          action={creaReparto}
          invio="Crea il reparto"
          className="grid gap-4 px-5 pb-5 pt-3 sm:grid-cols-2"
        >
          <Campo label="Nome">
            <Testo name="nome" placeholder="Riabilitazione" />
          </Campo>

          <Campo label="Descrizione" hint="Cosa fa, in una riga.">
            <Testo name="descrizione" placeholder="Recupero funzionale post-infortunio." />
          </Campo>

          <Campo
            label="Tipo"
            hint="Solo i reparti clinici compaiono fra le destinazioni possibili di un consulto."
          >
            <Scelta name="clinico" defaultValue="true">
              <option value="true">Clinico</option>
              <option value="false">Non clinico (accoglienza, amministrazione)</option>
            </Scelta>
          </Campo>
        </ModuloAzione>
      </Panel>

      {reparti.length === 0 ? (
        <Panel title="Reparti">
          <Vuoto>Nessun reparto ancora.</Vuoto>
        </Panel>
      ) : (
        reparti.map((r) => {
          const membri = membriPer.get(r.id) ?? [];
          const dentro = new Set(membri.map((m) => m.profileId));
          const aggiungibili = persone.filter((p) => !dentro.has(p.id));

          return (
            <Panel
              key={r.id}
              title={r.nome}
              hint={r.descrizione ?? undefined}
              action={
                <form action={cambiaStatoReparto}>
                  <input type="hidden" name="repartoId" value={r.id} />
                  <input
                    type="hidden"
                    name="attiva"
                    value={r.attivo ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="text-xs text-bone-50/50 transition-colors hover:text-bone-50"
                  >
                    {r.attivo ? "Metti fuori servizio" : "Rimetti in servizio"}
                  </button>
                </form>
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-3 pt-1 text-sm text-bone-50/60">
                <Stato tono={r.attivo ? "buono" : "spento"}>
                  {r.attivo ? "In servizio" : "Fuori servizio"}
                </Stato>
                <Stato tono={r.clinico ? "neutro" : "avviso"}>
                  {r.clinico ? "Clinico" : "Non clinico"}
                </Stato>
                <span className="tnum">
                  {membri.length} {membri.length === 1 ? "persona" : "persone"}
                </span>
                <span className="text-bone-50/35">{r.slug}</span>
              </div>

              <div className="border-t border-white/[0.07] px-5 pb-5 pt-4">
                {membri.length === 0 ? (
                  <p className="text-sm text-bone-50/40">
                    Nessuno in questo reparto: le comunicazioni indirizzate qui non
                    le leggerebbe nessuno.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {membri.map((m) => (
                      <li key={m.profileId}>
                        <form action={cambiaMembroReparto} className="inline">
                          <input type="hidden" name="repartoId" value={r.id} />
                          <input type="hidden" name="profileId" value={m.profileId} />
                          <input type="hidden" name="dentro" value="false" />
                          <button
                            type="submit"
                            title="Togli dal reparto"
                            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-sm text-bone-50/70 transition-colors hover:border-white/25 hover:text-bone-50"
                          >
                            {m.nome}
                            <span aria-hidden="true" className="text-bone-50/35">
                              ×
                            </span>
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {aggiungibili.length > 0 ? (
                  <form
                    action={cambiaMembroReparto}
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="repartoId" value={r.id} />
                    <input type="hidden" name="dentro" value="true" />

                    <div className="min-w-[240px] flex-1">
                      <Campo label="Aggiungi al reparto">
                        <Scelta name="profileId" defaultValue="">
                          <option value="">Scegli…</option>
                          {aggiungibili.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}
                            </option>
                          ))}
                        </Scelta>
                      </Campo>
                    </div>

                    <button
                      type="submit"
                      className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-bone-50/70 transition-colors hover:text-bone-50"
                    >
                      Aggiungi
                    </button>
                  </form>
                ) : null}
              </div>
            </Panel>
          );
        })
      )}

      <p className="max-w-[70ch] text-xs leading-relaxed text-bone-50/35">
        Mettere una persona in un reparto le dà da leggere tutte le comunicazioni
        indirizzate a quel reparto, e la possibilità di prendere in carico i
        consulti che vi arrivano — cioè, per la durata di un consulto, l’accesso
        alla cartella del paziente. Ogni apertura resta nel registro degli accessi.
      </p>
    </div>
  );
}
