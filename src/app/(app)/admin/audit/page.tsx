import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { auditLog, getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";

const LIMIT = 300;

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.audit.metaTitle };
}

function tone(action: string) {
  if (/disabled|removed|transferred/.test(action)) return "critical" as const;
  if (/role|approved|settings|paused|resumed/.test(action)) return "gold" as const;
  if (/login|registered|linked/.test(action)) return "accent" as const;
  return "neutral" as const;
}

export default async function AuditPage() {
  await requirePermission("audit.view");
  const { t, f } = await getI18n();
  const ta = t.admin.audit;
  const entries = await getDb().select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(LIMIT);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.shell.navSections.admin} title={t.shell.nav.audit} description={ta.description(LIMIT)} />
      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{ta.columns.time}</th>
                <th>{ta.columns.actor}</th>
                <th>{ta.columns.action}</th>
                <th>{ta.columns.target}</th>
                <th>{ta.columns.details}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-ink-3">
                    {ta.empty}
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.dateTime(e.createdAt)}</td>
                  <td>{e.actorName ?? <span className="text-ink-3">{ta.system}</span>}</td>
                  <td>
                    <Badge tone={tone(e.action)}>{e.action}</Badge>
                  </td>
                  <td className="text-ink-2">{e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}</td>
                  <td className="max-w-[420px]">
                    {e.details ? (
                      <code className="line-clamp-2 text-2xs break-all text-ink-3">{JSON.stringify(e.details)}</code>
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
