import { TypeIcon } from "@/components/ui/eve-image";
import { zkillRelated } from "@/modules/killboard/links";
import { CHART_CLASSES } from "@/modules/mining/class-colors";
import { Radio } from "lucide-react";
import { TIER_COLOR } from "../colors";
import type { PilotScore } from "../types";
import { PilotTags } from "./pilot-tags";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { isFriendly } from "../standings";
import { cynoEvidence, observedGroups } from "../evidence";
import type { ScanView } from "../view";
import { EventEvidence } from "./pilot-evidence";
import { zkillKill } from "@/modules/killboard/links";

export async function SituationPanel({ view, scannedAt, dscanAt }: { view: ScanView; scannedAt: Date; dscanAt: Date | null }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const others = view.rows.filter((r) => !isFriendly(r.standing));
  const events = others
    .flatMap((r) => (r.profile?.recent.latest ?? []).map((event) => ({ event, name: r.pilot.name })))
    .sort((a, b) => Date.parse(b.event.time) - Date.parse(a.event.time));
  const newest = events[0];
  const sortedPilots = [...view.rows].sort((a, b) => {
    const aScore = a.pilot.scoreDetail as PilotScore | null;
    const bScore = b.pilot.scoreDetail as PilotScore | null;
    const danger = (bScore && bScore.tier !== "unknown" ? bScore.composite : -1) - (aScore && aScore.tier !== "unknown" ? aScore.composite : -1);
    return danger || Number(cynoEvidence(b.profile).length > 0) - Number(cynoEvidence(a.profile).length > 0) || a.pilot.name.localeCompare(b.pilot.name);
  });
  const affiliationKey = (pilot: (typeof sortedPilots)[number]["pilot"]) => pilot.allianceId ? `alliance:${pilot.allianceId}` : pilot.corporationId ? `corporation:${pilot.corporationId}` : `pilot:${pilot.characterId}`;
  const affiliationGroups = new Map<string, typeof sortedPilots>();
  for (const row of sortedPilots) {
    const key = affiliationKey(row.pilot);
    affiliationGroups.set(key, [...(affiliationGroups.get(key) ?? []), row]);
  }
  const groupedPilots = [...affiliationGroups].map(([id, pilots], index) => ({
    id, pilots, color: CHART_CLASSES[index % CHART_CLASSES.length].color,
    name: pilots[0].pilot.allianceId ? pilots[0].pilot.allianceName ?? t.intel.pilot.alliance(pilots[0].pilot.allianceId) : pilots[0].pilot.corporationName ?? t.intel.pilot.unknownCorporation,
  }));
  const now = new Date();
  const group = observedGroups(others.map(r => ({ characterId: r.pilot.characterId, profile: r.profile })), now)[0];
  const checks = view.pilots
    .map((p) => p.statsAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return (
    <Panel title={e.situation} subtitle={e.snapshotHint} actions={
      <div className="flex max-w-[40vw] flex-wrap justify-end gap-x-4 gap-y-1 text-sm font-semibold text-ink sm:max-w-none">
        <span>{t.intel.scan.title(view.pilots.length, null)}</span>
        <span>{t.intel.scan.nonFriendly(others.length)}</span>
        <span className="text-ink-2">{t.intel.scan.friendlyPilots(view.rows.length - others.length)}</span>
      </div>
    }>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-inset rounded-lg p-3 sm:col-span-2">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{t.intel.scan.pilotsTitle}</h3>
          <PilotTags items={sortedPilots.map(({ pilot, profile }) => {
            const score = pilot.scoreDetail as PilotScore | null;
            const fits = cynoEvidence(profile);
            const fitDetails = fits.map(fit => `${e.cynoKinds[fit.kind]}: ${f.integer(fit.count)} · ${f.relativeTime(fit.lastAt)}`).join("; ");
            const cynoDetails = fits.length ? `${e.cyno}: ${fitDetails}. ${e.cynoTagCaution}` : `${profile?.depth === "deep" ? e.noCyno : e.unknownCyno}. ${e.cynoTagCaution}`;
            const alliance = groupedPilots.find(group => group.id === affiliationKey(pilot))!;
            return { id: pilot.characterId, affiliationId: affiliationKey(pilot), color: alliance.color,
              title: `${pilot.name} · ${alliance.name} · ${t.intel.score.explanation} ${cynoDetails}`,
              content: <>
                <span className="min-w-0 break-words text-ink-2">{pilot.name}</span>
                <span className="shrink-0 font-bold tabular-nums" style={{ color: TIER_COLOR[score?.tier ?? "unknown"] }}>{score && score.tier !== "unknown" ? f.number(score.composite / 10, 1) : "?"}</span>
                {fits.length > 0 && <span title={cynoDetails} aria-label={cynoDetails} className="shrink-0 text-warning"><Radio className="size-3.5" aria-hidden /></span>}
              </>,
            };
          })} />
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-surface-contrast/6 pt-2 text-3xs text-ink-2" aria-label={e.allianceLegend}>
            {groupedPilots.map(alliance => <li key={alliance.id ?? "none"} className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: alliance.color }} aria-hidden /><span>{alliance.name}</span></li>)}
          </ul>
        </div>
        <div className="space-y-3">
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3" title={e.groupsHint}>{e.groups}</h3>
          {group ? (
            <div className="space-y-1 text-xs">
              <p className="font-medium text-ink">{view.names.systems.get(group.systemId)?.name ?? e.unknown} · {f.relativeTime(group.time)}</p>
              <p className="text-ink-3">{e.groupCount(group.members.length, group.killmailIds.length)} · {now.getTime() - Date.parse(group.time) <= 2 * 60 * 60_000 ? e.recent : e.fallback}</p>
              <p className="text-ink">{e.destroyedHull(group.events[0].otherShipTypeId ? (view.names.types.get(group.events[0].otherShipTypeId)?.name ?? e.unknown) : e.unknown)}</p>
              <p className="text-ink-2">{e.attackers(group.events[0].attackerCount)} · {e.oneVictim}</p>
              <p className="text-ink-3">{f.compact(group.events[0].value)} ISK</p>
              <ul className="space-y-0.5 text-ink-2">
                {group.members.map(m => <li key={m.characterId}>{view.pilotNames.get(m.characterId)} · {m.shipTypeId ? (view.names.types.get(m.shipTypeId)?.name ?? e.unknown) : e.unknown}{m.changed ? " · " + e.changed : ""}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2 text-accent">
                {group.killmailIds.map(id => <a key={id} href={zkillKill(id)} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.killmail(id)}</a>)}
              </div>
            </div>
          ) : <p className="text-xs text-ink-3">{e.noGroup}</p>}
        </div>
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{e.newest}</h3>
          {newest ? (
            <div className="text-xs">
              <p className="mb-1 text-accent">
                {newest.name} · {newest.event.isLoss ? e.lastLoss : e.lastKill}
              </p>
              <EventEvidence event={newest.event} names={view.names} />
            </div>
          ) : (
            <p className="text-xs text-ink-3">{e.noEvent}</p>
          )}
        </div>
        </div>
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{e.engagementWithUs}</h3>
          {!view.home ? <p className="text-xs text-ink-3">{t.intel.scan.noHome}</p> : !view.engagements.length ? <p className="text-xs text-ink-3">{t.intel.scan.noFights}</p> : <>
            <ol className="space-y-3">
              {view.engagements.slice(0, 1).map(fight => <li key={fight.key} className="border-t border-surface-contrast/6 pt-2 text-xs">
                <a href={zkillRelated(fight.systemId, fight.start)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{view.names.systems.get(fight.systemId)?.name ?? e.unknown} · {f.relativeTime(fight.start)}</a>
                <p className="mt-1 text-ink-2">{t.intel.engagements.killed(fight.ourKills, f.compact(fight.iskKilled))}</p>
                <p className="text-ink-2">{t.intel.engagements.lost(fight.ourLosses, f.compact(fight.iskLost))}</p>
                <p className="mt-1 text-ink-3">{fight.pilots.map(pilot => view.pilotNames.get(pilot.characterId) ?? e.unknown).join(" · ")}</p>
                {fight.brought.length > 0 && <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-ink-2"><span className="text-ink-3">{t.intel.engagements.brought}</span>{fight.brought.slice(0, 5).map(ship => <span key={ship.shipTypeId} className="inline-flex items-center gap-1"><TypeIcon id={ship.shipTypeId} size={16} className="rounded" />{ship.count > 1 && `${f.integer(ship.count)}× `}{view.names.types.get(ship.shipTypeId)?.name ?? e.unknown}</span>)}</div>}
              </li>)}
            </ol>
            <p className="mt-2 text-3xs text-ink-3">{e.historyHint}</p>
          </>}
        </div>


      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-3">
        <span>
          {e.snapshot}: {f.relativeTime(scannedAt)}
        </span>
        <span>{checks.length ? e.oldestCheck(f.relativeTime(checks[0]), checks.length, view.pilots.length) : e.statsUnknown}</span>
        <span>
          {t.intel.dscan.title}: {dscanAt ? e.pasted(f.relativeTime(dscanAt)) : e.notProvided}
        </span>
      </div>
    </Panel>
  );
}

