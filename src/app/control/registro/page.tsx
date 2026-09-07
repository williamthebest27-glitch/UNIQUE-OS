import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  eNotevole,
  frase,
  getRegistroAccessi,
  verificaCatena,
} from "@/lib/data/registro";
import { SEZIONI_CONTROL } from "@/lib/sezioni";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { Panel, Stato, Vuoto } from "@/components/control/primitives";

export const metadata: Metadata = { title: "Registro" };
export const dynamic = "force-dynamic";

/**
 * Il registro degli accessi e delle modifiche.
 *
 * Una riga per gesto, in una frase che si legge senza conoscere lo
 * schema: «William ha aperto la cartella di Marta Bellini, 10:42».
 *
 * ---
 *
 * Ci sono due registri in Unique e questa pagina ne mostra uno solo,
 * perché rispondono a due domande diverse. `domain_events` dice **cosa
 * è cambiato** — è il sistema nervoso da cui partono notifiche e
 * automazioni. `audit_log` dice **chi ha fatto cosa**, ed è quello che
 * un garante chiede di vedere. Fino a poco fa il secondo conteneva solo
 * le letture; adesso i sei tipi di scrittura che contano ci finiscono
 * per trigger, quindi «chi ha modificato la terapia» e «chi ha aperto
 * la cartella» stanno finalmente nello stesso elenco.
 *
 * **La verifica in cima non è decorazione.** Ogni riga porta l'impronta
 * della precedente dentro la propria: ricalcolare la catena e trovarla
 * intera è la prova che nessuna riga è stata cambiata da quando è stata
 * scritta. Non è una probabilità — o tornano tutte, o si sa da quale
 * riga in poi non tornano. È l'unica proprietà ottenibile, perché
 * nessun database può impedire una modifica a chi ha le chiavi; e
 * basta, perché ciò che serve in un contenzioso non è l'impossibilità
 * ma l'evidenza.
 */
export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "owner") redirect("/control");

  const sezione = SEZIONI_CONTROL["/control/registro"];

  if (!isSupabaseConfigured()) {
    return (
      <Panel title={sezione.title}>
        <Vuoto>Supabase non è collegato: il registro vive nel database.</Vuoto>
      </Panel>
    );
  }

  const { giorni: giorniGrezzi } = await searchParams;
  const giorni = [7, 30, 90, 365].includes(Number(giorniGrezzi))
    ? Number(giorniGrezzi)
    : 30;

  const [righe, catena] = await Promise.all([
    getRegistroAccessi({ giorni, quante: 500 }),
    verificaCatena(),
  ]);

  // Raggruppare per giorno: cinquecento righe con la data su ciascuna si
  // leggono come rumore, e la domanda che ci si porta dentro è quasi
  // sempre «quel giorno lì».
  const giorniMappa = new Map<string, typeof righe>();
  for (const r of righe) {
    const g = r.quando.slice(0, 10);
    giorniMappa.set(g, [...(giorniMappa.get(g) ?? []), r]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-bone-50">
          {sezione.title}
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-sm text-bone-50/50">{sezione.subtitle}</p>
      </div>

      {/* ── L'integrità ──────────────────────────────────────── */}
      <Panel
        title="Integrità della catena"
        hint="Ogni riga porta l'impronta della precedente. Ricalcolarle tutte e trovarle intere è la prova che nessuna è stata cambiata."
      >
        <div className="px-5 pb-5 pt-2">
          {!catena.eseguita ? (
            <p className="text-sm text-gold-300">
              Verifica non eseguita — {catena.motivo}
            </p>
          ) : catena.integra ? (
            <div className="flex flex-wrap items-center gap-3">
              <Stato tono="buono">Catena integra</Stato>
              <p className="text-sm text-bone-50/60">
                Ogni impronta ricalcolata coincide con quella scritta. Nessuna riga
                è stata modificata da quando è stata registrata.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Stato tono="avviso">Catena interrotta</Stato>
                <p className="text-sm text-bone-50/70">
                  {catena.rotture.length}{" "}
                  {catena.rotture.length === 1 ? "riga non torna" : "righe non tornano"}.
                  La prima è la {catena.rotture[0]?.id}.
                </p>
              </div>
              <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-bone-50/50">
                Una rottura significa che una riga è stata modificata o cancellata
                dopo essere stata scritta, scavalcando il trigger che lo impedisce —
                cosa che richiede i privilegi del proprietario del database. Tutte le
                righe successive alla prima rottura risultano incoerenti anche se non
                sono state toccate: è così che funziona una catena.
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Il periodo ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90, 365].map((g) => (
          <Link
            key={g}
            href={`/control/registro?giorni=${g}`}
            aria-current={giorni === g ? "page" : undefined}
            className={
              giorni === g
                ? "rounded-full bg-brand-500/15 px-3 py-1.5 text-sm font-medium text-brand-300"
                : "rounded-full border border-white/12 px-3 py-1.5 text-sm text-bone-50/60 transition-colors hover:text-bone-50"
            }
          >
            {g === 365 ? "Un anno" : `${g} giorni`}
          </Link>
        ))}
        <span className="text-sm text-bone-50/35 tnum">
          {righe.length} {righe.length === 1 ? "riga" : "righe"}
        </span>
      </div>

      {/* ── Le righe ─────────────────────────────────────────── */}
      {righe.length === 0 ? (
        <Panel title="Gesti registrati">
          <Vuoto>
            Nessuna riga nel periodo. Il registro si popola da sé: ogni apertura di
            cartella, ogni terapia modificata, ogni esame validato.
          </Vuoto>
        </Panel>
      ) : (
        [...giorniMappa.entries()].map(([giorno, elenco]) => (
          <Panel
            key={giorno}
            title={formatShortDate(`${giorno}T12:00:00Z`)}
            hint={`${formatRelativeDays(`${giorno}T12:00:00Z`)} · ${elenco.length} ${
              elenco.length === 1 ? "gesto" : "gesti"
            }`}
          >
            <ul>
              {elenco.map((r) => {
                const { verbo, oggetto } = frase(r.azione, r.entita);
                const notevole = eNotevole(r.azione);

                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-white/[0.07] px-5 py-2.5 first:border-t-0"
                  >
                    <span className="w-14 shrink-0 text-xs text-bone-50/35 tnum">
                      {formatTime(r.quando)}
                    </span>

                    <span
                      className={
                        notevole
                          ? "text-[15px] font-medium text-bone-50"
                          : "text-[15px] text-bone-50"
                      }
                    >
                      {r.attore}
                    </span>

                    <span className="text-sm text-bone-50/50">
                      {verbo}
                      {oggetto ? ` ${oggetto}` : ""}
                    </span>

                    {r.pazienteId ? (
                      <Link
                        href={`/control/pazienti/${r.pazienteId}`}
                        className="text-sm text-brand-300 underline-offset-4 hover:underline"
                      >
                        {r.paziente}
                      </Link>
                    ) : null}

                    {/* I dettagli che rendono leggibile la riga fra un
                        anno: il farmaco, il pannello, il parametro. Mai
                        il contenuto clinico per intero. */}
                    {Object.entries(r.dettagli).length > 0 ? (
                      <span className="text-xs text-bone-50/35">
                        {Object.entries(r.dettagli)
                          .filter(([, v]) => v !== null && v !== "")
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </span>
                    ) : null}

                    {notevole ? <Stato tono="avviso">Rilevante</Stato> : null}

                    {!r.sigillata ? (
                      <span
                        title="Scritta prima che la catena esistesse: non verificabile."
                        className="text-xs text-bone-50/25"
                      >
                        non sigillata
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}

      <p className="max-w-[70ch] text-xs leading-relaxed text-bone-50/35">
        Il registro non si scrive dal browser e non si modifica da nessuna parte:
        le righe le producono funzioni <code className="font-mono">security definer</code> e
        un trigger rifiuta ogni <code className="font-mono">update</code> e{" "}
        <code className="font-mono">delete</code>, anche a chi ha la chiave di
        servizio. Resta scavalcabile da un superuser che disabiliti il trigger — ed è
        precisamente per quel caso che esiste la catena di impronte.
      </p>
    </div>
  );
}
