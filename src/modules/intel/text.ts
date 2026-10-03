import type { Messages } from "@/i18n/messages";
import { USER_HOURLY_LIMIT } from "./constants";
import type { ScanError } from "./scans";
import type { PilotTag, Reason, TagLabel } from "./types";

/**
 * Writes intel data out in a reader's language. Scores, tags and notes store
 * keys and numbers; these helpers turn them into text with a dictionary
 * (`t` from getI18n()/useI18n(), or MESSAGES.en for Claude's facts).
 * Isomorphic; imports nothing from the dictionaries at runtime (they import
 * hourRange from here).
 */

/** A score or tag reason. Relative times are measured from `now`. */
export function reasonText(t: Messages, reason: Reason, now: Date = new Date()): string {
  return (t.intel.reasons[reason.key] as (r: Reason, now: Date) => string)(reason, now);
}

/** A tag's label, marked when its evidence is only historic. */
export function tagText(t: Messages, tag: { label: TagLabel; historic: boolean } | PilotTag): string {
  const historic = "historic" in tag ? tag.historic : tag.evidence !== "recent";
  return historic ? t.intel.historic(t.intel.tags[tag.label]) : t.intel.tags[tag.label];
}

/** EVE hours as a range ("18–22") when they are close together, otherwise listed ("02, 14, 20"). */
export function hourRange(hours: number[]): string | null {
  if (!hours.length) return null;
  const pad = (h: number) => String(h).padStart(2, "0");
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  return hi - lo <= 6 ? `${pad(lo)}–${pad((hi + 1) % 24)}` : hours.map(pad).join(", ");
}

/** Budget codes stored as a note's error (see ai/limits.ts); anything else is Claude's own message. */
export const BUDGET_ERRORS = { instance: "budget:instance", user: "budget:user" } as const;

export function noteErrorText(t: Messages, error: string): string {
  if (error === BUDGET_ERRORS.instance) return t.intel.notes.instanceBudget;
  if (error === BUDGET_ERRORS.user) return t.intel.notes.userBudget(USER_HOURLY_LIMIT);
  return error;
}

export function scanErrorText(t: Messages, error: ScanError): string {
  const e = t.intel.errors;
  switch (error.code) {
    case "tooLong":
      return e.tooLong(error.max);
    case "tooMany":
      return e.tooMany(error.found, error.max);
    case "unknownSystem":
      return e.unknownSystem(error.name);
    default:
      return e[error.code];
  }
}
