import { Portrait } from "@/components/ui/eve-image";
import type { DisplayNames } from "../names";
import type { GroupSummary } from "../score/summary";
import { tierLabel } from "./score";

/** Tier counts, likely composition, roles and who flies together. */
export function GroupSummaryPanel({ summary, names, pilotNames }: { summary: GroupSummary; names: DisplayNames; pilotNames: Map<number, string> }) {
  const tiers = (["extreme", "high", "moderate", "low", "unknown"] as const).filter((t) => summary.tiers[t] > 0);
  const roles = (
    [
      ["cyno", "cyno"],
      ["capital", "capital"],
      ["logi", "logi"],
      ["tackle", "tackle"],
      ["hunter", "hunter"],
    ] as const
  ).filter(([k]) => summary.roles[k] > 0);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <div>
        <h3 className="eve-label mb-2 text-[0.62rem] text-ink-3">Threat</h3>
        <ul className="space-y-1 text-sm">
          {tiers.map((t) => (
            <li key={t} className="flex justify-between gap-3">
              <span className="text-ink-2">{tierLabel(t)}</span>
              <span className="font-semibold text-ink tabular-nums">{summary.tiers[t]}</span>
            </li>
          ))}
          {summary.reds > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-ink-2">Red standings</span>
              <span className="font-semibold text-ink tabular-nums">{summary.reds}</span>
            </li>
          )}
        </ul>
        {roles.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">{roles.map(([k, label]) => `${summary.roles[k]} ${label}`).join(" · ")}</p>
        )}
      </div>
      <div>
        <h3 className="eve-label mb-2 text-[0.62rem] text-ink-3">Likely flying</h3>
        {summary.comp.length ? (
          <ul className="space-y-1 text-sm">
            {summary.comp.slice(0, 6).map((c) => (
              <li key={c.cls} className="flex justify-between gap-3">
                <span className="text-ink-2">{c.label}</span>
                <span className="font-semibold text-ink tabular-nums">{c.pilots}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">Waiting for recent kills.</p>
        )}
        <p className="mt-2 text-xs text-ink-3">Each pilot&apos;s most flown hull class in the last week.</p>
      </div>
      <div>
        <h3 className="eve-label mb-2 text-[0.62rem] text-ink-3">Fly together</h3>
        {summary.clusters.length ? (
          <ul className="space-y-2">
            {summary.clusters.slice(0, 4).map((c) => (
              <li key={c.join("-")} className="flex flex-wrap items-center gap-1">
                {c.slice(0, 8).map((id) => (
                  <span key={id} title={pilotNames.get(id)}>
                    <Portrait id={id} size={22} />
                  </span>
                ))}
                <span className="ml-1 text-xs text-ink-3">{c.length} pilots</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">No shared kills between these pilots yet.</p>
        )}
        {summary.groups.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            {summary.groups
              .slice(0, 4)
              .map((g) => `${g.pilots} ${(g.allianceId && names.entities.get(g.allianceId)) || (g.corporationId && names.entities.get(g.corporationId)) || "unaffiliated"}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
