import { displaySecurity, securityColor } from "@/core/eve/images";
import { shortClass, type ClassKey } from "./static";

/**
 * Badge fills for system classes. C1–C6 are ordinal, so they use one violet
 * ramp (blue, green and yellow are taken by the security colours shown next to
 * them): validated with the dataviz validator, `--ordinal --mode dark` on
 * #15171b: monotone lightness, adjacent ΔL ≥ 0.06, darkest step 2.45:1.
 * Higher classes are lighter, i.e. more salient. Specials get a neutral chip
 * with their name; k-space shows its security status in the EVE colours.
 */
export const WSPACE_RAMP: Record<"c1" | "c2" | "c3" | "c4" | "c5" | "c6", string> = {
  c1: "#6343a4",
  c2: "#795fb7",
  c3: "#907bca",
  c4: "#a896dd",
  c5: "#c1b3ef",
  c6: "#dacfff",
};

const NEUTRAL = "#3a3f48";

export interface ClassBadgeStyle {
  background: string;
  color: string;
  /** Text shown in the badge: class code or security status. */
  text: string | null;
}

/** Dark or light ink, whichever clears contrast on the fill. */
export function inkOn(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#06101c" : "#ffffff";
}

/** `text` is null when the caller should print the translated class name (specials). */
export function classBadgeStyle(cls: ClassKey, sec: number | null): ClassBadgeStyle {
  if (cls in WSPACE_RAMP) {
    const background = WSPACE_RAMP[cls as keyof typeof WSPACE_RAMP];
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
