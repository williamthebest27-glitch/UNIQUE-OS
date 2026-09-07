"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui/primitives";

/**
 * La schermata che si aggiorna da sé.
 *
 * Due scelte reggono questo file, e vale la pena scriverle perché
 * entrambe hanno un'alternativa ovvia e peggiore.
 *
 * **Non ricostruisce i dati nel browser.** All'arrivo di un evento
 * chiama `router.refresh()`, e il server rirenderizza i componenti con
 * le stesse funzioni di lettura di sempre. L'alternativa — inserire il
 * messaggio ricevuto nello stato di React — avrebbe richiesto una
 * seconda copia della logica di lettura, in un posto dove la Row Level
 * Security non esiste: il payload di un evento realtime è la riga
 * grezza, senza i nomi, senza le ricevute, senza il reparto di chi
 * scrive. Due strade per la stessa schermata divergono sempre.
 *
 * **Non fa polling.** Un `setInterval` che ricarica ogni cinque secondi
 * costa una richiesta ogni cinque secondi per ogni scheda aperta di ogni
 * medico, e nel novantanove per cento dei casi risponde «niente di
 * nuovo». Il polling qui esiste solo come rete di sicurezza, lento e
 * acceso soltanto quando il canale è caduto — che è il momento in cui
 * serve davvero.
 *
 * Il debounce non è un dettaglio: quando qualcuno scrive in tre
 * conversazioni di fila arrivano tre eventi in mezzo secondo, e tre
 * `refresh()` in mezzo secondo sono tre render del server per mostrare
 * lo stesso risultato.
 */

type Stato = "collegato" | "in-collegamento" | "caduto";

const ATTESA_REFRESH = 400;
/** Quando il canale è caduto: lento, perché è una rete e non un motore. */
const RIPIEGO_MS = 30_000;

export function AggiornamentoLive({
  /** Quando c'è, ascolta solo questa conversazione. Altrimenti tutte. */
  conversationId,
  /** Il profilo di chi guarda: serve a filtrare le proprie notifiche. */
  profileId,
  /** Falso in modalità dimostrativa: senza database non c'è niente da ascoltare. */
  attivo = true,
}: {
  conversationId?: string | null;
  profileId: string;
  attivo?: boolean;
}) {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>("in-collegamento");
  const [avviso, setAvviso] = useState<string | null>(null);

  // In un ref e non nello stato: cambiarli non deve rirenderizzare nulla.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canale = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!attivo) return;

    const supabase = createSupabaseBrowserClient();

    const aggiorna = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), ATTESA_REFRESH);
    };

    const ch = supabase.channel(
      conversationId ? `comms:${conversationId}` : `comms:${profileId}`,
    );

    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_messages",
        ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
      },
      aggiorna,
    );

    // Le notifiche sono l'unico canale che dice «è successo qualcosa in
    // una conversazione che non stai guardando»: senza, il pallino nel
    // menu resterebbe fermo finché non si cambia pagina.
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        const riga = payload.new as {
          title?: string;
          severity?: string;
          category?: string;
        } | null;

        // Solo ciò che riguarda questa sezione, e solo se è abbastanza
        // importante da interrompere: un avviso a comparsa per ogni
        // notifica informativa sarebbe una tendina che sbatte.
        if (
          riga?.title &&
          (riga.category === "comunicazioni" || riga.category === "consulti") &&
          riga.severity !== "info"
        ) {
          setAvviso(riga.title);
        }
        aggiorna();
      },
    );

    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStato("collegato");
        // Al ritorno da una disconnessione la schermata è vecchia di
        // quanto è durata la caduta: si rilegge una volta sola.
        router.refresh();
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStato("caduto");
      } else {
        setStato("in-collegamento");
      }
    });

    canale.current = ch;

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(ch);
      canale.current = null;
    };
  }, [attivo, conversationId, profileId, router]);

  // La rete di sicurezza, accesa solo mentre il canale è giù.
  useEffect(() => {
    if (stato !== "caduto") return;
    const id = setInterval(() => router.refresh(), RIPIEGO_MS);
    return () => clearInterval(id);
  }, [stato, router]);

  useEffect(() => {
    if (!avviso) return;
    const id = setTimeout(() => setAvviso(null), 7000);
    return () => clearTimeout(id);
  }, [avviso]);

  return (
    <>
      {/*
        Lo stato del collegamento si dice solo quando è cattivo. Un
        pallino verde permanente non aggiunge niente e toglie un po' di
        attenzione a ogni sguardo.
      */}
      {stato === "caduto" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-bone-100 px-3 py-1.5 text-xs text-ink-500"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-attention"
          />
          Aggiornamento in tempo reale interrotto. La pagina si ricarica da sola
          ogni trenta secondi.
        </p>
      ) : null}

      {avviso ? <AvvisoLive testo={avviso} onChiudi={() => setAvviso(null)} /> : null}
    </>
  );
}

/**
 * L'avviso a comparsa.
 *
 * In basso a destra da tablet in su, in alto su telefono: sul telefono
 * il pollice sta in basso, e un avviso lì copre il campo in cui si sta
 * scrivendo proprio mentre lo si usa.
 */
function AvvisoLive({ testo, onChiudi }: { testo: string; onChiudi: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "fixed inset-x-4 top-4 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:max-w-sm",
        "flex items-start gap-3 rounded-xl bg-ink-900 px-4 py-3 text-bone-50 shadow-lg",
        "animate-comms-arriva",
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lume-500"
      />
      <p className="min-w-0 flex-1 text-sm leading-snug">{testo}</p>
      <button
        type="button"
        onClick={onChiudi}
        aria-label="Chiudi l’avviso"
        className="-mr-1 shrink-0 rounded-lg px-1.5 text-bone-50/60 transition-colors hover:text-bone-50"
      >
        ×
      </button>
    </div>
  );
}
