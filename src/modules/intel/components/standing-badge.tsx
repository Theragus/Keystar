import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/i18n/server";
import type { Standing } from "../types";

const TONE = {
  own: "good",
  blue: "accent",
  lightblue: "accent",
  orange: "warning",
  red: "critical",
} as const;

/** Standing as a labelled badge (colour never carries the meaning alone). Neutral shows nothing. */
export async function StandingBadge({ standing }: { standing: Standing }) {
  if (standing.cls === "neutral") return null;
  const { t, f } = await getI18n();
  const s = t.intel.standings;
  const value = standing.value === null ? "" : ` ${standing.value > 0 ? "+" : ""}${f.number(standing.value, Number.isInteger(standing.value) ? 0 : 1)}`;
  return (
    <span title={standing.cls === "own" ? s.own : s.contact(standing.source, standing.via)}>
      <Badge tone={TONE[standing.cls]}>
        {s.labels[standing.cls]}
        {value}
      </Badge>
    </span>
  );
}
