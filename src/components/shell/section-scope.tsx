"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { SectionTone } from "@/core/modules/types";
import { matchNavItem } from "./nav-match";

/**
 * App shell root. Sets `data-section-tone` from the current route so the
 * section colour (`--section` in globals.css) reaches headings, the sidebar
 * marker and the header glow.
 */
export function SectionScope({
  items,
  children,
}: {
  items: { href: string; exact?: boolean; tone?: SectionTone }[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tone = matchNavItem(pathname, items)?.tone;
  return (
    <div className="flex min-h-screen" data-section-tone={tone}>
      {children}
    </div>
  );
}
