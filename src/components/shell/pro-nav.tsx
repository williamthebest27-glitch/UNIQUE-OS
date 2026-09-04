"use client";

import { NavLink } from "@/components/shell/nav-link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BellIcon,
  CalendarIcon,
  DocumentIcon,
  HomeIcon,
  SparkIcon,
  TaskIcon,
  UsersIcon,
  cx,
} from "@/components/ui/primitives";

/**
 * Le sezioni dell'area clinica.
 *
 * Il paziente ha cinque voci perché il suo percorso è lineare. Il medico
 * ne ha undici perché la sua giornata non lo è: entra da «Oggi», ma deve
 * poter saltare a una cartella, a un referto, a una revisione o a una
 * procedura senza tornare indietro.
 *
 * Undici voci di fila sarebbero però un elenco da leggere ogni volta. Da
 * qui i quattro gruppi, che non sono decorazione — corrispondono a
 * quattro momenti diversi della giornata:
 *
 *   **La giornata** si guarda al mattino e fra un paziente e l'altro.
 *   **Clinica** si apre quando c'è qualcuno da seguire.
 *   **Lavoro** è ciò che resta quando l'ambulatorio è chiuso.
 *   **Riferimento** si consulta, non si presidia.
 *
 * Su telefono i gruppi spariscono e restano cinque voci: uno schermo da
 * pollice non regge una tassonomia, e chi apre l'applicazione in
 * corridoio sta cercando una delle cinque.
 */

export interface ProCounts {
  /** Proposte del motore AI in attesa di approvazione. */
  revisioni: number;
  /** Task ancora aperti. */
  task: number;
  /** Referti che nessuno ha ancora aperto. */
  documenti: number;
  /** Messaggi dei pazienti senza risposta. */
  messaggi: number;
}

type Voce = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Quale contatore mostrare accanto alla voce, se maggiore di zero. */
  badge?: keyof ProCounts;
};

type Gruppo = {
  titolo: string;
  voci: Voce[];
};

function AttenzioneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.5 20.5 19h-17z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5v-3.6A2.5 2.5 0 0 1 4 13.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 10v2.5M12 12.5 6.8 15M12 12.5 17.2 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7 19.5V12M12 19.5V6M17 19.5v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const GRUPPI: Gruppo[] = [
  {
    titolo: "La giornata",
    voci: [
      { href: "/pro", label: "Oggi", icon: <HomeIcon /> },
      { href: "/pro/attenzione", label: "Attenzione", icon: <AttenzioneIcon /> },
      { href: "/pro/agenda", label: "Agenda", icon: <CalendarIcon /> },
      { href: "/pro/notifiche", label: "Notifiche", icon: <BellIcon /> },
    ],
  },
  {
    titolo: "Clinica",
    voci: [
      { href: "/pro/pazienti", label: "Pazienti", icon: <UsersIcon /> },
      { href: "/pro/revisioni", label: "Revisioni", icon: <SparkIcon />, badge: "revisioni" },
      {
        href: "/pro/documenti",
        label: "Documenti",
        icon: <DocumentIcon />,
        badge: "documenti",
      },
    ],
  },
  {
    titolo: "Lavoro",
    voci: [
      { href: "/pro/task", label: "Task", icon: <TaskIcon />, badge: "task" },
      {
        href: "/pro/messaggi",
        label: "Messaggi",
        icon: <MessageIcon />,
        badge: "messaggi",
      },
      { href: "/pro/team", label: "Team", icon: <TeamIcon /> },
    ],
  },
  {
    titolo: "Riferimento",
    voci: [
      { href: "/pro/conoscenza", label: "Conoscenza", icon: <BookIcon /> },
      { href: "/pro/report", label: "Report", icon: <ReportIcon /> },
    ],
  },
];

/** Le cinque che stanno sul pollice. */
const SU_TELEFONO: Voce[] = [
  { href: "/pro", label: "Oggi", icon: <HomeIcon /> },
  { href: "/pro/attenzione", label: "Attenzione", icon: <AttenzioneIcon /> },
  { href: "/pro/agenda", label: "Agenda", icon: <CalendarIcon /> },
  { href: "/pro/pazienti", label: "Pazienti", icon: <UsersIcon /> },
  { href: "/pro/task", label: "Task", icon: <TaskIcon />, badge: "task" },
];

/**
 * `/pro` solo esatto: è la radice di tutto il resto, con `startsWith`
 * resterebbe accesa anche dentro una cartella paziente.
 */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/pro"
      ? pathname === "/pro"
      : pathname === href || pathname.startsWith(`${href}/`);
}

function conta(counts: ProCounts, voce: Voce): number {
  return voce.badge ? counts[voce.badge] : 0;
}

/** Colonna di navigazione, da tablet in su. */
export function ProSidebarNav({ counts }: { counts: ProCounts }) {
  const isActive = useIsActive();

  return (
    <nav aria-label="Sezioni dell'area clinica" className="space-y-5">
      {GRUPPI.map((gruppo) => (
        <div key={gruppo.titolo}>
          <h2 className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">
            {gruppo.titolo}
          </h2>
          <div className="mt-1.5 space-y-0.5">
            {gruppo.voci.map((voce) => {
              const active = isActive(voce.href);
              const n = conta(counts, voce);

              return (
                <NavLink
                  key={voce.href}
                  href={voce.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors",
                    "[&>span>svg]:h-[18px] [&>span>svg]:w-[18px]",
                    active
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-ink-500 hover:bg-bone-100 hover:text-ink-900",
                  )}
                >
                  <span className={active ? "text-brand-600" : "text-ink-400"}>
                    {voce.icon}
                  </span>
                  <span className="flex-1">{voce.label}</span>
                  {n > 0 ? (
                    <span
                      aria-label={`${n} da vedere`}
                      className="inline-flex min-w-[20px] justify-center rounded-full bg-[#fdf6e8] px-1.5 py-0.5 text-[11px] font-semibold text-signal-attention ring-1 ring-[#f0e0bd] tnum"
                    >
                      {n}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Barra inferiore su telefono: cinque voci, a portata di pollice. */
export function ProTabBar({ counts }: { counts: ProCounts }) {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Sezioni dell'area clinica"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bone-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {SU_TELEFONO.map((voce) => {
          const active = isActive(voce.href);
          const n = conta(counts, voce);

          return (
            <li key={voce.href}>
              <NavLink
                href={voce.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 px-0.5 py-2.5 text-[9px] font-medium",
                  "[&_svg]:h-5 [&_svg]:w-5",
                  active ? "text-brand-700" : "text-ink-400",
                )}
              >
                <span className="relative">
                  {voce.icon}
                  {n > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-signal-attention ring-2 ring-white"
                    />
                  ) : null}
                </span>
                {voce.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
