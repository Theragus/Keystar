"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { changeUserAccess } from "@/core/auth/manage-users";
import { deleteUserSessions } from "@/core/auth/session";
import { refreshCorporations } from "@/core/eve/resolver";
import { allPermissions } from "@/core/modules/registry";
import { isRole, type Role } from "@/core/rbac/roles";
import { getSettings, setSetting, type Settings } from "@/core/settings";
import { triggerJobs } from "@/core/sync/scheduler";

export async function updateUserRole(userId: string, formData: FormData) {
  const actor = await assertPermission("users.manage");
  const role = formData.get("role");
  if (!isRole(role)) throw new Error("Unknown role");
  if (actor.id === userId) throw new Error("You can't change your own role");
  const { from } = await changeUserAccess(actor.id, userId, { role });
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "user.role.changed",
    targetType: "user",
    targetId: userId,
    details: { from, to: role },
  });
  revalidatePath("/admin/users");
}

export async function approveUser(userId: string) {
  const actor = await assertPermission("users.manage");
  if (actor.id === userId) throw new Error("You can't approve yourself");
  const { changed } = await changeUserAccess(actor.id, userId, { role: "member" }, { onlyFromRole: "guest" });
  if (!changed) return;
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
  await changeUserAccess(actor.id, userId, { isDisabled: disabled });
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
  const actor = await assertPermission("sync.trigger");
  const [job] = await triggerJobs({ id: jobId });
  if (!job) throw new Error("Sync job not found or disabled");
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "sync.triggered",
    targetType: "sync_job",
    targetId: job.id,
    details: { job: job.jobKey, ownerType: job.ownerType, ownerId: job.ownerId },
  });
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
    // Import the new home corporation's killboard now instead of at the next hourly run.
    await triggerJobs({ jobKey: "killboard.zkill-sync" });
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
