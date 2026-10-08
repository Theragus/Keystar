import type { Formatter } from "@/lib/format";
import { MARKET_ROOTS } from "../sde/catalog";

/** Drag payload: the type id of the item being dragged from the browser. */
export const DRAG_MIME = "application/x-keystar-type-id";

/** Browser roots: the market group each shows and its dictionary key. */
export const BROWSER_ROOTS = [
  { key: "ships", id: MARKET_ROOTS.ships },
  { key: "equipment", id: MARKET_ROOTS.equipment },
  { key: "modifications", id: MARKET_ROOTS.modifications },
  { key: "charges", id: MARKET_ROOTS.charges },
  { key: "drones", id: MARKET_ROOTS.drones },
] as const;
export type BrowserRoot = (typeof BROWSER_ROOTS)[number]["key"];

/** Short meta labels for the badges (the SDE's names are English either way). */
const META_SHORT: Record<number, string> = { 1: "T1", 2: "T2", 3: "Story", 4: "Faction", 5: "Officer", 6: "Deadspace", 14: "T3", 15: "Abyssal" };
export function metaShort(metaGroupId: number, name: string | undefined): string | null {
  if (!metaGroupId) return null;
  return META_SHORT[metaGroupId] ?? name ?? null;
}

/**
 * The game's meta colours, so a badge reads the same as in the fitting window: Tech II orange, Tech III teal,
 * storyline olive, faction dark green, deadspace blue, officer purple, abyssal crimson. Tech I has none. By
 * decision for this module these follow the game rather than the colour-vision-safe chart palette.
 */
const META_COLOR: Record<number, string> = {
  2: "#d9641e",
  3: "#7e9a2e",
  4: "#1e6b3c",
  5: "#6f36c7",
  6: "#2457c5",
  14: "#1e9fb0",
  15: "#b8284f",
};
export function metaColor(metaGroupId: number): string | null {
  return META_COLOR[metaGroupId] ?? null;
}

/** 83.2 → "1m 23s", 4000 → "1h 06m", 9.5 → "9.5s". */
export function formatDuration(seconds: number, f: Formatter): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "–";
  if (seconds < 60) return `${f.number(seconds, 1)}s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}
