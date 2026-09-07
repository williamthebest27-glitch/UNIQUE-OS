import { NavLink } from "@/components/shell/nav-link";
import { Badge, cx } from "@/components/ui/primitives";
import { formatFileSize, formatShortDate, formatTime } from "@/lib/format";
import { eUrgente } from "@/lib/comunicazioni/tipi";
import { urlAllegato } from "@/lib/comunicazioni/azioni";
import type { ConversazioneInterna, MessaggioInterno } from "@/lib/data/comunicazioni";
import {
  EtichettaTipo,
  PastigliaPriorita,
  PastigliaStato,
} from "@/components/comunicazioni/segnali";

/**
 * Una conversazione, letta.
 *
 * Le righe non sono due colonne di fumetti contrapposti come nella
 * messaggistica con il paziente: là i lati sono due — il paziente e la
 * clinica — e la posizione dice chi parla. Qui i lati sono quanti sono i
 * partecipanti, e allineare tutto a sinistra con il nome in cima è
 * l'unico modo perché tre voci restino distinguibili. Il proprio
 * messaggio si riconosce da un fondo appena diverso, non dal lato.
 *
 * L'altra scelta è che **il nome porta con sé il reparto**: «Dott.
 * Rossi · Cardiologia» dice qualcosa che il solo nome non dice, ed è
 * proprio ciò che serve a leggere una risposta arrivata da un'unità con
 * cui non si parla tutti i giorni.
 */

export function Messaggi({ messaggi }: { messaggi: MessaggioInterno[] }) {
  if (messaggi.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-400">
        Nessun messaggio.
      </p>
    );
  }

  return (
    <ol className="space-y-3 px-5 py-5">
      {messaggi.map((m, i) => {
        // Righe di fila della stessa persona nello stesso quarto d'ora si
        // stringono: ripetere nome e ora per ogni frase spezza in tre
        // pezzi un pensiero che è uno solo.
        const prima = messaggi[i - 1];
        const continua =
          prima !== undefined &&
          prima.autoreId === m.autoreId &&
          new Date(m.quando).getTime() - new Date(prima.quando).getTime() < 15 * 60_000;

        return (
          <li key={m.id} className={continua ? "-mt-1.5" : undefined}>
            <div
              className={cx(
                "max-w-[92%] rounded-2xl px-4 py-3 ring-1",
                m.mio
                  ? "ml-auto bg-brand-50 ring-brand-100"
                  : "bg-white ring-bone-200/70",
                eUrgente(m.priorita) && !m.mio && "ring-brand-100",
              )}
            >
              {!continua ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
                    {m.mio ? "Tu" : m.autore}
                  </span>
                  {m.reparto ? (
                    <span className="text-[11px] uppercase tracking-[0.07em] text-ink-300">
                      {m.reparto}
                    </span>
                  ) : null}
                  <EtichettaTipo tipo={m.tipo} />
                  <PastigliaPriorita priorita={m.priorita} />
                </div>
              ) : null}

              <p
                className={cx(
                  "whitespace-pre-line text-[15px] leading-relaxed text-ink-900",
                  !continua && "mt-1.5",
                )}
              >
                {m.corpo}
              </p>

              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-300 tnum">
                <span>
                  {formatShortDate(m.quando)} · {formatTime(m.quando)}
                </span>
                {/*
                  «Letto da» e non una spunta: in una conversazione con
                  quattro partecipanti una spunta sola non dice chi manca,
                  ed è esattamente la domanda di chi ha scritto qualcosa di
                  urgente e sta aspettando.
                */}
                {m.mio && m.lettoDa.length > 0 ? (
                  <span className="text-signal-positive">
                    letto da {m.lettoDa.slice(0, 3).join(", ")}
                    {m.lettoDa.length > 3 ? ` +${m.lettoDa.length - 3}` : ""}
                  </span>
                ) : null}
                {m.mio && m.lettoDa.length === 0 ? (
                  <span className="text-ink-300">non ancora letto</span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── L'intestazione ───────────────────────────────────────────────── */

export function IntestazioneConversazione({ c }: { c: ConversazioneInterna }) {
  return (
    <header className="border-b border-bone-200 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-tight text-ink-900 sm:text-[25px]">
            {c.titolo}
          </h1>

          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-500">
            {c.reparto ? <span>{c.reparto}</span> : null}
            {c.pazienteId ? (
              <NavLink
                href={`/pro/pazienti/${c.pazienteId}`}
                className="text-brand-700 underline-offset-4 hover:underline"
              >
                {c.paziente ?? "Paziente"}
              </NavLink>
            ) : null}
            <span className="text-xs text-ink-300">
              aperta il {formatShortDate(c.creataIl)}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PastigliaPriorita priorita={c.priorita} />
          {c.consulto ? <PastigliaStato stato={c.consulto.stato} /> : null}
          {c.chiusa ? <Badge>Chiusa</Badge> : null}
          {c.silenziata ? <Badge>Silenziata</Badge> : null}
        </div>
      </div>

      {c.partecipanti.length > 0 ? (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
          <span className="text-ink-300">Partecipano: </span>
          {c.partecipanti.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? " · " : ""}
              <span className={p.reparto ? "text-ink-600" : undefined}>{p.nome}</span>
              {p.reparto ? " (reparto)" : ""}
            </span>
          ))}
        </p>
      ) : null}
    </header>
  );
}

/* ── La scheda del consulto ───────────────────────────────────────── */

/**
 * Il consulto, sopra la conversazione.
 *
 * Motivo, stato, chi l'ha chiesto, chi l'ha preso, entro quando. Sta in
 * cima e non in fondo perché è la domanda a cui tutta la conversazione
 * sotto sta rispondendo, e leggerla dopo trenta righe di discussione
 * significa averle lette senza sapere di cosa parlavano.
 */
export function SchedaConsulto({
  consulto,
  azioni,
}: {
  consulto: NonNullable<ConversazioneInterna["consulto"]>;
  azioni?: React.ReactNode;
}) {
  const righe: { etichetta: string; valore: string | null }[] = [
    { etichetta: "Richiesto da", valore: consulto.richiedente },
    { etichetta: "Reparto richiedente", valore: consulto.repartoRichiedente },
    { etichetta: "Reparto destinatario", valore: consulto.repartoDestinatario },
    { etichetta: "Preso in carico da", valore: consulto.incaricato },
    {
      etichetta: "Scadenza",
      valore: consulto.scadenza ? formatShortDate(consulto.scadenza) : null,
    },
    {
      etichetta: "Risposto il",
      valore: consulto.rispostoIl ? formatShortDate(consulto.rispostoIl) : null,
    },
  ].filter((r) => r.valore !== null);

  return (
    <section className="border-b border-bone-200 bg-bone-100/60 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-500">
          Consulto specialistico
        </h2>
        <PastigliaStato stato={consulto.stato} />
      </div>

      <p className="mt-2 text-[15px] leading-snug text-ink-900">{consulto.motivo}</p>

      {consulto.descrizione ? (
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-500">
          {consulto.descrizione}
        </p>
      ) : null}

      {righe.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {righe.map((r) => (
            <div key={r.etichetta} className="flex gap-2 text-xs">
              <dt className="shrink-0 text-ink-300">{r.etichetta}</dt>
              <dd className="min-w-0 truncate text-ink-600">{r.valore}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {consulto.risposta ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3 ring-1 ring-bone-200">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
            Risposta
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-900">
            {consulto.risposta}
          </p>
        </div>
      ) : null}

      {azioni ? <div className="mt-3">{azioni}</div> : null}
    </section>
  );
}

/* ── Allegati ─────────────────────────────────────────────────────── */

/**
 * Gli allegati.
 *
 * Un referto in cartella si apre nella cartella, dove c'è il
 * visualizzatore, l'estrazione dei valori e la revisione: portarlo qui
 * avrebbe voluto dire una seconda finestra di lettura con meno cose
 * dentro. Ciò che è nato nella conversazione, invece, si scarica da qui.
 */
export async function Allegati({
  allegati,
  pazienteId,
}: {
  allegati: ConversazioneInterna["allegati"];
  pazienteId: string | null;
}) {
  if (allegati.length === 0) return null;

  /*
   * Le firme si producono qui, tutte insieme, e non al clic.
   *
   * Un pulsante che chiede l'indirizzo e poi apre una finestra viene
   * fermato dal blocco dei popup nella metà dei browser, perché fra il
   * clic e l'apertura c'è un'attesa di rete. Un collegamento normale con
   * dentro un indirizzo già firmato non ha quel problema — e il fatto
   * che scada da solo dopo dieci minuti è esattamente ciò che serve a un
   * file clinico.
   */
  const firme = new Map(
    await Promise.all(
      allegati
        .filter((a) => a.storagePath && !a.documentId)
        .map(async (a) => [a.id, await urlAllegato(a.storagePath ?? "")] as const),
    ),
  );

  return (
    <ul className="divide-y divide-bone-200/80">
      {allegati.map((a) => {
        // Un referto in cartella si apre nella cartella, dove c'è il
        // visualizzatore e la revisione; ciò che è nato qui si scarica.
        const inCartella =
          a.documentId && pazienteId
            ? `/pro/pazienti/${pazienteId}/documenti/${a.documentId}`
            : null;
        const firmato = firme.get(a.id) ?? null;

        const corpo = (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{a.nome}</span>
            {a.documentId ? (
              <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-ink-300">
                in cartella
              </span>
            ) : null}
            <span className="shrink-0 text-xs text-ink-300 tnum">
              {formatFileSize(a.bytes)}
            </span>
          </>
        );

        const classi =
          "flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-bone-50";

        return (
          <li key={a.id}>
            {inCartella ? (
              <NavLink href={inCartella} className={classi}>
                {corpo}
              </NavLink>
            ) : firmato ? (
              <a
                href={firmato}
                target="_blank"
                rel="noopener noreferrer"
                className={classi}
              >
                {corpo}
              </a>
            ) : (
              <div className="flex items-center gap-3 px-5 py-2.5 opacity-60">
                {corpo}
                <span className="shrink-0 text-xs text-ink-300">non accessibile</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
