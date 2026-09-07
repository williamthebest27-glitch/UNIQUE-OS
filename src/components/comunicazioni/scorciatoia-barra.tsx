import { NavLink } from "@/components/shell/nav-link";

/**
 * Le comunicazioni, dalla barra in cima.
 *
 * Esiste per il telefono. La colonna di sinistra sparisce sotto i
 * settecentosessantotto pixel e la barra in fondo ha cinque voci — «uno
 * schermo da pollice non regge una tassonomia», e aggiungerne una sesta
 * avrebbe rotto la regola invece di rispettarla. Ma un medico in
 * corridoio che riceve un consulto urgente deve poterlo aprire, e senza
 * questo non avrebbe avuto nessuna strada.
 *
 * Da tablet in su resta, e diventa un'altra cosa: non una via d'accesso
 * — quella è nel menu — ma il posto dove il numero si vede senza dover
 * guardare la colonna.
 */
export function ScorciatoiaComunicazioni({ nonLette }: { nonLette: number }) {
  return (
    <NavLink
      href="/pro/comunicazioni"
      aria-label={
        nonLette > 0
          ? `Comunicazioni, ${nonLette} da leggere`
          : "Comunicazioni"
      }
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-bone-100 hover:text-ink-900"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
        <path
          d="M3 6.2A2.2 2.2 0 0 1 5.2 4h8.6A2.2 2.2 0 0 1 16 6.2v4.6a2.2 2.2 0 0 1-2.2 2.2H8l-3.6 2.7v-2.8A2.2 2.2 0 0 1 3 10.8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M18.5 9h.3A2.2 2.2 0 0 1 21 11.2v4.6a2.2 2.2 0 0 1-2.2 2.2h-.3v2.4L15 18h-2.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {nonLette > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-[17px] justify-center rounded-full bg-signal-attention px-1 text-[10px] font-semibold leading-[17px] text-white ring-2 ring-bone-50"
        >
          {nonLette > 99 ? "99+" : nonLette}
        </span>
      ) : null}
    </NavLink>
  );
}
