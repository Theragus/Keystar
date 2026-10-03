import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { isRecent } from "@/lib/format";
import { HostilesFeed } from "@/modules/intel/components/hostiles-feed";
import { ScanForm } from "@/modules/intel/components/scan-form";
import { FEED_DAYS } from "@/modules/intel/constants";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { lookupDisplayNames } from "@/modules/intel/names";
import { getRecentScans, recentSightings } from "@/modules/intel/scans";
import { isFriendly, isHostile, loadStandings, standingOf } from "@/modules/intel/standings";
import { createScan } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.intel.index.metaTitle };
}

/** A scan's system counts as "where you are" for this long. */
const SYSTEM_MEMORY_MS = 2 * 60 * 60_000;

export default async function IntelPage() {
  const user = await requirePermission(INTEL_PERMISSIONS.use);
  const { t, f } = await getI18n();
  const text = t.intel.index;
  const [recent, sightings, standings] = await Promise.all([getRecentScans(user.id), recentSightings(FEED_DAYS), loadStandings()]);
  // The feed: non-friendly pilots worth a look (moderate threat or worse, hostile standing, or fought us).
  const candidates = sightings.map((s) => ({ ...s, standing: standingOf(s, standings) })).filter((s) => !isFriendly(s.standing));
  const relevant = candidates.filter((s) => (s.score ?? 0) >= 25 || isHostile(s.standing) || s.fought);
  const feed = relevant.slice(0, 30);
  const names = await lookupDisplayNames({ systemIds: [...recent.map((s) => s.systemId), ...feed.map((s) => s.systemId)] });
  const latest = recent[0];
  const defaultSystem =
    latest?.systemId && isRecent(latest.createdAt, SYSTEM_MEMORY_MS) ? (names.systems.get(latest.systemId)?.name ?? "") : "";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.killboard.module.navSection} title={text.title} description={text.description} />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title={text.scanTitle} className="z-10 xl:col-span-8">
          <ScanForm action={createScan} defaultSystem={defaultSystem} />
        </Panel>
        <Panel title={text.recentTitle} className="xl:col-span-4">
          {recent.length ? (
            <ul className="divide-y divide-surface-contrast/6">
              {recent.map((scan) => (
                <li key={scan.id}>
                  <Link href={`/intel/${scan.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {scan.names.slice(0, 3).join(", ")}
                        {scan.names.length > 3 ? ` ${text.moreNames(scan.names.length - 3)}` : ""}
                      </div>
                      <div className="text-xs text-ink-3">
                        {f.relativeTime(scan.createdAt)}
                        {scan.systemId && names.systems.get(scan.systemId) ? ` · ${names.systems.get(scan.systemId)!.name}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">{f.integer(scan.pilotCount)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">{text.noScans}</p>
          )}
        </Panel>
      </div>
      <Panel title={text.feedTitle} subtitle={text.feedSubtitle(FEED_DAYS)}>
        <HostilesFeed sightings={feed} names={names} hidden={candidates.length - feed.length} />
      </Panel>
    </div>
  );
}
