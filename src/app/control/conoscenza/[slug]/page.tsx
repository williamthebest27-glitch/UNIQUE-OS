import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { voceConStoria } from "@/lib/knowledge/queries";
import {
  archiviaVersione,
  nuovaVersione,
  pubblicaVersione,
} from "@/lib/knowledge/actions";
import { anomalieCatena } from "@/lib/knowledge/validity";
import { requireProfile } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import {
  AreaTesto,
  Bottone,
  Campo,
  Panel,
  Stato,
  Testo,
  Vuoto,
} from "@/components/control/primitives";
import { TIPI_CONOSCENZA } from "@/lib/knowledge/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const voce = await voceConStoria(slug);
  return { title: voce?.title ?? "Informazione" };
}

/**
 * Una informazione e la sua storia.
 *
 * La versione in vigore sta in alto perché è quella che conta. Sotto c'è
 * la catena: chi ha scritto cosa, da quando valeva, chi l'ha autorizzata.
 * Serve a rispondere a un paziente che arriva con un preventivo di sei
 * mesi fa — e a spiegargli perché il numero era quello.
 */

const STATI: Record<string, { label: string; tono: "neutro" | "buono" | "avviso" | "spento" }> = {
  draft: { label: "Bozza", tono: "avviso" },
  active: { label: "In vigore", tono: "buono" },
  superseded: { label: "Superata", tono: "spento" },
  archived: { label: "Archiviata", tono: "spento" },
};

export default async function VocePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [voce, profile] = await Promise.all([voceConStoria(slug), requireProfile()]);

  if (!voce) notFound();

  const puoPubblicare = ["admin", "owner"].includes(profile.role);
  const anomalie = anomalieCatena(voce.versioni);
  const corrente = voce.corrente;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/control/conoscenza" className="text-sm text-bone-50/40 hover:text-bone-50/70">
          ← Knowledge base
        </Link>
        <h1 className="mt-2 font-display text-[28px] leading-tight text-bone-50">{voce.title}</h1>
        <p className="mt-1.5 text-sm text-bone-50/45">
          {TIPI_CONOSCENZA[voce.kind] ?? voce.kind} · {voce.slug}
          {voce.audience === "public" ? " · pubblica" : " · interna"}
        </p>
      </div>

      {/* ── Quello che è vero adesso ────────────────────────────── */}
      <Panel
        title="In vigore"
        hint={corrente ? corrente.provenienza : "Nessuna versione attiva: il Brain non risponderà su questo argomento."}
      >
        {corrente ? (
          <div className="px-5 pb-5 pt-1">
            {corrente.summary ? (
              <p className="text-[15px] text-bone-50/80">{corrente.summary}</p>
            ) : null}
            <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-bone-50/70">
              {corrente.body}
            </div>
            {Object.keys(corrente.data).length > 0 ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-white/[0.04] p-3 font-mono text-[12px] text-bone-50/60">
                {JSON.stringify(corrente.data, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : (
          <Vuoto>
            Tutte le versioni sono bozze, superate o archiviate. Finché non se ne
            pubblica una, questa informazione non esiste per il resto del sistema.
          </Vuoto>
        )}
      </Panel>

      {anomalie.length > 0 ? (
        <Panel title="Difetti della catena" hint="Giorni in cui il sistema non sapeva rispondere, o rispondeva in due modi.">
          <ul className="pb-2">
            {anomalie.map((a, i) => (
              <li
                key={`${a.tipo}-${i}`}
                className="border-t border-white/[0.07] px-5 py-3 text-sm text-gold-300 first:border-t-0"
              >
                {a.tipo === "buco" ? "Buco" : "Sovrapposizione"} fra la versione{" "}
                {a.versioni[0]} e la {a.versioni[1]}: dal {a.da} al {a.a}.
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* ── La storia ───────────────────────────────────────────── */}
      <Panel title="Versioni" hint="Dalla più recente. Nulla viene mai riscritto.">
        <ul className="pb-2">
          {voce.versioni.map((v) => {
            const stato = STATI[v.status] ?? { label: v.status, tono: "neutro" as const };
            return (
              <li key={v.id} className="border-t border-white/[0.07] px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <span className="flex items-center gap-3">
                    <span className="font-display text-[18px] text-bone-50 tnum">v{v.version}</span>
                    <Stato tono={stato.tono}>{stato.label}</Stato>
                  </span>
                  <span className="text-xs text-bone-50/40">
                    dal {v.validFrom}
                    {v.validTo ? ` al ${v.validTo}` : ""}
                    {v.authorName ? ` · ${v.authorName}` : ""}
                    {v.approvedAt ? ` · autorizzata il ${formatShortDate(v.approvedAt)}` : ""}
                  </span>
                </div>

                {v.changeNote ? (
                  <p className="mt-1.5 text-sm text-bone-50/60">{v.changeNote}</p>
                ) : null}

                {v.status === "draft" && puoPubblicare ? (
                  <form action={pubblicaVersione} className="mt-3">
                    <input type="hidden" name="versionId" value={v.id} />
                    <input type="hidden" name="slug" value={voce.slug} />
                    <Bottone type="submit">Metti in vigore</Bottone>
                  </form>
                ) : null}

                {v.status === "active" && puoPubblicare ? (
                  <form action={archiviaVersione} className="mt-3">
                    <input type="hidden" name="versionId" value={v.id} />
                    <input type="hidden" name="entryId" value={voce.entryId} />
                    <input type="hidden" name="slug" value={voce.slug} />
                    <Bottone type="submit" variante="pericolo">
                      Archivia
                    </Bottone>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── La prossima versione ────────────────────────────────── */}
      <Panel
        title="Nuova versione"
        hint="Nasce in bozza. Pubblicandola, quella di adesso si chiude il giorno prima."
      >
        <form action={nuovaVersione} className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-2">
          <input type="hidden" name="entryId" value={voce.entryId} />
          <input type="hidden" name="slug" value={voce.slug} />

          <div className="sm:col-span-2">
            <Campo label="Titolo">
              <Testo name="title" defaultValue={corrente?.title ?? voce.title} />
            </Campo>
          </div>

          <div className="sm:col-span-2">
            <Campo label="Sintesi">
              <Testo name="summary" defaultValue={corrente?.summary ?? ""} />
            </Campo>
          </div>

          <div className="sm:col-span-2">
            <Campo label="Contenuto">
              <AreaTesto name="body" required defaultValue={corrente?.body ?? ""} />
            </Campo>
          </div>

          <div className="sm:col-span-2">
            <Campo
              label="Dati strutturati"
              hint="JSON. Serve quando l'informazione è un numero su cui si fanno i conti."
            >
              <AreaTesto
                name="data"
                className="min-h-[5rem]"
                defaultValue={
                  corrente && Object.keys(corrente.data).length > 0
                    ? JSON.stringify(corrente.data, null, 2)
                    : ""
                }
              />
            </Campo>
          </div>

          <Campo label="In vigore dal">
            <Testo type="date" name="validFrom" />
          </Campo>

          <Campo label="Cosa cambia" hint="Chi legge fra un anno deve capire perché.">
            <Testo name="changeNote" placeholder="Aggiornamento prezzo da 129 a 149 €." />
          </Campo>

          <div className="sm:col-span-2">
            <Bottone type="submit">Salva la bozza</Bottone>
          </div>
        </form>
      </Panel>
    </div>
  );
}
