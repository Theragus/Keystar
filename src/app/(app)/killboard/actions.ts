"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getSetting } from "@/core/settings";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { generateSituationReport } from "@/modules/killboard/report/generate";

/** Rewrites the current week's situation report now (a single Claude call when configured). */
export async function rewriteSituationReport() {
  const actor = await assertPermission(KILLBOARD_PERMISSIONS.manage);
  const corporationId = await getSetting("corp.homeCorporationId");
  if (!corporationId) throw new Error("No home corporation configured");
  const out = await generateSituationReport(getDb(), corporationId, new Date(), { force: true });
  await audit({
    actorUserId: actor.id,
    actorName: actor.main?.name,
    action: "killboard.report.rewritten",
    details: { from: out.week.from, to: out.week.to, source: out.source, error: out.error ?? null },
  });
  revalidatePath("/killboard");
}
