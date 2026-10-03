import { ChevronRight, ExternalLink, Swords } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import { zkillCharacter } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { ScanPilot } from "../scans";
import type { PilotHistory, PilotProfile, PilotScore, Standing } from "../types";
import { LastSeen, LatestKills } from "./latest-kills";
import { DimensionBreakdown, ScoreBadge, TagList } from "./score";
import { StandingBadge } from "./standing-badge";

export async function HistoryChip({ history }: { history: PilotHistory | null }) {
  if (!history || history.killsOnUs + history.lossesToUs === 0) return null;
  const { t, f } = await getI18n();
  const parts = [];
  if (history.killsOnUs) parts.push(t.intel.pilot.onOurLosses(history.killsOnUs));
  if (history.lossesToUs) parts.push(t.intel.pilot.diedToUs(history.lossesToUs));
  return (
    <span title={t.intel.pilot.lastFought(f.relativeTime(history.lastAt))}>
      <Badge tone={history.killsOnUs ? "warning" : "neutral"}>
        <Swords className="size-3" aria-hidden />
        {parts.join(" · ")}
      </Badge>
    </span>
  );
}

async function ProfileStatus({ pilot }: { pilot: ScanPilot }) {
  const { t } = await getI18n();
  const p = t.intel.pilot;
  if (!pilot.profiled) return <span className="text-xs text-ink-3">{p.notProfiled}</span>;
  if (pilot.statsStatus === "none") return <span className="text-xs text-ink-3">{p.noHistory}</span>;
  if (pilot.statsStatus === "error") return <span className="text-xs text-critical-text">{p.zkillUnavailable}</span>;
  if (!pilot.statsStatus) return <span className="text-xs text-ink-3">{p.queued}</span>;
  return null;
}

/** One scanned pilot: identity, score, tags and latest kills in the row; the evidence when expanded. */
export async function PilotRow({
  pilot,
  standing,
  names,
  pilotNames,
  scanId,
}: {
  pilot: ScanPilot;
  standing: Standing;
  names: DisplayNames;
  pilotNames: Map<number, string>;
  scanId: string;
}) {
  const { t, f } = await getI18n();
  const p = t.intel.pilot;
  const ticker = pilot.corporationTicker ? `[${pilot.corporationTicker}]` : null;
  const history = pilot.history;
  const score = (pilot.scoreDetail as PilotScore | null) ?? null;
  const profile = (pilot.profile as PilotProfile | null) ?? null;
  const flyingWith = (profile?.associates ?? []).filter((a) => pilotNames.has(a.characterId) && a.characterId !== pilot.characterId);
  return (
    <details className="group glass-inset rounded-lg">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
        <Portrait id={pilot.characterId} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-ink">{pilot.name}</span>
            <StandingBadge standing={standing} />
            <HistoryChip history={history} />
            {score && <TagList tags={score.tags} />}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-3">
            {ticker && <span className="text-ink-2">{ticker} </span>}
            {pilot.corporationName ?? (pilot.corporationId ? p.corporation(pilot.corporationId) : p.unknownCorporation)}
            {pilot.allianceId && <> · {pilot.allianceName ?? p.alliance(pilot.allianceId)}</>}
          </div>
          {profile && (
            <div className="mt-1">
              <LastSeen profile={profile} names={names} />
            </div>
          )}
          {profile && profile.recent.latest.length > 0 && (
            <div className="mt-1.5 hidden md:block">
              <LatestKills events={profile.recent.latest} names={names} limit={4} />
            </div>
          )}
        </div>
        <ProfileStatus pilot={pilot} />
        <ScoreBadge score={score} />
      </summary>
      <div className="space-y-4 border-t border-surface-contrast/6 px-4 py-3">
        {profile && profile.recent.latest.length > 0 && (
          <div>
            <h4 className="eve-label mb-1.5 text-2xs text-ink-3">{p.latestTitle}</h4>
            <LatestKills events={profile.recent.latest} names={names} limit={10} />
          </div>
        )}
        {score && score.dimensions.length > 0 && (
          <div>
            <h4 className="eve-label mb-1.5 text-2xs text-ink-3">{p.whyTitle}</h4>
            <DimensionBreakdown dimensions={score.dimensions} recencyGate={score.recencyGate} />
          </div>
        )}
        {flyingWith.length > 0 && (
          <p className="text-xs text-ink-2">
            {p.fliesWith(
              flyingWith
                .slice(0, 6)
                .map((a) => `${pilotNames.get(a.characterId)} (${f.integer(a.sharedKills)})`)
                .join(", "),
            )}
          </p>
        )}
        {history && history.killsOnUs + history.lossesToUs > 0 && (
          <div>
            <h4 className="eve-label mb-1.5 text-2xs text-ink-3">{p.againstUs}</h4>
            <p className="text-xs text-ink-2">
              {p.againstUsText({
                killsOnUs: history.killsOnUs,
                iskOnUs: f.compact(history.iskDestroyedOnUs),
                lossesToUs: history.lossesToUs,
                iskToUs: f.compact(history.iskLostToUs),
                first: f.relativeTime(history.firstAt),
                last: f.relativeTime(history.lastAt),
              })}
            </p>
            {history.ships.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {history.ships.map((s) => (
                  <span key={s.shipTypeId} className="inline-flex items-center gap-1 text-xs text-ink-2">
                    <TypeIcon id={s.shipTypeId} size={20} className="rounded" />
                    {names.types.get(s.shipTypeId)?.name ?? p.unknownHull}
                    <span className="text-ink-3 tabular-nums">×{f.integer(s.count)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-4 text-xs">
          <Link href={`/intel/${scanId}/pilot/${pilot.characterId}`} className="text-accent hover:underline">
            {p.fullProfile}
          </Link>
          <a
            href={zkillCharacter(pilot.characterId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 hover:text-accent"
          >
            zKillboard <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </details>
  );
}
