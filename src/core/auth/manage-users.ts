import { eq, sql } from "drizzle-orm";
import { getDb, users, type Db } from "@/core/db";
import { assignableRoles, canManageRole, type Role } from "@/core/rbac/roles";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Advisory lock id that serialises provisioning (first-admin bootstrap, linking) and role or access changes. */
const USERS_LOCK = 727_275;

/** Takes the transaction-scoped lock shared by sign-in provisioning and user management. */
export async function lockUsers(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${USERS_LOCK})`);
}

export type UserAccessChange = { role: Role } | { isDisabled: boolean };

/**
 * Applies an admin's change to another user's role or disabled flag.
 *
 * The caller has checked the permission against the actor as read at the start
 * of the request. Here the actor and the target are read again under the users
 * lock, so concurrent changes are judged against what the others committed: two
 * admins demoting or disabling each other at once can't both succeed, and an
 * enabled admin always remains. With `onlyFromRole`, a target whose role is no
 * longer that one is left alone (`changed: false`).
 */
export async function changeUserAccess(
  actorId: string,
  targetId: string,
  change: UserAccessChange,
  opts: { onlyFromRole?: Role } = {},
): Promise<{ from: Role; changed: boolean }> {
  if (actorId === targetId) throw new Error("You can't change your own access");
  return getDb().transaction(async (tx) => {
    await lockUsers(tx);
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
    if (!actor || actor.isDisabled) throw new Error("You do not have permission to do that");
    const [target] = await tx.select().from(users).where(eq(users.id, targetId));
    if (!target) throw new Error("User not found");
    if (opts.onlyFromRole && target.role !== opts.onlyFromRole) return { from: target.role, changed: false };
    if (!canManageRole(actor.role, target.role)) throw new Error("You can only manage users below your own role");
    if ("role" in change && !assignableRoles(actor.role).includes(change.role)) {
      throw new Error("You can't assign that role");
    }
    await tx
      .update(users)
      .set({ ...change, updatedAt: new Date() })
      .where(eq(users.id, targetId));
    return { from: target.role, changed: true };
  });
}
