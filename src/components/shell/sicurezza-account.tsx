"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui/primitives";

/**
 * La sicurezza del proprio account: secondo fattore e sessioni.
 *
 * Client e non server, e per una ragione precisa: l'iscrizione di un
 * secondo fattore è una conversazione in tre passi — chiedi il segreto,
 * mostralo, fatti dire il codice che ne esce — e i tre passi devono
 * avvenire dentro la **stessa sessione**. Farli con azioni server
 * significherebbe tenere il `factorId` da qualche parte fra una
 * richiesta e l'altra, cioè inventare uno stato dove Supabase ne ha già
 * uno.
 *
 * Il segreto in chiaro sta accanto al QR e non al suo posto: chi usa un
 * gestore di password su un altro dispositivo non ha una fotocamera
 * puntata sullo schermo, e senza quella riga resterebbe fuori.
 *
 * ---
 *
 * Quello che questa schermata **non** fa: elencare le sessioni aperte.
 * Supabase espone l'elenco solo all'API di amministrazione, cioè a chi
 * ha la chiave di servizio — non alla persona. Mostrare un elenco finto,
 * o dedurlo dai token, sarebbe stato peggio che non mostrarlo: si
 * guarda un elenco di dispositivi proprio quando si sospetta che ce ne
 * sia uno di troppo. Quello che si può fare davvero è chiuderle tutte
 * tranne questa, e c'è.
 */

type Fattore = { id: string; friendlyName: string | null; status: string };

type Iscrizione = {
  factorId: string;
  qr: string;
  segreto: string;
};

const CAMPO =
  "w-full rounded-xl bg-bone-50 px-3.5 py-2.5 text-[15px] text-ink-900 ring-1 ring-bone-200 " +
  "placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

const PULSANTE =
  "rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-bone-50 " +
  "transition-colors hover:bg-ink-800 disabled:opacity-50";

const QUIETO =
  "rounded-lg px-3 py-1.5 text-sm text-ink-600 ring-1 ring-bone-200 " +
  "transition-colors hover:bg-bone-50 hover:text-brand-700 disabled:opacity-50";

export function SicurezzaAccount() {
  const [fattori, setFattori] = useState<Fattore[] | null>(null);
  const [iscrizione, setIscrizione] = useState<Iscrizione | null>(null);
  const [codice, setCodice] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(
    null,
  );
  const router = useRouter();

  const carica = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      setFattori([]);
      return;
    }
    setFattori(
      (data?.totp ?? []).map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        status: f.status,
      })),
    );
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  const attivo = (fattori ?? []).some((f) => f.status === "verified");

  async function inizia() {
    setInCorso(true);
    setMessaggio(null);

    const supabase = createSupabaseBrowserClient();

    // Un tentativo lasciato a metà resta come fattore «unverified» e
    // impedisce il successivo: si ripulisce prima di ricominciare.
    const { data: esistenti } = await supabase.auth.mfa.listFactors();
    for (const f of esistenti?.totp ?? []) {
      if (f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Unique OS · ${new Date().toLocaleDateString("it-IT")}`,
    });

    setInCorso(false);

    if (error || !data) {
      setMessaggio({
        tipo: "errore",
        testo: error?.message ?? "Non è stato possibile avviare l'attivazione.",
      });
      return;
    }

    setIscrizione({
      factorId: data.id,
      qr: data.totp.qr_code,
      segreto: data.totp.secret,
    });
  }

  async function conferma() {
    if (!iscrizione) return;

    setInCorso(true);
    setMessaggio(null);

    const supabase = createSupabaseBrowserClient();

    const { data: sfida, error: erroreSfida } = await supabase.auth.mfa.challenge({
      factorId: iscrizione.factorId,
    });

    if (erroreSfida || !sfida) {
      setInCorso(false);
      setMessaggio({ tipo: "errore", testo: "Non è stato possibile verificare il codice." });
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: iscrizione.factorId,
      challengeId: sfida.id,
      code: codice.replace(/\s/g, ""),
    });

    setInCorso(false);

    if (error) {
      setMessaggio({
        tipo: "errore",
        testo: "Il codice non è valido. Controlla che l'orario del telefono sia corretto.",
      });
      return;
    }

    setIscrizione(null);
    setCodice("");
    setMessaggio({
      tipo: "ok",
      testo: "Secondo fattore attivo. Al prossimo accesso ti verrà chiesto il codice.",
    });
    await carica();
    router.refresh();
  }

  async function disattiva(factorId: string) {
    setInCorso(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setInCorso(false);

    setMessaggio(
      error
        ? { tipo: "errore", testo: "Non è stato possibile disattivarlo." }
        : { tipo: "ok", testo: "Secondo fattore disattivato." },
    );
    await carica();
    router.refresh();
  }

  async function chiudiAltreSessioni() {
    setInCorso(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setInCorso(false);

    setMessaggio(
      error
        ? { tipo: "errore", testo: "Non è stato possibile chiudere le altre sessioni." }
        : {
            tipo: "ok",
            testo:
              "Le altre sessioni sono state chiuse. Questa resta aperta: gli altri dispositivi dovranno rientrare.",
          },
    );
  }

  return (
    <div className="space-y-6">
      {messaggio ? (
        <p
          role="status"
          className={cx(
            "text-sm leading-relaxed",
            messaggio.tipo === "ok" ? "text-signal-positive" : "text-signal-alert",
          )}
        >
          {messaggio.testo}
        </p>
      ) : null}

      {/* ── Secondo fattore ──────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[15px] font-medium text-ink-900">
            Verifica in due passaggi
          </h3>
          {fattori === null ? (
            <span className="text-xs text-ink-300">…</span>
          ) : attivo ? (
            <span className="text-xs font-medium text-signal-positive">Attiva</span>
          ) : (
            <span className="text-xs text-ink-400">Non attiva</span>
          )}
        </div>

        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Un codice da un’app di autenticazione, oltre alla password. La password di
          un professionista è la chiave della cartella clinica di qualcun altro: se
          finisce in mano a qualcuno, il secondo fattore è ciò che sta fra quella
          persona e i dati.
        </p>

        {iscrizione ? (
          <div className="mt-4 rounded-card bg-bone-50 p-5 ring-1 ring-bone-200">
            <p className="text-sm text-ink-700">
              Inquadra il codice con l’app di autenticazione, poi scrivi qui il
              numero che ti mostra.
            </p>

            <div className="mt-4 flex flex-wrap items-start gap-5">
              {/* Il QR arriva da Supabase come data URI di un SVG. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iscrizione.qr}
                alt="Codice QR per l’app di autenticazione"
                className="h-40 w-40 shrink-0 rounded-lg bg-white p-2 ring-1 ring-bone-200"
              />

              <div className="min-w-[200px] flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                  Oppure inserisci a mano
                </p>
                <p className="mt-1.5 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-ink-700 ring-1 ring-bone-200">
                  {iscrizione.segreto}
                </p>

                <label className="mt-4 block">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                    Codice a sei cifre
                  </span>
                  <input
                    value={codice}
                    onChange={(e) => setCodice(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    disabled={inCorso}
                    className={cx(CAMPO, "mt-1.5 max-w-[160px] tracking-[0.3em] tnum")}
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={conferma}
                    disabled={inCorso || codice.replace(/\s/g, "").length < 6}
                    className={PULSANTE}
                  >
                    {inCorso ? "Verifica…" : "Attiva"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIscrizione(null);
                      setCodice("");
                    }}
                    className={QUIETO}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {attivo ? (
              (fattori ?? [])
                .filter((f) => f.status === "verified")
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => disattiva(f.id)}
                    disabled={inCorso}
                    className={QUIETO}
                  >
                    Disattiva
                  </button>
                ))
            ) : (
              <button
                type="button"
                onClick={inizia}
                disabled={inCorso || fattori === null}
                className={PULSANTE}
              >
                {inCorso ? "Un attimo…" : "Attiva la verifica in due passaggi"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sessioni ─────────────────────────────────────────── */}
      <div className="border-t border-bone-200 pt-6">
        <h3 className="text-[15px] font-medium text-ink-900">Altri dispositivi</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Chiude tutte le sessioni tranne questa. Da fare quando si è entrati da un
          computer che non è il proprio, o quando si sospetta che qualcun altro sia
          dentro.
        </p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
          L’elenco dei dispositivi collegati non c’è, e non è una dimenticanza:
          Supabase lo espone solo all’amministrazione, non alla persona. Un elenco
          dedotto sarebbe stato peggio di nessun elenco — lo si guarda proprio
          quando si sospetta che ce ne sia uno di troppo.
        </p>

        <button
          type="button"
          onClick={chiudiAltreSessioni}
          disabled={inCorso}
          className={cx(QUIETO, "mt-3")}
        >
          {inCorso ? "Un attimo…" : "Esci da tutti gli altri dispositivi"}
        </button>
      </div>
    </div>
  );
}
