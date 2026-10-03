import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CONFIDENCE, THREAT_LEVELS, type Briefing, type Dossier } from "./types";
import type { BriefingFacts, DossierFacts } from "./facts";

/**
 * Claude writes the narrative for threat intel from computed facts, using
 * structured outputs so the response is validated JSON. Scores, tags and tiers
 * are computed in code; the model interprets them and never invents numbers.
 * Everything it sees is public (zKillboard, ESI) or the corporation's own
 * killboard.
 */

export type ClaudeClient = Pick<Anthropic, "messages">;
type Effort = "low" | "medium" | "high";

export interface ClaudeOptions {
  apiKey: string;
  model: string;
  client?: ClaudeClient;
}

export interface ClaudeResult<T> {
  content: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MARKUP = `The only formatting allowed inside text: **bold** for ships, systems and key figures; {+text} for good news for us; {-text} for danger or bad news; {@Name} for pilot names. No HTML, headings, lists or emoji.`;

const RULES = `Rules:
- Use only facts from the JSON. Never invent numbers, names, ships, systems or events, and never contradict the computed tiers, scores or tags.
- Lead with what is happening now: the latest killmails, the last 24 hours and the last 7 days come before anything else. Lifetime numbers are background only; a pilot who was dangerous long ago but shows no recent activity is not a current threat, so say so instead of hyping them.
- "Historic" tags were true in the past but have no recent evidence; treat them as possible, not certain.
- "historyWithUs" is the corporation's own record of fights with these pilots, newest first: what they brought and how it went. Use it when it exists.
- Spell pilot, ship and system names exactly as given.
- ${MARKUP}`;

export const BRIEFING_SYSTEM = `You are the intelligence officer of an EVE Online player corporation. A pilot pasted a list of pilots (local chat, a fleet or names) and you brief the corporation on who they are, based only on the computed facts provided as JSON. Write like a crisp military briefing with EVE flavour: confident and specific, never cheesy.

${RULES}
- headline: one line under 90 characters, no markup.
- threatLevel: "minimal" (nobody active or dangerous), "low", "elevated", "high" or "critical" (an active, dangerous group, hot-drop or capital capability, or a gang that recently beat us). Base it on the tiers, recent activity, roles and the history with us.
- recent: one or two sentences on what these pilots did in the last day and week (latest killmails first).
- paragraphs: 1 to 3 short paragraphs, 60 to 200 words in total: who matters most and why, the likely fleet composition and roles (cyno, tackle, logi, capitals), who flies together, and what happened when we fought them.
- keyPilots: up to 5 pilots to watch, by "id" from the facts, each with a short note under 120 characters.
- advice: one sentence of guidance for our pilots (for example dock up, avoid the gate, safe to operate, or a fight we can take).`;

export const DOSSIER_SYSTEM = `You are the intelligence officer of an EVE Online player corporation. Write a short dossier on one pilot from the computed facts provided as JSON.

${RULES}
- summary: two sentences: who this pilot is right now and how dangerous they are.
- recentActivity: what they did recently, from the latest killmails and the last 7 and 30 days.
- playstyle: how they fight (solo or gang size, hulls, roles, time zone, where), one or two sentences.
- watchFor: up to 4 short, concrete warnings (for example "Covert cyno on recent losses", "Hunts with a Sabre at gates").
- historyWithUs: one sentence about fights with our corporation, or null if there are none.
- confidence: "high" with many recent killmails, "medium" with a few or only statistics, "low" with almost nothing recent.`;

const BriefingSchema = z.object({
  headline: z.string(),
  threatLevel: z.enum(THREAT_LEVELS),
  recent: z.string(),
  paragraphs: z.array(z.string()),
  keyPilots: z.array(z.object({ id: z.number(), note: z.string() })),
  advice: z.string(),
});

const DossierSchema = z.object({
  summary: z.string(),
  recentActivity: z.string(),
  playstyle: z.string(),
  watchFor: z.array(z.string()),
  historyWithUs: z.string().nullable(),
  confidence: z.enum(CONFIDENCE),
});

export const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const plain = (s: string, max: number) => clip(s.replace(/[*{}]/g, ""), max);

async function callStructured<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  opts: ClaudeOptions & { effort: Effort; maxTokens: number; timeoutMs: number },
): Promise<{ parsed: z.infer<S>; model: string; usage: ClaudeResult<unknown>["usage"] }> {
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
  const message = await client.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema), effort: opts.effort },
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined to write this");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens)");
  if (!message.parsed_output) throw new Error("Claude's response did not match the expected format");
  return {
    parsed: message.parsed_output as z.infer<S>,
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}

/** Normalises a briefing: trims, caps lengths, keeps only pilots that are in the facts. */
export function sanitizeBriefing(raw: z.infer<typeof BriefingSchema>, knownIds: Set<number>): Briefing {
  const paragraphs = raw.paragraphs.map((p) => clip(p, 1200)).filter(Boolean).slice(0, 4);
  if (!raw.headline.trim() || (!paragraphs.length && !raw.recent.trim())) throw new Error("Claude returned an empty briefing");
  const seen = new Set<number>();
  return {
    headline: plain(raw.headline, 120),
    threatLevel: raw.threatLevel,
    recent: clip(raw.recent, 500),
    paragraphs,
    keyPilots: raw.keyPilots
      .filter((k) => knownIds.has(k.id) && !seen.has(k.id) && seen.add(k.id))
      .slice(0, 5)
      .map((k) => ({ characterId: k.id, note: clip(k.note, 160) })),
    advice: clip(raw.advice, 300),
  };
}

export function sanitizeDossier(raw: z.infer<typeof DossierSchema>): Dossier {
  if (!raw.summary.trim()) throw new Error("Claude returned an empty dossier");
  return {
    summary: clip(raw.summary, 500),
    recentActivity: clip(raw.recentActivity, 600),
    playstyle: clip(raw.playstyle, 500),
    watchFor: raw.watchFor.map((w) => plain(w, 140)).filter(Boolean).slice(0, 4),
    historyWithUs: raw.historyWithUs?.trim() ? clip(raw.historyWithUs, 300) : null,
    confidence: raw.confidence,
  };
}

export async function claudeBriefing(facts: BriefingFacts, opts: ClaudeOptions): Promise<ClaudeResult<Briefing>> {
  const where = facts.scan.system ? ` in ${facts.scan.system}` : "";
  const user = `Brief us on these ${facts.scan.pilots} pilots${where}, scanned ${facts.scan.scannedAt}.\n\n<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>`;
  const out = await callStructured(BriefingSchema, BRIEFING_SYSTEM, user, { ...opts, effort: "medium", maxTokens: 16000, timeoutMs: 90_000 });
  return { content: sanitizeBriefing(out.parsed, new Set(facts.pilots.map((p) => p.id))), model: out.model, usage: out.usage };
}

export async function claudeDossier(facts: DossierFacts, opts: ClaudeOptions): Promise<ClaudeResult<Dossier>> {
  const user = `Write the dossier for ${facts.pilot.name}.\n\n<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>`;
  const out = await callStructured(DossierSchema, DOSSIER_SYSTEM, user, { ...opts, effort: "low", maxTokens: 8000, timeoutMs: 45_000 });
  return { content: sanitizeDossier(out.parsed), model: out.model, usage: out.usage };
}
