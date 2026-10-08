import type { Fit } from "@eveshipfit/dogma-engine";
import type { Engine } from "./engine";

/*
 * Import and export of fits in the formats pilots pass around, on top of the engine's parsers: EFT text (what the
 * game copies), DNA (`fitting:` links from chat) and Keystar share links (the engine's compact link payload in
 * the URL fragment, so nothing is stored server-side).
 */

export type FitFormat = "eft" | "dna" | "link" | "esf";

export const LINK_PARAM = "fit";

/** What a pasted text looks like; null when it is none of the known formats. */
export function detectFormat(text: string): FitFormat | null {
  const s = text.trim();
  if (!s) return null;
  if (s.startsWith("%esf/")) return "esf";
  if (s.startsWith("[")) return "eft";
  if (/^(<url=)?fitting:\d+:/i.test(s) || /^\d+(:\d+(;\d+)?)*::?$/.test(s)) return "dna";
  if (/^https?:\/\//i.test(s)) return extractLinkPayload(s) ? "link" : null;
  if (/^[A-Za-z0-9_-]{16,}$/.test(s)) return "link";
  return null;
}

/** The share payload of a Keystar fitting URL (`/fitting#fit=…`), or null. */
export function extractLinkPayload(url: string): string | null {
  try {
    const u = new URL(url, "http://localhost");
    const fromHash = new URLSearchParams(u.hash.replace(/^#/, "")).get(LINK_PARAM);
    return fromHash || u.searchParams.get(LINK_PARAM);
  } catch {
    return null;
  }
}

/** Parses a pasted fit; throws an Error whose message names what went wrong. */
export function importFit(engine: Engine, text: string): Fit {
  const s = text.trim();
  switch (detectFormat(s)) {
    case "eft":
      return engine.load_eft(s);
    case "esf":
      return engine.load_esf(s);
    case "dna": {
      const dna = s.replace(/^<url=/i, "").replace(/^fitting:/i, "").replace(/>.*$/s, "");
      return engine.load_dna(dna);
    }
    case "link":
      return engine.load_esf_link(/^https?:\/\//i.test(s) ? (extractLinkPayload(s) ?? "") : s);
    default:
      throw new Error("unknown format");
  }
}

export function exportEft(engine: Engine, fit: Fit): string {
  return engine.save_eft(fit);
}

/** The share link's fragment value; the page reads it on load. */
export function sharePayload(engine: Engine, fit: Fit): string {
  return engine.save_esf_link(fit);
}

export function shareUrl(engine: Engine, fit: Fit, origin: string): string {
  return `${origin}/fitting#${LINK_PARAM}=${encodeURIComponent(sharePayload(engine, fit))}`;
}
