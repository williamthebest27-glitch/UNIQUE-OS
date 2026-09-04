import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { conversazione } from "@/lib/data/paziente-sezioni";
import { inviaMessaggio, segnaConversazioneLetta } from "@/lib/patient/actions";
import { Modulo } from "@/components/patient/modulo";
import { formatShortDate, formatTime } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Conversazione" };
export const dynamic = "force-dynamic";
// Dato clinico: mai riusato dalla cache del router, nemmeno per un istante.
// Il perché, e cosa resta invece in cache, in docs/freschezza-dei-dati.md.
export const unstable_dynamicStaleTime = 0;

/**
 * Una conversazione.
 *
 * Aprirla la segna letta, come aprire una busta: chiedere al paziente di
 * premere «segna come letto» dopo averlo letto è lavoro che facciamo fare
 * a lui per comodità nostra.
 *
 * L'id nell'URL non è una chiave: la Row Level Security decide cosa si
 * vede, e una conversazione di un altro paziente non esiste per questa
 * pagina — `notFound()`, non un errore di permessi che confermerebbe
 * l'esistenza della riga.
 */

const CATEGORIA: Record<string, string> = {
  clinical: "Clinico",
  administrative: "Amministrativo",
};

export default async function ConversazionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dati = await conversazione(id);
  if (!dati) notFound();

  const { filo, messaggi } = dati;
  if (filo.nonLetti > 0) await segnaConversazioneLetta(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/messaggi" className="text-xs text-ink-400 transition-colors hover:text-ink-900">
          ← Messaggi
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-[28px] leading-tight text-ink-900 sm:text-[32px]">
            {filo.oggetto}
          </h1>
          <Badge tone={filo.categoria === "clinical" ? "brand" : "neutral"}>
            {CATEGORIA[filo.categoria] ?? filo.categoria}
          </Badge>
          {filo.chiusa ? <Badge>Chiusa</Badge> : null}
        </div>
      </div>

      <Card>
        <div className="space-y-4 p-6">
          {messaggi.length === 0 ? (
            <EmptyState>Nessun messaggio in questa conversazione.</EmptyState>
          ) : (
            messaggi.map((m) => (
              <div
                key={m.id}
                className={cx("flex", m.dalPaziente ? "justify-end" : "justify-start")}
              >
                <div className="max-w-[85%]">
                  <div
                    className={cx(
                      "rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                      m.dalPaziente ? "bg-ink-900 text-bone-50" : "bg-bone-100 text-ink-900",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.testo}</p>
                  </div>
                  <p
                    className={cx(
                      "mt-1 text-[11px] text-ink-400 tnum",
                      m.dalPaziente ? "text-right" : "text-left",
                    )}
                  >
                    {m.dalPaziente ? "Tu" : (m.autore ?? "Unique")} ·{" "}
                    {formatShortDate(m.creatoIl)} alle {formatTime(m.creatoIl)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {filo.chiusa ? (
          <div className="border-t border-bone-200 px-6 py-5">
            <p className="text-sm text-ink-500">
              Questa conversazione è chiusa. Per riprendere l&apos;argomento, aprine una
              nuova dai messaggi.
            </p>
          </div>
        ) : (
          <div className="border-t border-bone-200 px-6 py-5">
            <Modulo action={inviaMessaggio} invio="Invia">
              <input type="hidden" name="threadId" value={filo.id} />
              <textarea
                name="corpo"
                required
                rows={3}
                placeholder="Scrivi una risposta…"
                aria-label="La tua risposta"
                className="w-full resize-y rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
              />
            </Modulo>
          </div>
        )}
      </Card>
    </div>
  );
}
