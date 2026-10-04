"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { disableOptionalScope, enableOptionalScope } from "@/core/auth/scope-switch";
import { esiTokens, getDb, industryJobs } from "@/core/db";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { INDUSTRY_PERMISSIONS, INDUSTRY_SCOPES } from "@/modules/industry/module";

export type IndustryAccessError = "forbidden" | "notOwned" | "notHeld";

class NotHeld extends Error {}

/**
 * Switches industry access (both industry scopes together) off or back on in Keystar without an EVE login; see
 * core/auth/scope-switch.ts. Switching on only works while the token still holds both scopes, otherwise the page
 * links to the EVE login instead.
 */
export async function setIndustryAccess(characterId: number, enabled: boolean): Promise<ActionResult<IndustryAccessError>> {
  const user = await assertPermission(INDUSTRY_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  try {
    await getDb().transaction(async (tx) => {
      await tx.select({ id: esiTokens.characterId }).from(esiTokens).where(eq(esiTokens.characterId, characterId)).for("update");
      const outcomes = [];
      for (const scope of INDUSTRY_SCOPES) {
        outcomes.push(enabled ? await enableOptionalScope(characterId, scope, tx) : await disableOptionalScope(characterId, scope, tx));
      }
      // On: both scopes or neither. Off: a partly enabled character only holds one of them.
      if (enabled ? outcomes.some((o) => o !== "ok") : outcomes.every((o) => o !== "ok")) throw new NotHeld();
    });
  } catch (err) {
    if (err instanceof NotHeld) return refused("notHeld");
    throw err;
  }
  // The worker's planner (every 30 seconds) starts or stops the industry job.
  for (const scope of INDUSTRY_SCOPES) {
    await audit({
      actorUserId: user.id,
      actorName: user.main?.name,
      action: enabled ? "esi.scope.enabled" : "esi.scope.disabled",
      targetType: "character",
      targetId: characterId,
      details: { scope },
    });
  }
  revalidatePath("/", "layout");
  return ok;
}

export type DeleteIndustryDataError = "forbidden" | "notOwned" | "stillEnabled";

/** Deletes a character's stored industry jobs from Keystar (only once industry access is off). */
export async function deleteIndustryData(characterId: number): Promise<ActionResult<DeleteIndustryDataError>> {
  const user = await assertPermission(INDUSTRY_PERMISSIONS.viewOwn).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (INDUSTRY_SCOPES.some((s) => token?.scopes.includes(s))) return refused("stillEnabled");
  await db.delete(industryJobs).where(eq(industryJobs.characterId, characterId));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "industry.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/industry", "layout");
  return ok;
}
