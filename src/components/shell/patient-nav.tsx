"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarIcon,
  CreditIcon,
  DocumentIcon,
  HomeIcon,
  PathIcon,
  cx,
} from "@/components/ui/primitives";

type NavItem = { href: string; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <HomeIcon /> },
  { href: "/percorso", label: "Percorso", icon: <PathIcon /> },
  { href: "/documenti", label: "Documenti", icon: <DocumentIcon /> },
  { href: "/appuntamenti", label: "Appuntamenti", icon: <CalendarIcon /> },
  { href: "/crediti", label: "Membership", icon: <CreditIcon /> },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigazione laterale, da tablet in su. */
export function PatientSidebarNav() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Sezioni" className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
              "[&>span>svg]:h-[18px] [&>span>svg]:w-[18px]",
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-500 hover:bg-bone-100 hover:text-ink-900",
            )}
          >
            <span className={active ? "text-brand-600" : "text-ink-400"}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferiore su telefono: le stesse sezioni, a portata di pollice. */
export function PatientTabBar() {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bone-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                  "[&>span>svg]:h-5 [&>span>svg]:w-5",
                  active ? "text-brand-700" : "text-ink-400",
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
