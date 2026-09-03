"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
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
 * ne ha sei perché la sua giornata non lo è: entra da "Oggi", ma deve
 * poter saltare a una cartella, a un referto o a una revisione senza
 * tornare indietro. Il menu è la mappa di ciò che può fare.
 */

export interface ProCounts {
  /** Proposte del motore AI in attesa di approvazione. */
  revisioni: number;
  /** Task ancora aperti. */
  task: number;
}

type Voce = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Quale contatore mostrare accanto alla voce, se maggiore di zero. */
  badge?: keyof ProCounts;
};

const NAV: Voce[] = [
  { href: "/pro", label: "Oggi", icon: <HomeIcon /> },
  { href: "/pro/agenda", label: "Agenda", icon: <CalendarIcon /> },
  { href: "/pro/pazienti", label: "Pazienti", icon: <UsersIcon /> },
  { href: "/pro/revisioni", label: "Revisioni", icon: <SparkIcon />, badge: "revisioni" },
  { href: "/pro/documenti", label: "Documenti", icon: <DocumentIcon /> },
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
    <nav aria-label="Sezioni dell'area clinica" className="space-y-1">
      {NAV.map((voce) => {
        const active = isActive(voce.href);
        const n = conta(counts, voce);

        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
              "[&>span>svg]:h-[18px] [&>span>svg]:w-[18px]",
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-500 hover:bg-bone-100 hover:text-ink-900",
            )}
          >
            <span className={active ? "text-brand-600" : "text-ink-400"}>{voce.icon}</span>
            <span className="flex-1">{voce.label}</span>
            {n > 0 ? (
              <span
                aria-label={`${n} da vedere`}
                className="inline-flex min-w-[20px] justify-center rounded-full bg-[#fdf6e8] px-1.5 py-0.5 text-[11px] font-semibold text-signal-attention ring-1 ring-[#f0e0bd] tnum"
              >
                {n}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferiore su telefono: le stesse sei sezioni, a portata di pollice. */
export function ProTabBar({ counts }: { counts: ProCounts }) {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Sezioni dell'area clinica"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bone-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-6">
        {NAV.map((voce) => {
          const active = isActive(voce.href);
          const n = conta(counts, voce);

          return (
            <li key={voce.href}>
              <Link
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
