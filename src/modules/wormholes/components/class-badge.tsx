"use client";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { classBadgeStyle } from "../class-colors";
import type { ClassKey } from "../static";

/** System class (C1–C6, specials) or, in known space, the security status in EVE colours. */
export function ClassBadge({ cls, sec, className }: { cls: ClassKey; sec: number | null; className?: string }) {
  const { t } = useI18n();
  const style = classBadgeStyle(cls, sec);
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.2rem] shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-3xs font-semibold tabular-nums",
        className,
      )}
      style={{ background: style.background, color: style.color }}
      title={t.wormholes.classNames[cls]}
    >
      {style.text ?? t.wormholes.classes[cls]}
    </span>
  );
}
