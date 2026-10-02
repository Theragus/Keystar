import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { isRecent, relativeTime } from "@/lib/format";
import { ScanForm } from "@/modules/intel/components/scan-form";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { lookupDisplayNames } from "@/modules/intel/names";
import { getRecentScans } from "@/modules/intel/scans";
import { createScan } from "./actions";

export const metadata = { title: "Threat Intel" };

/** A scan's system counts as "where you are" for this long. */
const SYSTEM_MEMORY_MS = 2 * 60 * 60_000;

export default async function IntelPage() {
  const user = await requirePermission(INTEL_PERMISSIONS.use);
  const recent = await getRecentScans(user.id);
  const names = await lookupDisplayNames({ systemIds: recent.map((s) => s.systemId) });
  const latest = recent[0];
  const defaultSystem =
    latest?.systemId && isRecent(latest.createdAt, SYSTEM_MEMORY_MS) ? (names.systems.get(latest.systemId)?.name ?? "") : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Combat"
        title="Threat Intel"
        description="Paste local, a fleet or a few names: who they are, whether we fought them, and how dangerous they are right now, from zKillboard."
      />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title="Scan pilots" className="xl:col-span-8">
          <ScanForm action={createScan} defaultSystem={defaultSystem} />
        </Panel>
        <Panel title="Your recent scans" className="xl:col-span-4">
          {recent.length ? (
            <ul className="divide-y divide-white/6">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/intel/${s.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {s.names.slice(0, 3).join(", ")}
                        {s.names.length > 3 ? ` +${s.names.length - 3}` : ""}
                      </div>
                      <div className="text-xs text-ink-3">
                        {relativeTime(s.createdAt)}
                        {s.systemId && names.systems.get(s.systemId) ? ` · ${names.systems.get(s.systemId)!.name}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">{s.pilotCount}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No scans yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
