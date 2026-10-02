"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { deleteUserSessions } from "@/core/auth/session";
import { getDb, users } from "@/core/db";
import { refreshCorporations } from "@/core/eve/resolver";
import { allPermissions } from "@/core/modules/registry";
import { assignableRoles, canManageRole, isRole, type Role } from "@/core/rbac/roles";
import { getSettings, setSetting, type Settings } from "@/core/settings";
import { triggerJobs } from "@/core/sync/scheduler";

async function loadTarget(userId: string) {
  const [target] = await getDb().select().from(users).where(eq(users.id, userId));
  if (!target) throw new Error("User not found");
  return target;
}

export async function updateUserRole(userId: string, formData: FormData) {
  const actor = await assertPermission("users.manage");
  const role = formData.get("role");
  if (!isRole(role)) throw new Error("Unknown role");
  if (actor.id === userId) throw new Error("You can't change your own role");
  const target = await loadTarget(userId);
  if (!canManageRole(actor.role, target.role)) throw new Error("You can only manage users below your own role");
  if (!assignableRoles(actor.role).includes(role)) throw new Error("You can't assign that role");

  await getDb().update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "user.role.changed",
    targetType: "user",
    targetId: userId,
    details: { from: target.role, to: role },
  });
  revalidatePath("/admin/users");
}

export async function approveUser(userId: string) {
  const actor = await assertPermission("users.manage");
  const target = await loadTarget(userId);
  if (target.role !== "guest") return;
  await getDb().update(users).set({ role: "member", updatedAt: new Date() }).where(eq(users.id, userId));
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "user.approved",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/users");
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  const actor = await assertPermission("users.manage");
  if (actor.id === userId) throw new Error("You can't disable yourself");
  const target = await loadTarget(userId);
  if (!canManageRole(actor.role, target.role)) throw new Error("You can only manage users below your own role");
  await getDb().update(users).set({ isDisabled: disabled, updatedAt: new Date() }).where(eq(users.id, userId));
  if (disabled) await deleteUserSessions(userId);
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: disabled ? "user.disabled" : "user.enabled",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/users");
}

export async function triggerSyncJob(jobId: number) {
  await assertPermission("sync.trigger");
  await triggerJobs({ id: jobId });
  revalidatePath("/admin/sync");
}

export async function triggerAllSyncJobs() {
  const actor = await assertPermission("sync.trigger");
  await triggerJobs({});
  await audit({ actorUserId: actor.id, actorName: actor.main?.name, action: "sync.triggered.all" });
  revalidatePath("/admin/sync");
}

export async function setSyncPaused(paused: boolean) {
  const actor = await assertPermission("app.settings.manage");
  await setSetting("sync.paused", paused, actor.id);
  await audit({ actorUserId: actor.id, actorName: actor.main?.name, action: paused ? "sync.paused" : "sync.resumed" });
  revalidatePath("/admin/sync");
}

export async function saveSettings(formData: FormData) {
  const actor = await assertPermission("app.settings.manage");
  const before = await getSettings();

  const corpRaw = String(formData.get("homeCorporationId") ?? "").trim();
  const homeCorporationId = corpRaw ? Number(corpRaw) : null;
  if (homeCorporationId !== null && (!Number.isSafeInteger(homeCorporationId) || homeCorporationId <= 0)) {
    throw new Error("Home corporation must be a numeric corporation ID");
  }

  const valuationSource = String(formData.get("valuationSource")) as Settings["mining.valuationSource"];
  const valuationMode = String(formData.get("valuationMode")) as Settings["mining.valuationMode"];

  const overrides: Record<string, Role> = {};
  for (const def of allPermissions()) {
    if (def.locked) continue;
    const value = formData.get(`perm:${def.key}`);
    if (isRole(value) && value !== def.defaultMinRole) overrides[def.key] = value;
  }

  await setSetting("corp.homeCorporationId", homeCorporationId, actor.id);
  await setSetting("access.autoApproveCorpMembers", formData.get("autoApproveCorpMembers") === "on", actor.id);
  await setSetting("access.autoApproveAllianceMembers", formData.get("autoApproveAllianceMembers") === "on", actor.id);
  await setSetting("mining.valuationSource", valuationSource, actor.id);
  await setSetting("mining.valuationMode", valuationMode, actor.id);
  await setSetting("permissions.overrides", overrides, actor.id);
  if (homeCorporationId && homeCorporationId !== before["corp.homeCorporationId"]) {
    await refreshCorporations([homeCorporationId]);
  }

  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "settings.updated",
    details: {
      homeCorporationId,
      valuationSource,
      valuationMode,
      overrides: Object.keys(overrides).length,
    },
  });
  revalidatePath("/", "layout");
}
