"use server";

import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { refreshCorporations } from "@/core/eve/resolver";
import { setSetting, type Settings } from "@/core/settings";

export async function saveSetupCorporation(formData: FormData) {
  const actor = await assertPermission("app.settings.manage");
  // The free-text ID field comes after the radio options, so a typed value wins.
  const values = formData
    .getAll("corporationId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const id = Number(values[values.length - 1]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Choose a corporation or enter a numeric corporation ID");
  await refreshCorporations([id]);
  await setSetting("corp.homeCorporationId", id, actor.id);
  redirect("/setup?step=2");
}

export async function saveSetupAccess(formData: FormData) {
  const actor = await assertPermission("app.settings.manage");
  await setSetting("access.autoApproveCorpMembers", formData.get("autoApproveCorpMembers") === "on", actor.id);
  await setSetting("access.autoApproveAllianceMembers", formData.get("autoApproveAllianceMembers") === "on", actor.id);
  await setSetting(
    "mining.valuationSource",
    String(formData.get("valuationSource")) as Settings["mining.valuationSource"],
    actor.id,
  );
  redirect("/setup?step=3");
}

export async function finishSetup() {
  const actor = await assertPermission("app.settings.manage");
  await setSetting("setup.completedAt", new Date().toISOString(), actor.id);
  await audit({ actorUserId: actor.id, actorName: actor.main?.name, action: "setup.completed" });
  redirect("/");
}
