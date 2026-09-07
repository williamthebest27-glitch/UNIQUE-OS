"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui/primitives";

/**
 * Il polso del Command Center.
 *
 * Un componente a parte e non `AggiornamentoLive`: quello ascolta le
 * conversazioni e fa comparire un avviso quando arriva un messaggio
 * urgente: qui l'avviso sarebbe una tendina che sbatte su uno schermo
 * che nessuno sta guardando da vicino. Le due schermate hanno lo stesso
 * meccanismo e due comportamenti diversi, e tenerle in un file solo
 * avrebbe voluto dire un parametro che spegne metà del componente.
 *
 * La tabella da ascoltare è **`domain_events`**: ogni fatto della
 * clinica ci passa, quindi una sottoscrizione sola copre le sei code.
 * Accanto c'è `clinical_consultations`, perché prendere in carico un
 * parere cambia una riga senza emettere un evento — ed è esattamente la
 * cosa che questa schermata deve smettere di mostrare quando succede.
 *
 * Come altrove: `router.refresh()` e non uno stato ricostruito nel
 * browser. Il payload di un evento è la riga grezza, i conteggi no.
 */

type Stato = "collegato" | "in-collegamento" | "caduto";

/** Gli eventi in clinica arrivano a raffica: tre in mezzo secondo sono
    un render solo. */
const ATTESA_REFRESH = 600;

/** Quando il canale è caduto. Lento, perché è una rete e non un motore. */
const RIPIEGO_MS = 30_000;

export function PolsoClinica({ attivo = true }: { attivo?: boolean }) {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>("in-collegamento");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!attivo) return;

    const supabase = createSupabaseBrowserClient();

    const aggiorna = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), ATTESA_REFRESH);
    };

    const ch = supabase.channel("comando");

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "domain_events" },
      aggiorna,
    );

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "clinical_consultations" },
      aggiorna,
    );

    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStato("collegato");
        // Al ritorno da una caduta la schermata è vecchia di quanto è
        // durata: si rilegge una volta sola.
        router.refresh();
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStato("caduto");
      } else {
        setStato("in-collegamento");
      }
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(ch);
    };
  }, [attivo, router]);

  // La rete di sicurezza, accesa solo mentre il canale è giù.
  useEffect(() => {
    if (!attivo || stato !== "caduto") return;
    const id = setInterval(() => router.refresh(), RIPIEGO_MS);
    return () => clearInterval(id);
  }, [attivo, stato, router]);

  if (!attivo) return null;

  /*
   * Lo stato del collegamento è scritto, non solo colorato.
   *
   * Su una schermata che resta aperta tutto il giorno la domanda «questi
   * numeri sono di adesso o di stamattina?» ha bisogno di una risposta
   * visibile: un pallino verde da solo la dà a chi sa già cosa
   * significa.
   */
  return (
    <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.16em] text-bone-50/35">
      <span
        aria-hidden
        className={cx(
          "size-1.5 rounded-full",
          stato === "collegato"
            ? "bg-signal-positive-light"
            : stato === "caduto"
              ? "bg-gold-500"
              : "bg-white/25",
        )}
      />
      {stato === "collegato"
        ? "In ascolto"
        : stato === "caduto"
          ? "Collegamento caduto · rileggo ogni 30 s"
          : "Mi collego"}
    </p>
  );
}
