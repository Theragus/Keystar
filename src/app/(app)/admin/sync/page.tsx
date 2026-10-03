import { sql } from "drizzle-orm";
import { Pause, Play, RefreshCw, Server } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getDb, workerHeartbeats } from "@/core/db";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { isRecent } from "@/lib/format";
import { jobLabel } from "@/modules/jobs";
import { setSyncPaused, triggerAllSyncJobs, triggerSyncJob } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.sync.metaTitle };
}

interface JobRow {
  id: number;
  job_key: string;
  owner_type: SyncOwnerType;
  owner_id: string;
  owner_name: string | null;
  enabled: boolean;
  last_status: "pending" | "running" | "ok" | "error" | "skipped";
  last_error: string | null;
  last_summary: string | null;
  last_success_at: string | null;
  last_run_at: string | null;
  next_run_at: string;
  last_duration_ms: number | null;
  consecutive_failures: number;
}

export default async function SyncPage() {
  const user = await requirePermission("sync.view");
  const { t, f } = await getI18n();
  const ts = t.admin.sync;
  const canTrigger = user.can("sync.trigger");
  const canPause = user.can("app.settings.manage");
  const db = getDb();
  const [jobs, workers, paused] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT j.id, j.job_key, j.owner_type, j.owner_id::text, j.enabled, j.last_status, j.last_error, j.last_summary,
             j.last_success_at, j.last_run_at, j.next_run_at, j.last_duration_ms, j.consecutive_failures,
             CASE j.owner_type
               WHEN 'character' THEN COALESCE(c.name, e.name)
               WHEN 'corporation' THEN co.name
               ELSE 'Global' END AS owner_name
      FROM sync_jobs j
      LEFT JOIN characters c ON j.owner_type = 'character' AND c.character_id = j.owner_id
      LEFT JOIN eve_entities e ON e.id = j.owner_id
      LEFT JOIN eve_corporations co ON j.owner_type = 'corporation' AND co.corporation_id = j.owner_id
      ORDER BY j.enabled DESC, (j.last_status = 'error') DESC, j.job_key, owner_name`),
    db.select().from(workerHeartbeats),
    getSetting("sync.paused"),
  ]);
  const rows = jobs as unknown as JobRow[];
  const active = rows.filter((r) => r.enabled);
  const errors = active.filter((r) => r.last_status === "error").length;
  const onlineWorkers = workers.filter((w) => isRecent(w.lastBeatAt, 2 * 60_000));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.sync}
        description={ts.description}
        actions={
          <>
            {canPause && (
              <form action={setSyncPaused.bind(null, !paused)}>
                <Button size="sm" type="submit">
                  {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
                  {paused ? ts.resume : ts.pause}
                </Button>
              </form>
            )}
            {canTrigger && (
              <form action={triggerAllSyncJobs}>
                <Button size="sm" type="submit" variant="primary">
                  <RefreshCw className="size-4" aria-hidden /> {ts.runAll}
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile
          label={ts.stats.worker}
          value={onlineWorkers.length ? ts.stats.online(onlineWorkers.length) : ts.stats.offline}
          delta={
            onlineWorkers.length ? (
              <StatusBadge status={paused ? "warning" : "ok"} label={paused ? ts.stats.paused : ts.stats.running} />
            ) : (
              <StatusBadge status="error" label={ts.stats.noHeartbeat} />
            )
          }
          hint={workers[0] ? ts.stats.lastBeat(f.relativeTime(workers[0].lastBeatAt)) : undefined}
        />
        <StatTile
          label={ts.stats.activeJobs}
          value={f.integer(active.length)}
          hint={ts.stats.disabled(rows.length - active.length)}
        />
        <StatTile
          label={ts.stats.failing}
          value={f.integer(errors)}
          delta={
            errors ? (
              <StatusBadge status="error" label={ts.stats.needsAttention} />
            ) : (
              <StatusBadge status="ok" label={ts.stats.allHealthy} />
            )
          }
        />
        <StatTile
          label={ts.stats.nextRun}
          value={active.length ? f.relativeTime(active.map((r) => r.next_run_at).sort()[0]) : "—"}
        />
      </div>

      {!onlineWorkers.length && (
        <Glass className="flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm">
          <Server className="size-4 text-warning" aria-hidden />
          <span className="text-ink-2">
            {ts.noWorker(
              <code className="text-ink">docker compose up -d worker</code>,
              <code className="text-ink">pnpm dev:worker</code>,
            )}
          </span>
        </Glass>
      )}

      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{ts.columns.job}</th>
                <th>{ts.columns.owner}</th>
                <th>{ts.columns.status}</th>
                <th>{ts.columns.result}</th>
                <th>{ts.columns.lastSuccess}</th>
                <th>{ts.columns.nextRun}</th>
                {canTrigger && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.enabled ? undefined : "opacity-45"}>
                  <td>
                    <div className="font-medium">{jobLabel(r.job_key, t)}</div>
                    <code className="text-2xs text-ink-3">{r.job_key}</code>
                  </td>
                  <td>
                    <div>{r.owner_type === "global" ? ts.ownerTypes.global : (r.owner_name ?? r.owner_id)}</div>
                    <div className="text-2xs text-ink-3">{ts.ownerTypes[r.owner_type]}</div>
                  </td>
                  <td>
                    {!r.enabled ? (
                      <StatusBadge status="pending" label={ts.disabled} />
                    ) : (
                      <StatusBadge
                        status={r.last_status === "skipped" ? "pending" : r.last_status}
                        label={r.last_status === "error" && r.consecutive_failures > 1 ? ts.errorCount(r.consecutive_failures) : undefined}
                      />
                    )}
                  </td>
                  <td className="max-w-[420px]">
                    {r.last_status === "error" && r.last_error ? (
                      <span className="line-clamp-2 text-xs text-critical-text" title={r.last_error}>
                        {r.last_error}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-2">{r.last_summary ?? "—"}</span>
                    )}
                    {r.last_duration_ms !== null && <div className="text-2xs text-ink-3">{f.integer(r.last_duration_ms)} ms</div>}
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{f.relativeTime(r.last_success_at)}</td>
                  <td className="whitespace-nowrap text-ink-2">{r.enabled ? f.relativeTime(r.next_run_at) : "—"}</td>
                  {canTrigger && (
                    <td className="text-right">
                      {r.enabled && (
                        <form action={triggerSyncJob.bind(null, r.id)}>
                          <Button size="sm" variant="ghost" type="submit" title={ts.runNow}>
                            <RefreshCw className="size-3.5" aria-hidden />
                          </Button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Glass>
    </div>
  );
}
