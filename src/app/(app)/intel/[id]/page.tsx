import { ArrowLeft, History, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { compact, dateTime, relativeTime } from "@/lib/format";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { claudeConfigured, latestNote } from "@/modules/intel/ai/generate";
import type { Briefing, DscanRead } from "@/modules/intel/ai/types";
import { DscanForm, ReadDscanButton } from "@/modules/intel/components/dscan-form";
import { DscanPanel } from "@/modules/intel/components/dscan-panel";
import { matchDscan } from "@/modules/intel/dscan";
import { RewriteBriefingButton } from "@/modules/intel/components/ai-buttons";
import { BriefingPanel } from "@/modules/intel/components/briefing-panel";
import { EngagementList } from "@/modules/intel/components/engagements";
import { GroupSummaryPanel } from "@/modules/intel/components/group-summary";
import { PilotRow } from "@/modules/intel/components/pilot-row";
import { ScanProgressPoller } from "@/modules/intel/components/scan-progress";
import { DeleteScanButton, ProfileRemainingButton, RescanButton } from "@/modules/intel/components/scan-buttons";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { getScan, scanProgress } from "@/modules/intel/scans";
import { isFriendly, isHostile } from "@/modules/intel/standings";
import { loadScanView } from "@/modules/intel/view";
import { deleteScan, profileScanPilots, readDscan, rescan, rewriteBriefing, setDscan } from "../actions";

export const metadata = { title: "Threat Intel scan" };

export default async function ScanPage({ params }: PageProps<"/intel/[id]">) {
  const user = await requirePermission(INTEL_PERMISSIONS.use);
  const { id } = await params;
  if (!SHARE_ID_PATTERN.test(id)) notFound();
  const scan = await getScan(id);
  if (!scan) notFound();

  const [view, progress, briefing, dscanRead] = await Promise.all([
    loadScanView(scan),
    scanProgress(scan),
    latestNote<Briefing>({ kind: "briefing", scanId: scan.id }),
    latestNote<DscanRead>({ kind: "dscan", scanId: scan.id }),
  ]);
  const { home, pilots, rows, engagements, names, summary, totals, pilotNames, system } = view;
  const friendly = rows.filter((r) => isFriendly(r.standing));
  const others = rows.filter((r) => !isFriendly(r.standing));
  const hostiles = rows.filter((r) => isHostile(r.standing)).length;
  const highThreat = summary.tiers.high + summary.tiers.extreme;
  const unprofiled = pilots.filter((p) => !p.profiled).length;
  const dscanRows = scan.dscan
    ? matchDscan(
        scan.dscan,
        rows.map((r) => ({ characterId: r.pilot.characterId, name: r.pilot.name, standing: r.standing, profile: r.profile })),
        scan.updatedAt,
      )
    : null;
  const canDelete = scan.createdBy === user.id || user.can(INTEL_PERMISSIONS.manage);
  const canAi = user.can(INTEL_PERMISSIONS.ai);
  const claudeHint = claudeConfigured()
    ? null
    : user.can(INTEL_PERMISSIONS.manage)
      ? "Briefings come from a template. Set ANTHROPIC_API_KEY to have Claude write them."
      : null;

  const dscanPanel = (
    <DscanPanel
      rows={dscanRows}
      read={dscanRead}
      pilotNames={pilotNames}
      form={
        <details open={!dscanRows}>
          <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">{dscanRows ? "Replace the d-scan" : "Paste a d-scan"}</summary>
          <div className="mt-2">
            <DscanForm scanId={scan.id} action={setDscan} replace={!!scan.dscan} />
          </div>
        </details>
      }
      actions={canAi && dscanRows?.length ? <ReadDscanButton scanId={scan.id} action={readDscan} label={claudeConfigured() ? "Ask Claude" : "Summarize"} /> : undefined}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Threat Intel"
        title={`${scan.pilotCount} pilot${scan.pilotCount === 1 ? "" : "s"}${system ? ` in ${system.name}` : ""}`}
        description={`Scanned ${relativeTime(scan.createdAt)} (${dateTime(scan.createdAt)})${scan.createdByName ? ` by ${scan.createdByName}` : ""}`}
        actions={
          <>
            <ButtonLink href="/intel" size="sm">
              <ArrowLeft className="size-4" aria-hidden /> New scan
            </ButtonLink>
            <RescanButton scanId={scan.id} action={rescan} />
            {canDelete && <DeleteScanButton scanId={scan.id} action={deleteScan} />}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pilots" value={String(scan.pilotCount)} hint={scan.unresolved.length ? `${scan.unresolved.length} unknown names` : undefined} />
        <StatTile label="High threat" value={String(highThreat)} hint={`${hostiles} with hostile standings`} />
        <StatTile label="Friendly" value={String(friendly.length)} hint="Our corporation, alliance or blue" />
        <StatTile
          label="Fought us"
          value={String(totals.pilots)}
          hint={totals.engagements ? `${totals.engagements} engagement${totals.engagements === 1 ? "" : "s"}` : "No fights on our killboard"}
        />
      </div>

      <ScanProgressPoller scanId={scan.id} initial={progress} />

      {summary.hostiles > 0 && (
        <BriefingPanel
          note={briefing}
          pending={scan.briefingStatus === "pending"}
          scanId={scan.id}
          pilotNames={pilotNames}
          claudeHint={claudeHint}
          actions={canAi && scan.status === "ready" ? <RewriteBriefingButton scanId={scan.id} action={rewriteBriefing} /> : undefined}
        />
      )}

      {summary.hostiles > 0 && (
        <Panel title="The group" subtitle={`${summary.hostiles} non-friendly pilot${summary.hostiles === 1 ? "" : "s"}`}>
          <GroupSummaryPanel summary={summary} names={names} pilotNames={pilotNames} />
        </Panel>
      )}

      {scan.unresolved.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Not EVE characters: {scan.unresolved.slice(0, 20).join(", ")}
          {scan.unresolved.length > 20 ? ` and ${scan.unresolved.length - 20} more` : ""}
        </p>
      )}

      {dscanRows && dscanPanel}

      <Panel
        title="Pilots"
        subtitle={others.length ? undefined : "Everyone here is friendly."}
        actions={unprofiled > 0 ? <ProfileRemainingButton scanId={scan.id} count={unprofiled} action={profileScanPilots} /> : undefined}
      >
        <div className="space-y-1.5">
          {others.map((r) => (
            <PilotRow key={r.pilot.characterId} pilot={r.pilot} standing={r.standing} names={names} pilotNames={pilotNames} scanId={scan.id} />
          ))}
        </div>
        {friendly.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">
              {friendly.length} friendly pilot{friendly.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-2 space-y-1.5">
              {friendly.map((r) => (
                <PilotRow key={r.pilot.characterId} pilot={r.pilot} standing={r.standing} names={names} pilotNames={pilotNames} scanId={scan.id} />
              ))}
            </div>
          </details>
        )}
      </Panel>

      {!dscanRows && summary.hostiles > 0 && dscanPanel}

      {home && engagements.length > 0 && (
        <Panel
          title="History with us"
          subtitle={`Fought ${totals.pilots} of these pilots in ${totals.engagements} engagement${totals.engagements === 1 ? "" : "s"}: we killed ${totals.ourKills} (${compact(totals.iskKilled)} ISK) and lost ${totals.ourLosses} (${compact(totals.iskLost)} ISK). Newest first, from our killboard.`}
        >
          <EngagementList engagements={engagements.slice(0, 5)} names={names} pilotNames={pilotNames} />
          {engagements.length > 5 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">{engagements.length - 5} older engagements</summary>
              <div className="mt-2">
                <EngagementList engagements={engagements.slice(5)} names={names} pilotNames={pilotNames} />
              </div>
            </details>
          )}
        </Panel>
      )}
      {!home && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <History className="size-4" aria-hidden /> Set the home corporation in Settings to see fights with these pilots.
        </p>
      )}

      <Panel title="Share">
        <CopyField value={`${env().APP_URL}/intel/${scan.id}`} />
        <p className="mt-2 text-xs text-ink-3">Anyone in the corporation who can use threat intel can open this scan.</p>
      </Panel>
    </div>
  );
}
