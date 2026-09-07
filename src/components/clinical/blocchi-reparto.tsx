import { NavLink } from "@/components/shell/nav-link";
import { Niente, Riquadro } from "@/components/clinical/command-center";
import { Badge, cx } from "@/components/ui/primitives";
import { formatRelativeDays, formatShortDate, formatTime } from "@/lib/format";
import { ETICHETTE_STATO } from "@/lib/comunicazioni/tipi";
import {
  BarraPriorita,
  PastigliaPriorita,
  PastigliaStato,
  classiUrgenza,
} from "@/components/comunicazioni/segnali";
import type { Diagnostica, Infermieristica } from "@/lib/data/reparto";

/**
 * I blocchi delle giornate che non sono quella di un medico.
 *
 * Stanno in un file a parte e non dentro `/pro/page.tsx` per una ragione
 * che si vede solo quando il file cresce: la pagina di apertura decide
 * **quali** blocchi mostrare e in quale ordine, e quella decisione va
 * potuta leggere senza scorrere seicento righe di JSX. Qui c'è come sono
 * fatti; là c'è a chi vanno.
 *
 * La forma è sempre la stessa del command center clinico — barra della
 * priorità, cosa, di chi, perché, quando, un verbo — e la somiglianza è
 * voluta: chi passa dall'infermieristica alla diagnostica non deve
 * imparare un secondo alfabeto.
 */

/* ── Infermieristica ──────────────────────────────────────────────── */

/**
 * Le azioni del piano di cura in scadenza.
 *
 * **Non sono i farmaci.** Quelli stanno nel giro delle somministrazioni,
 * che ha una tabella sua, degli orari e un registro di cosa è stato
 * dato. Qui c'è l'altra metà del piano — «cammina trenta minuti»,
 * «prenota il controllo» — che è la stessa riga che il paziente vede
 * nella sua applicazione. Tenerle in due riquadri costa una riga di
 * spazio e impedisce la cosa peggiore: un consiglio sullo stile di vita
 * accanto a una dose di ramipril, con sotto lo stesso pulsante.
 *
 * Le arretrate stanno in cima e portano un segno.
 */
export function AzioniPiano({
  righe,
}: {
  righe: Infermieristica["azioniPiano"];
}) {
  const arretrate = righe.filter((r) => r.arretrata).length;

  return (
    <Riquadro
      titolo="Azioni del piano"
      conta={righe.length}
      nota={
        arretrate > 0
          ? `${arretrate} ${arretrate === 1 ? "arretrata" : "arretrate"}. Sono le azioni del piano di cura in scadenza: le stesse che il paziente vede nella sua applicazione.`
          : "Le azioni del piano di cura in scadenza nei prossimi sette giorni."
      }
    >
      {righe.length === 0 ? (
        <Niente>
          Niente in scadenza. Le azioni del piano compaiono qui quando si
          avvicina la loro data.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((r) => (
            <li
              key={r.id}
              className={cx(
                "flex gap-3.5 px-6 py-3.5",
                r.arretrata && "bg-brand-50/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "w-[3px] shrink-0 self-stretch rounded-full",
                  r.arretrata
                    ? "bg-brand-600"
                    : r.priorita === 1
                      ? "bg-gold-500"
                      : "bg-bone-200",
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <p className="text-[15px] font-medium leading-snug text-ink-900">
                    {r.titolo}
                  </p>
                  {r.arretrata ? <Badge tone="brand">In ritardo</Badge> : null}
                </div>

                <p className="mt-0.5 text-sm">
                  <NavLink
                    href={`/pro/pazienti/${r.patientId}`}
                    className="text-brand-700 underline-offset-4 hover:underline"
                  >
                    {r.paziente}
                  </NavLink>
                </p>

                {r.dettaglio ? (
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    {r.dettaglio}
                  </p>
                ) : null}

                {r.scadenza ? (
                  <p className="mt-1 text-xs text-ink-300 tnum first-letter:uppercase">
                    {formatRelativeDays(`${r.scadenza}T12:00:00Z`)} ·{" "}
                    {formatShortDate(`${r.scadenza}T12:00:00Z`)}
                  </p>
                ) : null}
              </div>

              <NavLink
                href={`/pro/pazienti/${r.patientId}/piano`}
                className="h-fit shrink-0 rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 transition-colors hover:bg-bone-50 hover:text-brand-700"
              >
                Piano
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/**
 * Chi entra oggi e non ha ancora una misura registrata.
 *
 * Non è una tabella: è l'agenda di oggi meno chi ha già una misura di
 * oggi. La coda si svuota da sé registrandoli, da qualunque schermata lo
 * si faccia — che è la ragione per cui non esiste una lista «parametri
 * da registrare» da tenere in pari a mano.
 */
export function ParametriDaRegistrare({
  righe,
}: {
  righe: Infermieristica["parametriDaRegistrare"];
}) {
  return (
    <Riquadro
      titolo="Parametri da registrare"
      conta={righe.length}
      nota="Chi entra oggi e non ha ancora nessuna misura di oggi in cartella."
    >
      {righe.length === 0 ? (
        <Niente>
          Tutti i pazienti di oggi hanno già una misura registrata — o non c’è
          nessuno in agenda.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((r) => (
            <li key={r.patientId}>
              <NavLink
                href={`/pro/pazienti/${r.patientId}/visita`}
                className="flex items-baseline gap-3.5 px-6 py-3 transition-colors hover:bg-bone-50"
              >
                <span className="font-display text-[18px] text-ink-900 tnum">
                  {formatTime(r.ora)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-900">
                  {r.paziente}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xs text-ink-300"
                >
                  registra →
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/**
 * Il passaggio di consegne.
 *
 * Sono i messaggi interni di tipo «trasferimento», non un secondo
 * canale: ciò che si scrive qui vive nella conversazione da cui viene,
 * con le sue ricevute di lettura e la sua riga nel registro. Un quaderno
 * delle consegne separato sarebbe stato più semplice da costruire e
 * impossibile da verificare.
 */
export function Consegne({ righe }: { righe: Infermieristica["consegne"] }) {
  return (
    <Riquadro
      titolo="Passaggio di consegne"
      conta={righe.length}
      nota="Le comunicazioni interne di tipo «trasferimento», dalla più recente."
      tutto={{ label: "Comunicazioni", href: "/pro/comunicazioni" }}
    >
      {righe.length === 0 ? (
        <Niente>
          Nessuna consegna. Si scrive da una comunicazione interna scegliendo
          «Trasferimento» come tipo.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((c) => (
            <li key={c.id}>
              <NavLink
                href={`/pro/comunicazioni/${c.conversationId}`}
                className={cx(
                  "flex gap-3.5 px-6 py-3.5 transition-colors hover:bg-bone-50",
                  classiUrgenza(c.priorita),
                )}
              >
                <BarraPriorita priorita={c.priorita} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-[15px] font-medium leading-snug text-ink-900">
                      {c.titolo}
                    </p>
                    <PastigliaPriorita priorita={c.priorita} />
                  </div>

                  <p className="mt-0.5 text-sm text-ink-500">
                    {[c.autore, c.reparto].filter(Boolean).join(" · ")}
                  </p>

                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    {c.corpo}
                  </p>

                  <p className="mt-1 text-xs text-ink-300 first-letter:uppercase">
                    {formatRelativeDays(c.quando)} · {formatTime(c.quando)}
                  </p>
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/* ── Diagnostica ──────────────────────────────────────────────────── */

/**
 * Le richieste arrivate al reparto.
 *
 * Sono consulti: hanno uno stato, quindi «quante nessuno ha ancora preso
 * in carico» ha una risposta. In cima ci sono quelle aperte, che è la
 * coda che si perde perché non è di nessuno.
 */
export function RichiesteEsami({ righe }: { righe: Diagnostica["richieste"] }) {
  const aperte = righe.filter((r) => r.stato === "open").length;

  return (
    <Riquadro
      titolo="Richieste"
      conta={righe.length}
      nota={
        aperte > 0
          ? `${aperte} non ${aperte === 1 ? "presa" : "prese"} in carico da nessuno.`
          : "Le richieste di esame e di parere arrivate ai tuoi reparti."
      }
      tutto={{ label: "Tutti i consulti", href: "/pro/comunicazioni/consulti" }}
    >
      {righe.length === 0 ? (
        <Niente>
          Nessuna richiesta aperta. Un medico ne apre una da «Comunicazioni →
          Nuovo consulto», scegliendo il tuo reparto.
        </Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((r) => (
            <li key={r.id}>
              <NavLink
                href={`/pro/comunicazioni/${r.conversationId}`}
                className={cx(
                  "flex gap-3.5 px-6 py-3.5 transition-colors hover:bg-bone-50",
                  classiUrgenza(r.priorita),
                )}
              >
                <BarraPriorita priorita={r.priorita} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-[15px] font-medium leading-snug text-ink-900">
                      {r.motivo}
                    </p>
                    <PastigliaStato stato={r.stato} />
                    <PastigliaPriorita priorita={r.priorita} />
                  </div>

                  <p className="mt-0.5 text-sm text-brand-700">{r.paziente}</p>

                  <p className="mt-1 text-sm text-ink-500">
                    {[
                      r.richiedente ? `Chiesto da ${r.richiedente}` : null,
                      r.incaricato ? `Preso da ${r.incaricato}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-300 tnum">
                    <span className="first-letter:uppercase">
                      {formatRelativeDays(r.quando)}
                    </span>
                    {r.scadenza ? (
                      <span
                        className={
                          new Date(r.scadenza) < new Date()
                            ? "text-signal-alert"
                            : undefined
                        }
                      >
                        entro il {formatShortDate(r.scadenza)}
                      </span>
                    ) : null}
                    <span className="sr-only">{ETICHETTE_STATO[r.stato]}</span>
                  </p>
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/**
 * I valori che aspettano una firma.
 *
 * Il motore li ha letti da un referto e non se l'è sentita di scriverli
 * da solo: i motivi stanno accanto, in chiaro. Validare resta un gesto
 * di una persona, e la pagina delle revisioni è dove si compie — qui
 * c'è solo quanto lavoro aspetta.
 */
export function DaValidare({ righe }: { righe: Diagnostica["daValidare"] }) {
  return (
    <Riquadro
      titolo="Da validare"
      conta={righe.length}
      nota="Valori estratti da un referto che il motore non ha applicato da solo."
      tutto={{ label: "Revisioni", href: "/pro/revisioni" }}
    >
      {righe.length === 0 ? (
        <Niente>Niente in attesa di validazione.</Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((v) => (
            <li key={v.id} className="px-6 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[15px] text-ink-900">
                  {v.etichetta}{" "}
                  <span className="font-medium tnum">{v.valore}</span>
                </p>
                <span className="text-xs text-ink-300 tnum">
                  confidenza {Math.round(v.confidenza * 100)}%
                </span>
              </div>

              <p className="mt-0.5 text-sm">
                <NavLink
                  href={`/pro/pazienti/${v.patientId}/clinico`}
                  className="text-brand-700 underline-offset-4 hover:underline"
                >
                  {v.paziente}
                </NavLink>
                <span className="ml-2 text-xs text-ink-300 tnum">
                  {formatShortDate(`${v.misuratoIl}T12:00:00Z`)}
                </span>
              </p>

              {v.motivi.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {v.motivi.map((m) => (
                    <li key={m} className="text-sm leading-relaxed text-ink-500">
                      {m}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

/**
 * I referti in lavorazione, laboratorio e imaging insieme.
 *
 * La colonna del tipo distingue le due code senza dividerle in due
 * schermate: Unique ha un reparto di diagnostica solo, e due elenchi
 * mezzi vuoti si guardano peggio di uno pieno.
 */
export function RefertiInLavorazione({
  righe,
}: {
  righe: Diagnostica["referti"];
}) {
  const immagini = righe.filter((r) => r.immagine).length;

  return (
    <Riquadro
      titolo="Referti da chiudere"
      conta={righe.length}
      nota={
        immagini > 0
          ? `${immagini} di imaging, ${righe.length - immagini} di laboratorio. Nessuno li ha ancora approvati.`
          : "Referti caricati che nessuno ha ancora approvato."
      }
      tutto={{ label: "Tutti i documenti", href: "/pro/documenti" }}
    >
      {righe.length === 0 ? (
        <Niente>Nessun referto in lavorazione.</Niente>
      ) : (
        <ul className="mt-1 divide-y divide-bone-200/80">
          {righe.map((r) => (
            <li key={r.id}>
              <NavLink
                href={`/pro/pazienti/${r.patientId}/documenti/${r.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3 transition-colors hover:bg-bone-50"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-900">
                  {r.titolo}
                </span>
                <Badge tone={r.immagine ? "brand" : "neutral"}>{r.tipo}</Badge>
                <Badge tone={r.stato === "pending" ? "attention" : "neutral"}>
                  {r.stato === "pending" ? "Da leggere" : "Letto"}
                </Badge>
                <span className="w-full text-sm text-ink-500">
                  {r.paziente}
                  <span className="ml-2 text-xs text-ink-300 first-letter:uppercase">
                    {formatRelativeDays(r.caricatoIl)}
                  </span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}
