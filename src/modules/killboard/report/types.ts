/**
 * Situation report structure, shared by the Claude writer, the template
 * fallback and the UI. Isomorphic.
 *
 * Paragraph text may contain a tiny markup, rendered as styled text (never as
 * HTML): **bold**, {+good news}, {-bad news} and {@Pilot Name}.
 */
export const READINESS_LEVELS = ["surging", "steady", "strained", "quiet"] as const;
export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

export interface SituationReport {
  headline: string;
  paragraphs: string[];
  readiness: {
    level: ReadinessLevel;
    /** Short all-caps status line, e.g. "OPERATIONAL TEMPO RESTORED". */
    label: string;
    assessment: string;
  };
}

export interface WeekTotalsFacts {
  kills: number;
  losses: number;
  iskDestroyed: string;
  iskLost: string;
  /** Like "82.7%", or null without any ISK moved. */
  efficiency: string | null;
  soloKills: number;
}

export interface ReportFacts {
  corporation: { name: string; ticker: string | null };
  window: { from: string; to: string; label: string; yc: number };
  previousWindow: { from: string; to: string; label: string };
  week: WeekTotalsFacts;
  previousWeek: WeekTotalsFacts;
  change: { kills: number; losses: number; efficiencyPoints: number | null };
  topPilots: {
    name: string;
    kills: number;
    previousKills: number;
    finalBlows: number;
    soloKills: number;
    iskDestroyed: string;
    losses: number;
  }[];
  topShips: { name: string; kills: number; change: number }[];
  lostShips: { name: string; losses: number; iskLost: string }[];
  killSystems: { name: string; kills: number; change: number }[];
  lossSystems: { name: string; losses: number; change: number }[];
  biggestKill: { ship: string; victim: string | null; system: string; value: string; finalBlow: string | null } | null;
  biggestLoss: { ship: string; victim: string | null; system: string; value: string } | null;
}

export interface StoredReport {
  report: SituationReport;
  facts: ReportFacts;
  source: "claude" | "template";
  model: string | null;
  error: string | null;
  createdAt: string;
  periodFrom: string;
  periodTo: string;
}
