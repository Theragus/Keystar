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
  const cynos = others.filter((r) => cynoEvidence(r.profile).length);
  const priorities = others.filter((r) => r.score?.tier === "high" || r.score?.tier === "extreme");
  const checks = view.pilots
    .map((p) => p.statsAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const associated = new Set(view.summary.clusters.flat());
  const missing = others.filter((r) => r.profile?.depth !== "deep").length;
  return (
    <Panel title={e.situation} subtitle={e.snapshotHint}>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-lg font-semibold text-ink">
        <span>{t.intel.scan.title(view.pilots.length, null)}</span>
        <span>{t.intel.scan.nonFriendly(others.length)}</span>
        <span className="text-ink-2">{t.intel.scan.friendlyPilots(view.rows.length - others.length)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{e.interest}</h3>
          <p className="text-sm text-ink">{e.highInterest(view.summary.tiers.high + view.summary.tiers.extreme)}</p>
          <p className="mt-1 text-xs text-accent">
            {priorities
              .slice(0, 3)
              .map((r) => r.pilot.name)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-ink-2">{e.associated(associated.size)}</p>
          <p className="mt-1 text-xs text-ink-3">{e.incomplete(missing)}</p>
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
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{e.cyno}</h3>
          <p className={cynos.length ? "text-sm text-warning" : "text-xs text-ink-3"}>
            {cynos.length ? cynos.map((r) => r.pilot.name).join(" · ") : missing ? e.unknownCyno : e.noCyno}
          </p>
          <p className="mt-1 text-xs text-ink-3">{e.cynoHint}</p>
        </div>
        <div className="glass-inset rounded-lg p-3">
          <h3 className="eve-label mb-2 text-2xs text-ink-3">{t.intel.scan.foughtUs}</h3>
          <p className="text-sm text-ink-2">
            {!view.home ? e.unknown : view.totals.engagements ? t.intel.scan.engagements(view.totals.engagements) : t.intel.scan.noFights}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {view.engagements[0] ? e.historyHint + " · " + f.relativeTime(view.engagements[0].end) : e.noSafety}
          </p>
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

export async function ObservedGroupsPanel({ view, now }: { view: ScanView; now: Date }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const groups = observedGroups(
    view.rows.filter((r) => !isFriendly(r.standing)).map((r) => ({ characterId: r.pilot.characterId, profile: r.profile })),
    now,
  );
  return (
    <Panel title={e.groups} subtitle={e.groupsHint}>
      {groups.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.slice(0, 4).map((g) => (
            <div key={g.killmailIds[0]} className="glass-inset rounded-lg p-3">
              <h3 className="text-sm font-medium text-ink">
                {f.relativeTime(g.time)} · {view.names.systems.get(g.systemId)?.name ?? e.unknown}
              </h3>
              <p className="mt-1 text-xs text-ink-3">
                {e.groupCount(g.members.length, g.killmailIds.length)} ·{" "}
                {now.getTime() - Date.parse(g.time) <= 2 * 60 * 60_000 ? e.recent : e.fallback}
              </p>
              <div className="mt-2 border-t border-surface-contrast/6 pt-2 text-xs">
                <p className="eve-label mb-1 text-2xs text-ink-3">{e.latestGroupFight}</p>
                <p className="text-ink">{e.destroyedHull(g.events[0].otherShipTypeId ? (view.names.types.get(g.events[0].otherShipTypeId)?.name ?? e.unknown) : e.unknown)}</p>
                <p className="mt-0.5 text-ink-2">{e.attackers(g.events[0].attackerCount)} · {e.oneVictim}</p>
                <p className="mt-0.5 text-ink-3">{f.dateTime(g.events[0].time)} · {f.compact(g.events[0].value)} ISK</p>
              </div>
              <ul className="my-3 space-y-1 text-xs text-ink-2">
                {g.members.map((m) => (
                  <li key={m.characterId}>
                    {view.pilotNames.get(m.characterId)} ·{" "}
                    {m.shipTypeId ? (view.names.types.get(m.shipTypeId)?.name ?? e.unknown) : e.unknown} · {f.relativeTime(m.time)}
                    {m.changed ? " · " + e.changed : ""}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 text-xs text-accent">
                {g.killmailIds.map((id) => (
                  <a key={id} href={zkillKill(id)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {e.killmail(id)}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">{e.noGroup}</p>
      )}
      <p className="mt-3 text-xs text-ink-3">{e.groupCaution}</p>
    </Panel>
  );
}
