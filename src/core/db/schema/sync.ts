import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type SyncOwnerType = "character" | "corporation" | "global";
export type SyncStatus = "pending" | "running" | "ok" | "error" | "skipped";

/**
 * One row per (job definition × owner). The worker plans rows for every
 * eligible owner, then claims due rows with FOR UPDATE SKIP LOCKED.
 */
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: serial("id").primaryKey(),
    jobKey: text("job_key").notNull(),
    ownerType: text("owner_type").$type<SyncOwnerType>().notNull(),
    /** character_id, corporation_id or 0 for global jobs. */
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastStatus: text("last_status").$type<SyncStatus>().notNull().default("pending"),
    lastError: text("last_error"),
    lastSummary: text("last_summary"),
    lastDurationMs: integer("last_duration_ms"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockedBy: text("locked_by"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sync_jobs_unique").on(t.jobKey, t.ownerType, t.ownerId),
    index("sync_jobs_due_idx").on(t.enabled, t.nextRunAt),
  ],
);

/** Liveness of worker processes, shown in the admin UI. */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull().defaultNow(),
  version: text("version"),
  info: jsonb("info").$type<Record<string, unknown>>(),
});
