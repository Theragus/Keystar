"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { getDb, intelScans } from "@/core/db";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { writeBriefing, writeDossier as writeDossierNote, writeDscanRead } from "@/modules/intel/ai/generate";
import { dscanShips, MAX_DSCAN_CHARS } from "@/modules/intel/dscan";
import { nameScanEntities } from "@/modules/intel/names";
import { getScan, profileRemaining, startScan, type StartScanInput } from "@/modules/intel/scans";

export interface ScanFormState {
  error: string | null;
}

function scanIdFrom(formData: FormData): string {
  const id = String(formData.get("scanId") ?? "");
  if (!SHARE_ID_PATTERN.test(id)) throw new Error("Unknown scan");
  return id;
}

async function start(input: Omit<StartScanInput, "userId" | "userName" | "aiAllowed">): Promise<ScanFormState> {
  const user = await assertPermission(INTEL_PERMISSIONS.use);
  const result = await startScan({
    ...input,
    userId: user.id,
    userName: user.main?.name ?? null,
    aiAllowed: user.can(INTEL_PERMISSIONS.ai),
  });
  if (!result.ok) return { error: result.error };
  after(() => nameScanEntities(result.id, result.naming));
  redirect(`/intel/${result.id}`);
}

/** Scans a pasted pilot list (and optional d-scan) and opens the result. */
export async function createScan(_prev: ScanFormState, formData: FormData): Promise<ScanFormState> {
  await assertPermission(INTEL_PERMISSIONS.use);
  const dscanText = String(formData.get("dscan") ?? "");
  let dscan = null;
  if (dscanText.trim()) {
    if (dscanText.length > MAX_DSCAN_CHARS) return { error: "That d-scan is too long." };
    const parsed = await dscanShips(dscanText);
    if (!parsed.lines) return { error: "The d-scan box does not contain a d-scan (copy it from the directional scanner)." };
    dscan = parsed.ships;
  }
  return start({
    text: String(formData.get("pilots") ?? ""),
    systemName: String(formData.get("system") ?? ""),
    dscan,
  });
}

/** Adds or replaces the scan's d-scan. */
export async function setDscan(_prev: ScanFormState, formData: FormData): Promise<ScanFormState> {
  await assertPermission(INTEL_PERMISSIONS.use);
  const id = scanIdFrom(formData);
  const text = String(formData.get("dscan") ?? "");
  if (text.length > MAX_DSCAN_CHARS) return { error: "That d-scan is too long." };
  const parsed = await dscanShips(text);
  if (!parsed.lines) return { error: "Paste a d-scan (copy it from the directional scanner)." };
  await getDb().update(intelScans).set({ dscan: parsed.ships, updatedAt: new Date() }).where(eq(intelScans.id, id));
  refresh();
  return { error: null };
}

/** Claude's read of who is flying what on the d-scan. */
export async function readDscan(formData: FormData): Promise<void> {
  const user = await assertPermission(INTEL_PERMISSIONS.ai);
  await writeDscanRead(scanIdFrom(formData), { createdBy: user.id });
  refresh();
}

/** Scans the same pilots (and system) again with fresh data. */
export async function rescan(_prev: ScanFormState, formData: FormData): Promise<ScanFormState> {
  await assertPermission(INTEL_PERMISSIONS.use);
  const scan = await getScan(scanIdFrom(formData));
  if (!scan) return { error: "That scan no longer exists." };
  return start({ text: scan.names.join("\n"), systemId: scan.systemId, dscan: scan.dscan, rescanOf: scan.id });
}

/** Profiles the pilots of a scan that were skipped (friendlies, very large lists). */
export async function profileScanPilots(formData: FormData): Promise<void> {
  await assertPermission(INTEL_PERMISSIONS.use);
  await profileRemaining(scanIdFrom(formData));
  refresh();
}

export async function deleteScan(formData: FormData): Promise<void> {
  const user = await assertPermission(INTEL_PERMISSIONS.use);
  const scan = await getScan(scanIdFrom(formData));
  if (!scan) redirect("/intel");
  if (scan.createdBy !== user.id && !user.can(INTEL_PERMISSIONS.manage)) throw new Error("Only the creator or an intel manager can delete a scan");
  await getDb().delete(intelScans).where(eq(intelScans.id, scan.id));
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name ?? null,
    action: "intel.scan.delete",
    targetType: "intel_scan",
    targetId: scan.id,
    details: { pilots: scan.pilotCount, createdBy: scan.createdByName },
  });
  redirect("/intel");
}

/** Writes the scan's briefing again with the latest data (Claude when configured). */
export async function rewriteBriefing(formData: FormData): Promise<void> {
  const user = await assertPermission(INTEL_PERMISSIONS.ai);
  await writeBriefing(scanIdFrom(formData), { createdBy: user.id, automatic: false });
  refresh();
}

/** A dossier on one pilot of the scan. */
export async function writeDossier(formData: FormData): Promise<void> {
  const user = await assertPermission(INTEL_PERMISSIONS.ai);
  const characterId = Number(formData.get("characterId"));
  if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new Error("Unknown pilot");
  await writeDossierNote(scanIdFrom(formData), characterId, { createdBy: user.id });
  refresh();
}
