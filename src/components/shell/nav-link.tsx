"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isActivePath, matchNavItem } from "./nav-match";

/**
 * Sidebar link. `exact` is set when another nav item is nested below this one
 * (e.g. /mining vs /mining/ledger) so only the most specific item lights up.
 * `inFlyout` renders it in the collapsed rail's hover card (RailFlyout): full
 * width, no side marker, out of the tab order.
 */
export function NavLink({
  href,
  exact,
  inFlyout,
  children,
}: {
  href: string;
  exact?: boolean;
  inFlyout?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      tabIndex={inFlyout ? -1 : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.84rem] transition-colors",
        isActive
          ? "bg-surface-contrast/[0.07] text-ink [&_svg]:text-(--section) [&_svg]:opacity-100"
          : "text-ink-2 hover:bg-surface-contrast/[0.04] hover:text-ink",
      )}
    >
      {isActive && !inFlyout && (
        <span className="absolute top-1.5 bottom-1.5 -left-3 w-[2px] rounded-full bg-(--section)" aria-hidden />
      )}
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
