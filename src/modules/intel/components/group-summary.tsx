import { Portrait } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import type { DisplayNames } from "../names";
import type { GroupSummary } from "../score/summary";

const ROLE_ORDER = ["cyno", "capital", "logi", "tackle", "hunter"] as const;

/** Tier counts, likely composition, roles and who flies together. */
export async function GroupSummaryPanel({ summary, names, pilotNames }: { summary: GroupSummary; names: DisplayNames; pilotNames: Map<number, string> }) {
  const { t, f } = await getI18n();
  const g = t.intel.group;
  const tiers = (["extreme", "high", "moderate", "low", "unknown"] as const).filter((tier) => summary.tiers[tier] > 0);
  const roles = ROLE_ORDER.filter((role) => summary.roles[role] > 0);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <div>
        <h3 className="eve-label mb-2 text-2xs text-ink-3">{g.threat}</h3>
        <ul className="space-y-1 text-sm">
          {tiers.map((tier) => (
            <li key={tier} className="flex justify-between gap-3">
              <span className="text-ink-2">{t.intel.tiers[tier]}</span>
              <span className="font-semibold text-ink tabular-nums">{f.integer(summary.tiers[tier])}</span>
            </li>
          ))}
          {summary.reds > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-ink-2">{g.reds}</span>
              <span className="font-semibold text-ink tabular-nums">{f.integer(summary.reds)}</span>
            </li>
          )}
        </ul>
        {roles.length > 0 && <p className="mt-2 text-xs text-ink-3">{roles.map((role) => t.intel.roles[role](summary.roles[role])).join(" · ")}</p>}
      </div>
      <div>
        <h3 className="eve-label mb-2 text-2xs text-ink-3">{g.likelyFlying}</h3>
        {summary.comp.length ? (
          <ul className="space-y-1 text-sm">
            {summary.comp.slice(0, 6).map((c) => (
              <li key={c.cls} className="flex justify-between gap-3">
                <span className="text-ink-2">{t.intel.hullClasses[c.cls]}</span>
                <span className="font-semibold text-ink tabular-nums">{f.integer(c.pilots)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">{g.waiting}</p>
        )}
        <p className="mt-2 text-xs text-ink-3">{g.likelyHint}</p>
      </div>
      <div>
        <h3 className="eve-label mb-2 text-2xs text-ink-3">{g.flyTogether}</h3>
        {summary.clusters.length ? (
          <ul className="space-y-2">
            {summary.clusters.slice(0, 4).map((c) => (
              <li key={c.join("-")} className="flex flex-wrap items-center gap-1">
                {c.slice(0, 8).map((id) => (
                  <span key={id} title={pilotNames.get(id)}>
                    <Portrait id={id} size={22} />
                  </span>
                ))}
                <span className="ml-1 text-xs text-ink-3">{g.clusterPilots(c.length)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">{g.noClusters}</p>
        )}
        {summary.groups.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            {summary.groups
              .slice(0, 4)
              .map((x) =>
                g.groupPilots(
                  x.pilots,
                  (x.allianceId && names.entities.get(x.allianceId)) || (x.corporationId && names.entities.get(x.corporationId)) || g.unaffiliated,
                ),
              )
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
