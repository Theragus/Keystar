"use server";

import { getCurrentUser } from "@/core/auth/dal";
import { getLocale } from "@/i18n/server";
import { buildRouteFacts } from "@/modules/gatecheck/ai/facts";
import { routeBriefing } from "@/modules/gatecheck/ai/generate";
import type { RouteBriefing } from "@/modules/gatecheck/ai/briefing";
import { GATECHECK_PERMISSIONS } from "@/modules/gatecheck/module";
import { parseQuery } from "@/modules/gatecheck/params";
import { runGatecheck } from "@/modules/gatecheck/service";

export type BriefingState =
  | {
      ok: true;
      briefing: RouteBriefing;
      model: string | null;
      createdAt: string;
    }
  | {
      ok: false;
      reason: "noKey" | "budgetUser" | "budgetInstance" | "failed" | "forbidden" | "stale";
    };

/**
 * Claude's briefing for a route. The check runs again here from the route's
 * parameters, so Claude only ever reads facts the server computed itself.
 */
export async function askRouteBriefing(params: Record<string, string>): Promise<BriefingState> {
  const user = await getCurrentUser();
  if (!user?.can(GATECHECK_PERMISSIONS.use) || !user.can(GATECHECK_PERMISSIONS.ai)) return { ok: false, reason: "forbidden" };
  const query = parseQuery(params);
  const result = await runGatecheck(query);
  if (!result?.route) return { ok: false, reason: "stale" };
  const out = await routeBriefing(buildRouteFacts(result, query), user.id, await getLocale());
  return out.ok
    ? {
        ok: true,
        briefing: out.briefing,
        model: out.model,
        createdAt: out.createdAt.toISOString(),
      }
    : out;
}
