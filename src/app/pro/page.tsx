import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { esci } from "@/lib/auth-actions";
import { Badge, Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Area professionale" };
export const dynamic = "force-dynamic";

const IN_ARRIVO = [
  ["Elenco pazienti", "I pazienti assegnati al tuo care team, con il loro Score."],
  ["Scheda clinica", "Storico, biomarcatori, referti e note in un’unica vista."],
  ["Caricamento referti", "Esami e piani di cura, direttamente nel percorso del paziente."],
  ["Azioni consigliate", "Le indicazioni che il paziente vede nella sua home."],
  ["Agenda", "Le tue visite, con conferme e disponibilità."],
];

export default async function ProPage() {
  const profile = await requireProfile();

  // Un paziente qui non ci deve arrivare: ha una sua home.
  if (profile.role === "patient") redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col px-5 py-12 sm:px-8">
      <div>
        <span className="block font-display text-[22px] leading-none tracking-[0.18em] text-ink-900">
          UNIQUE
        </span>
        <span className="mt-1.5 block text-[9px] font-medium uppercase tracking-[0.28em] text-ink-400">
          Longevity Clinic
        </span>
      </div>

      <Card className="mt-10 p-7 sm:p-9">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] leading-tight text-ink-900">
            Area professionale
          </h1>
          <Badge tone="gold">In costruzione</Badge>
        </div>

        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          Ciao {profile.firstName ?? profile.fullName}. Il tuo accesso funziona e il
          ruolo è riconosciuto, ma questo livello di Unique OS non è ancora stato
          costruito. Ecco cosa ci arriverà.
        </p>

        <ul className="mt-7 divide-y divide-bone-200/80">
          {IN_ARRIVO.map(([titolo, dettaglio]) => (
            <li key={titolo} className="py-3.5">
              <h2 className="text-[15px] font-medium text-ink-900">{titolo}</h2>
              <p className="mt-0.5 text-sm text-ink-500">{dettaglio}</p>
            </li>
          ))}
        </ul>

        <form action={esci} className="mt-7">
          <button
            type="submit"
            className="text-sm text-ink-400 transition-colors hover:text-ink-700"
          >
            Esci
          </button>
        </form>
      </Card>
    </main>
  );
}
