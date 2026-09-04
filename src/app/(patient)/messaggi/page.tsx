import type { Metadata } from "next";
import Link from "next/link";
import { requirePatientDashboard } from "@/lib/data/patient";
import { conversazioni } from "@/lib/data/paziente-sezioni";
import { apriConversazione } from "@/lib/patient/actions";
import { SchedaInAttesa } from "@/components/patient/scheda-in-attesa";
import { PageHeading } from "@/components/shell/page-heading";
import { Modulo } from "@/components/patient/modulo";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatRelativeDays } from "@/lib/format";
import { Badge, Card, CardHeader, ChevronIcon, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Messaggi" };
export const dynamic = "force-dynamic";

/**
 * I messaggi.
 *
 * La categoria non è un'etichetta di comodo: decide chi legge. Un filo
 * **clinico** lo vedono solo il paziente e il suo care team; uno
 * **amministrativo** lo vede anche la segreteria, che è chi risponde di
 * appuntamenti e fatture. Lo diciamo in chiaro sotto il selettore,
 * perché chi scrive ha il diritto di sapere chi lo leggerà.
 */

const SEZIONE = sezioneDi("/messaggi")!;

const CATEGORIA: Record<string, { etichetta: string; chi: string }> = {
  clinical: { etichetta: "Clinico", chi: "Lo legge il tuo medico" },
  administrative: { etichetta: "Amministrativo", chi: "Lo legge la segreteria" },
};

export default async function MessaggiPage() {
  const data = await requirePatientDashboard();
  if (!data) return <SchedaInAttesa />;

  const fili = await conversazioni();
  const nonLetti = fili.reduce((s, f) => s + f.nonLetti, 0);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      <Card>
        <CardHeader
          title="Le tue conversazioni"
          action={nonLetti > 0 ? <Badge tone="brand">{nonLetti} da leggere</Badge> : undefined}
        />
        {fili.length === 0 ? (
          <EmptyState>
            Nessuna conversazione. Scrivine una qui sotto: ti risponde chi ti segue.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-bone-200/80 pb-2">
            {fili.map((filo) => (
              <li key={filo.id}>
                <Link
                  href={`/messaggi/${filo.id}`}
                  className="group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-bone-50"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-2 h-2 w-2 shrink-0 rounded-full",
                      filo.nonLetti > 0 ? "bg-brand-500" : "bg-bone-300",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span
                        className={cx(
                          "text-[15px] leading-snug",
                          filo.nonLetti > 0 ? "font-semibold text-ink-900" : "text-ink-900",
                        )}
                      >
                        {filo.oggetto}
                      </span>
                      <Badge tone={filo.categoria === "clinical" ? "brand" : "neutral"}>
                        {CATEGORIA[filo.categoria]?.etichetta ?? filo.categoria}
                      </Badge>
                      {filo.chiusa ? <Badge>Chiusa</Badge> : null}
                    </span>
                    {filo.anteprima ? (
                      <span className="mt-1 line-clamp-1 block text-sm text-ink-500">
                        {filo.anteprima}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-ink-400 first-letter:uppercase">
                      {formatRelativeDays(filo.ultimoMessaggioIl)}
                    </span>
                  </span>
                  <ChevronIcon className="mt-1.5 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Scrivi alla clinica" />
        <div className="px-6 pb-6 pt-3">
          <Modulo action={apriConversazione} invio="Invia">
            <div className="space-y-4">
              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Oggetto</span>
                <input
                  name="oggetto"
                  required
                  maxLength={120}
                  placeholder="Di cosa vuoi parlare"
                  className="mt-1.5 w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
              </label>

              <fieldset>
                <legend className="block text-[13px] font-medium text-ink-700">A chi</legend>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {(["clinical", "administrative"] as const).map((chiave) => (
                    <label
                      key={chiave}
                      className="flex cursor-pointer items-start gap-3 rounded-xl bg-bone-100 px-4 py-3 transition-colors has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        name="categoria"
                        value={chiave}
                        defaultChecked={chiave === "clinical"}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                      />
                      <span>
                        <span className="block text-[15px] text-ink-900">
                          {CATEGORIA[chiave].etichetta}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {CATEGORIA[chiave].chi}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Il messaggio</span>
                <textarea
                  name="corpo"
                  required
                  rows={5}
                  placeholder="Scrivi qui…"
                  className="mt-1.5 w-full resize-y rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
              </label>
            </div>
          </Modulo>
        </div>
      </Card>

      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-400">
        Questo canale non è un pronto soccorso. Per un&apos;urgenza chiama il 112 o
        rivolgiti al tuo medico curante: qui si risponde negli orari della clinica.
      </p>
    </div>
  );
}
