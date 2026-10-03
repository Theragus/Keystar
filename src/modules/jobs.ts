import {
  affiliationsJob,
  characterRolesJob,
  corporationMembersJob,
  housekeepingJob,
  marketPricesJob,
  serverStatusJob,
} from "@/core/sync/core-jobs";
import type { JobDefinition, PriceInterestProvider } from "@/core/sync/types";
import { killboardJobs } from "./killboard/jobs";
import { miningJobs, miningPriceInterest } from "./mining/jobs";
import { walletJobs } from "./wallet/jobs";

/**
 * Background jobs run by the worker. Add a module's jobs and price interest
 * providers here. Server-only: never import this from client components.
 */
const PRICE_INTEREST: PriceInterestProvider[] = [miningPriceInterest];

export const JOBS: JobDefinition[] = [
  serverStatusJob,
  affiliationsJob,
  characterRolesJob,
  corporationMembersJob,
  marketPricesJob(PRICE_INTEREST),
  housekeepingJob,
  ...miningJobs,
  ...killboardJobs,
  ...walletJobs,
];

export const JOB_LABELS: Record<string, string> = Object.fromEntries(JOBS.map((j) => [j.key, j.label]));
