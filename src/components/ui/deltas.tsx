import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Period-over-period change. Colour encodes good/bad (kills up is good, losses
 * up is bad) and is always paired with an arrow and a sign, never colour alone.
 * Isomorphic, so the caller passes the translated texts.
 */
export function WeekDelta({
  change,
  upIsGood = true,
  format = (n: number) => String(n),
  suffix,
  emptyText,
}: {
  change: number | null;
  upIsGood?: boolean;
  format?: (n: number) => string;
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

/** Compact signed chip for table cells, e.g. "+18". */
export function DeltaChip({ value, upIsGood = true }: { value: number; upIsGood?: boolean }) {
  if (!value) return <span className="text-ink-3">—</span>;
  const good = value > 0 === upIsGood;
  return (
    <span
      className={cn(
        "inline-flex min-w-8 justify-center rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ring-1 ring-inset",
        good ? "bg-good/15 text-good-text ring-good/30" : "bg-critical/15 text-critical-text ring-critical/30",
      )}
    >
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
    </span>
  );
}
