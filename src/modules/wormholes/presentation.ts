import type { Messages } from "@/i18n/messages";
import { displayBand, timeLeft, type LifeState } from "./lifetime";
import type { WormholeType } from "./static";
import { connectionSize, type MapConnection } from "./state";

/**
 * How a connection is drawn. Lifetime → dash pattern, mass → stroke width;
 * colour only adds emphasis (warning from end of life, critical for critical
 * mass) and every state is also written on the label.
 */
export const DASH: Record<LifeState, string | undefined> = {
  fresh: undefined,
  lt1d: "10 6",
  lt4h: "2 6",
  lt1h: "1 5",
  closing: "1 8",
};

export const MASS_WIDTH = { stable: 4, reduced: 2.5, critical: 1.5 } as const;

// Theme tokens, so the lines follow light and dark mode (SVG strokes are set through `style`).
export const INK_2 = "var(--color-ink-2)";
const WARNING = "var(--color-warning)";
const CRITICAL_TEXT = "var(--color-critical-text)";

export interface EdgeLook {
  band: LifeState;
  dash: string | undefined;
  width: number;
  color: string;
  collapsed: boolean;
}

export function edgeLook(conn: MapConnection, now: number): EdgeLook {
  const at = new Date(now);
  const band = displayBand(conn.life, conn.expiresBy, at);
  const collapsed = timeLeft(conn.expiresBy, at) === 0;
  const color = conn.mass === "critical" ? CRITICAL_TEXT : band === "lt4h" || band === "lt1h" || band === "closing" ? WARNING : INK_2;
  return { band, dash: DASH[band], width: MASS_WIDTH[conn.mass], color, collapsed };
}

/** "C247 · EOL ≤3h 12m · ½m · S": type, end of life, time left, mass, unusual size. */
export function connectionLabel(
  conn: MapConnection,
  types: Record<string, WormholeType>,
  now: number,
  tw: Messages["wormholes"],
): string {
  const look = edgeLook(conn, now);
  const size = connectionSize(conn, types);
  const parts = [
    conn.type ?? "?",
    look.band === "lt4h" || look.band === "lt1h" ? "EOL" : null,
    tw.timeLeft(Math.floor(timeLeft(conn.expiresBy, new Date(now)) / 60_000)),
    conn.mass === "stable" ? null : tw.massShort[conn.mass],
    size && (conn.size || size === "S" || size === "XL") ? size : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** "Wolf-Rayet Star" → "Wolf-Rayet", "Cataclysmic Variable" → "Cataclysmic", to fit on a map node. */
export const shortEffect = (effect: string | null) => effect?.replace(/ (Star|Variable)$/, "") ?? null;
