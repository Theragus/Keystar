import { Badge } from "@/components/ui/badge";
import type { Standing } from "../types";

const LABELS = {
  own: { tone: "good", label: "Friendly" },
  blue: { tone: "accent", label: "Blue" },
  lightblue: { tone: "accent", label: "Light blue" },
  orange: { tone: "warning", label: "Orange" },
  red: { tone: "critical", label: "Red" },
} as const;

/** Standing as a labelled badge (colour never carries the meaning alone). Neutral shows nothing. */
export function StandingBadge({ standing }: { standing: Standing }) {
  if (standing.cls === "neutral") return null;
  const meta = LABELS[standing.cls];
  const value = standing.value === null ? "" : ` ${standing.value > 0 ? "+" : ""}${standing.value}`;
  const title =
    standing.cls === "own"
      ? "Your corporation or alliance"
      : `${standing.source === "alliance" ? "Alliance" : "Corporation"} contact (via ${standing.via})`;
  return (
    <span title={title}>
      <Badge tone={meta.tone}>
        {meta.label}
        {value}
      </Badge>
    </span>
  );
}
