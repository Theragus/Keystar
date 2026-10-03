/**
 * What Claude (or the template) writes for threat intel. Text fields may use
 * the killboard report's markup: **bold**, {+good}, {-bad}, {@Pilot Name}.
 * Isomorphic.
 */
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

export interface Dossier {
  summary: string;
  recentActivity: string;
  playstyle: string;
  watchFor: string[];
  historyWithUs: string | null;
  confidence: (typeof CONFIDENCE)[number];
}

export const MATCH_CONFIDENCE = ["likely", "possible", "guess"] as const;

/** Who is probably flying what on a d-scan. */
export interface DscanRead {
  assessment: string;
  assignments: { typeId: number; characterId: number | null; confidence: (typeof MATCH_CONFIDENCE)[number]; reason: string }[];
  notes: string;
}

export interface StoredNote<T> {
  content: T;
  source: "claude" | "template";
  model: string | null;
  error: string | null;
  createdAt: string;
}
