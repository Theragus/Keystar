import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { CONFIDENCE, MATCH_CONFIDENCE, THREAT_LEVELS, type Briefing, type Dossier, type DscanRead } from "./types";
import type { BriefingFacts, DossierFacts, DscanFacts } from "./facts";

/**
 * Claude writes the narrative for threat intel from computed facts, using
 * structured outputs so the response is validated JSON. Scores, tags and tiers
 * are computed in code; the model interprets them and never invents numbers.
 * Everything it sees is public (zKillboard, ESI) or the corporation's own
 * killboard.
 */

export type ClaudeClient = Pick<Anthropic, "messages">;
export type Effort = "low" | "medium" | "high";

export interface ClaudeOptions {
  apiKey: string;
  model: string;
  /** The language to write in: whoever asked for the note (the scan's creator for automatic briefings). */
  locale: Locale;
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

export const DSCAN_SYSTEM = `You are the intelligence officer of an EVE Online player corporation. A pilot pasted a directional scan (ships on scan) next to the pilots in local. From the computed facts as JSON, say who is probably flying what.

${RULES}
- For every hull on the d-scan you may only name pilots from that hull's "candidates" (or no one). Prefer pilots who flew the exact hull recently; a pilot flies at most one hull; never assign more pilots to a hull than are on scan.
- assignments: one entry per pilot you place, with the hull's typeId, the pilot's id, confidence "likely" (flew this exact hull in the last week), "possible" (flew it before) or "guess" (only the hull class matches), and a short reason under 120 characters. Use characterId null for hulls you cannot place.
- assessment: two or three sentences on what this d-scan means: the likely composition and roles, how it fits the pilots in local, and the main danger.
- notes: one sentence on caveats (hulls nobody in local flies, pilots in local not on scan), or an empty string.`;

const DscanSchema = z.object({
  assessment: z.string(),
  assignments: z.array(z.object({ typeId: z.number(), characterId: z.number().nullable(), confidence: z.enum(MATCH_CONFIDENCE), reason: z.string() })),
  notes: z.string(),
});

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

/** Facts are always English; the note is written in the asker's language. Enum fields stay as specified. */
const LANGUAGE: Record<Locale, string> = {
  en: "Write every text field in English.",
  de:
    "Write every text field in German (informal, as German EVE players talk). Keep the EVE terms they use in English " +
    "(kill, tackle, cyno, gate camp, hot drop, logi, blob, small gang, d-scan, local) and every pilot, ship, system and " +
    "corporation name exactly as given. Enum values (threatLevel, confidence) stay in English.",
};

const ask = (task: string, facts: unknown, locale: Locale) =>
  `${task}\n\n<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>\n\n${LANGUAGE[locale]}`;

export async function callStructured<S extends z.ZodType>(
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
  const user = ask(`Brief us on these ${facts.scan.pilots} pilots${where}, scanned ${facts.scan.scannedAt}.`, facts, opts.locale);
  const out = await callStructured(BriefingSchema, BRIEFING_SYSTEM, user, { ...opts, effort: "medium", maxTokens: 16000, timeoutMs: 90_000 });
  return { content: sanitizeBriefing(out.parsed, new Set(facts.pilots.map((p) => p.id))), model: out.model, usage: out.usage };
}

export async function claudeDossier(facts: DossierFacts, opts: ClaudeOptions): Promise<ClaudeResult<Dossier>> {
  const user = ask(`Write the dossier for ${facts.pilot.name}.`, facts, opts.locale);
  const out = await callStructured(DossierSchema, DOSSIER_SYSTEM, user, { ...opts, effort: "low", maxTokens: 8000, timeoutMs: 45_000 });
  return { content: sanitizeDossier(out.parsed), model: out.model, usage: out.usage };
}

/** Keeps only assignments the computed candidates allow: per hull at most the count on scan, each pilot once. */
export function sanitizeDscan(raw: z.infer<typeof DscanSchema>, facts: DscanFacts): DscanRead {
  if (!raw.assessment.trim()) throw new Error("Claude returned an empty d-scan read");
  const rows = new Map(facts.dscan.map((r) => [r.typeId, r]));
  const used = new Map<number, number>();
  const pilots = new Set<number>();
  const assignments: DscanRead["assignments"] = [];
  for (const a of raw.assignments) {
    const row = rows.get(a.typeId);
    if (!row) continue;
    if ((used.get(a.typeId) ?? 0) >= row.onScan) continue;
    if (a.characterId !== null && (!row.candidates.some((c) => c.id === a.characterId) || pilots.has(a.characterId))) continue;
    used.set(a.typeId, (used.get(a.typeId) ?? 0) + 1);
    if (a.characterId !== null) pilots.add(a.characterId);
    assignments.push({ typeId: a.typeId, characterId: a.characterId, confidence: a.confidence, reason: clip(a.reason, 160) });
  }
  return { assessment: clip(raw.assessment, 800), assignments, notes: clip(raw.notes, 300) };
}

export async function claudeDscan(facts: DscanFacts, opts: ClaudeOptions): Promise<ClaudeResult<DscanRead>> {
  const user = ask("Who is flying what on this d-scan?", facts, opts.locale);
  const out = await callStructured(DscanSchema, DSCAN_SYSTEM, user, { ...opts, effort: "low", maxTokens: 8000, timeoutMs: 45_000 });
  return { content: sanitizeDscan(out.parsed, facts), model: out.model, usage: out.usage };
}
