import { getI18n } from "@/i18n/server";
import type { DisplayNames } from "../names";
import type { LatestEvent, PilotProfile } from "../types";
import { cynoEvidence, eventTargetHull, latestEvidence } from "../evidence";

export async function EventEvidence({ event, names }: { event: LatestEvent | null; names: DisplayNames }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  if (!event) return <span className="text-ink-3">{e.noEvent}</span>;
  const hull = eventTargetHull(event);
  const target = hull ? names.types.get(hull)?.name : null;
  return (
    <span className="block space-y-0.5">
      <span className="block font-medium text-ink">
        {target ?? t.intel.pilot.unknownHull} · {f.relativeTime(event.time)}
      </span>
      <span className="block text-ink-3">{names.systems.get(event.systemId)?.name ?? e.unknown}</span>
      {!event.isLoss && (
        <span className="block text-ink-2">
          {e.observedHull(event.shipTypeId ? (names.types.get(event.shipTypeId)?.name ?? e.unknown) : e.unknown)}
        </span>
      )}
      <span className="block text-ink-3">{e.attackers(event.attackerCount)}</span>
    </span>
  );
}

export async function CynoEvidence({ profile }: { profile: PilotProfile | null }) {
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const fits = cynoEvidence(profile);
  return (
    <span className="block space-y-1">
      {fits.length ? (
        fits.map((fit) => (
          <span key={fit.kind} className="block text-warning">
            <strong>{e.cynoKinds[fit.kind]}</strong> · {f.relativeTime(fit.lastAt)}
            <span className="block text-ink-3">{e.fittedLosses(fit.count)}</span>
          </span>
        ))
      ) : (
        <span className="text-ink-3">{profile?.depth === "deep" ? e.noCyno : e.unknownCyno}</span>
      )}
    </span>
  );
}

export async function PilotEvidence({
  profile,
  names,
  associates,
}: {
  profile: PilotProfile | null;
  names: DisplayNames;
  associates: number;
}) {
  const { t } = await getI18n();
  const e = t.intel.evidence;
  const latest = latestEvidence(profile);
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <span className="eve-label mb-1 block text-2xs text-ink-3">{e.lastKill}</span>
        <EventEvidence event={latest.kill} names={names} />
      </div>
      <div>
        <span className="eve-label mb-1 block text-2xs text-ink-3">{e.lastLoss}</span>
        <EventEvidence event={latest.loss} names={names} />
      </div>
      <div>
        <span className="eve-label mb-1 block text-2xs text-ink-3">{e.cyno}</span>
        <CynoEvidence profile={profile} />
      </div>
      <div>
        <span className="eve-label mb-1 block text-2xs text-ink-3">{e.association}</span>
        <span className="text-ink-2">{profile ? e.associates(associates) : e.unknown}</span>
      </div>
    </div>
  );
}
