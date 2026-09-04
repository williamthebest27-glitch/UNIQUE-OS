import type { Metadata } from "next";
import { getFiliDelPaziente } from "@/lib/data/messaggi";
import { traccia } from "@/lib/audit";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { ApriFilo } from "@/components/clinical/moduli-messaggio";
import { Badge, cx } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Comunicazioni" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Le conversazioni con questa persona.
 *
 * Cliniche e amministrative sono separate perché **la categoria decide
 * chi legge**, non perché stanno meglio in due elenchi. Un filo clinico
 * lo vedono il paziente e il suo care team; uno amministrativo lo vede
 * anche la reception, che è chi risponde di appuntamenti e fatture.
 * Mescolarli in una schermata insegnerebbe che la distinzione è
 * estetica, e prima o poi qualcuno scriverebbe di un referto in un filo
 * che legge il banco.
 */
export default async function ComunicazioniPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fili = await getFiliDelPaziente(id);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "comunicazioni" },
  });

  const cliniche = fili.filter((f) => f.categoria === "clinical");
  const amministrative = fili.filter((f) => f.categoria === "administrative");

  return (
    <div className="space-y-6">
      <Riquadro
        titolo="Conversazioni cliniche"
        conta={cliniche.length}
        nota="Le vedono il paziente e il suo care team."
        tutto={{ label: "Tutti i messaggi", href: "/pro/messaggi" }}
      >
        {cliniche.length === 0 ? (
          <Niente>
            Nessuna conversazione clinica. Se ne apre una qui sotto: il paziente la
            legge dalla sua applicazione.
          </Niente>
        ) : (
          <ElencoFili fili={cliniche} />
        )}
      </Riquadro>

      <Riquadro
        titolo="Conversazioni amministrative"
        conta={amministrative.length}
        nota="Appuntamenti, membership, fatture. Le vede anche la reception."
        apribile
        aperto={amministrative.length > 0}
      >
        {amministrative.length === 0 ? (
          <Niente>Nessuna conversazione amministrativa.</Niente>
        ) : (
          <ElencoFili fili={amministrative} />
        )}
      </Riquadro>

      <Riquadro
        titolo="Scrivi al paziente"
        nota="La categoria decide chi legge, ed è la sola decisione vera in questo modulo."
      >
        <div className="px-6 pb-6 pt-4">
          <ApriFilo patientId={id} />
        </div>
      </Riquadro>
    </div>
  );
}

function ElencoFili({
  fili,
}: {
  fili: Awaited<ReturnType<typeof getFiliDelPaziente>>;
}) {
  return (
    <ul className="mt-1 divide-y divide-bone-200/80">
      {fili.map((f) => (
        <li key={f.id}>
          <NavLink
            href={`/pro/messaggi/${f.id}`}
            className="block px-6 py-3.5 transition-colors hover:bg-bone-50"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p
                className={cx(
                  "text-[15px]",
                  f.nonLetti > 0 ? "font-medium text-ink-900" : "text-ink-900",
                )}
              >
                {f.oggetto}
              </p>
              <div className="flex items-center gap-2">
                {f.chiuso ? <Badge>Chiusa</Badge> : null}
                {f.nonLetti > 0 ? (
                  <Badge tone="attention">{f.nonLetti} da leggere</Badge>
                ) : f.toccaANoi ? (
                  <Badge tone="brand">Tocca a noi</Badge>
                ) : null}
              </div>
            </div>

            {f.anteprima ? (
              <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{f.anteprima}</p>
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
