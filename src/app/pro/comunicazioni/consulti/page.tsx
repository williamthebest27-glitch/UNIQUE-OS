import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getConsulti, type VoceConsulto } from "@/lib/data/comunicazioni";
import { ETICHETTE_STATO, type StatoConsulto } from "@/lib/comunicazioni/tipi";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Indietro, Riquadro, Scorciatoia } from "@/components/clinical/command-center";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  BarraPriorita,
  PastigliaPriorita,
  PastigliaStato,
  Vuoto,
  classiUrgenza,
} from "@/components/comunicazioni/segnali";
import { AggiornamentoLive } from "@/components/comunicazioni/realtime";

export const metadata: Metadata = { title: "Consulti" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * I due interruttori della pagina, in un indirizzo.
 *
 * Composti a mano erano quattro casi annidati e uno di essi produceva
 * `?miei=1?tutti=1`: due punti interrogativi, e il secondo filtro
 * silenziosamente ignorato. `URLSearchParams` non sa sbagliarlo.
 */
function indirizzo({ miei, tutti }: { miei: boolean; tutti: boolean }): string {
  const p = new URLSearchParams();
  if (miei) p.set("miei", "1");
  if (tutti) p.set("tutti", "1");
  const q = p.toString();
  return q
    ? `/pro/comunicazioni/consulti?${q}`
    : "/pro/comunicazioni/consulti";
}

/**
 * La lavagna dei consulti.
 *
 * Tre riquadri, e l'ordine è quello del lavoro: prima ciò che **nessuno
 * ha ancora preso in carico** — la coda che si dimentica, perché non è
 * di nessuno — poi ciò che è in mano a qualcuno, poi ciò che ha una
 * risposta e aspetta solo di essere chiuso da chi l'ha chiesta.
 *
 * «Aperto» non è la stessa cosa di «non letto», e tenerli separati è
 * tutto il valore di questa pagina: una richiesta può essere stata letta
 * da tre persone e non presa in carico da nessuna. In una chat quella
 * distinzione non esiste, ed è la ragione per cui un consulto qui è un
 * oggetto con uno stato e non un messaggio con un punto interrogativo.
 */
export default async function ConsultiPage({
  searchParams,
}: {
  searchParams: Promise<{ tutti?: string; miei?: string }>;
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

  const { tutti, miei } = await searchParams;
  const anchechiusi = tutti === "1";
  const soloMiei = miei === "1";

  const consulti = await getConsulti({
    soloAperti: !anchechiusi,
    soloMiei,
  });

  const daPrendere = consulti.filter((k) => k.stato === "open");
  const inCorso = consulti.filter((k) => k.stato === "taken" || k.stato === "in_review");
  const risposti = consulti.filter((k) => k.stato === "answered");
  const chiusi = consulti.filter((k) => k.stato === "closed");

  return (
    <div>
      <Indietro href="/pro/comunicazioni">Comunicazioni</Indietro>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <PageHeading
          title="Consulti specialistici"
          subtitle="Le richieste di parere che ti riguardano: quelle che hai chiesto e quelle arrivate ai tuoi reparti. Con lo stato, che è ciò che una chat non sa dire."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Scorciatoia href="/pro/comunicazioni/consulti/nuovo">
            Nuovo consulto
          </Scorciatoia>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <AggiornamentoLive profileId={profile.id} />

        <NavLink
          href={indirizzo({ miei: !soloMiei, tutti: anchechiusi })}
          className="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
        >
          {soloMiei ? "Mostra tutti i consulti" : "Solo quelli che ho chiesto io"}
        </NavLink>

        <NavLink
          href={indirizzo({ miei: soloMiei, tutti: !anchechiusi })}
          className="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
        >
          {anchechiusi ? "Nascondi i chiusi" : "Mostra anche i chiusi"}
        </NavLink>
      </div>

      <div className="mt-6 space-y-6">
        <Riquadro
          titolo="Da prendere in carico"
          conta={daPrendere.length}
          nota="Nessuno se n’è ancora fatto carico. È la coda che si perde, perché non è di nessuno."
        >
          {daPrendere.length === 0 ? (
            <Vuoto titolo="Niente in attesa di essere preso in carico.">
              Quando un collega chiede un parere a uno dei tuoi reparti, la richiesta
              compare qui finché qualcuno non la prende.
            </Vuoto>
          ) : (
            <Elenco consulti={daPrendere} />
          )}
        </Riquadro>

        <Riquadro
          titolo="In corso"
          conta={inCorso.length}
          nota="Presi in carico o in valutazione: hanno un nome accanto."
        >
          {inCorso.length === 0 ? (
            <Vuoto titolo="Nessun consulto in corso." />
          ) : (
            <Elenco consulti={inCorso} />
          )}
        </Riquadro>

        <Riquadro
          titolo="Risposti"
          conta={risposti.length}
          nota="Hanno una risposta. Chiuderli spetta a chi li ha chiesti: è il modo di dire «mi basta»."
          apribile
          aperto={risposti.length > 0}
        >
          {risposti.length === 0 ? (
            <Vuoto titolo="Nessun consulto in attesa di chiusura." />
          ) : (
            <Elenco consulti={risposti} />
          )}
        </Riquadro>

        {chiusi.length > 0 ? (
          <Riquadro titolo="Chiusi" conta={chiusi.length} apribile aperto={false}>
            <Elenco consulti={chiusi} />
          </Riquadro>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Una riga di consulto.
 *
 * L'ordine delle informazioni non cambia mai — priorità, motivo, di chi,
 * fra chi, quando — perché chi ne scorre venti impara la posizione una
 * volta sola e poi legge solo la colonna che gli serve. È la stessa
 * forma di `RigaLavoro` nel command center, e la somiglianza è voluta.
 */
function Elenco({ consulti }: { consulti: VoceConsulto[] }) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {consulti.map((k) => (
        <li key={k.id}>
          <NavLink
            href={`/pro/comunicazioni/${k.conversationId}`}
            className={`flex gap-3.5 px-6 py-4 transition-colors hover:bg-bone-50 ${classiUrgenza(
              k.priorita,
              k.stato === "closed",
            )}`}
          >
            <BarraPriorita priorita={k.priorita} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p className="text-[15px] font-medium leading-snug text-ink-900">
                  {k.motivo}
                </p>
                <PastigliaPriorita priorita={k.priorita} />
                <PastigliaStato stato={k.stato} />
              </div>

              {k.paziente ? (
                <p className="mt-0.5 text-sm text-brand-700">{k.paziente}</p>
              ) : null}

              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                {[
                  k.richiedente ? `Chiesto da ${k.richiedente}` : null,
                  k.repartoRichiedente,
                  k.repartoDestinatario ? `→ ${k.repartoDestinatario}` : null,
                  k.incaricato ? `· ${k.incaricato}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-300 tnum">
                <span className="first-letter:uppercase">
                  {formatRelativeDays(k.creatoIl)}
                </span>
                {k.scadenza ? (
                  <span
                    className={
                      new Date(k.scadenza) < new Date() && k.stato !== "closed"
                        ? "text-signal-alert"
                        : undefined
                    }
                  >
                    entro il {formatShortDate(k.scadenza)}
                  </span>
                ) : null}
              </p>
            </div>

            {k.nonLetti > 0 ? (
              <span
                aria-label={`${k.nonLetti} da leggere`}
                className="inline-flex h-fit min-w-[20px] shrink-0 justify-center rounded-full bg-[#fdf6e8] px-1.5 py-0.5 text-[11px] font-semibold text-signal-attention ring-1 ring-[#f0e0bd] tnum"
              >
                {k.nonLetti}
              </span>
            ) : (
              <span className="sr-only">{ETICHETTE_STATO[k.stato as StatoConsulto]}</span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
