"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

const VOCI = [
  ["/control", "Oggi"],
  ["/control/economia", "Economia"],
  ["/control/capacita", "Capacità"],
  ["/control/crm", "CRM"],
] as const;

export function ControlNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sezioni del Control Center" className="flex flex-wrap gap-1">
      {VOCI.map(([href, label]) => {
        const attivo = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={attivo ? "page" : undefined}
            className={cx(
              "relative px-3 py-2.5 text-sm transition-colors",
              attivo
                ? "text-bone-50 after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-jade-300"
                : "text-bone-50/50 hover:text-bone-50/80",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
