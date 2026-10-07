import "server-only";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { gatecheckBriefings, getDb, type Db } from "@/core/db";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";
import type { Locale } from "@/i18n/config";
import { BRIEFING_INSTANCE_HOURLY, BRIEFING_REUSE_MS, BRIEFING_USER_HOURLY } from "../constants";
import { claudeRouteBriefing, type RouteBriefing } from "./briefing";
import { factsHash, type RouteFacts } from "./facts";

const log = createLogger("gatecheck-ai");
/** Serialises budget checks so concurrent requests cannot all take the last free slot. */
const BUDGET_LOCK = 727_277;

export type BriefingOutcome =
  | { ok: true; briefing: RouteBriefing; model: string | null; createdAt: Date }
  | { ok: false; reason: "noKey" | "budgetUser" | "budgetInstance" | "failed" };

/**
 * A Claude route briefing for these facts: reused when the same facts were
 * briefed in the same language in the last 15 minutes, else written now.
 * Every call counts against the hourly budgets (per user and per instance),
 * reserved in a locked transaction before it is made, failed calls included.
 */
export async function routeBriefing(
  facts: RouteFacts,
  userId: string,
  locale: Locale,
  db: Db = getDb(),
  now = new Date(),
): Promise<BriefingOutcome> {
  const { ANTHROPIC_API_KEY: apiKey, INTEL_MODEL: model } = env();
  if (!apiKey) return { ok: false, reason: "noKey" };
  const hash = factsHash(facts);
  const [reuse] = await db
    .select()
    .from(gatecheckBriefings)
    .where(
      and(
        eq(gatecheckBriefings.factsHash, hash),
        eq(gatecheckBriefings.locale, locale),
        eq(gatecheckBriefings.source, "claude"),
        gt(gatecheckBriefings.createdAt, new Date(now.getTime() - BRIEFING_REUSE_MS)),
      ),
    )
    .orderBy(desc(gatecheckBriefings.createdAt))
    .limit(1);
  if (reuse)
    return {
      ok: true,
      briefing: reuse.content as RouteBriefing,
      model: reuse.model,
      createdAt: reuse.createdAt,
    };

  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BUDGET_LOCK})`);
    const since = new Date(now.getTime() - 3600_000);
    const [instance] = await tx
      .select({ n: count() })
      .from(gatecheckBriefings)
      .where(and(eq(gatecheckBriefings.claudeCalled, true), gt(gatecheckBriefings.createdAt, since)));
    if ((instance?.n ?? 0) >= BRIEFING_INSTANCE_HOURLY) return { ok: false as const, reason: "budgetInstance" as const };
    const [mine] = await tx
      .select({ n: count() })
      .from(gatecheckBriefings)
      .where(
        and(eq(gatecheckBriefings.claudeCalled, true), eq(gatecheckBriefings.createdBy, userId), gt(gatecheckBriefings.createdAt, since)),
      );
    if ((mine?.n ?? 0) >= BRIEFING_USER_HOURLY) return { ok: false as const, reason: "budgetUser" as const };
    const [row] = await tx
      .insert(gatecheckBriefings)
      .values({
        factsHash: hash,
        source: "pending",
        claudeCalled: true,
        locale,
        content: {},
        facts,
        createdBy: userId,
        createdAt: now,
      })
      .returning({ id: gatecheckBriefings.id });
    return { ok: true as const, id: row.id };
  });
  if (!reserved.ok) return reserved;

  try {
    const out = await claudeRouteBriefing(facts, { apiKey, model, locale });
    await db
      .update(gatecheckBriefings)
      .set({
        source: "claude",
        model: out.model,
        content: out.content,
        usage: out.usage,
      })
      .where(eq(gatecheckBriefings.id, reserved.id));
    return {
      ok: true,
      briefing: out.content,
      model: out.model,
      createdAt: now,
    };
  } catch (err) {
    log.warn("Claude route briefing failed", { error: errorMessage(err) });
    await db
      .update(gatecheckBriefings)
      .set({ source: "failed", error: errorMessage(err).slice(0, 500) })
      .where(eq(gatecheckBriefings.id, reserved.id));
    return { ok: false, reason: "failed" };
  }
}
