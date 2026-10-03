import type { OreClass } from "@/core/eve/ore";

/**
 * Chart colours. Categorical slots validated on the dark glass surface
 * (#14161a): adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.8, all ≥ 3:1.
 * Moon rarity is ordinal (R4 → R64), so it uses one blue ramp instead of
 * new hues — validated with --ordinal.
 */
export type ChartClass = "moon" | "ore" | "ice" | "gas" | "other";

export type MoonOreClass = Extract<OreClass, `moon_${string}`>;

/** Series order and colours; labels live in the dictionaries (`t.mining.chartClasses`). */
export const CHART_CLASSES: { id: ChartClass; color: string }[] = [
  { id: "moon", color: "#3987e5" },
  { id: "ore", color: "#d95926" },
  { id: "ice", color: "#199e70" },
  { id: "gas", color: "#c98500" },
  { id: "other", color: "#5d6878" },
];

export const CHART_CLASS_COLOR: Record<ChartClass, string> = Object.fromEntries(
  CHART_CLASSES.map((c) => [c.id, c.color]),
) as Record<ChartClass, string>;

export function chartClassOf(oreClass: OreClass): ChartClass {
  if (oreClass.startsWith("moon_")) return "moon";
  if (oreClass === "ore" || oreClass === "ice" || oreClass === "gas") return oreClass;
  return "other";
}

/**
 * Ordinal ramp for moon rarity: rarer = lighter (more salient on the dark surface).
 * Labels live in the dictionaries (`t.mining.moonRarity`).
 */
export const MOON_RARITY: { id: MoonOreClass; color: string }[] = [
  { id: "moon_r4", color: "#184f95" },
  { id: "moon_r8", color: "#256abf" },
  { id: "moon_r16", color: "#3987e5" },
  { id: "moon_r32", color: "#6da7ec" },
  { id: "moon_r64", color: "#9ec5f4" },
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
