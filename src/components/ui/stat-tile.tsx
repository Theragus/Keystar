import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Glass } from "./glass";

/** Signed change vs a named period; colour = direction × "up is good", always with an arrow. */
export function Delta({ value, period, upIsGood = true }: { value: number | null; period: string; upIsGood?: boolean }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-xs text-ink-3">No data for {period}</span>;
  }
  const flat = Math.abs(value) < 0.005;
  const good = flat ? null : value > 0 === upIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          good === null ? "text-ink-2" : good ? "text-good-text" : "text-critical-text",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {value > 0 ? "+" : ""}
        {(value * 100).toFixed(1)}%
      </span>
      <span className="text-ink-3 whitespace-nowrap">vs {period}</span>
    </span>
  );
}

/** Minimal sparkline: de-emphasis line with the latest point in the accent. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 40;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-40 overflow-visible", className)} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="rgba(92,200,255,0.08)" />
      <path d={d} fill="none" stroke="rgba(169,182,200,0.55)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill="#5cc8ff" stroke="#14161a" strokeWidth={2} />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  hint,
  hero = false,
  trend,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  /** Unit rendered smaller next to the value (e.g. "ISK", "m³"). */
  unit?: string;
  delta?: ReactNode;
  hint?: ReactNode;
  hero?: boolean;
  trend?: number[];
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Glass className={cn("flex flex-col justify-between gap-3 px-5 py-4", className)}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03]">
            <Icon className="size-3.5 text-ink-2" aria-hidden />
          </span>
        )}
        <div className="eve-label text-[0.64rem] text-ink-3">{label}</div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div
          className={cn(
            "leading-none font-semibold tracking-tight whitespace-nowrap text-ink",
            hero ? "text-[3.25rem]" : "text-[1.75rem]",
          )}
        >
          {value}
          {unit && <span className={cn("ml-1.5 font-medium text-ink-2", hero ? "text-2xl" : "text-base")}>{unit}</span>}
        </div>
        {trend && <Sparkline values={trend} className="mb-1 hidden xl:block" />}
      </div>
      <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
        {delta}
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
    </Glass>
  );
}
