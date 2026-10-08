"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, fittingEsiFittings, getDb } from "@/core/db";
import { ok, refused, type ActionResult } from "@/lib/action-result";
import { FITTING_PERMISSIONS, FITTINGS_SCOPE } from "@/modules/fitting/module";
import { getCharacterSkillLevels } from "@/modules/fitting/queries";

export type LoadSkillsError = "forbidden" | "notOwned";

/** The skills of one of the viewer's characters, for the calculator (skill type id → usable level). */
export async function loadCharacterSkills(
  characterId: number,
): Promise<{ ok: true; skills: Record<number, number> } | { ok: false; error: LoadSkillsError }> {
  const user = await assertPermission(FITTING_PERMISSIONS.use).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  return { ok: true, skills: await getCharacterSkillLevels(characterId) };
}

export type DeleteFittingDataError = "forbidden" | "notOwned" | "stillEnabled";

/** Deletes a character's stored saved fittings from Keystar (only once fitting access is off). */
export async function deleteFittingData(characterId: number): Promise<ActionResult<DeleteFittingDataError>> {
  const user = await assertPermission(FITTING_PERMISSIONS.use).catch(() => null);
  if (!user) return refused("forbidden");
  if (!user.characterIds.includes(characterId)) return refused("notOwned");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (token?.scopes.includes(FITTINGS_SCOPE)) return refused("stillEnabled");
  await db.delete(fittingEsiFittings).where(eq(fittingEsiFittings.characterId, characterId));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "fitting.data.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/fitting/settings");
  return ok;
}
