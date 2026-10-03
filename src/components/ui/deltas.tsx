import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// Client component (formats with the viewer's language); re-exported so callers keep importing it from here.
export { DeltaChip } from "./delta";

/**
 * Period-over-period change. Colour encodes good/bad (kills up is good, losses
 * up is bad) and is always paired with an arrow and a sign, never colour alone.
 * Isomorphic, so the caller passes the translated texts and the viewer's
 * number format (e.g. `f.integer`).
 */
export function WeekDelta({
  change,
  upIsGood = true,
  format,
  suffix,
  emptyText,
}: {
  change: number | null;
  upIsGood?: boolean;
  format: (n: number) => string;
  /** e.g. "vs prior 30d". */
  suffix: string;
  /** Shown when there is no baseline to compare with. */
  emptyText: string;
}) {
  if (change === null) return <span className="text-xs text-ink-3">{emptyText}</span>;
  const flat = Math.abs(change) < 1e-9;
  const good = flat ? null : change > 0 === upIsGood;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          good === null ? "text-ink-2" : good ? "text-good-text" : "text-critical-text",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {change > 0 ? "+" : change < 0 ? "−" : ""}
        {format(Math.abs(change))}
      </span>
      <span className="whitespace-nowrap text-ink-3">{suffix}</span>
    </span>
  );
}
