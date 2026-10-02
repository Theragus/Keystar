"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact || href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar link. `exact` is set when another nav item is nested below this one
 * (e.g. /mining vs /mining/ledger) so only the most specific item lights up.
 */
export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.84rem] transition-colors",
        isActive ? "bg-white/[0.07] text-ink" : "text-ink-2 hover:bg-white/[0.04] hover:text-ink",
      )}
    >
      {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[2px] rounded-full bg-accent" aria-hidden />}
      {children}
    </Link>
  );
}

/** Current page title for the top-bar breadcrumb. */
export function CurrentPageCrumb({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => isActivePath(pathname, i.href, i.exact));
  return <span className="font-medium text-ink">{match?.label ?? "Keystar"}</span>;
}
