"use client";

import { NavLink } from "@/components/shell/nav-link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

/**
 * Le sezioni del Control Center.
 *
 * Quali voci compaiono lo decide il ruolo, e la decisione arriva dal
 * server: un componente client non è il posto in cui stabilire chi vede
 * cosa. Qui si disegnano soltanto le voci ricevute.
 */
export function ControlNav({ voci }: { voci: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sezioni del Control Center" className="flex flex-wrap gap-1">
      {voci.map(({ href, label }) => {
        const attivo = pathname === href;
        return (
          <NavLink
            key={href}
            href={href}
            aria-current={attivo ? "page" : undefined}
            className={cx(
              "relative px-3 py-2.5 text-sm transition-colors",
              attivo
                ? "text-bone-50 after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-brand-300"
                : "text-bone-50/50 hover:text-bone-50/80",
            )}
          >
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}
