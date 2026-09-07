import type { Metadata } from "next";
import { getFiliDelPaziente } from "@/lib/data/messaggi";
import { getConsulti, getInbox } from "@/lib/data/comunicazioni";
import { traccia } from "@/lib/audit";
import { formatRelativeDays, formatShortDate } from "@/lib/format";
import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { ApriFilo } from "@/components/clinical/moduli-messaggio";
import { Badge, cx } from "@/components/ui/primitives";
import {
  BarraPriorita,
  PastigliaPriorita,
  PastigliaStato,
  Vuoto,
  classiUrgenza,
} from "@/components/comunicazioni/segnali";

export const metadata: Metadata = { title: "Comunicazioni" };
export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 0;

/**
 * Tutto ciò che si è detto su questa persona.
 *
 * Due mondi che non vanno mescolati, e il primo che si legge è quello
 * che il paziente **non** vede:
 *
 *   **Le comunicazioni cliniche interne** sono fra colleghi e reparti —
 *   consulti, richieste, passaggi di consegna. Il paziente non le legge
 *   e non deve sapere che esistono; vivono in tabelle diverse proprio
 *   perché la sua Row Level Security non possa arrivarci.
 *
 *   **Le conversazioni con lui** sono l'altro mondo, e lì la categoria
 *   decide chi legge: un filo clinico lo vedono il paziente e il suo
 *   care team, uno amministrativo anche la reception.
 *
 * Mescolarli in una schermata sola sarebbe stato più corto e avrebbe
 * insegnato la cosa peggiore: che la distinzione è di forma. Prima o poi
 * qualcuno avrebbe scritto il dubbio diagnostico nel filo che legge il
 * paziente.
 *
 * L'elenco è già ristretto: quello che si vede qui è ciò che chi guarda
 * ha titolo di vedere, e non è detto sia tutto ciò che esiste su questa
 * persona. È scritto in pagina, perché un elenco parziale che si crede
 * completo è peggio di nessun elenco.
 */
export default async function ComunicazioniPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [fili, interne, consulti] = await Promise.all([
    getFiliDelPaziente(id),
    getInbox({ pazienteId: id }),
    getConsulti({ pazienteId: id }),
  ]);

  traccia({
    azione: "patient.section.view",
    entita: "patient",
    patientId: id,
    dettagli: { sezione: "comunicazioni" },
  });

  const cliniche = fili.filter((f) => f.categoria === "clinical");
  const amministrative = fili.filter((f) => f.categoria === "administrative");
  const conversazioni = interne.filter((v) => v.genere !== "consultation");

  return (
    <div className="space-y-6">
      {/* ── Ciò che il paziente non vede ──────────────────────── */}
      <Riquadro
        titolo="Consulti specialistici"
        conta={consulti.length}
        nota="Le richieste di parere su questa persona, con il loro stato. Il paziente non le vede."
        azione={
          <NavLink
            href={`/pro/comunicazioni/consulti/nuovo?paziente=${id}`}
            className="text-xs text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
          >
            Richiedi un consulto →
          </NavLink>
        }
      >
        {consulti.length === 0 ? (
          <Vuoto titolo="Nessun consulto su questa persona.">
            Un consulto è una richiesta di parere con uno stato: aperto, preso in
            carico, in valutazione, risposto, chiuso. Chi lo prende in carico può
            aprire questa cartella finché resta aperto.
          </Vuoto>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {consulti.map((k) => (
              <li key={k.id}>
                <NavLink
                  href={`/pro/comunicazioni/${k.conversationId}`}
                  className={cx(
                    "flex gap-3.5 px-6 py-3.5 transition-colors hover:bg-bone-50",
                    classiUrgenza(k.priorita, k.stato === "closed"),
                  )}
                >
                  <BarraPriorita priorita={k.priorita} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <p className="text-[15px] leading-snug text-ink-900">{k.motivo}</p>
                      <PastigliaStato stato={k.stato} />
                      <PastigliaPriorita priorita={k.priorita} />
                    </div>

                    <p className="mt-0.5 text-sm text-ink-500">
                      {[
                        k.richiedente ? `Chiesto da ${k.richiedente}` : null,
                        k.repartoDestinatario ? `→ ${k.repartoDestinatario}` : null,
                        k.incaricato,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    <p className="mt-1 text-xs text-ink-300 first-letter:uppercase">
                      {formatRelativeDays(k.creatoIl)} · {formatShortDate(k.creatoIl)}
                    </p>
                  </div>

                  {k.nonLetti > 0 ? (
                    <Badge tone="attention">{k.nonLetti}</Badge>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro
        titolo="Comunicazioni cliniche interne"
        conta={conversazioni.length}
        nota="Fra colleghi e reparti, su questa persona. Vedi solo quelle a cui partecipi."
        azione={
          <NavLink
            href={`/pro/comunicazioni/nuova?paziente=${id}`}
            className="text-xs text-ink-400 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
          >
            Apri una comunicazione →
          </NavLink>
        }
      >
        {conversazioni.length === 0 ? (
          <Vuoto titolo="Nessuna comunicazione interna su questa persona.">
            Quando un collega apre una conversazione collegata a questo paziente,
            compare qui — se ne fai parte.
          </Vuoto>
        ) : (
          <ul className="mt-1 divide-y divide-bone-200/80">
            {conversazioni.map((v) => (
              <li key={v.id}>
                <NavLink
                  href={`/pro/comunicazioni/${v.id}`}
                  className={cx(
                    "flex gap-3.5 px-6 py-3.5 transition-colors hover:bg-bone-50",
                    classiUrgenza(v.priorita, v.chiusa),
                  )}
                >
                  <BarraPriorita priorita={v.priorita} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <p
                        className={cx(
                          "text-[15px] leading-snug",
                          v.nonLetti > 0
                            ? "font-medium text-ink-900"
                            : "text-ink-900",
                        )}
                      >
                        {v.titolo}
                      </p>
                      <PastigliaPriorita priorita={v.priorita} />
                      {v.chiusa ? <Badge>Chiusa</Badge> : null}
                    </div>

                    {v.con.length > 0 ? (
                      <p className="mt-0.5 text-sm text-ink-500">{v.con.join(" · ")}</p>
                    ) : null}

                    {v.anteprima ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-500">
                        {v.anteprima}
                      </p>
                    ) : null}

                    <p className="mt-1 text-xs text-ink-300 first-letter:uppercase">
                      {formatRelativeDays(v.ultimoIl)} · {formatShortDate(v.ultimoIl)}
                    </p>
                  </div>

                  {v.nonLetti > 0 ? <Badge tone="attention">{v.nonLetti}</Badge> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      {/* ── Ciò che il paziente legge ─────────────────────────── */}
      <Riquadro
        titolo="Conversazioni cliniche con il paziente"
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
