/**
 * What Claude (or the template) writes for threat intel. Text fields may use
 * the killboard report's markup: **bold**, {+good}, {-bad}, {@Pilot Name}.
 * Isomorphic.
 */
import type { Locale } from "@/i18n/config";

export const THREAT_LEVELS = ["minimal", "low", "elevated", "high", "critical"] as const;
export type ThreatLevel = (typeof THREAT_LEVELS)[number];

export interface Briefing {
  headline: string;
  threatLevel: ThreatLevel;
  /** What the group has been doing in the last day or week. */
  recent: string;
  paragraphs: string[];
  keyPilots: { characterId: number; note: string }[];
  /** One line of guidance (posture). */
  advice: string;
}

export const CONFIDENCE = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export interface Dossier {
  summary: string;
  recentActivity: string;
  playstyle: string;
  watchFor: string[];
  historyWithUs: string | null;
  confidence: Confidence;
}

export const MATCH_CONFIDENCE = ["likely", "possible", "guess"] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCE)[number];

/** Who is probably flying what on a d-scan. */
export interface DscanRead {
  assessment: string;
  assignments: { typeId: number; characterId: number | null; confidence: MatchConfidence; reason: string }[];
  notes: string;
}

/**
 * A note as stored. Claude's notes are text in `locale`, the language of
 * whoever asked for them; template notes hold a draft (ai/template.ts) that is
 * written out in each reader's language, so their locale is null.
 */
export interface StoredNote<T> {
  content: T;
  source: "claude" | "template";
  model: string | null;
  /** Why Claude was not used: its error message, or a budget code (text.ts). */
  error: string | null;
  locale: Locale | null;
  createdAt: string;
}
