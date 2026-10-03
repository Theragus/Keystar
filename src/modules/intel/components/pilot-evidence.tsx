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
  const { t, f } = await getI18n();
  const e = t.intel.evidence;
  const latest = latestEvidence(profile);
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {[{ label: e.lastKill, event: latest.kill }, { label: e.lastLoss, event: latest.loss }].map(({ label, event }) => {
        const hull = event ? eventTargetHull(event) : null;
        return <span key={label} className="text-ink-2"><span className="text-ink-3">{label}: </span>{event ? `${hull ? (names.types.get(hull)?.name ?? e.unknown) : e.unknown} · ${f.relativeTime(event.time)}` : e.noEvent}</span>;
      })}
      <span className={cynoEvidence(profile).length ? "text-warning" : "text-ink-3"}>{e.cyno}: {cynoEvidence(profile).length ? cynoEvidence(profile).map(fit => `${e.cynoKinds[fit.kind]} · ${f.relativeTime(fit.lastAt)}`).join(" · ") : profile?.depth === "deep" ? e.noCyno : e.unknown}</span>
      {associates > 0 && <span className="text-ink-2">{e.associates(associates)}</span>}
    </div>
  );
}
