import { displaySecurity, securityColor } from "@/core/eve/images";
import { shortClass, type ClassKey } from "./static";

/**
 * Badge fills for system classes, in the colours wormholers know from the game and Pathfinder: C1–C3 green, C4–C5
 * yellow, C6 red. Checked with the dataviz validator (`--mode dark`, surface #15171b): every fill clears 3:1, and
 * green/yellow/red stay apart for normal vision (ΔE ≥ 27) and colour-vision deficiency (adjacent ΔE ≥ 20; green↔red
 * 7.1 for protans). The class code is always written in the badge, so colour is never the only cue. C6 and null-sec
 * share "red = dangerous" on purpose. Specials get a neutral chip with their name; k-space shows its security
 * status in the security colours (`securityColor`).
 */
const GREEN = "#2a8f3d";
const YELLOW = "#ecc94b";
const RED = "#e5534b";

export const WSPACE_COLORS: Record<"c1" | "c2" | "c3" | "c4" | "c5" | "c6", string> = {
  c1: GREEN,
  c2: GREEN,
  c3: GREEN,
  c4: YELLOW,
  c5: YELLOW,
  c6: RED,
};

const NEUTRAL = "#3a3f48";

export interface ClassBadgeStyle {
  background: string;
  color: string;
  /** Text shown in the badge: class code or security status. */
  text: string | null;
}

const DARK_INK = "#06101c";
const LIGHT_INK = "#ffffff";

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark or light ink, whichever contrasts more with the fill. */
export function inkOn(hex: string): string {
  return contrast(hex, DARK_INK) >= contrast(hex, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/** `text` is null when the caller should print the translated class name (specials). */
export function classBadgeStyle(cls: ClassKey, sec: number | null): ClassBadgeStyle {
  if (cls in WSPACE_COLORS) {
    const background = WSPACE_COLORS[cls as keyof typeof WSPACE_COLORS];
    return { background, color: inkOn(background), text: cls.toUpperCase() };
  }
  if (sec !== null && (cls === "hs" || cls === "ls" || cls === "ns" || cls === "pochven")) {
    const background = securityColor(sec);
    return { background, color: inkOn(background), text: displaySecurity(sec) };
  }
  if (cls === "hs" || cls === "ls" || cls === "ns") {
    // A destination class without a system: a representative security colour.
    const background = securityColor(cls === "hs" ? 0.7 : cls === "ls" ? 0.3 : -0.5);
    return { background, color: inkOn(background), text: shortClass(cls) };
  }
  return { background: NEUTRAL, color: "#ededee", text: cls === "c13" ? "C13" : null };
}
