"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { getCurrentUser } from "@/core/auth/dal";
import { revokeRefreshToken } from "@/core/auth/sso";
import { decryptToken } from "@/core/crypto";
import { characters, esiTokens, getDb, users } from "@/core/db";
import { triggerJobs } from "@/core/sync/scheduler";

async function ownedCharacter(characterId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!user.characterIds.includes(characterId)) throw new Error("That character is not linked to your account");
  return user;
}

export async function setMainCharacter(characterId: number) {
  const user = await ownedCharacter(characterId);
  await getDb().update(users).set({ mainCharacterId: characterId, updatedAt: new Date() }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

export async function syncCharacterNow(characterId: number) {
  await ownedCharacter(characterId);
  await triggerJobs({ ownerType: "character", ownerId: characterId });
  revalidatePath("/characters");
}

/** Unlinks a character, deletes its token and revokes it at CCP. Mining history is kept. */
export async function removeCharacter(characterId: number) {
  const user = await ownedCharacter(characterId);
  if (user.characterIds.length <= 1) throw new Error("You can't remove your only character");
  const db = getDb();
  const [token] = await db.select().from(esiTokens).where(eq(esiTokens.characterId, characterId));
  await db.delete(characters).where(and(eq(characters.characterId, characterId), eq(characters.userId, user.id)));
  if (user.main?.characterId === characterId) {
    const next = user.characterIds.find((id) => id !== characterId) ?? null;
    await db.update(users).set({ mainCharacterId: next }).where(eq(users.id, user.id));
  }
  if (token) {
    try {
      await revokeRefreshToken(decryptToken(token.refreshTokenEnc));
    } catch {
      // Revocation is best effort; the token is deleted locally either way.
    }
  }
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "character.removed",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/", "layout");
}
