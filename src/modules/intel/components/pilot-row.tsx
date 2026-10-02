import { ChevronRight, ExternalLink, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { compact, relativeTime } from "@/lib/format";
import { zkillCharacter } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { ScanPilot } from "../scans";
import type { PilotHistory, Standing } from "../types";
import { StandingBadge } from "./standing-badge";

export function HistoryChip({ history }: { history: PilotHistory | null }) {
  if (!history || history.killsOnUs + history.lossesToUs === 0) return null;
  const parts = [];
  if (history.killsOnUs) parts.push(`on ${history.killsOnUs} of our losses`);
  if (history.lossesToUs) parts.push(`${history.lossesToUs} died to us`);
  return (
    <span title={`Last ${relativeTime(history.lastAt)}`}>
      <Badge tone={history.killsOnUs ? "warning" : "neutral"}>
        <Swords className="size-3" aria-hidden />
        {parts.join(" · ")}
      </Badge>
    </span>
  );
}

function ProfileStatus({ pilot }: { pilot: ScanPilot }) {
  if (!pilot.profiled) return <span className="text-xs text-ink-3">not profiled</span>;
  if (pilot.statsStatus === "none") return <span className="text-xs text-ink-3">no killboard history</span>;
  if (pilot.statsStatus === "error") return <span className="text-xs text-critical-text">zKillboard unavailable</span>;
  if (!pilot.statsStatus) return <span className="text-xs text-ink-3">queued…</span>;
  return null;
}

/** One scanned pilot: identity and standing in the row, the evidence when expanded. */
export function PilotRow({
  pilot,
  standing,
  names,
  scoreSlot,
  details,
}: {
  pilot: ScanPilot;
  standing: Standing;
  names: DisplayNames;
  scoreSlot?: React.ReactNode;
  details?: React.ReactNode;
}) {
  const ticker = pilot.corporationTicker ? `[${pilot.corporationTicker}]` : null;
  const history = pilot.history;
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
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-3">
            {ticker && <span className="text-ink-2">{ticker} </span>}
            {pilot.corporationName ?? (pilot.corporationId ? `Corporation ${pilot.corporationId}` : "Unknown corporation")}
            {pilot.allianceId && <> · {pilot.allianceName ?? `Alliance ${pilot.allianceId}`}</>}
          </div>
        </div>
        <ProfileStatus pilot={pilot} />
        {scoreSlot}
      </summary>
      <div className="space-y-4 border-t border-white/6 px-4 py-3">
        {details}
        {history && history.killsOnUs + history.lossesToUs > 0 && (
          <div>
            <h4 className="eve-label mb-1.5 text-[0.62rem] text-ink-3">Against us</h4>
            <p className="text-xs text-ink-2">
              On {history.killsOnUs} of our losses ({compact(history.iskDestroyedOnUs)} ISK), lost {history.lossesToUs} ships to us (
              {compact(history.iskLostToUs)} ISK). First {relativeTime(history.firstAt)}, last {relativeTime(history.lastAt)}.
            </p>
            {history.ships.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {history.ships.map((s) => (
                  <span key={s.shipTypeId} className="inline-flex items-center gap-1 text-xs text-ink-2">
                    <TypeIcon id={s.shipTypeId} size={20} className="rounded" />
                    {names.types.get(s.shipTypeId)?.name ?? "Unknown hull"}
                    <span className="text-ink-3 tabular-nums">×{s.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <a
          href={zkillCharacter(pilot.characterId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          zKillboard <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </details>
  );
}
