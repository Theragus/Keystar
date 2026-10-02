import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { READINESS_LEVELS, type ReportFacts, type SituationReport } from "./types";

/**
 * Writes the situation report with Claude, using structured outputs so the
 * response is validated JSON. The model only sees aggregated numbers and
 * names that are public on zKillboard anyway.
 */

const ReportSchema = z.object({
  headline: z.string(),
  paragraphs: z.array(z.string()),
  readiness: z.object({
    level: z.enum(READINESS_LEVELS),
    label: z.string(),
    assessment: z.string(),
  }),
});

export const SYSTEM_PROMPT = `You are the fleet intelligence officer of an EVE Online player corporation. Each week you write a short situation report (sitrep) for its pilots, based only on the statistics provided as JSON.

Style: a crisp military briefing with EVE flavour: confident, a little dramatic, never cheesy. Refer to the corporation in the third person. Dates are EVE time; the year may be given as YC.

Rules:
- Use only facts from the JSON. Never invent numbers, names, ships, systems or events, and don't speculate about causes the numbers don't show.
- Write 2 or 3 paragraphs, 120 to 220 words in total: (1) the overall result against the previous week, (2) pilots and ship/doctrine trends, (3) the theatre of operations and notable kills or losses. Skip a topic when the data for it is empty.
- Spell pilot, ship and system names exactly as given. Quote ISK amounts exactly as formatted in the JSON, followed by "ISK".
- The only formatting allowed inside paragraphs: **bold** for ships, systems and key figures; {+text} for good news (kills, ISK destroyed, gains); {-text} for bad news (losses, ISK lost, declines); {@Name} for pilot names. No HTML, headings, lists or emoji.
- headline: one punchy line under 80 characters, without markup.
- readiness.level: "surging" (activity clearly up with a good exchange rate), "steady" (baseline), "strained" (losing more than gaining, or ISK efficiency under about 50%), or "quiet" (little or no contact). readiness.label: an all-caps status line under 40 characters. readiness.assessment: one sentence of guidance.`;

export function userPrompt(facts: ReportFacts): string {
  const who = facts.corporation.ticker ? `${facts.corporation.name} [${facts.corporation.ticker}]` : facts.corporation.name;
  return `Write the situation report for ${who} covering ${facts.window.label} YC${facts.window.yc}.\n\n<stats>\n${JSON.stringify(facts, null, 2)}\n</stats>`;
}

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Normalises model output: trims, caps lengths and drops empty paragraphs. */
export function sanitizeReport(raw: z.infer<typeof ReportSchema>): SituationReport {
  const paragraphs = raw.paragraphs.map((p) => clip(p, 1500)).filter(Boolean).slice(0, 4);
  if (!paragraphs.length || !raw.headline.trim()) throw new Error("Claude returned an empty report");
  return {
    headline: clip(raw.headline.replace(/[*{}]/g, ""), 120),
    paragraphs,
    readiness: {
      level: raw.readiness.level,
      label: clip(raw.readiness.label, 60).toUpperCase(),
      assessment: clip(raw.readiness.assessment, 300),
    },
  };
}

export async function claudeReport(
  facts: ReportFacts,
  opts: { apiKey: string; model: string; client?: Pick<Anthropic, "messages"> },
): Promise<{ report: SituationReport; model: string }> {
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: 90_000, maxRetries: 2 });
  const message = await client.messages.parse({
    model: opts.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(facts) }],
    output_config: { format: zodOutputFormat(ReportSchema) },
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined to write the report");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's report was cut off (max_tokens)");
  if (!message.parsed_output) throw new Error("Claude's response did not match the report format");
  return { report: sanitizeReport(message.parsed_output), model: message.model };
}
