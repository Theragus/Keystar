import type { OreClass } from "@/core/eve/ore";

/**
 * Chart colours. Categorical slots validated on the dark glass surface
 * (#14161a): adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.8, all ≥ 3:1.
 * Moon rarity is ordinal (R4 → R64), so it uses one blue ramp instead of
 * new hues — validated with --ordinal.
 */
export type ChartClass = "moon" | "ore" | "ice" | "gas" | "other";

export const CHART_CLASSES: { id: ChartClass; label: string; color: string }[] = [
  { id: "moon", label: "Moon ore", color: "#3987e5" },
  { id: "ore", label: "Asteroid ore", color: "#d95926" },
  { id: "ice", label: "Ice", color: "#199e70" },
  { id: "gas", label: "Gas", color: "#c98500" },
  { id: "other", label: "Other", color: "#5d6878" },
];

export const CHART_CLASS_COLOR: Record<ChartClass, string> = Object.fromEntries(
  CHART_CLASSES.map((c) => [c.id, c.color]),
) as Record<ChartClass, string>;

export function chartClassOf(oreClass: OreClass): ChartClass {
  if (oreClass.startsWith("moon_")) return "moon";
  if (oreClass === "ore" || oreClass === "ice" || oreClass === "gas") return oreClass;
  return "other";
}

/** Ordinal ramp for moon rarity: rarer = lighter (more salient on the dark surface). */
export const MOON_RARITY: { id: OreClass; label: string; color: string }[] = [
  { id: "moon_r4", label: "R4 Ubiquitous", color: "#184f95" },
  { id: "moon_r8", label: "R8 Common", color: "#256abf" },
  { id: "moon_r16", label: "R16 Uncommon", color: "#3987e5" },
  { id: "moon_r32", label: "R32 Rare", color: "#6da7ec" },
  { id: "moon_r64", label: "R64 Exceptional", color: "#9ec5f4" },
];

export function oreClassColor(oreClass: OreClass): string {
  return MOON_RARITY.find((m) => m.id === oreClass)?.color ?? CHART_CLASS_COLOR[chartClassOf(oreClass)];
}

/** Collapses per-OreClass values into chart classes. */
export function toChartClasses(values: Partial<Record<OreClass, number>>): Record<ChartClass, number> {
  const out: Record<ChartClass, number> = { moon: 0, ore: 0, ice: 0, gas: 0, other: 0 };
  for (const [k, v] of Object.entries(values)) out[chartClassOf(k as OreClass)] += v ?? 0;
  return out;
}
