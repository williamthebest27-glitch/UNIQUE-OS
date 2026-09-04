import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getIntestazione } from "@/lib/data/cartella";
import { traccia } from "@/lib/audit";
import { STAGE_LABELS } from "@/lib/journey/stages";
import { formatCredits, formatDelta, formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { Indietro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";
import { SezioniCartella } from "@/components/clinical/sezioni-cartella";

/**
 * Il workspace della cartella.
 *
 * Prima era una pagina sola di seicento righe: si apriva tutta insieme,
 * si scorreva per trovare la nota di ieri, e chi entrava per registrare
 * l'esito di una visita pagava anche lo storico delle misure.
 *
 * Adesso è un'intestazione fissa più una sezione per rotta. Non è un
 * `useState` con delle schede: **ogni sezione ha un indirizzo**, quindi
 * si apre in una scheda nuova, si mette fra i preferiti, si manda a un
 * collega e torna indietro con il tasto del browser. Uno stato in React
 * avrebbe risparmiato una navigazione e tolto tutte e quattro le cose.
 *
 * L'intestazione resta perché un medico che legge una nota deve
 * continuare a vedere di chi la sta leggendo — con il punteggio, la fase
 * del percorso e le code aperte accanto al nome. È la differenza fra
 * leggere un documento e leggere la cartella di una persona.
 *
 * Qui viene anche registrato l'accesso. Aprire una cartella senza
 * toccare niente non produce nessun evento di dominio, ed è proprio
 * l'accesso che un registro dei trattamenti deve poter mostrare.
 */

export default async function CartellaLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/pazienti">Pazienti</Indietro>
        <Card className="mt-6">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            cartelle da aprire.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const p = await getIntestazione(id);
  if (!p) notFound();

  // Non si attende: una riga di registro non deve stare fra il medico e
  // la cartella che ha chiesto.
  traccia({ azione: "patient.view", entita: "patient", patientId: id });

  const delta =
    p.score !== null && p.scorePrecedente !== null ? p.score - p.scorePrecedente : null;

  return (
    <div>
      <Indietro href="/pro/pazienti">Pazienti</Indietro>

      {/* ── L'intestazione clinica ───────────────────────────── */}
      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
              {p.nome}
            </h1>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
              {p.codice ? (
                <span className="font-mono text-xs text-ink-400">{p.codice}</span>
              ) : null}
              {p.eta !== null ? <span className="tnum">{p.eta} anni</span> : null}
              {p.sesso ? <span>{p.sesso}</span> : null}
              {p.altezzaCm ? <span className="tnum">{p.altezzaCm} cm</span> : null}
              {p.sede ? <span>{p.sede}</span> : null}
            </p>

            {p.careTeam.length > 0 ? (
              <p className="mt-1.5 text-sm text-ink-400">
                Care team:{" "}
                {p.careTeam
                  .map((m) => [m.titolo, m.nome].filter(Boolean).join(" "))
                  .join(" · ")}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.fase ? <Badge tone="brand">{STAGE_LABELS[p.fase.stage]}</Badge> : null}
              {p.membership?.piano ? (
                <Badge tone="gold">
                  {p.membership.piano}
                  {p.membership.stato && p.membership.stato !== "active"
                    ? ` · ${p.membership.stato}`
                    : ""}
                </Badge>
              ) : null}
              {p.crediti && p.crediti.assegnati > 0 ? (
                <Badge>{formatCredits(p.crediti.disponibili)} disponibili</Badge>
              ) : null}
            </div>
          </div>

          {/* Il punteggio, grande quanto basta a leggerlo di sfuggita. */}
          <div className="shrink-0 text-right">
            {p.score !== null ? (
              <>
                <p className="font-display text-[44px] leading-none text-ink-900 tnum">
                  {Math.round(p.score)}
                </p>
                <p className="mt-1.5 text-xs text-ink-400">
                  {p.scoreIl ? formatShortDate(p.scoreIl) : ""}
                </p>
                {delta !== null ? (
                  <p
                    className={cx(
                      "mt-0.5 text-xs font-medium tnum",
                      delta > 0
                        ? "text-signal-positive"
                        : delta < 0
                          ? "text-signal-alert"
                          : "text-ink-300",
                    )}
                  >
                    {formatDelta(Math.round(delta * 10) / 10)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-300">nessun punteggio</p>
            )}
          </div>
        </div>

        {/* ── Le code aperte su questa persona ──────────────── */}
        {p.inRevisione > 0 || p.refertiDaLeggere > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {p.inRevisione > 0 ? (
              <NavLink
                href="/pro/revisioni"
                className="inline-flex items-center gap-2 rounded-xl bg-[#fdf6e8] px-3.5 py-2 text-sm text-signal-attention ring-1 ring-[#f0e0bd] transition-colors hover:bg-[#fbf0d9]"
              >
                <span className="tnum">{p.inRevisione}</span>
                {p.inRevisione === 1 ? "valore in attesa" : "valori in attesa"} di revisione
                <span aria-hidden="true">→</span>
              </NavLink>
            ) : null}
            {p.refertiDaLeggere > 0 ? (
              <NavLink
                href={`/pro/pazienti/${id}/documenti`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#fdf6e8] px-3.5 py-2 text-sm text-signal-attention ring-1 ring-[#f0e0bd] transition-colors hover:bg-[#fbf0d9]"
              >
                <span className="tnum">{p.refertiDaLeggere}</span>
                {p.refertiDaLeggere === 1 ? "referto da leggere" : "referti da leggere"}
                <span aria-hidden="true">→</span>
              </NavLink>
            ) : null}
          </div>
        ) : null}

        {/* ── La prossima visita ────────────────────────────── */}
        {p.prossimaVisita ? (
          <p className="mt-4 text-sm text-ink-500">
            Prossima visita: <span className="text-ink-900">{p.prossimaVisita.servizio}</span>,{" "}
            <span className="first-letter:uppercase">
              {formatWeekdayDayMonth(p.prossimaVisita.quando)}
            </span>{" "}
            alle <span className="tnum">{formatTime(p.prossimaVisita.quando)}</span>.{" "}
            <NavLink
              href={`/pro/pazienti/${id}/visita`}
              className="text-brand-700 underline-offset-4 hover:underline"
            >
              Preparala
            </NavLink>
          </p>
        ) : null}
      </header>

      {/* ── Le sezioni ───────────────────────────────────────── */}
      <div className="mt-6 border-b border-bone-200 pb-px">
        <SezioniCartella
          patientId={id}
          conte={{ documenti: p.refertiDaLeggere, revisioni: p.inRevisione }}
        />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
