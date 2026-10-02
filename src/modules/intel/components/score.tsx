import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TIER_COLOR } from "../colors";
import type { DimensionScore, PilotScore, PilotTag, Tier } from "../types";

const TIER_META: Record<Tier | "unknown", { label: string; tone: "neutral" | "gold" | "warning" | "critical" }> = {
  low: { label: "Low", tone: "neutral" },
  moderate: { label: "Moderate", tone: "gold" },
  high: { label: "High", tone: "warning" },
  extreme: { label: "Extreme", tone: "critical" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export function tierLabel(tier: Tier | "unknown"): string {
  return TIER_META[tier].label;
}

/** Tier and score, e.g. "High 62"; quick scores (statistics only) are marked. */
export function ScoreBadge({ score }: { score: PilotScore | null }) {
  if (!score) return null;
  const meta = TIER_META[score.tier];
  return (
    <div className="flex shrink-0 flex-col items-end gap-1" title={score.quick ? "Quick score from zKillboard statistics; recent kills are still loading" : undefined}>
      <Badge tone={meta.tone}>
        {meta.label}
        {score.tier !== "unknown" && <span className="font-semibold tabular-nums">{score.composite}</span>}
        {score.quick && score.tier !== "unknown" && <span className="text-ink-3">·</span>}
      </Badge>
      {score.tier !== "unknown" && <ScoreBar value={score.composite} tier={score.tier} />}
    </div>
  );
}

export function ScoreBar({ value, tier, className }: { value: number; tier: Tier | "unknown"; className?: string }) {
  return (
    <div className={cn("h-1 w-16 overflow-hidden rounded-full bg-white/8", className)} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, value)}%`, background: TIER_COLOR[tier] }} />
    </div>
  );
}

export function TagList({ tags, className }: { tags: PilotTag[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <span key={t.key} title={`${t.why}${t.evidence === "lifetime" ? " (historic)" : ""}`}>
          <Badge tone={t.key === "cyno" || t.key === "capital" || t.key === "blops" ? "warning" : "neutral"} className={t.evidence === "lifetime" ? "opacity-55" : undefined}>
            {t.label}
          </Badge>
        </span>
      ))}
    </span>
  );
}

/** Each dimension with its score bar and the reason, so a veteran can check the number. */
export function DimensionBreakdown({
  dimensions,
  recencyGate,
  columns = 2,
}: {
  dimensions: DimensionScore[];
  recencyGate: number;
  /** Two columns where the breakdown spans the page, one in narrow panels. */
  columns?: 1 | 2;
}) {
  return (
    <div>
      <ul className={cn("grid gap-x-6 gap-y-1.5", columns === 2 && "md:grid-cols-2")}>
        {dimensions.map((d) => (
          <li key={d.key} className={cn("flex items-start gap-3 text-xs", !d.available && "opacity-50")}>
            <span className="w-28 shrink-0 text-ink-2">{d.label}</span>
            <span className="mt-1.5 shrink-0">
              <ScoreBar value={d.available ? d.score : 0} tier={d.score >= 75 ? "extreme" : d.score >= 50 ? "high" : d.score >= 25 ? "moderate" : "low"} className="w-12" />
            </span>
            <span className="w-7 shrink-0 text-right font-semibold text-ink tabular-nums">{d.available ? d.score : "–"}</span>
            <span className="min-w-0 text-ink-3">
              {d.why}
              {d.evidence === "lifetime" && <span className="text-ink-3"> (historic)</span>}
            </span>
          </li>
        ))}
      </ul>
      {recencyGate < 0.99 && (
        <p className="mt-2 text-xs text-ink-3">Score damped to {Math.round(recencyGate * 100)}% because the pilot has not been active recently.</p>
      )}
    </div>
  );
}
