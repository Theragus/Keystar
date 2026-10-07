import { z } from "zod";
import { callStructured, clip, type ClaudeClient } from "@/modules/intel/ai/claude";
import { THREAT_LEVELS } from "@/modules/intel/ai/types";
import type { Locale } from "@/i18n/config";
import type { RouteFacts } from "./facts";

/**
 * Claude's route briefing: a reading of the computed facts, never new facts.
 * Same rules and markup as the threat intel notes (rendered by the
 * killboard's safe markup, never as HTML).
 */
export interface RouteBriefing {
  headline: string;
  threatLevel: (typeof THREAT_LEVELS)[number];
  summary: string;
  hotspots: { system: string; note: string }[];
  advice: string;
}

const Schema = z.object({
  headline: z.string(),
  threatLevel: z.enum(THREAT_LEVELS),
  summary: z.string(),
  hotspots: z.array(z.object({ system: z.string(), note: z.string() })),
  advice: z.string(),
});

export const ROUTE_SYSTEM = `You are the travel intelligence officer of an EVE Online player corporation. A pilot is about to fly a stargate route; brief them from the computed facts provided as JSON: kills at the route's gates in the last hours (from zKillboard), tags of what the camps used, and statistical camp estimates for the time they reach each gate. Write like a crisp pre-flight briefing with EVE flavour: specific and practical, never cheesy.

Rules:
- Use only facts from the JSON. Never invent numbers, names, ships, systems or events, and never contradict the computed status, levels or chances.
- Lead with what is happening now (status "camp", kills minutes ago), then likely camps from history and regulars seen nearby.
- Tags: smartbomb (smartbombs did damage: fast ships and pods die), interdictor and hic (bubbles in null-sec; a HIC's point everywhere), gank (CONCORD on the mail: high-sec suicide gankers), hotdrop (Black Ops or capitals), pod (the camp kills pods).
- A camp estimate is a chance from public killmails, not a certainty; low confidence means little history. "quietSystems" saw nothing.
- If the feed is "delayed" or "offline", say that the newest kills may be missing.
- Spell pilot, group, ship and system names exactly as given.
- The only formatting allowed inside text: **bold** for ships, systems and key figures; {+text} for good news; {-text} for danger; {@Name} for pilot names. No HTML, headings, lists or emoji.
- headline: one line under 90 characters, no markup.
- threatLevel: "minimal" (nothing on the route), "low", "elevated", "high" or "critical" (an active camp, smartbombs or bubbles on a gate you must take, or gankers at a high-sec gate a hauler would use).
- summary: 2 to 4 sentences: the route's overall picture.
- hotspots: up to 5 systems from the facts, by exact "name", each with a short note under 140 characters on what is there and when.
- advice: one or two sentences of concrete guidance (for example take the safer route, avoid a system, wait an hour, scout ahead, use an insta-warp or cloaky ship, or go now while it is quiet).`;

const LANGUAGE: Record<Locale, string> = {
  en: "Write every text field in English.",
  de:
    "Write every text field in German (informal, as German EVE players talk). Keep the EVE terms they use in English " +
    "(gate camp, bubble, smartbomb, insta-warp, scout, gank, hot drop, pod, tackle) and every pilot, group, ship and system name exactly as given. " +
    "The threatLevel value stays in English.",
};

const plain = (s: string, max: number) => clip(s.replace(/[*{}]/g, ""), max);

/** Trims and caps the briefing; keeps only hotspots that name a listed system. */
export function sanitizeRouteBriefing(raw: z.infer<typeof Schema>, facts: RouteFacts): RouteBriefing {
  if (!raw.headline.trim() || !raw.summary.trim()) throw new Error("Claude returned an empty briefing");
  const known = new Map((facts.systems as { name: string }[]).map((s) => [s.name.toLowerCase(), s.name]));
  const seen = new Set<string>();
  const hotspots: RouteBriefing["hotspots"] = [];
  for (const h of raw.hotspots) {
    const name = known.get(h.system.trim().toLowerCase());
    if (!name || seen.has(name)) continue;
    seen.add(name);
    hotspots.push({ system: name, note: clip(h.note, 200) });
  }
  return {
    headline: plain(raw.headline, 120),
    threatLevel: raw.threatLevel,
    summary: clip(raw.summary, 1000),
    hotspots: hotspots.slice(0, 5),
    advice: clip(raw.advice, 400),
  };
}

export async function claudeRouteBriefing(
  facts: RouteFacts,
  opts: {
    apiKey: string;
    model: string;
    locale: Locale;
    client?: ClaudeClient;
  },
): Promise<{
  content: RouteBriefing;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const user = `Brief me on the route ${facts.route.from} → ${facts.route.to}.\n\n<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>\n\n${LANGUAGE[opts.locale]}`;
  const out = await callStructured(Schema, ROUTE_SYSTEM, user, {
    ...opts,
    effort: "low",
    maxTokens: 8000,
    timeoutMs: 60_000,
  });
  return {
    content: sanitizeRouteBriefing(out.parsed, facts),
    model: out.model,
    usage: out.usage,
  };
}
