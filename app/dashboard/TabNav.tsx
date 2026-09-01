"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_TABS = [
  { href: "/dashboard", label: "Your keys" },
  { href: "/dashboard/generate", label: "Generate" },
];
const ADMIN_TAB = { href: "/dashboard/admin", label: "Audit log" };

export function TabNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <div className="flex gap-4 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 pb-2 text-sm ${
            pathname === tab.href
              ? "border-black font-medium"
              : "border-transparent text-zinc-500"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
