import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A profit/loss figure: sign, arrow and colour together, never colour alone. */
export function SignedIsk({ value, unit = false, className }: { value: number; unit?: boolean; className?: string }) {
  const flat = Math.abs(value) < 0.5;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        flat ? "text-ink-2" : value > 0 ? "text-good-text" : "text-critical-text",
        className,
      )}
    >
      {!flat && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {flat ? "" : value > 0 ? "+" : "−"}
      {compact(Math.abs(value))}
      {unit && " ISK"}
    </span>
  );
}
