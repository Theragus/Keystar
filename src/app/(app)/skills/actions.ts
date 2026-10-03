"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, getDb, skillsCharacter, skillsCharacterSkills, skillsQueue } from "@/core/db";
import { SKILLS_PERMISSIONS, SKILLS_SCOPES } from "@/modules/skills/module";

/** Deletes a character's stored skills from Keystar (only once skill access has been removed). */
export async function deleteSkillData(characterId: number) {
  const user = await assertPermission(SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp);
  if (!user.characterIds.includes(characterId)) throw new Error("That character is not linked to your account");
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (SKILLS_SCOPES.some((s) => token?.scopes.includes(s))) throw new Error("Stop sharing skills for this character first");
  await db.transaction(async (tx) => {
    await tx.delete(skillsQueue).where(eq(skillsQueue.characterId, characterId));
    await tx.delete(skillsCharacterSkills).where(eq(skillsCharacterSkills.characterId, characterId));
    await tx.delete(skillsCharacter).where(eq(skillsCharacter.characterId, characterId));
  });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "skills.deleted",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/skills", "layout");
}
