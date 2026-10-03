/**
 * Shapes stored in the intel tables' JSON columns and passed between the
 * worker, scoring and pages. Everything here is derived from public data
 * (ESI, zKillboard) and the corporation's own killboard.
 */

/** Kills/losses per zKillboard label (e.g. "tz:eu", "loc:nullsec", "solo", "#:5+"). */
export type LabelCounts = Record<string, { kills: number; losses: number }>;

export interface ShipUse {
  shipTypeId: number;
  groupId: number | null;
  kills: number;
  losses: number;
  appearances: number;
}

/** The subset of zKillboard's character statistics Keystar uses (see stats.ts). */
export interface NormalizedStats {
  kills: number;
  losses: number;
  iskDestroyed: number;
  iskLost: number;
  soloKills: number;
  soloLosses: number;
  /** 0–100: share of ships destroyed vs lost, weighted by points. */
  dangerRatio: number | null;
  /** 0–100: share of kills in a gang (vs solo). */
  gangRatio: number | null;
  soloRatio: number | null;
  avgGangSize: number | null;
  /** zKillboard's recent-activity counters (roughly the last week). */
  activePvp: { kills: number; ships: number; systems: number; regions: number } | null;
  /** Monthly totals, oldest first. */
  months: { year: number; month: number; kills: number; losses: number; iskDestroyed: number; iskLost: number }[];
  /** Lifetime kills/losses per ship group. */
  groups: { groupId: number; kills: number; losses: number }[];
  recentShips: ShipUse[];
  topShips: ShipUse[];
  /** Pilots who share the most kills with this one. */
  associates: { characterId: number; sharedKills: number }[];
  /** Kills per weekday (0 = Sunday) and EVE hour. */
  activity: number[][] | null;
  labels: { lifetime: LabelCounts; recent: LabelCounts; weekly: LabelCounts };
  fc: { level: string | null; score: number | null } | null;
  activityTags: { blops: number; logi: number; capital: number; super: number; titan: number } | null;
  topSystems: { systemId: number; kills: number }[];
  info: {
    name: string | null;
    corporationId: number | null;
    allianceId: number | null;
    birthday: string | null;
    securityStatus: number | null;
  };
}

export interface CorpHistoryEntry {
  corporationId: number;
  startDate: string;
}

/** A parsed d-scan line group: one row per ship type seen. */
export interface DscanEntry {
  typeId: number;
  name: string;
  count: number;
  groupId?: number | null;
}

// ---------------------------------------------------------------------------
// Profiles (built from stats + the killmail digest, see score/profile.ts)
// ---------------------------------------------------------------------------

/** One of a pilot's recent kills or losses, newest first. */
export interface LatestEvent {
  killmailId: number;
  time: string;
  isLoss: boolean;
  /** The pilot's own hull. */
  shipTypeId: number | null;
  /** The victim's hull on a kill, the final blow's hull on a loss. */
  otherShipTypeId: number | null;
  otherCharacterId: number | null;
  otherCorporationId: number | null;
  otherAllianceId: number | null;
  systemId: number;
  attackerCount: number;
  solo: boolean;
  finalBlow: boolean;
  value: number;
}

export interface HullUse {
  shipTypeId: number;
  groupId: number | null;
  /** Recency-weighted uses (kills + losses in this hull). */
  weight: number;
  count: number;
  lastAt: string | null;
}

export const FIT_KEYS = [
  "cyno",
  "covertCyno",
  "industrialCyno",
  "cloak",
  "covertCloak",
  "scram",
  "web",
  "bubble",
  "remoteRep",
  "smartbomb",
  "neut",
  "commandBurst",
] as const;
export type FitKey = (typeof FIT_KEYS)[number];

/** Modules seen on the pilot's lost ships: how often and when last. */
export type FitEvidence = Partial<Record<FitKey, { count: number; lastAt: string }>>;

export interface PilotProfile {
  version: number;
  builtAt: string;
  /** "stats" = zKillboard statistics only, "deep" = plus recent killmails. */
  depth: "none" | "stats" | "deep";
  recent: {
    latest: LatestEvent[];
    lastSeen: { time: string; shipTypeId: number | null; systemId: number; isLoss: boolean } | null;
    kills7d: number;
    kills30d: number;
    kills90d: number;
    losses7d: number;
    losses30d: number;
    lastKillAt: string | null;
    /** Oldest killmail the digest covers (null without a deep pass). */
    coveredSince: string | null;
  };
  /** Recency-weighted totals (half-life DECAY_HALF_LIFE_DAYS). */
  decayed: {
    kills: number;
    losses: number;
    iskDestroyed: number;
    iskLost: number;
    finalBlows: number;
    gang: { solo: number; small: number; fleet: number; blob: number };
    /** Weighted activity per EVE hour. */
    hours: number[];
    gateKills: number;
    highsecKills: number;
  };
  hulls: HullUse[];
  systems: { systemId: number; weight: number; count30d: number }[];
  fits: FitEvidence;
  associates: { characterId: number; sharedKills: number; source: "digest" | "stats" }[];
  lifetime: {
    kills: number;
    losses: number;
    iskDestroyed: number;
    iskLost: number;
    soloKills: number;
    dangerRatio: number | null;
    gangRatio: number | null;
    soloRatio: number | null;
    avgGangSize: number | null;
    lastActiveMonth: string | null;
  };
  character: { ageDays: number | null; corpHops365: number; npcCorp: boolean; securityStatus: number | null };
  timezone: { peakHours: number[]; label: string | null; heat: number[][] | null };
  flags: { blops: number; logi: number; capital: number; super: number; titan: number; fcLevel: string | null };
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export type DimensionKey =
  | "activity"
  | "lethality"
  | "style"
  | "specialty"
  | "relevance"
  | "history"
  | "timezone"
  | "character";

export type Evidence = "recent" | "lifetime" | "none";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  /** 0–100. */
  score: number;
  weight: number;
  /** False when the inputs are missing (e.g. no current system); excluded from the composite. */
  available: boolean;
  why: string;
  evidence: Evidence;
}

export type TagKey =
  | "cyno"
  | "capital"
  | "blops"
  | "hunter"
  | "tackle"
  | "gatecamper"
  | "ganker"
  | "logi"
  | "fc"
  | "solo"
  | "blob"
  | "newchar"
  | "npcalt"
  | "activenow";

export interface PilotTag {
  key: TagKey;
  label: string;
  evidence: "recent" | "lifetime";
  why: string;
}

export type Tier = "low" | "moderate" | "high" | "extreme";

export type StandingClass = "own" | "blue" | "lightblue" | "neutral" | "orange" | "red";

export interface Standing {
  cls: StandingClass;
  value: number | null;
  /** Whose contact list decided it. */
  source: "corporation" | "alliance" | null;
  /** Which of the pilot's entities matched. */
  via: "character" | "corporation" | "alliance" | "faction" | null;
}

export interface PilotScore {
  composite: number;
  tier: Tier | "unknown";
  recencyGate: number;
  dimensions: DimensionScore[];
  tags: PilotTag[];
  /** Friendly pilots are shown but left out of totals. */
  excluded: "own" | "blue" | null;
  /** Computed before the recent killmails arrived. */
  quick: boolean;
}

// ---------------------------------------------------------------------------
// History with us (the home corporation's killboard)
// ---------------------------------------------------------------------------

export interface PilotHistory {
  /** Our losses this pilot was on. */
  killsOnUs: number;
  /** This pilot's losses to us. */
  lossesToUs: number;
  iskDestroyedOnUs: number;
  iskLostToUs: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Hulls flown against us, most used first. */
  ships: { shipTypeId: number; count: number; lastAt: string }[];
  /** Recency-weighted encounters, for scoring. */
  weight: number;
}

export interface Engagement {
  key: string;
  systemId: number;
  start: string;
  end: string;
  /** Pasted pilots present, with the hulls they flew. */
  pilots: { characterId: number; role: "attacker" | "victim" | "both"; shipTypeIds: number[] }[];
  /** Hulls on their side (attackers on our losses, victims of our kills). */
  brought: { shipTypeId: number; count: number }[];
  /** Other pilots on their side who were not pasted, by corporation/alliance. */
  others: { corporationId: number | null; allianceId: number | null; pilots: number }[];
  ourKills: number;
  ourLosses: number;
  iskKilled: number;
  iskLost: number;
  /** Most valuable killmail of the fight, for a link. */
  topKillmailId: number;
}
