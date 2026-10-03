"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isActivePath, matchNavItem } from "./nav-match";
import { useSidebar } from "./sidebar-state";

/**
 * Sidebar link. `exact` is set when another nav item is nested below this one
 * (e.g. /mining vs /mining/ledger) so only the most specific item lights up.
 * `title` becomes the tooltip while the sidebar is collapsed to its icon rail.
 */
export function NavLink({
  href,
  exact,
  title,
  children,
}: {
  href: string;
  exact?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isActive = isActivePath(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? title : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.84rem] transition-colors",
        collapsed && "justify-center px-0",
        isActive
          ? "bg-surface-contrast/[0.07] text-ink [&_svg]:text-(--section) [&_svg]:opacity-100"
          : "text-ink-2 hover:bg-surface-contrast/[0.04] hover:text-ink",
      )}
    >
      {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[2px] rounded-full bg-(--section)" aria-hidden />}
      {children}
    </Link>
  );
}

/** Current page title for the top-bar breadcrumb. */
export function CurrentPageCrumb({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  const match = matchNavItem(pathname, items);
  return <span className="font-medium text-ink">{match?.label ?? "Keystar"}</span>;
}
