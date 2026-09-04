import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cerca } from "@/lib/data/ricerca";
import { ETICHETTE_REVISIONE, toStatoRevisione } from "@/lib/documents/revisione";
import { formatShortDate, formatTime, formatWeekdayDayMonth } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { RicercaGlobale } from "@/components/clinical/ricerca-globale";
import { Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Ricerca" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * I risultati, divisi per categoria.
 *
 * Le categorie compaiono solo se hanno qualcosa dentro, e in ordine
 * fisso: prima le persone. Chi cerca in una clinica sta cercando una
 * persona nove volte su dieci, e le altre due categorie sono quasi
 * sempre un modo indiretto di cercare la stessa persona.
 */

const TIPO_DOCUMENTO: Record<string, string> = {
  lab_report: "Esame di laboratorio",
  imaging: "Diagnostica per immagini",
  prescription: "Prescrizione",
  consent: "Consenso",
  care_plan: "Piano di cura",
  invoice: "Fattura",
  other: "Documento",
};

const TIPO_NOTA: Record<string, string> = {
  note: "Nota",
  assessment: "Valutazione",
  visit_summary: "Sintesi di visita",
};

export default async function CercaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const risultati = isSupabaseConfigured() ? await cerca(query) : null;

  return (
    <div>
      <PageHeading
        title="Ricerca"
        subtitle="Pazienti, referti, visite, task, note cliniche e procedure. I risultati arrivano divisi per categoria."
      />

      <div className="mt-5">
        <RicercaGlobale valoreIniziale={query} autoFocus={query.length === 0} />
      </div>

      {!isSupabaseConfigured() ? (
        <Card className="mt-6">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è nulla da
            cercare.
          </EmptyState>
        </Card>
      ) : !risultati?.utile ? (
        <Card className="mt-6">
          <EmptyState>
            {query.length === 0
              ? "Scrivi un nome, un codice paziente, il titolo di un referto o una parola di un task."
              : "Servono almeno due lettere: con una sola i risultati sarebbero tutti."}
          </EmptyState>
        </Card>
      ) : risultati.totale === 0 ? (
        <Card className="mt-6">
          <EmptyState>
            Nessun risultato per «{query}». La ricerca guarda solo ciò che hai
            titolo di vedere: se cerchi un paziente che non segui, non compare.
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-ink-400">
            <span className="tnum">{risultati.totale}</span>{" "}
            {risultati.totale === 1 ? "risultato" : "risultati"} per «{query}».
          </p>

          {/* ── Pazienti ─────────────────────────────────────── */}
          {risultati.pazienti.length > 0 ? (
            <Riquadro titolo="Pazienti" conta={risultati.pazienti.length}>
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.pazienti.map((p) => (
                  <li key={p.id}>
                    <NavLink
                      href={`/pro/pazienti/${p.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-ink-900">{p.nome}</p>
                        {p.codice ? (
                          <p className="mt-0.5 font-mono text-xs text-ink-300">{p.codice}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {p.ultimoScore !== null ? (
                          <>
                            <p className="font-display text-[20px] leading-none text-ink-900 tnum">
                              {Math.round(p.ultimoScore)}
                            </p>
                            <p className="mt-1 text-xs text-ink-400 tnum">
                              {p.ultimoScoreIl ? formatShortDate(p.ultimoScoreIl) : ""}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-ink-300">nessun punteggio</p>
                        )}
                      </div>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          {/* ── Documenti ────────────────────────────────────── */}
          {risultati.documenti.length > 0 ? (
            <Riquadro titolo="Referti e documenti" conta={risultati.documenti.length}>
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.documenti.map((d) => (
                  <li key={d.id}>
                    <NavLink
                      href={`/pro/pazienti/${d.patientId}/documenti`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-ink-900">{d.titolo}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {d.paziente} · {TIPO_DOCUMENTO[d.tipo] ?? d.tipo} ·{" "}
                          <span className="tnum">{formatShortDate(d.quando)}</span>
                        </p>
                      </div>
                      {toStatoRevisione(d.statoRevisione) === "pending" ? (
                        <Badge tone="attention">Da revisionare</Badge>
                      ) : (
                        <Badge>{ETICHETTE_REVISIONE[toStatoRevisione(d.statoRevisione)]}</Badge>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          {/* ── Visite ───────────────────────────────────────── */}
          {risultati.visite.length > 0 ? (
            <Riquadro titolo="Visite" conta={risultati.visite.length}>
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.visite.map((v) => (
                  <li key={v.id}>
                    <NavLink
                      href={`/pro/pazienti/${v.patientId}/visita`}
                      className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <p className="text-[15px] text-ink-900">
                        {v.servizio} — {v.paziente}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-500 first-letter:uppercase">
                        {formatWeekdayDayMonth(v.quando)} · ore{" "}
                        <span className="tnum">{formatTime(v.quando)}</span>
                      </p>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          {/* ── Task ─────────────────────────────────────────── */}
          {risultati.task.length > 0 ? (
            <Riquadro titolo="Task" conta={risultati.task.length}>
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.task.map((t) => (
                  <li key={t.id}>
                    <NavLink
                      href="/pro/task"
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-ink-900">{t.titolo}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {t.paziente ?? "Senza paziente"}
                          {t.scadenzaIl ? ` · entro il ${formatShortDate(t.scadenzaIl)}` : ""}
                        </p>
                      </div>
                      {t.stato !== "open" ? <Badge tone="positive">Chiuso</Badge> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          {/* ── Note cliniche ────────────────────────────────── */}
          {risultati.note.length > 0 ? (
            <Riquadro
              titolo="Note e valutazioni"
              conta={risultati.note.length}
              nota="Il testo compare in estratto: si apre nella cartella, dove ha il suo contesto."
            >
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.note.map((n) => (
                  <li key={n.id}>
                    <NavLink
                      href={`/pro/pazienti/${n.patientId}/clinico`}
                      className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                          {TIPO_NOTA[n.tipo] ?? n.tipo}
                        </span>
                        <span className="text-ink-500">{n.paziente}</span>
                        <span className="text-xs text-ink-300 tnum">
                          {formatShortDate(n.quando)}
                        </span>
                      </p>
                      {n.titolo ? (
                        <p className="mt-0.5 text-[15px] font-medium text-ink-900">
                          {n.titolo}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                        {n.estratto}
                      </p>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          {/* ── Knowledge base ───────────────────────────────── */}
          {risultati.conoscenza.length > 0 ? (
            <Riquadro
              titolo="Knowledge base"
              conta={risultati.conoscenza.length}
              nota="Solo ciò che è in vigore oggi. Il testo di ieri resta leggibile, ma non risponde più."
              tutto={{ label: "Tutta la knowledge base", href: "/pro/conoscenza" }}
            >
              <ul className="mt-2 divide-y divide-bone-200/80">
                {risultati.conoscenza.map((v) => (
                  <li key={v.entryId}>
                    <NavLink
                      href={`/pro/conoscenza/${v.slug}`}
                      className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
                    >
                      <p className="text-[15px] font-medium text-ink-900">{v.title}</p>
                      {v.summary ? (
                        <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                          {v.summary}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-ink-300">{v.provenienza}</p>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Riquadro>
          ) : null}

          <Riquadro titolo="Cosa non compare qui" apribile aperto={false}>
            <div className="px-6 py-4 text-sm leading-relaxed text-ink-500">
              <p>
                La ricerca guarda solo ciò che hai titolo di vedere: la Row Level
                Security filtra prima che questa pagina esista. Un paziente che
                non segui non compare, e non compare nemmeno una riga che dica
                che esiste.
              </p>
              <p className="mt-3">
                Restano fuori anche i valori delle misure e i punteggi: si
                cercano dal paziente, perché «182 mg/dL» senza la persona a cui
                appartiene non è un risultato utile a nessuno.
              </p>
            </div>
          </Riquadro>
        </div>
      )}
    </div>
  );
}
