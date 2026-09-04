import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getConversazione } from "@/lib/data/messaggi";
import { chiudiFilo, segnaFiloLetto } from "@/lib/clinical/messaggi-actions";
import { traccia } from "@/lib/audit";
import { formatShortDate, formatTime } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { Indietro, Riquadro } from "@/components/clinical/command-center";
import { Rispondi } from "@/components/clinical/moduli-messaggio";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Conversazione" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Una conversazione.
 *
 * Aprire il filo non lo segna letto. È deliberato: `read_by_staff_at` è
 * uno solo per tutta la clinica, quindi segnarlo all'apertura
 * significherebbe che una scheda lasciata aperta per sbaglio toglie il
 * pallino a tutto il team — e la domanda del paziente resta lì senza che
 * nessuno la veda più.
 *
 * Segnare è un gesto, e rispondere lo comprende.
 */
export default async function ConversazionePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <Indietro href="/pro/messaggi">Messaggi</Indietro>
        <Card className="mt-6">
          <EmptyState>Supabase non è collegato.</EmptyState>
        </Card>
      </div>
    );
  }

  const c = await getConversazione(id);
  if (!c) notFound();

  traccia({
    azione: "patient.section.view",
    entita: "message_thread",
    patientId: c.filo.patientId,
    entityId: id,
    dettagli: { sezione: "conversazione" },
  });

  return (
    <div className="mx-auto max-w-[820px]">
      <Indietro href="/pro/messaggi">Messaggi</Indietro>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-display text-[26px] leading-tight text-ink-900 sm:text-[30px]">
              {c.filo.oggetto}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">
              <NavLink
                href={`/pro/pazienti/${c.filo.patientId}`}
                className="text-brand-700 underline-offset-4 hover:underline"
              >
                {c.filo.paziente}
              </NavLink>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.filo.categoria === "clinical" ? "brand" : "neutral"}>
              {c.filo.categoria === "clinical" ? "Clinica" : "Amministrativa"}
            </Badge>
            {c.filo.chiuso ? <Badge>Chiusa</Badge> : null}
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          {c.filo.categoria === "clinical"
            ? "La leggono il paziente e il suo care team. La reception non la vede."
            : "La legge anche la reception, che risponde di appuntamenti e fatture."}
        </p>
      </header>

      {/* ── Le righe ─────────────────────────────────────────── */}
      <ol className="mt-6 space-y-3">
        {c.messaggi.map((m) => (
          <li
            key={m.id}
            className={cx("flex", m.dalPaziente ? "justify-start" : "justify-end")}
          >
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-3",
                m.dalPaziente
                  ? "bg-white shadow-card ring-1 ring-bone-200/70"
                  : "bg-brand-50 ring-1 ring-brand-100",
              )}
            >
              <p className="text-[11px] uppercase tracking-[0.07em] text-ink-400">
                {m.dalPaziente ? c.filo.paziente : (m.autore ?? "Unique")}
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink-900">
                {m.corpo}
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-300 tnum">
                {formatShortDate(m.quando)} · {formatTime(m.quando)}
                {!m.dalPaziente && m.lettoDalPaziente ? (
                  <span className="text-signal-positive">letto</span>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Rispondere ───────────────────────────────────────── */}
      <Riquadro titolo="Rispondi" className="mt-6">
        <div className="px-6 pb-6 pt-4">
          <Rispondi
            threadId={id}
            patientId={c.filo.patientId}
            chiuso={c.filo.chiuso}
          />
        </div>
      </Riquadro>

      {/* ── Gli altri due gesti ──────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {c.filo.toccaANoi ? (
          <form action={segnaFiloLetto}>
            <input type="hidden" name="threadId" value={id} />
            <input type="hidden" name="patientId" value={c.filo.patientId} />
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-white hover:text-brand-700"
            >
              Segna letto senza rispondere
            </button>
          </form>
        ) : null}

        <form action={chiudiFilo}>
          <input type="hidden" name="threadId" value={id} />
          <input type="hidden" name="patientId" value={c.filo.patientId} />
          <input type="hidden" name="riapri" value={c.filo.chiuso ? "true" : "false"} />
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm text-ink-500 ring-1 ring-bone-200 transition-colors hover:bg-white hover:text-ink-900"
          >
            {c.filo.chiuso ? "Riapri la conversazione" : "Chiudi la conversazione"}
          </button>
        </form>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-300">
        Chiudere non cancella niente e non impedisce di rileggere: toglie la
        possibilità di scrivere e fa sparire il filo dalla coda.
      </p>
    </div>
  );
}
