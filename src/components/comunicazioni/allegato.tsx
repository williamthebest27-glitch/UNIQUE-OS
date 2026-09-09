import { cx } from "@/components/ui/primitives";

/**
 * L'allegato di un messaggio.
 *
 * Un solo componente per le due parti del filo. Non perché faccia
 * risparmiare righe — ne fa risparmiare poche — ma perché **il paziente
 * e il medico devono vedere lo stesso oggetto**: se il referto allegato
 * ha un aspetto in cartella e un altro in chat, il paziente che chiede
 * «ma è quello che le ho mandato?» ha ragione a chiederlo.
 *
 * Il file non passa mai di qui. Passa il suo id, e il collegamento va a
 * `/api/documenti/<id>`, che verifica il titolo di accesso sulla riga,
 * firma un URL che dura cinque minuti e lascia una traccia nel registro.
 * Un `<a href>` diretto allo storage non potrebbe fare nessuna delle
 * tre cose.
 */

const ESTENSIONE: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
  "image/tiff": "TIFF",
  "text/csv": "CSV",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

function etichetta(mime: string | null): string {
  if (!mime) return "FILE";
  return ESTENSIONE[mime] ?? mime.split("/")[1]?.slice(0, 4).toUpperCase() ?? "FILE";
}

export function Allegato({
  id,
  titolo,
  mime,
  /** Su fondo scuro — la bolla di chi scrive — i contrasti si invertono. */
  scuro = false,
}: {
  id: string;
  titolo: string;
  mime: string | null;
  scuro?: boolean;
}) {
  return (
    <a
      href={`/api/documenti/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
        // 44px di altezza minima: è un bersaglio da toccare con il
        // pollice, non solo da cliccare con un puntatore.
        "min-h-11",
        scuro
          ? "bg-white/10 text-bone-50 hover:bg-white/15"
          : "bg-white text-ink-900 ring-1 ring-bone-200 hover:bg-bone-50",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
          scuro ? "bg-white/15 text-bone-50/80" : "bg-bone-100 text-ink-500",
        )}
      >
        {etichetta(mime)}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm">{titolo}</span>

      <span className={cx("shrink-0 text-xs", scuro ? "text-bone-50/50" : "text-ink-400")}>
        Apri
      </span>
    </a>
  );
}
