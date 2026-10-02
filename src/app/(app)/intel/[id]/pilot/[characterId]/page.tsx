import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { compact, integer, relativeTime, shortDate } from "@/lib/format";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { zkillCharacter } from "@/modules/killboard/links";
import { EngagementList } from "@/modules/intel/components/engagements";
import { ActivityHeatmap } from "@/modules/intel/components/heatmap";
import { LastSeen, LatestKills } from "@/modules/intel/components/latest-kills";
import { HistoryChip } from "@/modules/intel/components/pilot-row";
import { DimensionBreakdown, ScoreBadge, TagList } from "@/modules/intel/components/score";
import { StandingBadge } from "@/modules/intel/components/standing-badge";
import { encountersWithUs, engagementsWithUs } from "@/modules/intel/history";
import { HULL_CLASS_LABELS, hullClass } from "@/modules/intel/hulls";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { lookupDisplayNames, scanEntityIds } from "@/modules/intel/names";
import { getScan, getScanPilots } from "@/modules/intel/scans";
import { loadStandings, standingOf } from "@/modules/intel/standings";
import type { PilotProfile, PilotScore } from "@/modules/intel/types";

export const metadata = { title: "Pilot profile" };

export default async function PilotPage({ params }: PageProps<"/intel/[id]/pilot/[characterId]">) {
  await requirePermission(INTEL_PERMISSIONS.use);
  const { id, characterId: raw } = await params;
  const characterId = Number(raw);
  if (!SHARE_ID_PATTERN.test(id) || !Number.isSafeInteger(characterId) || characterId <= 0) notFound();
  const scan = await getScan(id);
  if (!scan) notFound();
  const [pilot] = await getScanPilots(id, { characterId });
  if (!pilot) notFound();

  const [standings, settings, scanPilots] = await Promise.all([loadStandings(), getSettings(), getScanPilots(id)]);
  const standing = standingOf(pilot, standings);
  const profile = (pilot.profile as PilotProfile | null) ?? null;
  const score = (pilot.scoreDetail as PilotScore | null) ?? null;
  const home = settings["corp.homeCorporationId"];
  const engagements = home
    ? await engagementsWithUs(home, await encountersWithUs(home, [characterId]), [characterId], { limit: 10 })
    : [];
  const ids = scanEntityIds([pilot.history], engagements);
  const names = await lookupDisplayNames({
    typeIds: [
      ...ids.typeIds,
      ...(profile?.hulls.map((h) => h.shipTypeId) ?? []),
      ...(profile?.recent.latest.flatMap((e) => [e.shipTypeId, e.otherShipTypeId]) ?? []),
    ],
    systemIds: [...(profile?.recent.latest.map((e) => e.systemId) ?? []), ...(profile?.systems.map((x) => x.systemId) ?? []), ...engagements.map((e) => e.systemId)],
    entityIds: [...ids.entityIds, pilot.allianceId, ...(profile?.associates.slice(0, 12).map((a) => a.characterId) ?? []), ...(pilot.corpHistory?.map((c) => c.corporationId) ?? [])],
    corporationIds: [...ids.corporationIds, pilot.corporationId, ...(pilot.corpHistory?.map((c) => c.corporationId) ?? [])],
  });
  const pilotNames = new Map(scanPilots.map((p) => [p.characterId, p.name]));
  const associateName = (cid: number) => pilotNames.get(cid) ?? names.entities.get(cid) ?? `Pilot ${cid}`;
  const r = profile?.recent;
  const lifetime = profile?.lifetime;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Threat Intel"
        title={pilot.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {pilot.corporationTicker && <span>[{pilot.corporationTicker}]</span>}
            {pilot.corporationName ?? "Unknown corporation"}
            {pilot.allianceId && <span>· {pilot.allianceName ?? `Alliance ${pilot.allianceId}`}</span>}
            <StandingBadge standing={standing} />
            <HistoryChip history={pilot.history} />
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/intel/${id}`} size="sm">
              <ArrowLeft className="size-4" aria-hidden /> Back to scan
            </ButtonLink>
            <ButtonLink href={`https://zkillboard.com/character/${characterId}/`} size="sm" target="_blank" rel="noopener noreferrer">
              zKillboard <ExternalLink className="size-3.5" aria-hidden />
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Portrait id={characterId} size={72} />
        <ScoreBadge score={score} />
        {score && <TagList tags={score.tags} />}
        {profile && <LastSeen profile={profile} names={names} />}
      </div>

      {!profile && <p className="text-sm text-ink-3">No zKillboard data for this pilot yet{pilot.profiled ? " — it is on its way." : "."}</p>}

      {profile && r && (
        <>
          <Panel title="Latest kills and losses" subtitle="Newest first; open one on zKillboard.">
            {r.latest.length ? (
              <LatestKills events={r.latest} names={names} limit={10} />
            ) : (
              <p className="text-sm text-ink-3">{profile.depth === "deep" ? "No killmails recently." : "Recent killmails are still loading."}</p>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Kills 7 days" value={integer(r.kills7d)} hint={profile.depth === "deep" ? `${r.kills30d} in 30 days` : "zKillboard"} />
            <StatTile label="Losses 30 days" value={integer(r.losses30d)} hint={`${r.losses7d} in 7 days`} />
            <StatTile label="Last kill" value={r.lastKillAt ? relativeTime(r.lastKillAt) : "—"} hint={lifetime?.lastActiveMonth ? `Last active month ${lifetime.lastActiveMonth}` : undefined} />
            <StatTile
              label="Character"
              value={profile.character.ageDays !== null ? `${integer(profile.character.ageDays)} days` : "—"}
              hint={profile.character.securityStatus !== null ? `Security ${profile.character.securityStatus.toFixed(1)}` : undefined}
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Panel title="Ships" subtitle="Recency weighted, most flown first.">
              <ul className="space-y-1.5">
                {profile.hulls.slice(0, 10).map((h) => (
                  <li key={h.shipTypeId} className="flex items-center gap-2 text-sm">
                    <TypeIcon id={h.shipTypeId} size={24} className="rounded" />
                    <span className="min-w-0 flex-1 truncate">{names.types.get(h.shipTypeId)?.name ?? `Type ${h.shipTypeId}`}</span>
                    <span className="text-xs text-ink-3">{HULL_CLASS_LABELS[hullClass(h.groupId)]}</span>
                    <span className="w-20 text-right text-xs text-ink-3">{h.lastAt ? relativeTime(h.lastAt) : `${h.count}×`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Why this score">
              {score ? <DimensionBreakdown dimensions={score.dimensions} recencyGate={score.recencyGate} columns={1} /> : <p className="text-sm text-ink-3">Not scored yet.</p>}
            </Panel>
          </div>

          <Panel title="When they fight" subtitle={profile.timezone.label ? `Mostly ${profile.timezone.label} time zone` : undefined}>
            <ActivityHeatmap heat={profile.timezone.heat} peakHours={profile.timezone.peakHours} />
          </Panel>
        </>
      )}

      {engagements.length > 0 && (
        <Panel title="Fights with us" subtitle="From our killboard, newest first.">
          <EngagementList engagements={engagements} names={names} pilotNames={pilotNames} />
        </Panel>
      )}

      {profile && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel title="Flies with" subtitle="Pilots sharing the most kills (from this scan in bold).">
            {profile.associates.length ? (
              <ul className="space-y-1">
                {profile.associates.slice(0, 12).map((a) => (
                  <li key={a.characterId} className="flex items-center gap-2 text-sm">
                    <Portrait id={a.characterId} size={22} />
                    <a href={zkillCharacter(a.characterId)} target="_blank" rel="noopener noreferrer" className={pilotNames.has(a.characterId) ? "font-semibold text-ink hover:text-accent" : "text-ink-2 hover:text-accent"}>
                      {associateName(a.characterId)}
                    </a>
                    <span className="ml-auto text-xs text-ink-3 tabular-nums">{a.sharedKills} shared</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No regular wingmen on record.</p>
            )}
          </Panel>
          <Panel title="Corporation history">
            {pilot.corpHistory?.length ? (
              <ul className="space-y-1 text-sm">
                {pilot.corpHistory.slice(0, 10).map((c) => (
                  <li key={`${c.corporationId}-${c.startDate}`} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{names.entities.get(c.corporationId) ?? `Corporation ${c.corporationId}`}</span>
                    <span className="text-xs text-ink-3">since {shortDate(c.startDate.slice(0, 10))} {c.startDate.slice(0, 4)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Not loaded.</p>
            )}
          </Panel>
        </div>
      )}

      {lifetime && (
        <Panel title="Lifetime (zKillboard)">
          <p className="text-sm text-ink-2">
            {integer(lifetime.kills)} kills, {integer(lifetime.losses)} losses, {compact(lifetime.iskDestroyed)} ISK destroyed, {compact(lifetime.iskLost)} lost
            {lifetime.dangerRatio !== null ? ` · danger ${lifetime.dangerRatio}%` : ""}
            {lifetime.soloRatio !== null ? ` · solo ${lifetime.soloRatio}%` : ""}
            {lifetime.avgGangSize ? ` · average gang ${lifetime.avgGangSize}` : ""}.
          </p>
        </Panel>
      )}
    </div>
  );
}
