import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Icon tile + mono label + value, as used on the overview page. With `href` the
 * row links to the page behind the value (`external` opens it in a new tab).
 */
export function InfoItem({
  icon: Icon,
  media,
  label,
  href,
  external = false,
  children,
}: {
  icon?: LucideIcon;
  /** Replaces the icon tile, e.g. with a corporation logo. */
  media?: ReactNode;
  label: string;
  href?: string;
  external?: boolean;
  children: ReactNode;
}) {
  const Arrow = external ? ArrowUpRight : ArrowRight;
  const body = (
    <>
      {media ??
        (Icon && (
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
            <Icon className="size-[18px] text-ink-2" aria-hidden />
          </span>
        ))}
      <div className="min-w-0">
        <div className="eve-label text-2xs text-ink-3">{label}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[0.95rem] text-ink">
          <span className="min-w-0 truncate transition-colors group-hover:text-accent">{children}</span>
          {href && <Arrow className="size-3.5 shrink-0 text-ink-3 transition-colors group-hover:text-accent" aria-hidden />}
        </div>
      </div>
    </>
  );

  if (!href) return <div className="flex items-center gap-3.5">{body}</div>;
  // Negative margin keeps linked and plain items aligned while the hover area gets some padding.
  const className = "group -m-2 flex items-center gap-3.5 rounded-xl p-2 transition-colors hover:bg-white/[0.04]";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
