import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { auditLog, getDb } from "@/core/db";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

function tone(action: string) {
  if (/disabled|removed|transferred/.test(action)) return "critical" as const;
  if (/role|approved|settings|paused|resumed/.test(action)) return "gold" as const;
  if (/login|registered|linked/.test(action)) return "accent" as const;
  return "neutral" as const;
}

export default async function AuditPage() {
  await requirePermission("audit.view");
  const entries = await getDb().select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(300);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Audit Log" description="The last 300 security-relevant and administrative actions." />
      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-ink-3">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-ink-2 tabular-nums">{dateTime(e.createdAt)}</td>
                  <td>{e.actorName ?? <span className="text-ink-3">system</span>}</td>
                  <td>
                    <Badge tone={tone(e.action)}>{e.action}</Badge>
                  </td>
                  <td className="text-ink-2">{e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}</td>
                  <td className="max-w-[420px]">
                    {e.details ? (
                      <code className="line-clamp-2 text-[0.7rem] break-all text-ink-3">{JSON.stringify(e.details)}</code>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Glass>
    </div>
  );
}
