"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_TABS: { href: string; label: string; badge?: string }[] = [
  { href: "/dashboard", label: "Your keys" },
  { href: "/dashboard/generate", label: "Generate" },
];
const ADMIN_TAB = { href: "/dashboard/admin", label: "Audit log", badge: "ADMIN" };

export function TabNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <nav className="flex flex-col">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="navitem flex items-center gap-3 py-2.5 pl-[17px] pr-5 text-sm"
            style={{
              borderLeft: `3px solid ${active ? "var(--color-accent)" : "transparent"}`,
              background: active ? "color-mix(in srgb, var(--color-accent) 9%, transparent)" : "transparent",
              color: active ? "var(--color-accent-700)" : "var(--color-text)",
              fontFamily: "var(--font-heading)",
              fontWeight: active ? 700 : 500,
            }}
          >
            {tab.label}
            {tab.badge && (
              <span
                className="ml-auto text-[10px] font-semibold px-1.5 py-px"
                style={{ background: "var(--color-neutral-300)", color: "var(--color-neutral-800)" }}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
