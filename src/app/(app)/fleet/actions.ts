"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { esiTokens, fleetTrackers, getDb } from "@/core/db";
import { triggerJobs } from "@/core/sync/scheduler";
import { FLEET_JOB_KEY, FLEET_SCOPE } from "@/modules/fleet/logic";
import { FLEET_PERMISSIONS } from "@/modules/fleet/module";
import { closeFleet } from "@/modules/fleet/sync";

async function ownedCharacter(characterId: number) {
  const user = await assertPermission(FLEET_PERMISSIONS.track);
  if (!user.characterIds.includes(characterId)) throw new Error("That character is not linked to your account");
  return user;
}

/** Starts sharing the fleet this character is in; the worker reads it within seconds. */
export async function startFleetTracking(characterId: number) {
  const user = await ownedCharacter(characterId);
  const db = getDb();
  const [token] = await db.select({ scopes: esiTokens.scopes }).from(esiTokens).where(eq(esiTokens.characterId, characterId));
  if (!token?.scopes.includes(FLEET_SCOPE)) throw new Error("This character has not granted fleet access");
  const now = new Date();
  await db
    .insert(fleetTrackers)
    .values({ characterId, userId: user.id, status: "tracking", startedAt: now, checkedAt: null })
    .onConflictDoUpdate({
      target: fleetTrackers.characterId,
      set: { userId: user.id, status: "tracking", fleetId: null, startedAt: now, checkedAt: null },
    });
  await triggerJobs({ jobKey: FLEET_JOB_KEY, ownerType: "character", ownerId: characterId });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "fleet.tracking.started",
    targetType: "character",
    targetId: characterId,
  });
  revalidatePath("/fleet");
}

/** Stops sharing; a fleet this character was boss of is closed. */
export async function stopFleetTracking(characterId: number) {
  const user = await ownedCharacter(characterId);
  const db = getDb();
  const [tracker] = await db.select().from(fleetTrackers).where(eq(fleetTrackers.characterId, characterId));
  if (!tracker) return;
  if (tracker.fleetId && tracker.status === "tracking") await closeFleet(db, tracker.fleetId, new Date());
  await db.update(fleetTrackers).set({ status: "stopped" }).where(eq(fleetTrackers.characterId, characterId));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "fleet.tracking.stopped",
    targetType: "character",
    targetId: characterId,
    details: tracker.fleetId ? { fleetId: tracker.fleetId } : undefined,
  });
  revalidatePath("/fleet");
}
