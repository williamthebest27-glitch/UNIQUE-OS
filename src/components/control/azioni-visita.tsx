import { cambiaStatoAppuntamento } from "@/lib/gestione/actions";

/**
 * I quattro gesti del banco su una visita.
 *
 * Conferma, svolta, non presentato, disdici: uno per bottone, uno per
 * modulo, nessun menu. Dopo la visita restano solo i due esiti; dopo un
 * esito non resta niente, perché una visita svolta non si tocca più da
 * qui.
 */
export function AzioniVisita({
  appointmentId,
  patientId,
  status,
}: {
  appointmentId: string;
  patientId: string | null;
  status: string;
}) {
  if (!["scheduled", "confirmed"].includes(status)) return null;

  const bottone =
    "rounded-md border border-white/12 px-2.5 py-1 text-xs text-bone-50/70 transition-colors hover:text-bone-50 hover:bg-white/[0.06]";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(
        [
          ...(status === "scheduled" ? [{ stato: "confirmed", label: "Conferma" }] : []),
          { stato: "completed", label: "Svolta" },
          { stato: "no_show", label: "Non presentato" },
          { stato: "cancelled", label: "Disdici" },
        ] as { stato: string; label: string }[]
      ).map(({ stato, label }) => (
        <form key={stato} action={cambiaStatoAppuntamento}>
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="patientId" value={patientId ?? ""} />
          <input type="hidden" name="stato" value={stato} />
          <button
            type="submit"
            className={stato === "cancelled" ? `${bottone} text-gold-300/80` : bottone}
          >
            {label}
          </button>
        </form>
      ))}
    </div>
  );
}
