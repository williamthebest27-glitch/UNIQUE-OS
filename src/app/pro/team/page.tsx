import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile, requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { elencoProfessionisti } from "@/lib/data/gestione";
import { DISCIPLINE_LABELS, pillarsFor, type Discipline } from "@/lib/professionals/disciplines";
import { PILLAR_LABELS, type PillarKey } from "@/lib/score/pillars";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

const GIORNI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

/**
 * La squadra.
 *
 * Chi c'è, che disciplina ha, su quali pilastri può **scrivere**, quando
 * riceve e quanto lavoro ha aperto.
 *
 * La colonna che vale più di tutte è quella degli ambiti di competenza,
 * ed è anche quella che nessuno pensa a chiedere: leggere una cartella è
 * di tutto il care team — la storia clinica si legge intera o non si
 * capisce — ma **scrivere** una misura è per disciplina. Sapere che un
 * osteopata non può validare un pannello lipidico evita di passargli un
 * referto e scoprirlo dopo, quando Postgres lo rifiuta.
 *
 * I conteggi sui pazienti sono ristretti dalla Row Level Security a chi
 * questa persona e chi guarda hanno **in comune**: è corretto — nessuno
 * deve poter contare i pazienti di un collega — e va scritto in pagina,
 * o il numero sembra sbagliato.
 */
export default async function TeamPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Team" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non c’è una squadra
            da mostrare.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();

  const [professionisti, io, assegnazioniRes, taskRes] = await Promise.all([
    elencoProfessionisti(),
    getCurrentProfile(),
    supabase.from("care_team_members").select("professional_id").is("ended_at", null).limit(2000),
    supabase
      .from("tasks")
      .select("owner_id, professional_id")
      .eq("status", "open")
      .limit(400),
  ]);

  const pazientiPer = new Map<string, number>();
  for (const a of (assegnazioniRes.data ?? []) as { professional_id: string }[]) {
    pazientiPer.set(a.professional_id, (pazientiPer.get(a.professional_id) ?? 0) + 1);
  }

  const taskPerProfilo = new Map<string, number>();
  const taskPerPro = new Map<string, number>();
  for (const t of (taskRes.data ?? []) as {
    owner_id: string | null;
    professional_id: string | null;
  }[]) {
    if (t.owner_id) taskPerProfilo.set(t.owner_id, (taskPerProfilo.get(t.owner_id) ?? 0) + 1);
    if (t.professional_id) {
      taskPerPro.set(t.professional_id, (taskPerPro.get(t.professional_id) ?? 0) + 1);
    }
  }

  const attivi = professionisti.filter((p) => p.attivo);
  const inattivi = professionisti.filter((p) => !p.attivo);

  return (
    <div>
      <PageHeading
        title="Team"
        subtitle="Chi c’è, su cosa può scrivere, quando riceve. Leggere una cartella è di tutto il care team; scrivere una misura è per disciplina."
      />

      <Riquadro
        titolo="Professionisti"
        conta={attivi.length}
        nota="I conteggi dei pazienti mostrano solo quelli che tu e il collega avete in comune: la Row Level Security non lascia contare i pazienti altrui."
        className="mt-6"
      >
        {attivi.length === 0 ? (
          <Niente>Nessun professionista attivo.</Niente>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {attivi.map((p) => {
              const sono = p.profileId === io?.id;
              const ambiti = pillarsFor(p.disciplina as Discipline);
              const task =
                (taskPerProfilo.get(p.profileId) ?? 0) + (taskPerPro.get(p.id) ?? 0);

              return (
                <li key={p.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="text-[15px] font-medium text-ink-900">
                          {[p.titolo, p.nome].filter(Boolean).join(" ")}
                        </span>
                        <Badge tone={sono ? "brand" : "neutral"}>
                          {DISCIPLINE_LABELS[p.disciplina as Discipline] ?? p.disciplina}
                        </Badge>
                        {sono ? <span className="text-xs text-brand-600">sei tu</span> : null}
                      </p>

                      {p.specialita ? (
                        <p className="mt-0.5 text-sm text-ink-500">{p.specialita}</p>
                      ) : null}

                      {p.sede ? (
                        <p className="mt-0.5 text-xs text-ink-400">{p.sede}</p>
                      ) : null}

                      {/* Su cosa può scrivere: la regola che conta. */}
                      <div className="mt-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
                          Può scrivere su
                        </p>
                        {ambiti === "all" ? (
                          <p className="mt-1 text-sm text-ink-700">
                            Tutti i pilastri. Può approvare un valore fuori soglia clinica.
                          </p>
                        ) : ambiti.length === 0 ? (
                          <p className="mt-1 text-sm text-ink-400">
                            Nessun pilastro dichiarato: non scrive misure. Il valore
                            predefinito è restrittivo, così un ruolo mancante non apre un
                            varco.
                          </p>
                        ) : (
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {ambiti.map((pilastro) => (
                              <li
                                key={pilastro}
                                className="rounded-full bg-bone-100 px-2.5 py-0.5 text-xs text-ink-600 ring-1 ring-bone-200"
                              >
                                {PILLAR_LABELS[pilastro as PillarKey] ?? pilastro}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <dl className="flex shrink-0 gap-6 text-right">
                      <Cifra
                        etichetta="Pazienti in comune"
                        valore={pazientiPer.get(p.id) ?? 0}
                      />
                      <Cifra etichetta="Task aperti" valore={task} />
                      <Cifra etichetta="Slot liberi" valore={p.slotFuturi} />
                    </dl>
                  </div>

                  {/* Gli orari: quando è raggiungibile. */}
                  {p.turni.length > 0 ? (
                    <details className="mt-3 group">
                      <summary className="cursor-pointer list-none text-sm text-ink-400 transition-colors hover:text-ink-700 [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Orari settimanali →</span>
                        <span className="hidden group-open:inline">Orari settimanali</span>
                      </summary>
                      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                        {[...p.turni]
                          .sort((a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt))
                          .map((t) => (
                            <li
                              key={`${t.weekday}-${t.startsAt}`}
                              className="text-sm text-ink-600"
                            >
                              <span className="text-ink-400">{GIORNI[t.weekday] ?? "—"}</span>{" "}
                              <span className="tnum">
                                {t.startsAt}–{t.endsAt}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="mt-3 text-sm text-ink-300">
                      Nessun orario settimanale pubblicato.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Riquadro>

      {inattivi.length > 0 ? (
        <Riquadro titolo="Non attivi" conta={inattivi.length} apribile aperto={false} className="mt-6">
          <ul className="divide-y divide-bone-200/80">
            {inattivi.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3"
              >
                <span className="text-[15px] text-ink-400">
                  {[p.titolo, p.nome].filter(Boolean).join(" ")}
                </span>
                <span className="text-xs text-ink-300">
                  {DISCIPLINE_LABELS[p.disciplina as Discipline] ?? p.disciplina}
                </span>
              </li>
            ))}
          </ul>
        </Riquadro>
      ) : null}

      <Riquadro titolo="Come funzionano i permessi" apribile aperto={false} className="mt-6">
        <div className="space-y-3 px-6 py-4 text-sm leading-relaxed text-ink-600">
          <p>
            <strong className="font-medium text-ink-900">Leggere</strong> è a livello di
            paziente: chi fa parte del care team vede tutta la cartella, perché una
            storia clinica si legge intera o non si capisce. A imporlo è{" "}
            <code className="font-mono text-xs">can_access_patient()</code> nel database,
            non un controllo nell&apos;interfaccia.
          </p>
          <p>
            <strong className="font-medium text-ink-900">Scrivere</strong> è per
            disciplina, e le regole vivono nel codice insieme al catalogo delle metriche —
            che è versionato con l&apos;algoritmo dello Score.
          </p>
          <p>
            <strong className="font-medium text-ink-900">Approvare</strong> un valore
            fuori soglia clinica richiede un medico, e questa è nel database:{" "}
            <code className="font-mono text-xs">can_approve_clinical_flag()</code>.
          </p>
          <p className="text-ink-400">
            Le assegnazioni al care team si gestiscono dalla control room, non da qui:
            cambiare chi vede una cartella è una decisione di direzione.
          </p>
        </div>
      </Riquadro>
    </div>
  );
}

function Cifra({ etichetta, valore }: { etichetta: string; valore: number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
        {etichetta}
      </dt>
      <dd
        className={cx(
          "mt-1 font-display text-[22px] leading-none tnum",
          valore === 0 ? "text-ink-300" : "text-ink-900",
        )}
      >
        {valore}
      </dd>
    </div>
  );
}
