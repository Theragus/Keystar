import type { Db } from "@/core/db";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import type { EsiClient } from "@/core/esi/client";
import type { Logger } from "@/core/logger";

export interface JobContext {
  jobId: number;
  ownerType: SyncOwnerType;
  /** character_id, corporation_id, or 0 for global jobs. */
  ownerId: number;
  /**
   * Character whose ESI token should be used: the owner for character jobs,
   * an eligible member (with the needed in-game role) for corporation jobs.
   */
  characterId: number | null;
  esi: EsiClient;
  db: Db;
  log: Logger;
  meta: Record<string, unknown>;
}

export interface JobResult {
  /** Short human readable outcome, shown in the sync status page. */
  summary?: string;
  /** Earliest time the job should run again (e.g. ESI Expires). */
  nextRunAt?: Date | null;
  meta?: Record<string, unknown>;
}

/**
 * A background sync job. The worker creates one schedule row per eligible
 * owner: every character whose token has `requiredScopes`, every tracked
 * corporation with at least one such character, or a single global row.
 */
export interface JobDefinition {
  key: string;
  label: string;
  module: string;
  owner: SyncOwnerType;
  requiredScopes?: string[];
  /** Corporation jobs: prefer tokens of characters with any of these in-game roles. */
  preferredCorpRoles?: string[];
  /**
   * Corporation jobs whose ESI endpoint needs no in-game role (e.g. contacts):
   * any member with the scopes may serve it; role holders are still tried first.
   */
  anyCorpMember?: boolean;
  intervalSeconds: number;
  run(ctx: JobContext): Promise<JobResult | void>;
}

/** Lets modules tell the price job which item types they need valued. */
export type PriceInterestProvider = (db: Db) => Promise<number[]>;
