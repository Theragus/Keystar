"use client";

import type { MouseEvent, ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { useHelp } from "./help-provider";

/**
 * The sidebar's version: opens What's new for a release build with highlights; otherwise, and on a
 * modified click (new tab), it is a plain link to the release notes or, for a test build, the commit.
 */
export function WhatsNewLink({
  href,
  prerelease,
  title,
  className,
  children,
}: {
  href: string;
  prerelease: boolean;
  /** The link's own title (release notes, or the unstable build warning). */
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { latest, openWhatsNew } = useHelp();
  const opens = !prerelease && latest !== null;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!opens || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openWhatsNew();
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-haspopup={opens ? "dialog" : undefined}
      title={opens ? t.help.whatsNew(latest.version) : title}
      className={className}
    >
      {children}
    </a>
  );
}
