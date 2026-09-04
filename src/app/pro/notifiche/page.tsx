import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { segnaNotificaLetta, segnaTutteLette } from "@/lib/clinical/attenzione-actions";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Notifiche" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Il centro notifiche.
 *
 * «Non voglio ricevere centinaia di notifiche.» La risposta non è
 * mandarne meno a caso: è dare a ciascuna un destino diverso, e sono tre
 * — la stessa scala che governa il briefing del mattino della direzione.
 *
 *   `critical`  interrompe. Va guardata adesso.
 *   `important` si vede in giornata.
 *   `info`      non suona mai. Sta qui, e basta.
 *
 * La differenza fra questa pagina e il centro di attenzione è netta e va
 * tenuta: **una notifica è un fatto già avvenuto che qualcuno voleva
 * sapere; un segnale è lavoro che aspetta.** Una notifica letta sparisce;
 * un referto non revisionato resta lì anche dopo che l'hai visto passare.
 * Mescolarle produrrebbe una coda che si svuota leggendo, ed è il modo
 * più rapido per perdere il lavoro vero.
 */

interface RigaNotifica {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  category: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
}

const GRAVITA: Record<string, { etichetta: string; tono: "attention" | "brand" | "neutral" }> = {
  critical: { etichetta: "Critica", tono: "attention" },
  important: { etichetta: "Importante", tono: "brand" },
  info: { etichetta: "Informativa", tono: "neutral" },
};

export default async function NotifichePage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Notifiche" />
        <Card className="mt-8">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const io = await getCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link_url, category, severity, read_at, created_at")
    .eq("profile_id", io?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(120);

  const tutte = (data ?? []) as RigaNotifica[];
  const nonLette = tutte.filter((n) => n.read_at === null);

  const critiche = nonLette.filter((n) => n.severity === "critical");
  const importanti = nonLette.filter((n) => n.severity === "important");
  const informative = nonLette.filter((n) => n.severity === "info");
  const lette = tutte.filter((n) => n.read_at !== null);

  return (
    <div>
      <PageHeading
        title="Notifiche"
        subtitle="Fatti già avvenuti che qualcuno voleva farti sapere. Il lavoro che aspetta sta nel centro di attenzione: sono due code diverse."
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <NavLink
          href="/pro/attenzione"
          className="text-sm text-brand-700 underline-offset-4 hover:underline"
        >
          Vai al centro di attenzione →
        </NavLink>
        {nonLette.length > 0 ? (
          <form action={segnaTutteLette}>
            <button
              type="submit"
              className="text-sm text-ink-400 underline-offset-4 transition-colors hover:text-ink-700 hover:underline"
            >
              Segna tutte lette ({nonLette.length})
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-6 space-y-6">
        <Riquadro
          titolo="Critiche"
          conta={critiche.length}
          nota="Interrompono. Vanno guardate adesso."
        >
          {critiche.length === 0 ? (
            <Niente>Niente di critico.</Niente>
          ) : (
            <Elenco notifiche={critiche} />
          )}
        </Riquadro>

        <Riquadro
          titolo="Importanti"
          conta={importanti.length}
          nota="Si vedono in giornata."
        >
          {importanti.length === 0 ? (
            <Niente>Niente di importante non letto.</Niente>
          ) : (
            <Elenco notifiche={importanti} />
          )}
        </Riquadro>

        <Riquadro
          titolo="Informative"
          conta={informative.length}
          nota="Non suonano mai. Stanno qui, e basta."
          apribile
          aperto={false}
        >
          {informative.length === 0 ? (
            <Niente>Nessuna informativa.</Niente>
          ) : (
            <Elenco notifiche={informative} />
          )}
        </Riquadro>

        {lette.length > 0 ? (
          <Riquadro titolo="Lette" conta={lette.length} apribile aperto={false}>
            <ul className="divide-y divide-bone-200/80">
              {lette.slice(0, 40).map((n) => (
                <li
                  key={n.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-2.5"
                >
                  <p className="text-[15px] text-ink-400">{n.title}</p>
                  <p className="text-xs text-ink-300 tnum">
                    {formatShortDate(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </Riquadro>
        ) : null}
      </div>
    </div>
  );
}

function Elenco({ notifiche }: { notifiche: RigaNotifica[] }) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {notifiche.map((n) => {
        const gravita = GRAVITA[n.severity] ?? GRAVITA.info;

        return (
          <li key={n.id} className="flex gap-3.5 px-6 py-4">
            <span
              aria-hidden="true"
              className={cx(
                "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                n.severity === "critical"
                  ? "bg-brand-600"
                  : n.severity === "important"
                    ? "bg-gold-500"
                    : "bg-bone-300",
              )}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p className="text-[15px] font-medium text-ink-900">{n.title}</p>
                <Badge tone={gravita.tono}>{gravita.etichetta}</Badge>
                {n.category ? (
                  <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                    {n.category}
                  </span>
                ) : null}
              </div>

              {n.body ? (
                <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{n.body}</p>
              ) : null}

              <p className="mt-1 text-xs text-ink-300 tnum first-letter:uppercase">
                {formatRelativeDays(n.created_at)} · {formatTime(n.created_at)}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {n.link_url ? (
                <NavLink
                  href={n.link_url}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
                >
                  Apri
                </NavLink>
              ) : null}

              <form action={segnaNotificaLetta}>
                <input type="hidden" name="notificaId" value={n.id} />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-400 ring-1 ring-bone-200 transition-colors hover:text-ink-700"
                >
                  Letta
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
