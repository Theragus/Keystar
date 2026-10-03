/**
 * Skill queue logic shared by pages, jobs and tests. Pure: no database, no ESI.
 */

/** Dogma attribute ids of the character attributes, as used by a skill's primary/secondary attribute. */
export const ATTRIBUTE_IDS = {
  charisma: 164,
  intelligence: 165,
  memory: 166,
  perception: 167,
  willpower: 168,
} as const;
export type AttributeName = keyof typeof ATTRIBUTE_IDS;
export const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTE_IDS) as AttributeName[];

/** Dogma attributes on a skill type: primary attribute, secondary attribute, rank (training time multiplier). */
export const DOGMA_PRIMARY_ATTRIBUTE = 180;
export const DOGMA_SECONDARY_ATTRIBUTE = 181;
export const DOGMA_SKILL_RANK = 275;

export interface SkillTrainingAttributes {
  primaryAttribute: number;
  secondaryAttribute: number;
  rank: number;
}

/** Training attributes from a type's `dogma_attributes`, or null when it isn't a skill. */
export function parseSkillDogma(dogma: { attribute_id: number; value: number }[] | undefined): SkillTrainingAttributes | null {
  const value = (id: number) => dogma?.find((a) => a.attribute_id === id)?.value;
  const primary = value(DOGMA_PRIMARY_ATTRIBUTE);
  const secondary = value(DOGMA_SECONDARY_ATTRIBUTE);
  const rank = value(DOGMA_SKILL_RANK);
  if (primary === undefined || secondary === undefined || rank === undefined) return null;
  return { primaryAttribute: Math.round(primary), secondaryAttribute: Math.round(secondary), rank: Math.round(rank) };
}

/** One queue entry as stored (dates absent while the queue is paused). */
export interface QueueEntry {
  queuePosition: number;
  skillId: number;
  finishedLevel: number;
  startDate: Date | null;
  finishDate: Date | null;
  trainingStartSp: number | null;
  levelStartSp: number | null;
  levelEndSp: number | null;
}

export type QueueStatus = "training" | "ending-soon" | "paused" | "empty";

/** A queue that runs out within this window is flagged so its owner can top it up. */
export const ENDING_SOON_MS = 24 * 3600_000;

export interface QueueProgress {
  /** SP trained towards this level so far (interpolated while training). */
  sp: number | null;
  /** Share of the level done, 0..1. */
  fraction: number | null;
}

export interface QueueSummary<T extends QueueEntry = QueueEntry> {
  status: QueueStatus;
  /** Entries not yet finished, in queue order. */
  entries: T[];
  /** The skill in training (or first in a paused queue). */
  active: T | null;
  activeProgress: QueueProgress;
  /** When the last queued skill finishes; null when paused or empty. */
  endsAt: Date | null;
  remainingMs: number | null;
}

/**
 * Progress of an entry at `now`. While training, SP grows linearly from `training_start_sp` at the start date to
 * `level_end_sp` at the finish date; a paused entry stays at `training_start_sp`.
 */
export function entryProgress(e: QueueEntry, now: Date): QueueProgress {
  if (e.levelStartSp === null || e.levelEndSp === null || e.levelEndSp <= e.levelStartSp) return { sp: null, fraction: null };
  const startSp = e.trainingStartSp ?? e.levelStartSp;
  let sp = startSp;
  if (e.startDate && e.finishDate) {
    const span = e.finishDate.getTime() - e.startDate.getTime();
    const done = span > 0 ? (now.getTime() - e.startDate.getTime()) / span : 1;
    sp = startSp + (e.levelEndSp - startSp) * Math.min(1, Math.max(0, done));
  }
  const fraction = (sp - e.levelStartSp) / (e.levelEndSp - e.levelStartSp);
  return { sp: Math.round(sp), fraction: Math.min(1, Math.max(0, fraction)) };
}

/** SP still to train for an entry at `now` (null without SP data). */
export function remainingSp(e: QueueEntry, now: Date): number | null {
  const { sp } = entryProgress(e, now);
  return sp === null || e.levelEndSp === null ? null : Math.max(0, e.levelEndSp - sp);
}

/**
 * Summarises a stored queue. ESI only refreshes the queue at login, so entries that finished since then are dropped;
 * a queue with entries but no dates is paused.
 */
export function summarizeQueue<T extends QueueEntry>(rows: T[], now: Date): QueueSummary<T> {
  const entries = [...rows]
    .sort((a, b) => a.queuePosition - b.queuePosition)
    .filter((e) => !e.finishDate || e.finishDate.getTime() > now.getTime());
  const active = entries[0] ?? null;
  if (!active) return { status: "empty", entries, active, activeProgress: { sp: null, fraction: null }, endsAt: null, remainingMs: null };
  const activeProgress = entryProgress(active, now);
  const last = entries[entries.length - 1];
  if (!active.finishDate || !last.finishDate) {
    return { status: "paused", entries, active, activeProgress, endsAt: null, remainingMs: null };
  }
  const remainingMs = last.finishDate.getTime() - now.getTime();
  return {
    status: remainingMs < ENDING_SOON_MS ? "ending-soon" : "training",
    entries,
    active,
    activeProgress,
    endsAt: last.finishDate,
    remainingMs,
  };
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
}

/** Whole days, hours and minutes of a duration (rounded up to the minute, like the game). */
export function durationParts(ms: number): DurationParts {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

const ROMAN = ["0", "I", "II", "III", "IV", "V"];

/** Skill level as the game shows it (I–V). */
export function romanLevel(level: number): string {
  return ROMAN[level] ?? String(level);
}
