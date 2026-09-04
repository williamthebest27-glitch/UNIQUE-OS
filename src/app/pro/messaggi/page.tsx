import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getFiliClinici } from "@/lib/data/messaggi";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeading } from "@/components/shell/page-heading";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, Card, EmptyState, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Messaggi" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * La coda dei messaggi.
 *
 * Tre elenchi, e l'ordine è quello del lavoro: prima ciò a cui nessuno
 * ha risposto, poi le conversazioni vive, poi quelle amministrative —
 * che sono di un'altra persona e stanno qui solo perché un
 * professionista possa vederle se serve.
 *
 * «Tocca a noi» non è la stessa cosa di «non letto»: un filo può essere
 * stato aperto da un collega — quindi letto — e restare senza risposta.
 * Sono due code diverse, e confonderle è il modo in cui una domanda di
 * un paziente resta ferma tre giorni con il pallino spento.
 */
export default async function MessaggiPage() {
  const profile = await requireProfile();
  if (profile.role === "patient") redirect("/dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeading title="Messaggi" />
        <Card className="mt-8">
          <EmptyState>
            Supabase non è collegato: in modalità dimostrativa non ci sono
            conversazioni.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const fili = await getFiliClinici(false);

  const daLeggere = fili.filter((f) => !f.chiuso && f.nonLetti > 0);
  const inAttesa = fili.filter((f) => !f.chiuso && f.nonLetti === 0 && f.toccaANoi);
  const cliniche = fili.filter(
    (f) => !f.chiuso && f.categoria === "clinical" && f.nonLetti === 0 && !f.toccaANoi,
  );
  const amministrative = fili.filter(
    (f) => !f.chiuso && f.categoria === "administrative" && f.nonLetti === 0 && !f.toccaANoi,
  );
  const chiuse = fili.filter((f) => f.chiuso);

  return (
    <div>
      <PageHeading
        title="Messaggi"
        subtitle="Le conversazioni con i pazienti che segui. Un filo clinico lo vedono il paziente e il care team; uno amministrativo anche la reception."
      />

      <div className="mt-6 space-y-6">
        <Riquadro
          titolo="Da leggere"
          conta={daLeggere.length}
          nota="Il paziente ha scritto e nessuno di noi ha ancora aperto."
        >
          {daLeggere.length === 0 ? (
            <Niente>Niente di non letto.</Niente>
          ) : (
            <Elenco fili={daLeggere} />
          )}
        </Riquadro>

        <Riquadro
          titolo="In attesa di risposta"
          conta={inAttesa.length}
          nota="Letti, ma l’ultima parola è del paziente. È la coda che si dimentica più facilmente."
        >
          {inAttesa.length === 0 ? (
            <Niente>Nessuna conversazione in attesa.</Niente>
          ) : (
            <Elenco fili={inAttesa} />
          )}
        </Riquadro>

        <Riquadro titolo="Conversazioni cliniche" conta={cliniche.length} apribile aperto={false}>
          {cliniche.length === 0 ? (
            <Niente>Nessun'altra conversazione clinica aperta.</Niente>
          ) : (
            <Elenco fili={cliniche} />
          )}
        </Riquadro>

        <Riquadro
          titolo="Amministrative"
          conta={amministrative.length}
          nota="Le risponde la reception. Sono qui perché tu possa vederle, non perché tocchino a te."
          apribile
          aperto={false}
        >
          {amministrative.length === 0 ? (
            <Niente>Nessuna conversazione amministrativa aperta.</Niente>
          ) : (
            <Elenco fili={amministrative} />
          )}
        </Riquadro>

        {chiuse.length > 0 ? (
          <Riquadro titolo="Chiuse" conta={chiuse.length} apribile aperto={false}>
            <Elenco fili={chiuse} />
          </Riquadro>
        ) : null}
      </div>
    </div>
  );
}

function Elenco({ fili }: { fili: Awaited<ReturnType<typeof getFiliClinici>> }) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {fili.map((f) => (
        <li key={f.id}>
          <NavLink
            href={`/pro/messaggi/${f.id}`}
            className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p
                  className={cx(
                    "text-[15px]",
                    f.nonLetti > 0 ? "font-medium text-ink-900" : "text-ink-900",
                  )}
                >
                  {f.oggetto}
                </p>
                <p className="mt-0.5 text-sm text-ink-500">{f.paziente}</p>
              </div>

              <div className="flex items-center gap-2">
                {f.categoria === "administrative" ? <Badge>Amministrativo</Badge> : null}
                {f.chiuso ? <Badge>Chiusa</Badge> : null}
                {f.nonLetti > 0 ? (
                  <Badge tone="attention">{f.nonLetti} da leggere</Badge>
                ) : f.toccaANoi && !f.chiuso ? (
                  <Badge tone="brand">Tocca a noi</Badge>
                ) : null}
              </div>
            </div>

            {f.anteprima ? (
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{f.anteprima}</p>
            ) : null}

            <p className="mt-1 text-xs text-ink-300 first-letter:uppercase">
              {formatRelativeDays(f.ultimoIl)} · {formatShortDate(f.ultimoIl)}
            </p>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
