import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CONSENSI_OBBLIGATORI,
  ETICHETTE_CONSENSO,
  profilo,
  type TipoConsenso,
} from "@/lib/data/paziente-sezioni";
import { aggiornaRecapiti, decidiConsenso, salvaPreferenze } from "@/lib/patient/actions";
import { Interruttore, Modulo } from "@/components/patient/modulo";
import { PageHeading } from "@/components/shell/page-heading";
import { sezioneDi } from "@/lib/patient/sezioni";
import { formatShortDate } from "@/lib/format";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Profilo e privacy" };
export const dynamic = "force-dynamic";

/**
 * Profilo, preferenze, consensi.
 *
 * Il paziente cambia i propri recapiti e le proprie scelte. **Non cambia
 * dati clinici**: data di nascita, codice fiscale e misure sono dati di
 * cartella, e una cartella clinica non si riscrive dall'app di chi ne è
 * il soggetto. Lo diciamo in pagina, invece di limitarci a disabilitare
 * un campo senza spiegare perché.
 *
 * I consensi si registrano, non si aggiornano: revocare scrive una riga
 * nuova. Cancellare la concessione precedente cancellerebbe anche la
 * prova di averla avuta.
 */

const SEZIONE = sezioneDi("/profilo")!;

const ORDINE: TipoConsenso[] = ["privacy_policy", "health_data", "marketing", "research"];

const PREFERENZE: { campo: string; etichetta: string; spiegazione: string }[] = [
  {
    campo: "appointmentReminders",
    etichetta: "Promemoria degli appuntamenti",
    spiegazione: "Un avviso prima di ogni visita.",
  },
  {
    campo: "results",
    etichetta: "Nuovi referti e risultati",
    spiegazione: "Quando un documento nuovo entra nella tua cartella.",
  },
  {
    campo: "messages",
    etichetta: "Messaggi dalla clinica",
    spiegazione: "Quando chi ti segue ti scrive.",
  },
  {
    campo: "email",
    etichetta: "Ricevili anche per email",
    spiegazione: "Senza questa spunta gli avvisi restano solo dentro Unique OS.",
  },
];

export default async function ProfiloPage() {
  const p = await profilo();
  if (!p) redirect("/accedi");

  const consensoDi = (tipo: TipoConsenso) => p.consensi.find((c) => c.tipo === tipo);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeading title={SEZIONE.titolo} subtitle={SEZIONE.sottotitolo} />

      {/* ── Recapiti ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="I tuoi dati"
          hint="Nome, cognome e telefono li aggiorni tu. Il resto è cartella clinica."
        />
        <div className="px-6 pb-6 pt-3">
          <Modulo action={aggiornaRecapiti} invio="Salva" variante="quieto">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Nome</span>
                <input
                  name="nome"
                  required
                  defaultValue={p.nome}
                  className="mt-1.5 w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Cognome</span>
                <input
                  name="cognome"
                  defaultValue={p.cognome ?? ""}
                  className="mt-1.5 w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Telefono</span>
                <input
                  name="telefono"
                  type="tel"
                  defaultValue={p.telefono ?? ""}
                  className="mt-1.5 w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-ink-700">Email</span>
                <input
                  value={p.email ?? ""}
                  readOnly
                  disabled
                  className="mt-1.5 w-full rounded-xl bg-bone-100 px-4 py-3 text-[15px] text-ink-400"
                />
                <span className="mt-1 block text-xs text-ink-400">
                  È la tua chiave d&apos;accesso: per cambiarla scrivi alla segreteria.
                </span>
              </label>
            </div>
          </Modulo>
        </div>
      </Card>

      {/* ── Consensi ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Consensi"
          hint="Ogni scelta viene registrata con la data. Revocare non cancella lo storico."
        />
        <div className="divide-y divide-bone-200/80">
          {ORDINE.map((tipo) => {
            const consenso = consensoDi(tipo);
            const obbligatorio = CONSENSI_OBBLIGATORI.includes(tipo);
            const etichette = ETICHETTE_CONSENSO[tipo];

            return (
              <div key={tipo}>
                <Interruttore
                  action={decidiConsenso}
                  attivo={consenso?.concesso ?? false}
                  campi={{ tipo }}
                  bloccato={obbligatorio}
                  etichetta={etichette.titolo}
                  spiegazione={etichette.spiegazione}
                />
                <p className="-mt-2 px-6 pb-3 text-xs text-ink-400">
                  {obbligatorio ? <Badge tone="attention">Necessario</Badge> : null}{" "}
                  {consenso
                    ? `${consenso.concesso ? "Concesso" : "Revocato"} il ${formatShortDate(consenso.decisoIl)} · informativa ${consenso.versione}`
                    : "Mai espresso."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Preferenze ───────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Come vuoi essere avvisato" />
        <div className="px-6 pb-6 pt-3">
          <Modulo action={salvaPreferenze} invio="Salva le preferenze" variante="quieto">
            <div className="space-y-1">
              {PREFERENZE.map((pref) => (
                <label
                  key={pref.campo}
                  className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bone-50"
                >
                  <input
                    type="checkbox"
                    name={pref.campo}
                    defaultChecked={
                      p.preferenze[pref.campo as keyof typeof p.preferenze] ?? true
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span>
                    <span className="block text-[15px] text-ink-900">{pref.etichetta}</span>
                    <span className="mt-0.5 block text-sm text-ink-500">{pref.spiegazione}</span>
                  </span>
                </label>
              ))}
            </div>
          </Modulo>
        </div>
      </Card>

      {/* ── Sicurezza e diritti ──────────────────────────────────── */}
      <Card>
        <CardHeader title="Sicurezza e diritti" />
        <div className="space-y-4 px-6 pb-6 pt-3 text-[15px] leading-relaxed text-ink-500">
          <p>
            La password si cambia dalla pagina di accesso, con{" "}
            <Link href="/accedi" className="text-ink-900 underline underline-offset-2">
              «Ho dimenticato la password»
            </Link>
            : ti arriva un collegamento per email e ne scegli una nuova.
          </p>
          <p>
            I tuoi dati sanitari restano sull&apos;infrastruttura di Unique, in
            Unione Europea, e non vengono mandati a servizi esterni per essere
            elaborati. L&apos;assistente che trovi in{" "}
            <Link href="/assistente" className="text-ink-900 underline underline-offset-2">
              Chiedi a Unique
            </Link>{" "}
            gira sul motore proprietario: le tue domande non escono da qui.
          </p>
          <p>
            Per ottenere una copia dei tuoi dati, correggerli o chiederne la
            cancellazione, scrivi dai{" "}
            <Link href="/messaggi" className="text-ink-900 underline underline-offset-2">
              messaggi
            </Link>
            : è un diritto e la richiesta viene tracciata.
          </p>
        </div>
      </Card>
    </div>
  );
}
