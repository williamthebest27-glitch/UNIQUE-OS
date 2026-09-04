"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { cx } from "@/components/ui/primitives";

/**
 * La casella in cui si parla con Unique.
 *
 * Un componente client per una ragione sola: mentre il Brain interroga i
 * dati passano venti secondi, e una schermata che non dice niente per
 * venti secondi sembra rotta. Il resto della pagina resta server.
 */

function Invia() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        pending
          ? "bg-white/10 text-bone-50/50"
          : "bg-brand-500 text-white hover:bg-brand-600",
      )}
    >
      {pending ? "Sto guardando i dati…" : "Chiedi"}
    </button>
  );
}

function Area({ conversationId }: { conversationId: string | null }) {
  const { pending } = useFormStatus();
  const riferimento = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <input type="hidden" name="conversationId" value={conversationId ?? ""} />
      <textarea
        ref={riferimento}
        name="domanda"
        required
        disabled={pending}
        rows={3}
        placeholder="Come sta andando Unique questo mese?"
        className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-3 text-[15px] leading-relaxed text-bone-50 placeholder:text-bone-50/25 focus:border-brand-300/60 focus:outline-none focus:ring-1 focus:ring-brand-300/40 disabled:opacity-50"
        onKeyDown={(e) => {
          // Invio manda, a capo con maiuscolo: è una chat, non un modulo.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
    </>
  );
}

export function BrainChat({
  conversationId,
  azione,
}: {
  conversationId: string | null;
  azione: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={azione} className="space-y-3">
      <Area conversationId={conversationId} />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-bone-50/30">
          Ogni numero viene da una query, e le chiamate restano scritte sotto la
          risposta.
        </p>
        <Invia />
      </div>
    </form>
  );
}
