import { auditLog, getDb } from "@/core/db";

export interface AuditEntry {
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
}

/** Records an administrative or security-relevant action. Never throws. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        actorUserId: entry.actorUserId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId === undefined ? null : String(entry.targetId),
        details: entry.details ?? null,
      });
  } catch (err) {
    console.error("Failed to write audit log entry", entry.action, err);
  }
}
